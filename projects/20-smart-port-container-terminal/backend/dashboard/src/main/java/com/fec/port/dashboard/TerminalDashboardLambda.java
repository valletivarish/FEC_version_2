package com.fec.port.dashboard;

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
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Answers the dashboard API behind a real AWS API Gateway REST API. Dispatch
 * is one flat map keyed by a record -- RouteKey(method, path) -- so each
 * request resolves with a single routes.get(new RouteKey(...)) lookup riding
 * the record's generated equals/hashCode: no nested maps, no scanning, no
 * switch. Reuses BerthRepository, PipelineStatus, and ThresholdsGateway
 * directly rather than duplicating their logic.
 */
public class TerminalDashboardLambda implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    record RouteKey(String method, String path) {}

    interface RouteHandler {
        Object handle(APIGatewayProxyRequestEvent event) throws Exception;
    }

    static final ObjectMapper JSON = new ObjectMapper();
    static final String TABLE_NAME = System.getenv().getOrDefault("TABLE_NAME", "spc-readings");
    static final String QUEUE_NAME = System.getenv().getOrDefault("SQS_QUEUE_NAME", "spc-berth-agg");
    static final String FUNCTION_NAME = System.getenv().getOrDefault("LAMBDA_FUNCTION_NAME", "spc-processor");
    static final String ENDPOINT = System.getenv("AWS_ENDPOINT_URL");
    static final String REGION = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
    static final String FOG_HEALTH_URL = System.getenv().getOrDefault("FOG_HEALTH_URL", "http://fog:8000/health");
    static final String FOG_THRESHOLDS_URL = System.getenv().getOrDefault("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds");
    static final String[] SENSOR_TYPES = {"crane_load_kg", "container_stack_height", "wind_speed_knots",
        "berth_occupancy_pct", "reefer_temp_c"};
    static final int PIPELINE_FRESH_SECONDS = 30;
    static final int BERTH_HISTORY_PER_TYPE = 20;
    static final Map<String, String> CORS_HEADERS = Map.of(
        "Access-Control-Allow-Origin", "*",
        "Content-Type", "application/json");

    private final BerthRepository repository = new BerthRepository();
    private final PipelineStatus checks = new PipelineStatus();
    private final ThresholdsGateway thresholdsGateway = new ThresholdsGateway();
    private final HttpClient upstream = HttpClient.newHttpClient();

    private final Map<RouteKey, RouteHandler> routes;
    private DynamoDbClient dynamo;
    private SqsClient sqs;
    private LambdaClient lambda;
    private String thresholdsCache;

    public TerminalDashboardLambda() {
        this(null, null, null);
    }

    /** Package-private, for tests: pre-seeds the AWS clients so dynamo()/sqs()/lambda() never build real ones. */
    TerminalDashboardLambda(DynamoDbClient dynamo, SqsClient sqs, LambdaClient lambda) {
        this.dynamo = dynamo;
        this.sqs = sqs;
        this.lambda = lambda;
        routes = Map.of(
            new RouteKey("GET", "/api/berths"), this::handleBerths,
            new RouteKey("GET", "/api/readings"), this::handleReadings,
            new RouteKey("GET", "/api/thresholds"), this::handleThresholds,
            new RouteKey("GET", "/api/health"), this::handleHealth,
            new RouteKey("GET", "/api/backend-stats"), this::handleBackendStats);
    }

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent event, Context context) {
        if ("OPTIONS".equals(event.getHttpMethod())) {
            return respond(200, "");
        }
        RouteHandler handler = routes.get(new RouteKey(event.getHttpMethod(), event.getPath()));
        if (handler == null) {
            return respondJson(404, Map.of("error", "no route for " + event.getHttpMethod() + " " + event.getPath()));
        }
        try {
            return respondJson(200, handler.handle(event));
        } catch (Exception e) {
            return respondJson(502, Map.of("error", e.getMessage() == null ? "internal error" : e.getMessage()));
        }
    }

    private Object handleBerths(APIGatewayProxyRequestEvent event) {
        return repository.byBerth(dynamo(), TABLE_NAME, SENSOR_TYPES, BERTH_HISTORY_PER_TYPE);
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

    private synchronized Object handleThresholds(APIGatewayProxyRequestEvent event) throws Exception {
        // Cached for the invocation environment's lifetime: BerthRules.CATALOG
        // is a static, code-defined constant that never changes at runtime,
        // so refetching it per request would just be a repeated round-trip to
        // fog with no fresher data to show for it.
        if (thresholdsCache == null) {
            thresholdsCache = thresholdsGateway.fetch(upstream, FOG_THRESHOLDS_URL);
        }
        return JSON.readValue(thresholdsCache, Map.class);
    }

    private Object handleHealth(APIGatewayProxyRequestEvent event) {
        Double freshestAge = freshestWindowAgeSeconds();
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("gateway", gatewayHealthy());
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

    private boolean gatewayHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(FOG_HEALTH_URL))
                .timeout(Duration.ofSeconds(2)).GET().build();
            return upstream.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
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
        // Static test/test credentials are LocalStack-only. Gating this on
        // ENDPOINT lets the real deployment fall through to the SDK default
        // chain (the Lambda execution role) instead of misauthenticating
        // against real AWS with a fake pair.
        if (ENDPOINT != null) {
            builder.endpointOverride(URI.create(ENDPOINT))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")));
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
