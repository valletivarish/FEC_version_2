package com.fec.smartcity.dashboard;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CityDashboardAppTest {

    @Test
    void windowRecencyKeepsSmallestOfferedAge() {
        Instant now = Instant.parse("2026-01-01T00:01:00Z");
        var recency = new CityDashboardApp.WindowRecency()
            .offer("2026-01-01T00:00:40Z", now)
            .offer("2026-01-01T00:00:55Z", now)
            .offer(null, now);
        assertThat(recency.bestAgeSeconds()).isEqualTo(5.0);
    }

    @Test
    void windowRecencyHasNoAgeWhenNothingOffered() {
        var recency = new CityDashboardApp.WindowRecency();
        assertThat(recency.bestAgeSeconds()).isNull();
    }

    @Test
    void responseFieldsRejectsDuplicateKeys() {
        var fields = new CityDashboardApp.ResponseFields().with("relay", true);
        assertThatThrownBy(() -> fields.with("relay", false)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void responseFieldsRejectsBlankKeys() {
        var fields = new CityDashboardApp.ResponseFields();
        assertThatThrownBy(() -> fields.with("", true)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void responseFieldsPreservesInsertionOrder() {
        var built = new CityDashboardApp.ResponseFields().with("relay", true).with("queue", false).build();
        assertThat(built.keySet()).containsExactly("relay", "queue");
    }

    @Test
    void parseQueryReadsMultipleParams() {
        var params = CityDashboardApp.parseQuery("sensor_type=vehicle_count&limit=30");
        assertThat(params).containsEntry("sensor_type", "vehicle_count").containsEntry("limit", "30");
    }

    @Test
    void parseQueryHandlesNullQuery() {
        assertThat(CityDashboardApp.parseQuery(null)).isEmpty();
    }

    @Test
    void parseQueryDecodesUrlEncodedValues() {
        var params = CityDashboardApp.parseQuery("site_id=zone%201&label=north%2Fgate");
        assertThat(params).containsEntry("site_id", "zone 1").containsEntry("label", "north/gate");
    }

    @Test
    void parseQueryTreatsMissingValueAsEmptyString() {
        var params = CityDashboardApp.parseQuery("sensor_type");
        assertThat(params).containsEntry("sensor_type", "");
    }

    @ParameterizedTest(name = "contentTypeFor(''{0}'') is {1}")
    @CsvSource({
        "static/index.html, text/html",
        "static/dashboard.js, application/javascript",
        "static/style.css, text/css"
    })
    void contentTypeForKnownExtensions(String path, String expectedType) {
        assertThat(CityDashboardApp.contentTypeFor(path)).isEqualTo(expectedType);
    }

    @Test
    void contentTypeForUnknownExtensionFallsBackToOctetStream() {
        assertThat(CityDashboardApp.contentTypeFor("static/readings.bin")).isEqualTo("application/octet-stream");
    }

    @Test
    void contentTypeForPathWithoutExtensionFallsBackToOctetStream() {
        assertThat(CityDashboardApp.contentTypeFor("static/README")).isEqualTo("application/octet-stream");
    }
}
