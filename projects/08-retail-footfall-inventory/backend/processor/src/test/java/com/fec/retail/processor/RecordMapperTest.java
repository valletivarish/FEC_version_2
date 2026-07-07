package com.fec.retail.processor;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RecordMapperTest {

    static final String MESSAGE = "{\"sensor_type\":\"queue_length\",\"site_id\":\"store-1\",\"unit\":\"people\"," +
        "\"window_start\":\"s\",\"window_end\":\"2026-07-05T10:00:00Z\",\"count\":3,\"min\":10.0,\"max\":15.0," +
        "\"avg\":13.0,\"latest\":14.0,\"alerts\":[\"checkout_congestion\"]}";

    @Test
    void buildsSortKeyFromWindowEndAndSiteId() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);
        assertEquals("2026-07-05T10:00:00Z#store-1", item.get("sort_key").s());
    }

    @Test
    void sortKeyDisambiguatesTwoStoresInSameWindow() throws Exception {
        String messageStore2 = MESSAGE.replace("store-1", "store-2");
        Map<String, AttributeValue> itemA = RecordMapper.toItem(MESSAGE);
        Map<String, AttributeValue> itemB = RecordMapper.toItem(messageStore2);

        assertNotEquals(itemA.get("sort_key").s(), itemB.get("sort_key").s());
        assertEquals(itemA.get("sensor_type").s(), itemB.get("sensor_type").s());
    }

    @Test
    void missingSiteIdDefaultsToStoreOne() throws Exception {
        String noSite = "{\"sensor_type\":\"shelf_stock_pct\",\"unit\":\"%\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":10,\"max\":10,\"avg\":10,\"latest\":10}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noSite);
        assertEquals("store-1", item.get("site_id").s());
        assertEquals("e#store-1", item.get("sort_key").s());
    }

    @Test
    void carriesNumericFieldsAndAlerts() throws Exception {
        Map<String, AttributeValue> item = RecordMapper.toItem(MESSAGE);
        assertEquals("3", item.get("count").n());
        assertEquals("13.0", item.get("avg").n());
        assertEquals(1, item.get("alerts").l().size());
        assertEquals("checkout_congestion", item.get("alerts").l().get(0).s());
    }

    @Test
    void missingAlertsProducesEmptyList() throws Exception {
        String noAlerts = "{\"sensor_type\":\"energy_draw_kw\",\"site_id\":\"store-1\",\"unit\":\"kW\"," +
            "\"window_start\":\"s\",\"window_end\":\"e\",\"count\":1,\"min\":1,\"max\":1,\"avg\":1,\"latest\":1}";
        Map<String, AttributeValue> item = RecordMapper.toItem(noAlerts);
        assertTrue(item.get("alerts").l().isEmpty());
    }
}
