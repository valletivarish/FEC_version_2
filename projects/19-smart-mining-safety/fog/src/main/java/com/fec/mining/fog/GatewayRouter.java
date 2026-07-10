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

/**
 * Single HttpHandler registered at "/" that looks routes up in a flat
 * Map<String, HttpHandler> keyed by "METHOD path" (e.g. "GET /health",
 * "POST /ingest") -- an O(1) table lookup, distinct from every other Java
 * fog sibling's routing/dispatch style in this portfolio: 02 registers one
 * server.createContext() lambda per path directly in main(); 04's
 * RouteServer and 07's Router are both thin fluent wrappers that still call
 * server.createContext() once per path under the hood; 08's Route is an
 * enum where each constant IS a route, iterated via wireAll(); 09's
 * PathDispatcher does a linear scan over a List<Route> of
 * (Predicate<String> pathMatcher, HttpHandler) pairs; 16 uses a literal
 * if/else-if string-equality chain inside one route() method.
 *
 * Keying by HTTP method as well as path also lets this router tell a real
 * 404 (no route registered for that path at all) apart from a 405 (the path
 * exists, wrong method) -- none of the six siblings distinguish those two
 * cases; 02's FogApp instead hardcodes a manual method check only inside
 * its /ingest handler, and the rest don't check method at all.
 */
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
