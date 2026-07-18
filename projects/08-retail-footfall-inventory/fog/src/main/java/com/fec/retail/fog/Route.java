package com.fec.retail.fog;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/** Each gateway endpoint as an enum constant; wireAll() attaches them, wrapping every handler in a 500 error boundary. */
enum Route {

    HEALTH("/health", exchange -> respond(exchange, 200, "{\"status\":\"ok\"}")),
    THRESHOLDS("/thresholds", StoreGateway::handleThresholds),
    INGEST("/ingest", StoreGateway::handleIngest);

    private final String path;
    private final HttpHandler handler;

    Route(String path, HttpHandler handler) {
        this.path = path;
        this.handler = handler;
    }

    static void wireAll(HttpServer server, int workerThreads) {
        for (Route route : values()) {
            server.createContext(route.path, guarded(route.handler));
        }
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
    }

    private static HttpHandler guarded(HttpHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exc) {
                System.out.println(exchange.getRequestURI() + " failed: " + exc);
                respond(exchange, 500, "{\"error\":\"internal error\"}");
            }
        };
    }

    static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static String bodyOf(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }
}
