package com.fec.industrial.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class DashboardAppTest {

    @Test
    void parseQueryReadsMultipleParams() {
        var params = DashboardApp.parseQuery("sensor_type=vibration&limit=30");
        assertEquals("vibration", params.get("sensor_type"));
        assertEquals("30", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQuery() {
        assertTrue(DashboardApp.parseQuery(null).isEmpty());
    }

    @Test
    void contentTypeForKnownExtensions() {
        assertEquals("text/html", DashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", DashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", DashboardApp.contentTypeFor("static/style.css"));
    }
}
