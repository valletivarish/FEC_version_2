package com.fec.port.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TerminalDashboardAppTest {

    @Test
    void parseQueryHandlesMultipleParams() {
        var params = TerminalDashboardApp.parseQuery("sensor_type=crane_load_kg&limit=10");
        assertEquals("crane_load_kg", params.get("sensor_type"));
        assertEquals("10", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQueryString() {
        var params = TerminalDashboardApp.parseQuery(null);
        assertEquals(0, params.size());
    }

    @Test
    void parseQueryUrlDecodesValues() {
        var params = TerminalDashboardApp.parseQuery("sensor_type=berth%20occupancy");
        assertEquals("berth occupancy", params.get("sensor_type"));
    }

    @Test
    void contentTypeForResolvesKnownExtensions() {
        assertEquals("text/html", TerminalDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", TerminalDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", TerminalDashboardApp.contentTypeFor("static/style.css"));
        assertEquals("application/octet-stream", TerminalDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
