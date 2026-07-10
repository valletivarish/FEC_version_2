package com.fec.mining.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MineDashboardAppTest {

    @Test
    void parseQueryHandlesMultipleParams() {
        var params = MineDashboardApp.parseQuery("sensor_type=methane_ppm&limit=10");
        assertEquals("methane_ppm", params.get("sensor_type"));
        assertEquals("10", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQueryString() {
        var params = MineDashboardApp.parseQuery(null);
        assertEquals(0, params.size());
    }

    @Test
    void parseQueryUrlDecodesValues() {
        var params = MineDashboardApp.parseQuery("sensor_type=ground_vibration_mms%20test");
        assertEquals("ground_vibration_mms test", params.get("sensor_type"));
    }

    @Test
    void contentTypeForResolvesKnownExtensions() {
        assertEquals("text/html", MineDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", MineDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", MineDashboardApp.contentTypeFor("static/style.css"));
        assertEquals("application/octet-stream", MineDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
