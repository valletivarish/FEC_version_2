package com.fec.port.fog;

import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * One link in a com.sun.net.httpserver.Filter chain-of-responsibility: if
 * this exchange's method and path match, handle it directly and stop the
 * chain (never call chain.doFilter); otherwise pass the exchange on
 * untouched via chain.doFilter(exchange) so the next filter (or, if none
 * match, the terminal 404 handler) gets a turn. See TerminalRouter for how
 * these are registered and why this is a genuinely different routing
 * mechanism from every other Java fog sibling in this portfolio.
 */
public class RouteFilter extends Filter {

    private final String method;
    private final String path;
    private final HttpHandler handler;

    public RouteFilter(String method, String path, HttpHandler handler) {
        this.method = method;
        this.path = path;
        this.handler = handler;
    }

    @Override
    public String description() {
        return method + " " + path;
    }

    @Override
    public void doFilter(HttpExchange exchange, Chain chain) throws IOException {
        boolean matches = exchange.getRequestMethod().equals(method)
            && exchange.getRequestURI().getPath().equals(path);
        if (!matches) {
            chain.doFilter(exchange);
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
}
