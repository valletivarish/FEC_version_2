package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MineFogNodeTest {

    @Test
    void ingestBuffersReadings() {
        MineFogNode node = new MineFogNode();
        node.ingest("methane_ppm", "shaft-a", "ppm", List.of(new Reading("t0", 320.0), new Reading("t1", 340.0)));

        assertTrue(node.buffer.activeKeys().contains(new ShaftKey("methane_ppm", "shaft-a")));
    }

    @Test
    void flushWindowAggregatesAndEvaluatesAlerts() {
        MineFogNode node = new MineFogNode();
        node.ingest("co_ppm", "shaft-a", "ppm", List.of(new Reading("t0", 40.0), new Reading("t1", 70.0)));

        List<WindowAggregate> summaries = node.flushWindow();
        assertEquals(1, summaries.size());
        WindowAggregate summary = summaries.get(0);
        assertEquals(55.0, summary.avg());
        assertEquals(List.of("co_exposure_risk"), HazardRules.assess("co_ppm", summary));
    }

    @Test
    void flushWindowClearsBufferAfterFlush() {
        MineFogNode node = new MineFogNode();
        node.ingest("ambient_temp_c", "shaft-a", "C", List.of(new Reading("t0", 28.0)));
        node.flushWindow();
        assertTrue(node.flushWindow().isEmpty());
    }

    @Test
    void separateShaftsProduceSeparateWindowSummaries() {
        MineFogNode node = new MineFogNode();
        node.ingest("dust_concentration_mgm3", "shaft-a", "mg/m3", List.of(new Reading("t0", 3.0)));
        node.ingest("dust_concentration_mgm3", "shaft-b", "mg/m3", List.of(new Reading("t0", 22.0)));

        List<WindowAggregate> summaries = node.flushWindow();
        assertEquals(2, summaries.size());
        var bySite = summaries.stream().collect(java.util.stream.Collectors.toMap(WindowAggregate::siteId, w -> w));
        assertEquals(3.0, bySite.get("shaft-a").avg());
        assertEquals(22.0, bySite.get("shaft-b").avg());
        assertTrue(HazardRules.assess("dust_concentration_mgm3", bySite.get("shaft-b")).contains("silica_dust_hazard"));
        assertTrue(HazardRules.assess("dust_concentration_mgm3", bySite.get("shaft-a")).isEmpty());
    }

    @Test
    void thresholdsJsonExposesRealRules() {
        MineFogNode node = new MineFogNode();
        String json = node.thresholdsJson();
        assertTrue(json.contains("methane_buildup_risk"));
        assertTrue(json.contains("\"limit\":1000.0"));
        assertTrue(json.contains("blast_vibration_exceedance"));
        assertTrue(json.contains("\"field\":\"max\""));
    }
}
