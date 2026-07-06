package com.fec.industrial.processor;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ReshapeTest {

    static final String MESSAGE = "{\"sensor_type\":\"motor_temperature\",\"site_id\":\"line-1\",\"unit\":\"C\"," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":4,\"min\":60.0,\"max\":68.0,\"avg\":64.0," +
        "\"latest\":66.0,\"alerts\":[]}";

    @Test
    void toItemParsesFields() throws Exception {
        var item = Reshape.toItem(MESSAGE);
        assertEquals("motor_temperature", item.get("sensor_type").s());
        assertEquals("64.0", item.get("avg").n());
        assertEquals("e", item.get("window_end").s());
    }

    @Test
    void toItemDefaultsMissingSiteId() throws Exception {
        String minimal = "{\"sensor_type\":\"vibration\",\"window_start\":\"s\",\"window_end\":\"e\"," +
            "\"count\":1,\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0}";
        var item = Reshape.toItem(minimal);
        assertEquals("line-1", item.get("site_id").s());
        assertTrue(item.get("alerts").l().isEmpty());
    }

    @Test
    void sortKeyDisambiguatesSitesSharingAWindow() throws Exception {
        String a = MESSAGE.replace("\"site_id\":\"line-1\"", "\"site_id\":\"line-1\"");
        String b = MESSAGE.replace("\"site_id\":\"line-1\"", "\"site_id\":\"line-2\"");
        var itemA = Reshape.toItem(a);
        var itemB = Reshape.toItem(b);
        assertEquals(itemA.get("window_end").s(), itemB.get("window_end").s());
        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
    }
}
