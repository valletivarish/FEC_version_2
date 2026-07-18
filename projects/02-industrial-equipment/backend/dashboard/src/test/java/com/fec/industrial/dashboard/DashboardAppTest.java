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

    @Test
    void contentTypeForUnknownExtensionFallsBackToOctetStream() {
        assertEquals("application/octet-stream", DashboardApp.contentTypeFor("static/logo.png"));
    }

    @Test
    void parseQueryDecodesPercentEncodedValues() {
        var params = DashboardApp.parseQuery("sensor_type=motor%20temperature");
        assertEquals("motor temperature", params.get("sensor_type"));
    }

    @Test
    void parseQueryTreatsAValuelessKeyAsEmpty() {
        var params = DashboardApp.parseQuery("fresh");
        assertTrue(params.containsKey("fresh"));
        assertEquals("", params.get("fresh"));
    }

    @Test
    void sensorCatalogueIsTheFiveMachineSignals() {
        assertArrayEquals(
            new String[]{"vibration", "motor_temperature", "bearing_acoustic", "rotation_speed", "power_draw"},
            DashboardApp.SENSOR_TYPES);
    }
}
