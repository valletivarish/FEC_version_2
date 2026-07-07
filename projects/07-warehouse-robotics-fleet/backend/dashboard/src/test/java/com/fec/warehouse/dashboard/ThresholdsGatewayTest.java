package com.fec.warehouse.dashboard;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThresholdsGatewayTest {

    @Test
    void fetchReturnsTheRealUpstreamBody() throws Exception {
        HttpServer upstream = HttpServer.create(new InetSocketAddress(0), 0);
        upstream.createContext("/thresholds", exchange -> {
            byte[] body = ("{\"motor_temp_c\":[{\"field\":\"avg\",\"op\":\">\",\"limit\":75,"
                + "\"key\":\"motor_overheat\"}]}").getBytes();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.getResponseBody().close();
        });
        upstream.start();
        try {
            String url = "http://127.0.0.1:" + upstream.getAddress().getPort() + "/thresholds";
            String result = new ThresholdsGateway().fetch(HttpClient.newHttpClient(), url);
            assertTrue(result.contains("motor_overheat"));
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
