package com.fec.port.dashboard;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Fetches the fog gateway's /thresholds JSON. Takes HttpClient and the
 * target URL as plain method arguments (not a static field baked in at
 * class load time), so it is directly unit testable against a real local
 * HttpServer without the actual fog container running -- see
 * ThresholdsGatewayTest for both the success and unreachable-upstream paths.
 */
class ThresholdsGateway {

    String fetch(HttpClient client, String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(5))
            .GET()
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }
}
