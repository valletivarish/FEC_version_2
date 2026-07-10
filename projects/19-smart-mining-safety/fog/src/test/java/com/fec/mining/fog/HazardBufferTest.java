package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HazardBufferTest {

    @Test
    void ingestGroupsReadingsBySensorTypeAndSite() {
        HazardBuffer buffer = new HazardBuffer();
        buffer.ingest("methane_ppm", "shaft-a", "ppm", List.of(new Reading("t0", 320.0), new Reading("t1", 340.0)));

        assertEquals(1, buffer.activeKeys().size());
        assertTrue(buffer.activeKeys().contains(new ShaftKey("methane_ppm", "shaft-a")));
    }

    @Test
    void differentSitesForTheSameSensorTypeAreSeparateKeys() {
        HazardBuffer buffer = new HazardBuffer();
        buffer.ingest("co_ppm", "shaft-a", "ppm", List.of(new Reading("t0", 10.0)));
        buffer.ingest("co_ppm", "shaft-b", "ppm", List.of(new Reading("t0", 12.0)));

        assertEquals(2, buffer.activeKeys().size());
    }

    @Test
    void drainReturnsReadingsInArrivalOrderAndEmptiesTheKey() {
        HazardBuffer buffer = new HazardBuffer();
        ShaftKey key = new ShaftKey("dust_concentration_mgm3", "shaft-a");
        buffer.ingest("dust_concentration_mgm3", "shaft-a", "mg/m3",
            List.of(new Reading("t0", 4.0), new Reading("t1", 6.0)));

        List<Reading> drained = buffer.drain(key);
        assertEquals(2, drained.size());
        assertEquals(4.0, drained.get(0).value());
        assertEquals(6.0, drained.get(1).value());

        assertFalse(buffer.activeKeys().contains(key));
    }

    @Test
    void drainOnUnknownKeyReturnsEmptyList() {
        HazardBuffer buffer = new HazardBuffer();
        assertTrue(buffer.drain(new ShaftKey("ambient_temp_c", "shaft-b")).isEmpty());
    }

    @Test
    void afterDrainANewIngestStartsAFreshQueueForTheSameKey() {
        HazardBuffer buffer = new HazardBuffer();
        ShaftKey key = new ShaftKey("ground_vibration_mms", "shaft-a");
        buffer.ingest("ground_vibration_mms", "shaft-a", "mm/s", List.of(new Reading("t0", 3.0)));
        buffer.drain(key);

        buffer.ingest("ground_vibration_mms", "shaft-a", "mm/s", List.of(new Reading("t1", 5.0)));
        List<Reading> drained = buffer.drain(key);
        assertEquals(1, drained.size());
        assertEquals(5.0, drained.get(0).value());
    }

    @Test
    void unitForRemembersTheMostRecentlySeenUnitPerSensorType() {
        HazardBuffer buffer = new HazardBuffer();
        buffer.ingest("methane_ppm", "shaft-a", "ppm", List.of(new Reading("t0", 300.0)));
        assertEquals("ppm", buffer.unitFor("methane_ppm"));
        assertEquals("", buffer.unitFor("unknown_sensor"));
    }
}
