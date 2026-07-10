package com.fec.mining.fog;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HazardRulesTest {

    static WindowAggregate window(String sensorType, double min, double max, double avg) {
        return new WindowAggregate(sensorType, "shaft-a", "u", "ws", "we", 3, min, max, avg, avg);
    }

    @Test
    void methaneAverageAboveOneThousandFiresBuildupRisk() {
        assertEquals(java.util.List.of("methane_buildup_risk"),
            HazardRules.assess("methane_ppm", window("methane_ppm", 900, 1300, 1050)));
    }

    @Test
    void methaneAverageAtOrBelowOneThousandIsSilent() {
        assertEquals(java.util.List.of(), HazardRules.assess("methane_ppm", window("methane_ppm", 800, 1000, 900)));
    }

    @Test
    void coAverageAboveFiftyFiresExposureRisk() {
        assertEquals(java.util.List.of("co_exposure_risk"),
            HazardRules.assess("co_ppm", window("co_ppm", 20, 80, 60)));
    }

    @Test
    void dustAverageAboveTenFiresSilicaHazard() {
        assertEquals(java.util.List.of("silica_dust_hazard"),
            HazardRules.assess("dust_concentration_mgm3", window("dust_concentration_mgm3", 5, 15, 12)));
    }

    @Test
    void vibrationRuleUsesMaxNotAvg() {
        // avg (18) stays under 25, but max (30) exceeds it -- the rule must
        // fire because it is defined against MAX, not AVG.
        assertEquals(java.util.List.of("blast_vibration_exceedance"),
            HazardRules.assess("ground_vibration_mms", window("ground_vibration_mms", 5, 30, 18)));
    }

    @Test
    void vibrationWithinBandIsSilent() {
        assertEquals(java.util.List.of(),
            HazardRules.assess("ground_vibration_mms", window("ground_vibration_mms", 1, 20, 10)));
    }

    @Test
    void ambientTempNeverRaisesAnAlertRegardlessOfValue() {
        assertEquals(java.util.List.of(),
            HazardRules.assess("ambient_temp_c", window("ambient_temp_c", 40, 44, 42)));
    }

    @Test
    void unknownSensorTypeHasNoRules() {
        assertEquals(java.util.List.of(), HazardRules.assess("pressure", window("pressure", 999, 999, 999)));
    }

    @Test
    void catalogCoversExactlyTheFourAlertBearingSensorTypes() {
        var sensorTypes = HazardRules.CATALOG.stream().map(ThresholdRule::sensorType).distinct().toList();
        assertEquals(4, sensorTypes.size());
        assertTrue(sensorTypes.containsAll(java.util.List.of(
            "methane_ppm", "co_ppm", "dust_concentration_mgm3", "ground_vibration_mms")));
    }
}
