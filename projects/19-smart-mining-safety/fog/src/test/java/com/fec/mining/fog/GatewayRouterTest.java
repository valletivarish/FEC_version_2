package com.fec.mining.fog;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Exercises the "METHOD path" route table's 404-vs-405 distinction over a real HttpServer on an ephemeral port. */
class GatewayRouterTest {

    private HttpServer server;
    private String base;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        GatewayRouter router = new GatewayRouter()
            .route("GET", "/health", exchange -> {
                byte[] body = "{\"status\":\"ok\"}".getBytes();
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            })
            .route("POST", "/ingest", exchange -> {
                exchange.sendResponseHeaders(202, -1);
                exchange.close();
            });
        server = router.bind(0, 2);
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private int statusOf(String method, String path) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + path));
        builder = method.equals("POST") ? builder.POST(HttpRequest.BodyPublishers.noBody()) : builder.GET();
        return client.send(builder.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void knownRouteRespondsNormally() throws Exception {
        assertEquals(200, statusOf("GET", "/health"));
    }

    @Test
    void wrongMethodOnAKnownPathIsA405NotA404() throws Exception {
        assertEquals(405, statusOf("GET", "/ingest"));
    }

    @Test
    void unknownPathIsA404() throws Exception {
        assertEquals(404, statusOf("GET", "/nope"));
    }
}
