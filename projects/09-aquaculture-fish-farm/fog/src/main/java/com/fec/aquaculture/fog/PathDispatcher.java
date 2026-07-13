package com.fec.aquaculture.fog;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/** Single createContext("/", ...) registration dispatching at request time over an ordered List<Route> of (path predicate, handler) pairs, rather than one createContext per route at startup. */
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

    static HttpServer bind(int port, int workerThreads, PathDispatcher dispatcher) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", dispatcher);
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(workerThreads));
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
            respond(exchange, 500, StreamingJson.error("internal error"));
        }
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
