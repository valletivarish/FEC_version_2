package com.fec.port.fog;

import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.Executors;

/**
 * Binds a single root context ("/") whose terminal handler is a plain 404,
 * then registers each RouteFilter onto that ONE context's own filter chain
 * (HttpContext.getFilters().add(...)) -- the JDK's built-in
 * chain-of-responsibility mechanism, applied to every request before the
 * context handler ever runs. This is a genuinely different routing/dispatch
 * MECHANISM from every other Java fog sibling in this portfolio, none of
 * which touch com.sun.net.httpserver.Filter at all: 02 registers one
 * server.createContext() lambda per path directly in main(); 04's
 * RouteServer and 07's Router are thin fluent wrappers that still call
 * server.createContext() once per path under the hood; 08's Route is an enum
 * where each constant IS a route, iterated via wireAll(); 09's
 * PathDispatcher does a single createContext("/") plus a linear scan over a
 * List<Route> of (Predicate<String>, HttpHandler) pairs; 16 uses a single
 * createContext("/") plus a literal if/else-if string-equality chain; 19's
 * GatewayRouter is a single createContext("/") plus a genuine
 * Map<String,HttpHandler> table keyed by "METHOD path" with O(1) lookup and
 * an explicit 404-vs-405 distinction. This class keeps things simpler than
 * 19 on purpose (no 404-vs-405 split -- an unmatched method on a known path
 * falls through to the same plain 404 as an unknown path) precisely because
 * the interesting difference is the MECHANISM (a chain of independent
 * Filter objects, each free to intercept or pass the request on) rather
 * than a lookup table.
 */
public class TerminalRouter {

    public static HttpServer bind(int port, int workerThreads, List<RouteFilter> routes) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        HttpContext root = server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        });
        for (RouteFilter route : routes) {
            root.getFilters().add(route);
        }
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
        return server;
    }
}
