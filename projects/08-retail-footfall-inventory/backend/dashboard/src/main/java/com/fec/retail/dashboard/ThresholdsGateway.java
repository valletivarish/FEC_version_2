package com.fec.retail.dashboard;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Fetches the fog gateway's real threshold rules over HTTP. Kept as its own
 * class taking the HttpClient and URL as plain method arguments (not a
 * static-final env-derived constant baked into the call), so the proxy
 * behaviour can be exercised directly against a real local HttpServer in
 * tests without needing to override env vars at test time.
 */
final class ThresholdsGateway {

    String fetch(HttpClient client, String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url))
            .timeout(Duration.ofSeconds(5)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }
}
