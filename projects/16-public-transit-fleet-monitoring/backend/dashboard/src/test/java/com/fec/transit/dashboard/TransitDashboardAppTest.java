package com.fec.transit.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TransitDashboardAppTest {

    @Test
    void parseQueryHandlesMultipleParams() {
        var params = TransitDashboardApp.parseQuery("sensor_type=engine_temp_c&limit=10");
        assertEquals("engine_temp_c", params.get("sensor_type"));
        assertEquals("10", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQueryString() {
        var params = TransitDashboardApp.parseQuery(null);
        assertEquals(0, params.size());
    }

    @Test
    void parseQueryUrlDecodesValues() {
        var params = TransitDashboardApp.parseQuery("sensor_type=brake_pad_wear_pct%20test");
        assertEquals("brake_pad_wear_pct test", params.get("sensor_type"));
    }

    @Test
    void contentTypeForResolvesKnownExtensions() {
        assertEquals("text/html", TransitDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", TransitDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", TransitDashboardApp.contentTypeFor("static/style.css"));
        assertEquals("application/octet-stream", TransitDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
