package com.fec.transit.fog;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises the fog gateway's real if/else routing chain and /ingest
 * validation over a genuine HttpServer bound to an ephemeral port, so the
 * 400-on-malformed-input behaviour is proven at the actual HTTP layer
 * (status code, response body), not just IngestPayload.parse throwing in
 * isolation.
 */
class TransitGatewayHttpTest {

    private HttpServer server;
    private String base;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        TransitGateway gateway = new TransitGateway();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", gateway::route);
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + path))
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthReturnsOk() throws Exception {
        HttpResponse<String> response = get("/health");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"status\":\"ok\""));
    }

    @Test
    void thresholdsReturnsTheRealRules() throws Exception {
        HttpResponse<String> response = get("/thresholds");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("engine_overheat_risk"));
    }

    @Test
    void unknownPathReturns404() throws Exception {
        HttpResponse<String> response = get("/nope");
        assertEquals(404, response.statusCode());
    }

    @Test
    void ingestWithWrongMethodReturns405() throws Exception {
        HttpResponse<String> response = get("/ingest");
        assertEquals(405, response.statusCode());
    }

    @Test
    void nonJsonBodyReturns400() throws Exception {
        HttpResponse<String> response = post("/ingest", "this is not json");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("malformed JSON body"));
    }

    @Test
    void missingSensorTypeReturns400() throws Exception {
        HttpResponse<String> response = post("/ingest", "{\"readings\":[{\"value\":88.0}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("sensor_type is required"));
    }

    @Test
    void readingsNotAnArrayReturns400() throws Exception {
        HttpResponse<String> response = post("/ingest", "{\"sensor_type\":\"engine_temp_c\",\"readings\":\"oops\"}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("readings must be a JSON array"));
    }

    @Test
    void readingMissingNumericValueReturns400() throws Exception {
        HttpResponse<String> response = post("/ingest", "{\"sensor_type\":\"engine_temp_c\",\"readings\":[{\"ts\":\"x\"}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("numeric value"));
    }

    @Test
    void validPayloadIsAccepted() throws Exception {
        HttpResponse<String> response = post("/ingest",
            "{\"sensor_type\":\"engine_temp_c\",\"site_id\":\"depot-a\",\"unit\":\"C\",\"readings\":[{\"value\":88.0}]}");
        assertEquals(202, response.statusCode());
        assertTrue(response.body().contains("\"accepted\":1"));
    }
}
