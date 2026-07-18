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
        var item = Reshape.toDynamoItem(MESSAGE);
        assertEquals("motor_temperature", item.get("sensor_type").s());
        assertEquals("64.0", item.get("avg").n());
        assertEquals("e", item.get("window_end").s());
    }

    @Test
    void toItemDefaultsMissingSiteId() throws Exception {
        String minimal = "{\"sensor_type\":\"vibration\",\"window_start\":\"s\",\"window_end\":\"e\"," +
            "\"count\":1,\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0}";
        var item = Reshape.toDynamoItem(minimal);
        assertEquals("line-1", item.get("site_id").s());
        assertTrue(item.get("alerts").l().isEmpty());
    }

    @Test
    void sortKeyDisambiguatesSitesSharingAWindow() throws Exception {
        String a = MESSAGE.replace("\"site_id\":\"line-1\"", "\"site_id\":\"line-1\"");
        String b = MESSAGE.replace("\"site_id\":\"line-1\"", "\"site_id\":\"line-2\"");
        var itemA = Reshape.toDynamoItem(a);
        var itemB = Reshape.toDynamoItem(b);
        assertEquals(itemA.get("window_end").s(), itemB.get("window_end").s());
        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
    }

    @Test
    void sortKeyIsWindowEndThenHashThenSite() throws Exception {
        String msg = "{\"sensor_type\":\"rotation_speed\",\"site_id\":\"line-2\",\"unit\":\"RPM\"," +
            "\"window_start\":\"2026-01-01T00:00:00Z\",\"window_end\":\"2026-01-01T00:00:10Z\"," +
            "\"count\":5,\"min\":900.0,\"max\":3500.0,\"avg\":2000.0,\"latest\":1800.0,\"alerts\":[]}";
        assertEquals("2026-01-01T00:00:10Z#line-2", Reshape.toDynamoItem(msg).get("sort_key").s());
    }

    @Test
    void numericFieldsAreStoredAsNumbersNotStrings() throws Exception {
        var item = Reshape.toDynamoItem(MESSAGE);
        for (String key : new String[]{"count", "min", "max", "avg", "latest"}) {
            assertNotNull(item.get(key).n(), key + " must be a DynamoDB number");
            assertNull(item.get(key).s(), key + " must not be stored as a string");
        }
    }

    @Test
    void countIsMarshalledAsAnIntegerNotADouble() throws Exception {
        assertEquals("4", Reshape.toDynamoItem(MESSAGE).get("count").n());
    }

    @Test
    void alertKeysArePreservedAsAListOfStrings() throws Exception {
        String msg = MESSAGE.replace("\"alerts\":[]", "\"alerts\":[\"overheating\",\"overspeed_fault\"]");
        var alerts = Reshape.toDynamoItem(msg).get("alerts").l();
        assertEquals(2, alerts.size());
        assertEquals("overheating", alerts.get(0).s());
        assertEquals("overspeed_fault", alerts.get(1).s());
    }

    @Test
    void missingUnitBecomesAnEmptyString() throws Exception {
        String msg = "{\"sensor_type\":\"vibration\",\"window_start\":\"s\",\"window_end\":\"e\"," +
            "\"count\":1,\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0}";
        assertEquals("", Reshape.toDynamoItem(msg).get("unit").s());
    }
}
