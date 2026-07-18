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

    @Test
    void closeWindowOnAFreshAppReturnsNothing() {
        assertTrue(new FogApp().closeWindow().isEmpty());
    }

    @Test
    void bufferReadingsAccumulatesAcrossCallsForOneChannel() {
        FogApp app = new FogApp();
        app.bufferReadings("motor_temperature", "line-1", "C", List.of(new Reading("t0", 60.0)));
        app.bufferReadings("motor_temperature", "line-1", "C", List.of(new Reading("t1", 62.0), new Reading("t2", 64.0)));
        assertEquals(3, app.windowBuffer.get(new FogApp.MachineChannel("motor_temperature", "line-1")).size());
    }

    @Test
    void closeWindowGroupsEachSensorSitePairSeparately() {
        FogApp app = new FogApp();
        app.bufferReadings("vibration", "line-1", "mm/s", List.of(new Reading("t0", 2.0)));
        app.bufferReadings("vibration", "line-2", "mm/s", List.of(new Reading("t0", 3.0)));
        app.bufferReadings("power_draw", "line-1", "kW", List.of(new Reading("t0", 40.0)));

        List<Aggregation.Summary> summaries = app.closeWindow();
        assertEquals(3, summaries.size());
        assertTrue(summaries.stream().anyMatch(s -> s.sensorType().equals("vibration") && s.siteId().equals("line-2")));
    }

    @Test
    void encodeSummaryEmbedsFiredAlertsAndEveryStat() {
        FogApp app = new FogApp();
        Aggregation.Summary s = new Aggregation.Summary("motor_temperature", "line-1", "C", "ws", "we", 4, 90.0, 100.0, 96.0, 99.0);
        String json = app.encodeSummary(s, List.of("overheating"));
        assertTrue(json.contains("\"sensor_type\":\"motor_temperature\""));
        assertTrue(json.contains("\"count\":4"));
        assertTrue(json.contains("\"avg\":96.0"));
        assertTrue(json.contains("\"latest\":99.0"));
        assertTrue(json.contains("\"alerts\":[\"overheating\"]"));
    }

    @Test
    void encodeSummaryEmitsAnEmptyAlertsArrayWhenNoneFired() {
        FogApp app = new FogApp();
        Aggregation.Summary s = new Aggregation.Summary("power_draw", "line-1", "kW", "ws", "we", 2, 30.0, 40.0, 35.0, 38.0);
        assertTrue(app.encodeSummary(s, List.of()).contains("\"alerts\":[]"));
    }
}
