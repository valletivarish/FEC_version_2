package com.fec.aquaculture.processor;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecordMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"ammonia_ppm\",\"site_id\":\"pond-1\",\"unit\":\"ppm\"," +
        "\"window_start\":\"2026-07-05T10:00:00Z\",\"window_end\":\"2026-07-05T10:00:10Z\",\"count\":4," +
        "\"min\":0.1,\"max\":0.6,\"avg\":0.35,\"latest\":0.6,\"alerts\":[\"toxicity_risk\"]}";

    @Test
    void mapsAllAggregateFieldsOntoTheItem() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);

        assertEquals("ammonia_ppm", item.get("sensor_type").s());
        assertEquals("pond-1", item.get("site_id").s());
        assertEquals("ppm", item.get("unit").s());
        assertEquals("2026-07-05T10:00:00Z", item.get("window_start").s());
        assertEquals("2026-07-05T10:00:10Z", item.get("window_end").s());
        assertEquals("4", item.get("count").n());
        assertEquals("0.1", item.get("min").n());
        assertEquals("0.6", item.get("max").n());
        assertEquals("0.35", item.get("avg").n());
        assertEquals("0.6", item.get("latest").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("toxicity_risk", item.get("alerts").l().get(0).s());
    }

    @Test
    void sortKeyIsWindowEndHashSiteId() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);
        assertEquals("2026-07-05T10:00:10Z#pond-1", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoPondsSharingTheSameFlushWindow() throws Exception {
        String pond1 = "{\"sensor_type\":\"water_temp_c\",\"site_id\":\"pond-1\",\"unit\":\"C\"," +
            "\"window_start\":\"s\",\"window_end\":\"2026-07-05T11:00:00Z\",\"count\":1,\"min\":24,\"max\":24," +
            "\"avg\":24,\"latest\":24,\"alerts\":[]}";
        String pond2 = "{\"sensor_type\":\"water_temp_c\",\"site_id\":\"pond-2\",\"unit\":\"C\"," +
            "\"window_start\":\"s\",\"window_end\":\"2026-07-05T11:00:00Z\",\"count\":1,\"min\":26,\"max\":26," +
            "\"avg\":26,\"latest\":26,\"alerts\":[]}";

        Map<String, AttributeValue> item1 = RecordMapper.toItem(pond1);
        Map<String, AttributeValue> item2 = RecordMapper.toItem(pond2);

        assertEquals(item1.get("sensor_type").s(), item2.get("sensor_type").s(), "same partition key");
        assertEquals("2026-07-05T11:00:00Z#pond-1", item1.get("sort_key").s());
        assertEquals("2026-07-05T11:00:00Z#pond-2", item2.get("sort_key").s());
    }

    @Test
    void missingSiteIdDefaultsToPond1() throws Exception {
        String noSite = "{\"sensor_type\":\"ph_level\",\"unit\":\"pH\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":7,\"max\":7,\"avg\":7,\"latest\":7,\"alerts\":[]}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noSite);
        assertEquals("pond-1", item.get("site_id").s());
        assertEquals("e#pond-1", item.get("sort_key").s());
    }

    @Test
    void missingAlertsProducesAnEmptyList() throws Exception {
        String noAlerts = "{\"sensor_type\":\"ph_level\",\"site_id\":\"pond-2\",\"unit\":\"pH\"," +
            "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1,\"min\":7,\"max\":7,\"avg\":7,\"latest\":7}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noAlerts);
        assertEquals(0, item.get("alerts").l().size());
    }
}
