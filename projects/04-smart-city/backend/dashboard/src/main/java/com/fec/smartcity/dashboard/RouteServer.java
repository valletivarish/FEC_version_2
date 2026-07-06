package com.fec.smartcity.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
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

    private static final ObjectMapper JSON = new ObjectMapper();

    private final HttpServer server;
    private final Map<String, HttpHandler> routes = new LinkedHashMap<>();
    private int threadCount = 8;

    private RouteServer(HttpServer server) {
        this.server = server;
    }

    static RouteServer on(int port) throws IOException {
        return new RouteServer(HttpServer.create(new InetSocketAddress(port), 0));
    }

    RouteServer route(String path, HttpHandler handler) {
        routes.put(path, handler);
        return this;
    }

    RouteServer threads(int count) {
        this.threadCount = count;
        return this;
    }

    HttpServer start() {
        routes.forEach((path, handler) -> server.createContext(path, guarded(handler)));
        server.setExecutor(Executors.newFixedThreadPool(threadCount));
        server.start();
        return server;
    }

    private static HttpHandler guarded(HttpHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exc) {
                System.out.println(exchange.getRequestURI() + " handler failed: " + exc);
                sendJson(exchange, 500, "{\"error\":\"internal error\"}");
            }
        };
    }

    static void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        String text = body instanceof String ? (String) body : JSON.writeValueAsString(body);
        sendRaw(exchange, status, text.getBytes(StandardCharsets.UTF_8), "application/json", null);
    }

    static void sendRaw(HttpExchange exchange, int status, byte[] bytes, String contentType, String cacheControl) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        if (cacheControl != null) exchange.getResponseHeaders().set("Cache-Control", cacheControl);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
