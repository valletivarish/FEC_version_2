package com.fec.mining.fog;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

// Flat Map<String, HttpHandler> keyed by "METHOD path" for O(1) route lookup that also distinguishes real 404s (unknown path) from 405s (wrong method).
public class GatewayRouter implements HttpHandler {

    private final Map<String, HttpHandler> routes = new HashMap<>();

    public GatewayRouter route(String method, String path, HttpHandler handler) {
        routes.put(method + " " + path, handler);
        return this;
    }

    private boolean pathKnown(String path) {
        return routes.keySet().stream().anyMatch(key -> key.endsWith(" " + path));
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        HttpHandler handler = routes.get(method + " " + path);
        if (handler == null) {
            exchange.sendResponseHeaders(pathKnown(path) ? 405 : 404, -1);
            exchange.close();
            return;
        }
        try {
            handler.handle(exchange);
        } catch (Exception e) {
            byte[] bytes = "{\"error\":\"internal error\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(500, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        }
    }

    public HttpServer bind(int port, int workerThreads) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", this);
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
        return server;
    }
}
