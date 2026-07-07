package com.fec.warehouse.dashboard;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Fetches the fog gateway's real threshold rules over HTTP. Pulled out of
 * FleetDashboardApp as its own class, taking the client and URL as plain
 * arguments, so the proxy behaviour (success body passthrough, exception on
 * an unreachable upstream) can be exercised directly against a real local
 * HttpServer in tests without depending on the env-derived FOG_THRESHOLDS_URL
 * constant.
 */
final class ThresholdsGateway {

    String fetch(HttpClient client, String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url))
            .timeout(Duration.ofSeconds(5)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString()).body();
    }
}
