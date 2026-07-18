package com.fec.warehouse.dashboard;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

// Answers API Gateway directly since FleetDashboardApp's HttpServer binding has no meaning inside a Lambda invocation.
public class FleetDashboardLambda implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final FleetRepository repository = new FleetRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsGateway thresholdsGateway = new ThresholdsGateway();
    private final HttpClient upstream = HttpClient.newHttpClient();

    private DynamoDbClient dynamo;
    private SqsClient sqs;
    private LambdaClient lambda;

    public FleetDashboardLambda() {
    }

    /** Test seam: injects stub AWS clients instead of building real ones. */
    FleetDashboardLambda(DynamoDbClient dynamo, SqsClient sqs, LambdaClient lambda) {
        this.dynamo = dynamo;
        this.sqs = sqs;
        this.lambda = lambda;
    }

    private synchronized DynamoDbClient dynamo() {
        if (dynamo == null) dynamo = awsClient(DynamoDbClient.builder());
        return dynamo;
    }

    private synchronized SqsClient sqs() {
        if (sqs == null) sqs = awsClient(SqsClient.builder());
        return sqs;
    }

    private synchronized LambdaClient lambda() {
        if (lambda == null) lambda = awsClient(LambdaClient.builder());
        return lambda;
    }

    private static <B extends software.amazon.awssdk.awscore.client.builder.AwsClientBuilder<B, T>, T> T awsClient(B builder) {
        builder.region(Region.of(FleetDashboardApp.REGION));
        if (FleetDashboardApp.ENDPOINT != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(FleetDashboardApp.ENDPOINT));
        }
        return builder.build();
    }

    // Sealed route markers matched by path/method, then dispatched via an instanceof chain.
    sealed interface Route {
        record Fleet() implements Route {}
        record Readings() implements Route {}
        record Thresholds() implements Route {}
        record Health() implements Route {}
        record BackendStats() implements Route {}

        static Route match(String method, String path) {
            if (!"GET".equals(method)) return null;
            return switch (path) {
                case "/api/fleet" -> new Fleet();
                case "/api/readings" -> new Readings();
                case "/api/thresholds" -> new Thresholds();
                case "/api/health" -> new Health();
                case "/api/backend-stats" -> new BackendStats();
                default -> null;
            };
        }
    }

    private boolean fogHealthy() {
        try {
            var request = java.net.http.HttpRequest.newBuilder().uri(URI.create(FleetDashboardApp.FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private Double freshestWindowAgeSeconds() {
        Instant now = Instant.now();
        Double best = null;
        for (String sensorType : FleetDashboardApp.SENSOR_TYPES) {
            var recent = repository.recentWindows(dynamo(), FleetDashboardApp.TABLE_NAME, sensorType, 1);
            if (recent.isEmpty()) continue;
            String windowEnd = (String) recent.get(recent.size() - 1).get("window_end");
            double age = Duration.between(Instant.parse(windowEnd), now).toMillis() / 1000.0;
            if (best == null || age < best) best = age;
        }
        return best;
    }

    private Object handle(Route route, Map<String, String> query) throws Exception {
        if (route instanceof Route.Fleet) {
            return repository.buildRoster(dynamo(), FleetDashboardApp.TABLE_NAME, FleetDashboardApp.SENSOR_TYPES, FleetDashboardApp.ROSTER_TRAIL_LENGTH);
        }
        if (route instanceof Route.Readings) {
            String sensorType = query.get("sensor_type");
            int limit = query.containsKey("limit") ? Integer.parseInt(query.get("limit")) : 60;
            var items = repository.recentWindows(dynamo(), FleetDashboardApp.TABLE_NAME, sensorType, limit);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sensor_type", sensorType);
            body.put("items", items);
            return body;
        }
        if (route instanceof Route.Thresholds) {
            return JSON.readValue(thresholdsGateway.fetch(upstream, FleetDashboardApp.FOG_THRESHOLDS_URL), Object.class);
        }
        if (route instanceof Route.Health) {
            Double freshestAge = freshestWindowAgeSeconds();
            Map<String, Object> health = new LinkedHashMap<>();
            health.put("gateway", fogHealthy());
            health.put("queue", checks.queueReachable(sqs(), FleetDashboardApp.QUEUE_NAME));
            health.put("lambda", checks.lambdaDeployed(lambda(), FleetDashboardApp.FUNCTION_NAME));
            health.put("pipeline", freshestAge != null && freshestAge <= FleetDashboardApp.PIPELINE_FRESH_SECONDS);
            health.put("freshest_age_seconds", freshestAge);
            return health;
        }
        if (route instanceof Route.BackendStats) {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("queue", checks.queueDepth(sqs(), FleetDashboardApp.QUEUE_NAME));
            stats.put("items_in_table", checks.itemCount(dynamo(), FleetDashboardApp.TABLE_NAME));
            return stats;
        }
        throw new IllegalStateException("unhandled route " + route);
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String method = (String) event.getOrDefault("httpMethod", "GET");
        String path = normalizePath((String) event.getOrDefault("path", "/"));
        @SuppressWarnings("unchecked")
        Map<String, String> query = (Map<String, String>) event.getOrDefault("queryStringParameters", Map.of());
        if (query == null) query = Map.of();

        Map<String, Object> headers = Map.of(
            "Content-Type", "application/json",
            "Access-Control-Allow-Origin", "*");

        Route route = Route.match(method, path);
        if (route == null) {
            return response(404, headers, Map.of("error", "not found"));
        }
        try {
            return response(200, headers, handle(route, query));
        } catch (Exception e) {
            return response(500, headers, Map.of("error", e.getMessage() == null ? "internal error" : e.getMessage()));
        }
    }

    private static String normalizePath(String path) {
        if (path.length() > 1 && path.endsWith("/")) return path.substring(0, path.length() - 1);
        return path;
    }

    private static Map<String, Object> response(int statusCode, Map<String, Object> headers, Object body) {
        try {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("statusCode", statusCode);
            result.put("headers", headers);
            result.put("body", JSON.writeValueAsString(body));
            return result;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
