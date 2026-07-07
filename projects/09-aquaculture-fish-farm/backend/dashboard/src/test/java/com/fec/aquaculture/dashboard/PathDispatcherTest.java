package com.fec.aquaculture.dashboard;

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

class PathDispatcherTest {

    private HttpServer server;
    private int port;

    @BeforeEach
    void start() throws Exception {
        PathDispatcher dispatcher = new PathDispatcher()
            .exact("/api/health", exchange -> PathDispatcher.respond(exchange, 200, "{\"ok\":true}"))
            .prefix("/static", exchange -> PathDispatcher.respond(exchange, 200, "{\"served\":true}"))
            .exact("/boom", exchange -> { throw new RuntimeException("deliberate failure"); });
        server = PathDispatcher.bind(0, 2, dispatcher);
        server.start();
        port = server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void exactMatchIsDispatched() throws Exception {
        HttpResponse<String> response = get("/api/health");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"ok\":true"));
    }

    @Test
    void prefixMatchIsDispatchedForAnySubPath() throws Exception {
        HttpResponse<String> response = get("/static/vendor/chart.umd.min.js");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"served\":true"));
    }

    @Test
    void unmatchedPathReturns404() throws Exception {
        assertEquals(404, get("/nope").statusCode());
    }

    @Test
    void handlerExceptionIsTranslatedToA500JsonErrorNotACrash() throws Exception {
        HttpResponse<String> response = get("/boom");
        assertEquals(500, response.statusCode());
        assertTrue(response.body().contains("\"error\""));
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
