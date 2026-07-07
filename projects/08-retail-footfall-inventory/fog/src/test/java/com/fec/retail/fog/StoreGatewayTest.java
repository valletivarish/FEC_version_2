package com.fec.retail.fog;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class StoreGatewayTest {

    @Test
    void thresholdsJsonExposesRealRulesMatchingTheBrief() throws Exception {
        String json = StoreGateway.thresholdsJson();

        assertTrue(json.contains("restock_needed"));
        assertTrue(json.contains("cold_chain_risk"));
        assertTrue(json.contains("checkout_congestion"));
        assertTrue(json.contains("capacity_warning"));
        assertTrue(json.contains("\"limit\":15.0"));
        assertTrue(json.contains("\"limit\":8.0"));
        assertTrue(json.contains("\"limit\":12.0"));
        assertTrue(json.contains("\"limit\":500.0"));
    }

    @Test
    void thresholdsJsonGroupsRulesBySensorType() throws Exception {
        String json = StoreGateway.thresholdsJson();
        assertTrue(json.contains("\"shelf_stock_pct\":["));
        assertTrue(json.contains("\"fridge_temp_c\":["));
        assertTrue(json.contains("\"queue_length\":["));
        assertTrue(json.contains("\"footfall_count\":["));
    }
}
