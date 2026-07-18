package com.fec.retail.dashboard;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.function.Function;

/** Each dashboard endpoint as an enum constant binding its handler off a live app; wireAll() attaches them behind a shared error boundary. */
enum DashboardRoute {

    STORES("/api/stores", StoreDashboardApp::handleStores),
    READINGS("/api/readings", StoreDashboardApp::handleReadings),
    THRESHOLDS("/api/thresholds", StoreDashboardApp::handleThresholds),
    HEALTH("/api/health", StoreDashboardApp::handleHealth),
    BACKEND_STATS("/api/backend-stats", StoreDashboardApp::handleBackendStats),
    STATIC("/static", StoreDashboardApp::handleStatic),
    INDEX("/", StoreDashboardApp::handleIndex);

    private final String path;
    private final Function<StoreDashboardApp, HttpHandler> binder;

    DashboardRoute(String path, Function<StoreDashboardApp, HttpHandler> binder) {
        this.path = path;
        this.binder = binder;
    }

    static void wireAll(HttpServer server, StoreDashboardApp app, int workerThreads) {
        for (DashboardRoute route : values()) {
            server.createContext(route.path, guarded(route.binder.apply(app)));
        }
        server.setExecutor(Executors.newFixedThreadPool(workerThreads));
    }

    private static HttpHandler guarded(HttpHandler handler) {
        return exchange -> {
            try {
                handler.handle(exchange);
            } catch (Exception exc) {
                System.out.println(exchange.getRequestURI() + " failed: " + exc);
                Map<String, String> error = new LinkedHashMap<>();
                error.put("error", "internal error");
                StoreDashboardApp.writeJsonStatic(exchange, 500, error);
            }
        };
    }
}
