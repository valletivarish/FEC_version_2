package com.fec.port.fog;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises /health, /thresholds and /ingest over a real HttpServer bound to
 * an ephemeral port (via TerminalRouter.bind(0, ...)), so the 400-on-
 * malformed-input behaviour is proven at the actual
 * HTTP layer -- status code and body -- not just a unit test of
 * IngestValidation.parse() in isolation.
 */
class TerminalGatewayHttpTest {

    private HttpServer server;
    private String base;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        TerminalGateway gateway = new TerminalGateway();
        server = TerminalRouter.bind(0, 2, List.of(
            new RouteFilter("GET", "/health", gateway::handleHealth),
            new RouteFilter("GET", "/thresholds", gateway::handleThresholds),
            new RouteFilter("POST", "/ingest", gateway::handleIngest)
        ));
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(base + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + "/ingest"))
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthReturns200Ok() throws Exception {
        HttpResponse<String> response = get("/health");
        assertEquals(200, response.statusCode());
        assertEquals("{\"status\":\"ok\"}", response.body());
    }

    @Test
    void thresholdsExposesTheRealRules() throws Exception {
        HttpResponse<String> response = get("/thresholds");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("berth_congestion_warning"));
    }

    @Test
    void nonJsonBodyReturns400() throws Exception {
        HttpResponse<String> response = post("this is not json");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("malformed JSON body"));
    }

    @Test
    void missingSensorTypeReturns400() throws Exception {
        HttpResponse<String> response = post("{\"readings\":[{\"value\":320.0}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("sensor_type is required"));
    }

    @Test
    void readingsNotAnArrayReturns400() throws Exception {
        HttpResponse<String> response = post("{\"sensor_type\":\"crane_load_kg\",\"readings\":\"oops\"}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("readings must be a JSON array"));
    }

    @Test
    void readingMissingNumericValueReturns400() throws Exception {
        HttpResponse<String> response = post("{\"sensor_type\":\"crane_load_kg\",\"readings\":[{\"ts\":\"x\"}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("numeric value"));
    }

    @Test
    void validPayloadIsAccepted() throws Exception {
        HttpResponse<String> response = post(
            "{\"sensor_type\":\"crane_load_kg\",\"site_id\":\"berth-a\",\"unit\":\"kg\",\"readings\":[{\"value\":15200.5}]}");
        assertEquals(202, response.statusCode());
        assertTrue(response.body().contains("\"accepted\":1"));
    }

    @Test
    void unregisteredPathReturns404() throws Exception {
        HttpResponse<String> response = get("/nope");
        assertEquals(404, response.statusCode());
    }

    @Test
    void wrongMethodOnIngestFallsThroughToNotFound() throws Exception {
        HttpResponse<String> response = get("/ingest");
        assertEquals(404, response.statusCode());
    }
}
