package com.fec.warehouse.fog;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Registers handlers against an HttpServer instance directly (createContext),
 * with a shared error boundary and response-writing helpers, rather than
 * collecting routes into an intermediate map first.
 */
public class Router {

    private final HttpServer server;

    private Router(HttpServer server) {
        this.server = server;
    }

    public static Router bind(int port, int workerThreads) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
        return new Router(server);
    }

    public Router handle(String path, HttpHandler handler) {
        server.createContext(path, exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exc) {
                System.out.println(path + " failed: " + exc);
                respond(exchange, 500, "{\"error\":\"internal error\"}");
            }
        });
        return this;
    }

    public void listen() {
        server.start();
    }

    public static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static String bodyOf(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }
}
