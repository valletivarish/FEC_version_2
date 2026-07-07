package com.fec.warehouse.processor;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RecordMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"motor_temp_c\",\"site_id\":\"zone-a\",\"unit\":\"C\"," +
        "\"window_start\":\"s\",\"window_end\":\"2026-07-05T10:00:00Z\",\"count\":3,\"min\":40.0,\"max\":50.0," +
        "\"avg\":45.0,\"latest\":48.0,\"alerts\":[\"motor_overheat\"]}";

    @Test
    void buildsSortKeyFromWindowEndAndSiteId() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);
        assertEquals("2026-07-05T10:00:00Z#zone-a", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoSitesInSameWindow() throws Exception {
        String messageZoneB = MESSAGE.replace("zone-a", "zone-b");
        Map<String, AttributeValue> itemA = RecordMapper.toItem(MESSAGE);
        Map<String, AttributeValue> itemB = RecordMapper.toItem(messageZoneB);

        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
        assertEquals(itemA.get("sensor_type").s(), itemB.get("sensor_type").s());
    }

    @Test
    void missingSiteIdDefaultsToZoneA() throws Exception {
        String noSite = "{\"sensor_type\":\"battery_level_pct\",\"unit\":\"%\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":10,\"max\":10,\"avg\":10,\"latest\":10}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noSite);
        assertEquals("zone-a", item.get("site_id").s());
        assertEquals("e#zone-a", item.get("sort_key").s());
    }

    @Test
    void carriesNumericFieldsAndAlerts() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);
        assertEquals("3", item.get("count").n());
        assertEquals("45.0", item.get("avg").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("motor_overheat", item.get("alerts").l().get(0).s());
    }

    @Test
    void missingAlertsProducesEmptyList() throws Exception {
        String noAlerts = "{\"sensor_type\":\"payload_kg\",\"site_id\":\"zone-a\",\"unit\":\"kg\"," +
            "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1,\"min\":1,\"max\":1,\"avg\":1,\"latest\":1}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noAlerts);
        assertTrue(item.get("alerts").l().isEmpty());
    }
}
