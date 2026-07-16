package com.fec.aquaculture.dashboard;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Answers the dashboard API behind a real AWS API Gateway REST API. Dispatch
 * is a nested two-level Map, method then exact path, built once and resolved
 * by two chained lookups -- not a linear scan (project 15), a trie (22), a
 * framework adapter (01, 06), a flat single-level dict (23), a switch
 * expression (24), a template-segment array (25), an enum registry (19), a
 * sealed interface (07), pattern matching (21), or a chain-of-responsibility
 * (10). Reuses PondRepository, PipelineChecks, and ThresholdsGateway
 * directly rather than duplicating their logic.
 */
public class PondDashboardLambda implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "aff-readings");
    private static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "aff-pond-agg");
    private static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "aff-processor");
    private static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    private static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    private static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    private static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    private static final String[] SENSOR_TYPES = {"water_temp_c", "dissolved_oxygen_mgl", "ph_level", "ammonia_ppm", "feed_dispensed_g"};
    private static final int PIPELINE_FRESH_SECONDS = 30;
    private static final int POND_HISTORY_PER_TYPE = 20;
    private static final Map<String, String> CORS_HEADERS = Map.of(
        "Access-Control-Allow-Origin", "*",
        "Content-Type", "application/json"
    );

    interface RouteHandler {
        Object handle(APIGatewayProxyRequestEvent event) throws Exception;
    }

    private final PondRepository repository = new PondRepository();
    private final PipelineChecks checks = new PipelineChecks();
    private final ThresholdsGateway thresholdsGateway = new ThresholdsGateway();
    private final HttpClient upstream = HttpClient.newHttpClient();

    private final Map<String, Map<String, RouteHandler>> routes;
    private DynamoDbClient dynamo;
    private SqsClient sqs;
    private LambdaClient lambda;

    public PondDashboardLambda() {
        this(null, null, null);
    }

    /** Package-private, for tests: pre-seeds the AWS clients so dynamo()/sqs()/lambda() never build real ones. */
    PondDashboardLambda(DynamoDbClient dynamo, SqsClient sqs, LambdaClient lambda) {
        this.dynamo = dynamo;
        this.sqs = sqs;
        this.lambda = lambda;
        routes = new HashMap<>();
        routes.computeIfAbsent("GET", k -> new HashMap<>()).put("/api/ponds", this::handlePonds);
        routes.computeIfAbsent("GET", k -> new HashMap<>()).put("/api/readings", this::handleReadings);
        routes.computeIfAbsent("GET", k -> new HashMap<>()).put("/api/thresholds", this::handleThresholds);
        routes.computeIfAbsent("GET", k -> new HashMap<>()).put("/api/health", this::handleHealth);
        routes.computeIfAbsent("GET", k -> new HashMap<>()).put("/api/backend-stats", this::handleBackendStats);
    }

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        String method = event.getHttpMethod();
        String path = event.getPath();

        if ("OPTIONS".equals(method)) {
            return respond(200, "");
        }

        RouteHandler handler = routes.getOrDefault(method, Map.of()).get(path);
        if (handler == null) {
            return respondJson(404, Map.of("error", "no route for " + method + " " + path));
        }

        try {
            Object body = handler.handle(event);
            return respondJson(200, body);
        } catch (Exception e) {
            return respondJson(502, Map.of("error", e.getMessage() == null ? "internal error" : e.getMessage()));
        }
    }

    private Object handlePonds(APIGatewayProxyRequestEvent event) {
        return repository.byPond(dynamo(), TABLE_NAME, SENSOR_TYPES, POND_HISTORY_PER_TYPE);
    }

    private Object handleReadings(APIGatewayProxyRequestEvent event) {
        Map<String, String> q = event.getQueryStringParameters() == null ? Map.of() : event.getQueryStringParameters();
        String sensorType = q.get("sensor_type");
        int limit = q.containsKey("limit") ? Integer.parseInt(q.get("limit")) : 60;
        var items = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, limit);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sensor_type", sensorType);
        body.put("items", items);
        return body;
    }

    private Object handleThresholds(APIGatewayProxyRequestEvent event) throws Exception {
        String raw = thresholdsGateway.fetch(upstream, FOG_THRESHOLDS_URL);
        return JSON.readValue(raw, Map.class);
    }

    private Object handleHealth(APIGatewayProxyRequestEvent event) {
        Double freshestAge = freshestWindowAgeSeconds();
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("gateway", fogHealthy());
        health.put("queue", checks.queueReachable(sqs(), QUEUE_NAME));
        health.put("lambda", checks.lambdaDeployed(lambda(), FUNCTION_NAME));
        health.put("pipeline", freshestAge != null && freshestAge <= PIPELINE_FRESH_SECONDS);
        health.put("freshest_age_seconds", freshestAge);
        return health;
    }

    private Object handleBackendStats(APIGatewayProxyRequestEvent event) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("queue", checks.queueDepth(sqs(), QUEUE_NAME));
        stats.put("items_in_table", checks.itemCount(dynamo(), TABLE_NAME));
        return stats;
    }

    private boolean fogHealthy() {
        try {
            var request = java.net.http.HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private Double freshestWindowAgeSeconds() {
        Instant now = Instant.now();
        Double best = null;
        for (String sensorType : SENSOR_TYPES) {
            var recent = repository.recentWindows(dynamo(), TABLE_NAME, sensorType, 1);
            if (recent.isEmpty()) continue;
            String windowEnd = (String) recent.get(recent.size() - 1).get("window_end");
            double age = Duration.between(Instant.parse(windowEnd), now).toMillis() / 1000.0;
            if (best == null || age < best) best = age;
        }
        return best;
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
        builder.region(Region.of(REGION));
        if (ENDPOINT != null) {
            builder.endpointOverride(URI.create(ENDPOINT));
            builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    private static APIGatewayProxyResponseEvent respondJson(int status, Object body) {
        try {
            return respond(status, JSON.writeValueAsString(body));
        } catch (Exception e) {
            return respond(500, "{\"error\":\"failed to serialize response\"}");
        }
    }

    private static APIGatewayProxyResponseEvent respond(int status, String body) {
        return new APIGatewayProxyResponseEvent()
            .withStatusCode(status)
            .withHeaders(CORS_HEADERS)
            .withBody(body);
    }
}
