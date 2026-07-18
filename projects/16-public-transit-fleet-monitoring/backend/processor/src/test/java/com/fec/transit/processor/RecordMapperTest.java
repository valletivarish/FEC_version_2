package com.fec.transit.processor;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecordMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"engine_temp_c\",\"site_id\":\"depot-a\",\"unit\":\"C\"," +
        "\"window_start\":\"2026-07-05T10:00:00Z\",\"window_end\":\"2026-07-05T10:00:10Z\",\"count\":4," +
        "\"min\":85.0,\"max\":108.0,\"avg\":96.5,\"latest\":108.0,\"alerts\":[\"engine_overheat_risk\"]}";

    @Test
    void mapsAllAggregateFieldsOntoTheItem() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toWindowItem(MESSAGE);

        assertEquals("engine_temp_c", item.get("sensor_type").s());
        assertEquals("depot-a", item.get("site_id").s());
        assertEquals("C", item.get("unit").s());
        assertEquals("2026-07-05T10:00:00Z", item.get("window_start").s());
        assertEquals("2026-07-05T10:00:10Z", item.get("window_end").s());
        assertEquals("4", item.get("count").n());
        assertEquals("85.0", item.get("min").n());
        assertEquals("108.0", item.get("max").n());
        assertEquals("96.5", item.get("avg").n());
        assertEquals("108.0", item.get("latest").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("engine_overheat_risk", item.get("alerts").l().get(0).s());
    }

    @Test
    void sortKeyIsWindowEndHashSiteId() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toWindowItem(MESSAGE);
        assertEquals("2026-07-05T10:00:10Z#depot-a", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoDepotsSharingTheSameFlushWindow() throws Exception {
        String depotA = "{\"sensor_type\":\"gps_speed_kmh\",\"site_id\":\"depot-a\",\"unit\":\"km/h\"," +
            "\"window_start\":\"s\",\"window_end\":\"2026-07-05T11:00:00Z\",\"count\":1,\"min\":40,\"max\":40," +
            "\"avg\":40,\"latest\":40,\"alerts\":[]}";
        String depotB = "{\"sensor_type\":\"gps_speed_kmh\",\"site_id\":\"depot-b\",\"unit\":\"km/h\"," +
            "\"window_start\":\"s\",\"window_end\":\"2026-07-05T11:00:00Z\",\"count\":1,\"min\":55,\"max\":55," +
            "\"avg\":55,\"latest\":55,\"alerts\":[]}";

        Map<String, AttributeValue> itemA = RecordMapper.toWindowItem(depotA);
        Map<String, AttributeValue> itemB = RecordMapper.toWindowItem(depotB);

        assertEquals(itemA.get("sensor_type").s(), itemB.get("sensor_type").s(), "same partition key");
        assertEquals("2026-07-05T11:00:00Z#depot-a", itemA.get("sort_key").s());
        assertEquals("2026-07-05T11:00:00Z#depot-b", itemB.get("sort_key").s());
    }

    @Test
    void missingSiteIdDefaultsToDepotA() throws Exception {
        String noSite = "{\"sensor_type\":\"fuel_level_pct\",\"unit\":\"%\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":50,\"max\":50,\"avg\":50,\"latest\":50,\"alerts\":[]}";
        Map<String, AttributeValue> item = RecordMapper.toWindowItem(noSite);
        assertEquals("depot-a", item.get("site_id").s());
        assertEquals("e#depot-a", item.get("sort_key").s());
    }

    @Test
    void missingAlertsProducesAnEmptyList() throws Exception {
        String noAlerts = "{\"sensor_type\":\"fuel_level_pct\",\"site_id\":\"depot-b\",\"unit\":\"%\"," +
            "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1,\"min\":50,\"max\":50,\"avg\":50,\"latest\":50}";
        Map<String, AttributeValue> item = RecordMapper.toWindowItem(noAlerts);
        assertEquals(0, item.get("alerts").l().size());
    }
}
