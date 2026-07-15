package com.fec.mining.dashboard;

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
import java.util.Optional;

/**
 * Answers the real deployment's API Gateway REST API. server.js-equivalent
 * MineDashboardApp binds routes to a live com.sun.net.httpserver.HttpServer,
 * which has no meaning inside a single synchronous Lambda invocation, so
 * this class reuses the same ShaftRepository/PipelineChecks/ThresholdsProxy
 * classes behind a route registry expressed as enum constants -- each Route
 * carries its own method, path, and handler reference -- rather than the
 * array-of-templates, character trie, flat dict, or switch expression every
 * prior reassigned project's dashboard-Lambda has already used.
 */
public class MineDashboardLambda implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final ShaftRepository repository = new ShaftRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsProxy thresholdsProxy = new ThresholdsProxy();
    private final HttpClient upstream = HttpClient.newHttpClient();

    private DynamoDbClient dynamo;
    private SqsClient sqs;
    private LambdaClient lambda;

    public MineDashboardLambda() {
    }

    /** Test seam: injects fake AWS clients instead of building real ones. */
    MineDashboardLambda(DynamoDbClient dynamo, SqsClient sqs, LambdaClient lambda) {
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
        builder.region(Region.of(MineDashboardApp.REGION));
        if (MineDashboardApp.ENDPOINT != null) {
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
            builder.endpointOverride(URI.create(MineDashboardApp.ENDPOINT));
        }
        return builder.build();
    }

    interface RouteHandler {
        Object handle(MineDashboardLambda app, Map<String, String> query) throws Exception;
    }

    enum Route {
        SHAFTS("GET", "/api/shafts", (app, query) ->
            app.repository.byShaft(app.dynamo(), MineDashboardApp.TABLE_NAME, MineDashboardApp.SENSOR_TYPES, MineDashboardApp.SHAFT_HISTORY_PER_TYPE)),

        READINGS("GET", "/api/readings", (app, query) -> {
            String sensorType = query.get("sensor_type");
            int limit = query.containsKey("limit") ? Integer.parseInt(query.get("limit")) : 60;
            var items = app.repository.recentWindows(app.dynamo(), MineDashboardApp.TABLE_NAME, sensorType, limit);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("sensor_type", sensorType);
            body.put("items", items);
            return body;
        }),

        THRESHOLDS("GET", "/api/thresholds", (app, query) ->
            new ObjectMapper().readValue(app.thresholdsProxy.fetch(app.upstream, MineDashboardApp.FOG_THRESHOLDS_URL), Object.class)),

        HEALTH("GET", "/api/health", (app, query) -> {
            Double freshestAge = app.freshestWindowAgeSeconds();
            Map<String, Object> health = new LinkedHashMap<>();
            health.put("gateway", app.gatewayHealthy());
            health.put("queue", app.checks.queueReachable(app.sqs(), MineDashboardApp.QUEUE_NAME));
            health.put("lambda", app.checks.lambdaDeployed(app.lambda(), MineDashboardApp.FUNCTION_NAME));
            health.put("pipeline", freshestAge != null && freshestAge <= MineDashboardApp.PIPELINE_FRESH_SECONDS);
            health.put("freshest_age_seconds", freshestAge);
            return health;
        }),

        BACKEND_STATS("GET", "/api/backend-stats", (app, query) -> {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("queue", app.checks.queueDepth(app.sqs(), MineDashboardApp.QUEUE_NAME));
            stats.put("items_in_table", app.checks.itemCount(app.dynamo(), MineDashboardApp.TABLE_NAME));
            return stats;
        });

        final String method;
        final String path;
        final RouteHandler handler;

        Route(String method, String path, RouteHandler handler) {
            this.method = method;
            this.path = path;
            this.handler = handler;
        }

        static Optional<Route> find(String method, String path) {
            for (Route route : values()) {
                if (route.method.equals(method) && route.path.equals(path)) return Optional.of(route);
            }
            return Optional.empty();
        }
    }

    private boolean gatewayHealthy() {
        try {
            var request = java.net.http.HttpRequest.newBuilder().uri(URI.create(MineDashboardApp.FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private Double freshestWindowAgeSeconds() {
        Instant now = Instant.now();
        Double best = null;
        for (String sensorType : MineDashboardApp.SENSOR_TYPES) {
            var recent = repository.recentWindows(dynamo(), MineDashboardApp.TABLE_NAME, sensorType, 1);
            if (recent.isEmpty()) continue;
            String windowEnd = (String) recent.get(recent.size() - 1).get("window_end");
            double age = Duration.between(Instant.parse(windowEnd), now).toMillis() / 1000.0;
            if (best == null || age < best) best = age;
        }
        return best;
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        String method = (String) event.getOrDefault("httpMethod", "GET");
        String path = normalizePath((String) event.getOrDefault("path", "/"));
        @SuppressWarnings("unchecked")
        Map<String, String> query = (Map<String, String>) event.getOrDefault("queryStringParameters", Map.of());
        if (query == null) query = Map.of();

        Optional<Route> match = Route.find(method, path);
        Map<String, Object> headers = Map.of(
            "Content-Type", "application/json",
            "Access-Control-Allow-Origin", "*");

        if (match.isEmpty()) {
            return response(404, headers, Map.of("error", "not found"));
        }
        try {
            Object body = match.get().handler.handle(this, query);
            return response(200, headers, body);
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
