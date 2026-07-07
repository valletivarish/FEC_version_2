package com.fec.warehouse.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FleetGatewayTest {

    @Test
    void ingestBuffersReadingsUnderTheirKey() {
        FleetGateway gateway = new FleetGateway();
        gateway.ingest("motor_temp_c", "zone-a", "C", List.of(45.0, 46.0));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(1, flushed.size());
        assertEquals(2, flushed.get(0).count());
    }

    @Test
    void flushWindowClearsBufferAfterFlush() {
        FleetGateway gateway = new FleetGateway();
        gateway.ingest("payload_kg", "zone-a", "kg", List.of(40.0));
        gateway.flushWindow();

        assertTrue(gateway.flushWindow().isEmpty());
    }

    @Test
    void flushWindowKeepsZonesSeparate() {
        FleetGateway gateway = new FleetGateway();
        gateway.ingest("battery_level_pct", "zone-a", "%", List.of(90.0));
        gateway.ingest("battery_level_pct", "zone-b", "%", List.of(10.0, 12.0));

        List<WindowAggregate> flushed = gateway.flushWindow();
        assertEquals(2, flushed.size());
        var byZone = flushed.stream().collect(java.util.stream.Collectors.toMap(WindowAggregate::siteId, w -> w));
        assertEquals(90.0, byZone.get("zone-a").avg());
        assertEquals(11.0, byZone.get("zone-b").avg());
    }

    @Test
    void toPayloadIncludesFiredAlerts() {
        WindowAggregate w = WindowAggregate.of("motor_temp_c", "zone-a", "C", List.of(80.0), "s", "e");
        String json = FleetGateway.toPayload(w, List.of("motor_overheat"));

        assertTrue(json.contains("\"sensor_type\":\"motor_temp_c\""));
        assertTrue(json.contains("\"alerts\":[\"motor_overheat\"]"));
    }

    @Test
    void toPayloadHandlesNoAlerts() {
        WindowAggregate w = WindowAggregate.of("payload_kg", "zone-a", "kg", List.of(40.0), "s", "e");
        String json = FleetGateway.toPayload(w, List.of());
        assertTrue(json.contains("\"alerts\":[]"));
    }

    @Test
    void thresholdsJsonExposesRealRules() {
        String json = FleetGateway.thresholdsJson();
        assertTrue(json.contains("battery_critical"));
        assertTrue(json.contains("motor_overheat"));
        assertTrue(json.contains("navigation_drift"));
        assertTrue(json.contains("fleet_backlog"));
        assertTrue(json.contains("\"limit\":15.0"));
    }
}
