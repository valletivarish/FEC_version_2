package com.fec.aquaculture.fog;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises /ingest over a real HttpServer bound to an ephemeral port, so
 * the 400-on-malformed-input behaviour is proven at the actual HTTP layer
 * (status code, not just IngestPayload.parse throwing in isolation).
 */
class PondGatewayHttpTest {

    private HttpServer server;
    private String base;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        PondGateway gateway = new PondGateway();
        PathDispatcher dispatcher = new PathDispatcher().exact("/ingest", gateway::handleIngest);
        server = PathDispatcher.bind(0, 2, dispatcher);
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private HttpResponse<String> post(String body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + "/ingest"))
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void nonJsonBodyReturns400() throws Exception {
        HttpResponse<String> response = post("this is not json");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("malformed JSON body"));
    }

    @Test
    void missingSensorTypeReturns400() throws Exception {
        HttpResponse<String> response = post("{\"readings\":[{\"value\":7.2}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("sensor_type is required"));
    }

    @Test
    void readingsNotAnArrayReturns400() throws Exception {
        HttpResponse<String> response = post("{\"sensor_type\":\"ph_level\",\"readings\":\"oops\"}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("readings must be a JSON array"));
    }

    @Test
    void readingMissingNumericValueReturns400() throws Exception {
        HttpResponse<String> response = post("{\"sensor_type\":\"ph_level\",\"readings\":[{\"ts\":\"x\"}]}");
        assertEquals(400, response.statusCode());
        assertTrue(response.body().contains("numeric value"));
    }

    @Test
    void validPayloadIsAccepted() throws Exception {
        HttpResponse<String> response = post(
            "{\"sensor_type\":\"ph_level\",\"site_id\":\"pond-1\",\"unit\":\"pH\",\"readings\":[{\"value\":7.2}]}");
        assertEquals(202, response.statusCode());
        assertTrue(response.body().contains("\"accepted\":1"));
    }
}
