package com.fec.port.fog;

import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.Executors;

/** Routes via HttpContext.getFilters().add(...), the JDK's own chain-of-responsibility mechanism, dispatching through com.sun.net.httpserver.Filter instead of per-path createContext(). */
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
