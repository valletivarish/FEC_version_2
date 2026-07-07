package com.fec.aquaculture.dashboard;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.function.Predicate;

/**
 * Same single-context, request-time path-matching dispatcher as the fog
 * module (see fog/PathDispatcher): one HttpServer.createContext("/", ...)
 * registration, routing decided per-request against an ordered List of
 * (path predicate, handler) entries rather than one createContext call per
 * route at startup. Every dispatch is wrapped in a try/catch translating any
 * uncaught exception into a structured 500 JSON response.
 */
final class PathDispatcher implements HttpHandler {

    private final List<Route> routes = new ArrayList<>();

    record Route(Predicate<String> pathMatcher, HttpHandler handler) {}

    PathDispatcher route(Predicate<String> pathMatcher, HttpHandler handler) {
        routes.add(new Route(pathMatcher, handler));
        return this;
    }

    PathDispatcher exact(String path, HttpHandler handler) {
        return route(p -> p.equals(path), handler);
    }

    PathDispatcher prefix(String prefix, HttpHandler handler) {
        return route(p -> p.startsWith(prefix), handler);
    }

    static HttpServer bind(int port, int workerThreads, PathDispatcher dispatcher) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", dispatcher);
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
        return server;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            for (Route route : routes) {
                if (route.pathMatcher().test(path)) {
                    route.handler().handle(exchange);
                    return;
                }
            }
            exchange.sendResponseHeaders(404, -1);
        } catch (Exception exc) {
            System.out.println(exchange.getRequestURI() + " failed: " + exc);
            respond(exchange, 500, "{\"error\":\"internal error\"}");
        }
    }

    static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static void respondBytes(HttpExchange exchange, int status, byte[] bytes, String contentType) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    static String bodyOf(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }
}
