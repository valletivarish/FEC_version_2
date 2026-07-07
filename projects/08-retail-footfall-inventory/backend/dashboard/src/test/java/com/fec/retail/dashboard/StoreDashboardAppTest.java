package com.fec.retail.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class StoreDashboardAppTest {

    @Test
    void parseQueryReadsMultipleParams() {
        var params = StoreDashboardApp.parseQuery("sensor_type=queue_length&limit=30");
        assertEquals("queue_length", params.get("sensor_type"));
        assertEquals("30", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQuery() {
        assertTrue(StoreDashboardApp.parseQuery(null).isEmpty());
    }

    @Test
    void contentTypeForKnownExtensions() {
        assertEquals("text/html", StoreDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", StoreDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", StoreDashboardApp.contentTypeFor("static/style.css"));
    }

    @Test
    void contentTypeForUnknownExtensionFallsBackToOctetStream() {
        assertEquals("application/octet-stream", StoreDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
