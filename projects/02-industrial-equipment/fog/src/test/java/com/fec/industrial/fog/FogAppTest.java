package com.fec.industrial.fog;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FogAppTest {

    @Test
    void ingestBuffersReadings() {
        FogApp app = new FogApp();
        app.bufferReadings("vibration", "line-1", "mm/s", List.of(new Reading("t0", 7.5), new Reading("t1", 8.2)));

        assertEquals(2, app.windowBuffer.get(new FogApp.MachineChannel("vibration", "line-1")).size());
    }

    @Test
    void flushWindowAggregatesAndEvaluatesAlerts() {
        FogApp app = new FogApp();
        app.bufferReadings("vibration", "line-1", "mm/s", List.of(new Reading("t0", 7.5), new Reading("t1", 8.2)));

        List<Aggregation.Summary> summaries = app.closeWindow();
        assertEquals(1, summaries.size());
        Aggregation.Summary summary = summaries.get(0);
        assertEquals(7.85, summary.avg());
        assertEquals(List.of("bearing_wear_risk"), Alerts.diagnoseFaults("vibration", summary));
    }

    @Test
    void flushWindowClearsBufferAfterFlush() {
        FogApp app = new FogApp();
        app.bufferReadings("power_draw", "line-1", "kW", List.of(new Reading("t0", 40.0)));
        app.closeWindow();
        assertTrue(app.closeWindow().isEmpty());
    }

    @Test
    void thresholdsJsonExposesRealRules() {
        FogApp app = new FogApp();
        String json = app.faultRulesJson();
        assertTrue(json.contains("bearing_wear_risk"));
        assertTrue(json.contains("\"limit\":7.0"));
    }
}
