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

/**
 * Single HttpServer.createContext("/", ...) registration: every request
 * lands on the same dispatcher and is matched at request time against an
 * ordered List of (path predicate, handler) entries, instead of registering
 * one createContext per route at startup. This differs from every other
 * routing shape in the portfolio: 02 has no reusable router at all (routes
 * wired directly in main(), no error boundary), 04's RouteServer and 07's
 * Router both still register one createContext per route (accumulated then
 * wired, or wired immediately), and 08's Route enum iterates values() once
 * in wireAll() to register one context per constant. Here there is exactly
 * one registered context; routing is a runtime decision, not a startup-time
 * one. Every dispatch is wrapped in a try/catch translating any uncaught
 * exception into a structured 500 JSON response.
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
