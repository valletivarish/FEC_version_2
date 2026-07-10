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

/**
 * Exercises the Filter chain-of-responsibility directly: several routes are
 * registered on one context's filter chain, and a request only reaches the
 * handler whose (method, path) it actually matches -- every other filter in
 * the chain must call chain.doFilter() and pass it on untouched.
 */
class TerminalRouterTest {

    private HttpServer server;
    private String base;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void start() throws Exception {
        server = TerminalRouter.bind(0, 2, List.of(
            new RouteFilter("GET", "/one", exchange -> {
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            }),
            new RouteFilter("GET", "/two", exchange -> {
                exchange.sendResponseHeaders(201, -1);
                exchange.close();
            }),
            new RouteFilter("POST", "/two", exchange -> {
                exchange.sendResponseHeaders(202, -1);
                exchange.close();
            })
        ));
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
    void firstFilterInTheChainHandlesItsOwnRoute() throws Exception {
        assertEquals(200, statusOf("GET", "/one"));
    }

    @Test
    void requestsPassThroughNonMatchingFiltersToReachTheRightOne() throws Exception {
        // GET /two must skip the "/one" filter and the "POST /two" filter
        // before reaching the "GET /two" filter.
        assertEquals(201, statusOf("GET", "/two"));
    }

    @Test
    void sameHandlerPathDifferentMethodReachesADifferentFilter() throws Exception {
        assertEquals(202, statusOf("POST", "/two"));
    }

    @Test
    void unmatchedRequestFallsThroughEveryFilterToTheTerminal404() throws Exception {
        assertEquals(404, statusOf("GET", "/three"));
    }
}
