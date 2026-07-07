package com.fec.warehouse.dashboard;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FleetDashboardAppTest {

    @Test
    void parseQueryReadsMultipleParams() {
        var params = FleetDashboardApp.parseQuery("sensor_type=motor_temp_c&limit=30");
        assertEquals("motor_temp_c", params.get("sensor_type"));
        assertEquals("30", params.get("limit"));
    }

    @Test
    void parseQueryHandlesNullQuery() {
        assertTrue(FleetDashboardApp.parseQuery(null).isEmpty());
    }

    @Test
    void contentTypeForKnownExtensions() {
        assertEquals("text/html", FleetDashboardApp.contentTypeFor("static/index.html"));
        assertEquals("application/javascript", FleetDashboardApp.contentTypeFor("static/dashboard.js"));
        assertEquals("text/css", FleetDashboardApp.contentTypeFor("static/style.css"));
    }

    @Test
    void contentTypeForUnknownExtensionFallsBackToOctetStream() {
        assertEquals("application/octet-stream", FleetDashboardApp.contentTypeFor("static/vendor/chart.umd.min.js.map"));
    }
}
