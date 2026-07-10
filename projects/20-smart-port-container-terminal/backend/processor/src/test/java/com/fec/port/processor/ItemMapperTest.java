package com.fec.port.processor;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ItemMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"crane_load_kg\",\"site_id\":\"berth-a\",\"unit\":\"kg\"," +
        "\"window_start\":\"2026-01-01T00:00:00Z\",\"window_end\":\"2026-01-01T00:00:10Z\",\"count\":4," +
        "\"min\":14000.0,\"max\":18000.0,\"avg\":16000.0,\"latest\":17500.0,\"alerts\":[\"crane_overload_risk\"]}";

    @Test
    void mapsAllFields() throws Exception {
        var item = ItemMapper.toItem(MESSAGE);
        assertEquals("crane_load_kg", item.get("sensor_type").s());
        assertEquals("berth-a", item.get("site_id").s());
        assertEquals("kg", item.get("unit").s());
        assertEquals("4", item.get("count").n());
        assertEquals("14000.0", item.get("min").n());
        assertEquals("18000.0", item.get("max").n());
        assertEquals("16000.0", item.get("avg").n());
        assertEquals("17500.0", item.get("latest").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("crane_overload_risk", item.get("alerts").l().get(0).s());
    }

    @Test
    void sortKeyIsWindowEndHashSiteId() throws Exception {
        var item = ItemMapper.toItem(MESSAGE);
        assertEquals("2026-01-01T00:00:10Z#berth-a", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoBerthsInTheSameWindow() throws Exception {
        String berthA = MESSAGE;
        String berthB = MESSAGE.replace("\"site_id\":\"berth-a\"", "\"site_id\":\"berth-b\"");

        var itemA = ItemMapper.toItem(berthA);
        var itemB = ItemMapper.toItem(berthB);

        assertEquals(itemA.get("window_end").s(), itemB.get("window_end").s());
        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
    }

    @Test
    void defaultsSiteIdWhenMissing() throws Exception {
        String noSite = "{\"sensor_type\":\"wind_speed_knots\",\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1," +
            "\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0,\"alerts\":[]}";
        var item = ItemMapper.toItem(noSite);
        assertEquals("berth-a", item.get("site_id").s());
        assertEquals("e#berth-a", item.get("sort_key").s());
    }

    @Test
    void handlesMissingAlertsArray() throws Exception {
        String noAlerts = "{\"sensor_type\":\"container_stack_height\",\"site_id\":\"berth-b\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":3.0,\"max\":3.0,\"avg\":3.0,\"latest\":3.0}";
        var item = ItemMapper.toItem(noAlerts);
        assertTrue(item.get("alerts").l().isEmpty());
    }
}
