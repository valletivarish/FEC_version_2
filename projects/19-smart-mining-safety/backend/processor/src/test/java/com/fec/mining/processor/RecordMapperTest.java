package com.fec.mining.processor;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RecordMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"methane_ppm\",\"site_id\":\"shaft-a\",\"unit\":\"ppm\"," +
        "\"window_start\":\"2026-01-01T00:00:00Z\",\"window_end\":\"2026-01-01T00:00:10Z\",\"count\":3," +
        "\"min\":300.0,\"max\":900.0,\"avg\":600.0,\"latest\":850.0,\"alerts\":[\"methane_buildup_risk\"]}";

    @Test
    void mapsAllFields() throws Exception {
        var item = RecordMapper.toItem(MESSAGE);
        assertEquals("methane_ppm", item.get("sensor_type").s());
        assertEquals("shaft-a", item.get("site_id").s());
        assertEquals("ppm", item.get("unit").s());
        assertEquals("3", item.get("count").n());
        assertEquals("300.0", item.get("min").n());
        assertEquals("900.0", item.get("max").n());
        assertEquals("600.0", item.get("avg").n());
        assertEquals("850.0", item.get("latest").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("methane_buildup_risk", item.get("alerts").l().get(0).s());
    }

    @Test
    void sortKeyIsWindowEndHashSiteId() throws Exception {
        var item = RecordMapper.toItem(MESSAGE);
        assertEquals("2026-01-01T00:00:10Z#shaft-a", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoShaftsInTheSameWindow() throws Exception {
        String shaftA = MESSAGE.replace("shaft-a", "shaft-a");
        String shaftB = MESSAGE.replace("\"site_id\":\"shaft-a\"", "\"site_id\":\"shaft-b\"");

        var itemA = RecordMapper.toItem(shaftA);
        var itemB = RecordMapper.toItem(shaftB);

        assertEquals(itemA.get("window_end").s(), itemB.get("window_end").s());
        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
    }

    @Test
    void defaultsSiteIdWhenMissing() throws Exception {
        String noSite = "{\"sensor_type\":\"co_ppm\",\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1," +
            "\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0,\"alerts\":[]}";
        var item = RecordMapper.toItem(noSite);
        assertEquals("shaft-a", item.get("site_id").s());
        assertEquals("e#shaft-a", item.get("sort_key").s());
    }

    @Test
    void handlesMissingAlertsArray() throws Exception {
        String noAlerts = "{\"sensor_type\":\"ambient_temp_c\",\"site_id\":\"shaft-b\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":26.0,\"max\":26.0,\"avg\":26.0,\"latest\":26.0}";
        var item = RecordMapper.toItem(noAlerts);
        assertTrue(item.get("alerts").l().isEmpty());
    }
}
