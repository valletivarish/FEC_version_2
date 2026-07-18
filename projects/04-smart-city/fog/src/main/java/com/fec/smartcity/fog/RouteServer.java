package com.fec.smartcity.fog;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;

final class RouteServer {

    private final HttpServer server;
    private final Map<String, HttpHandler> handlers = new LinkedHashMap<>();
    private int poolSize = 4;

    private RouteServer(HttpServer server) {
        this.server = server;
    }

    static RouteServer on(int port) throws IOException {
        return new RouteServer(HttpServer.create(new InetSocketAddress(port), 0));
    }

    RouteServer route(String path, HttpHandler handler) {
        handlers.put(path, handler);
        return this;
    }

    RouteServer threads(int count) {
        this.poolSize = count;
        return this;
    }

    HttpServer start() {
        handlers.forEach((path, handler) -> server.createContext(path, shielded(handler)));
        server.setExecutor(Executors.newFixedThreadPool(poolSize));
        server.start();
        return server;
    }

    private static HttpHandler shielded(HttpHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exc) {
                System.out.println(exchange.getRequestURI() + " handler failed: " + exc);
                sendJson(exchange, 500, "{\"error\":\"internal error\"}");
            }
        };
    }

    static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }
}
