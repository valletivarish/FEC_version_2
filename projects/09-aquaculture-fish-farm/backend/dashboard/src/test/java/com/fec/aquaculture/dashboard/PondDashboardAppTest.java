package com.fec.aquaculture.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PondDashboardAppTest {

    @Test
    void parseQueryHandlesMultipleParams() {
        var params = PondDashboardApp.parseQuery("sensor_type=ph_level&limit=10");
        assertEquals("ph_level", params.get("sensor_type"));
        assertEquals("10", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQueryString() {
        var params = PondDashboardApp.parseQuery(null);
        assertEquals(0, params.size());
    }

    @Test
    void parseQueryUrlDecodesValues() {
        var params = PondDashboardApp.parseQuery("sensor_type=dissolved_oxygen_mgl%20test");
        assertEquals("dissolved_oxygen_mgl test", params.get("sensor_type"));
    }

    @Test
    void contentTypeForResolvesKnownExtensions() {
        assertEquals("text/html", PondDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", PondDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", PondDashboardApp.contentTypeFor("static/style.css"));
        assertEquals("application/octet-stream", PondDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
