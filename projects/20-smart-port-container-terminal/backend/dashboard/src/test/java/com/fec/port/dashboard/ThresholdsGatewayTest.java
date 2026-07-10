package com.fec.port.dashboard;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThresholdsGatewayTest {

    @Test
    void fetchReturnsTheRealUpstreamBody() throws Exception {
        HttpServer upstream = HttpServer.create(new InetSocketAddress(0), 0);
        upstream.createContext("/thresholds", exchange -> {
            byte[] body = "{\"crane_load_kg\":[{\"field\":\"avg\",\"op\":\">\",\"limit\":32000.0,\"key\":\"crane_overload_risk\"}]}"
                .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.getResponseBody().close();
        });
        upstream.start();
        try {
            int port = upstream.getAddress().getPort();
            String result = new ThresholdsGateway().fetch(HttpClient.newHttpClient(), "http://localhost:" + port + "/thresholds");
            assertTrue(result.contains("crane_overload_risk"));
        } finally {
            upstream.stop(0);
        }
    }

    @Test
    void fetchThrowsWhenTheUpstreamIsUnreachable() {
        assertThrows(Exception.class, () ->
            new ThresholdsGateway().fetch(HttpClient.newHttpClient(), "http://127.0.0.1:1/thresholds"));
    }
}
