package com.fec.mining.dashboard;

import java.util.Map;

/**
 * Local mirror of the fog's 4 alert-bearing threshold limits (see
 * com.fec.mining.fog.HazardRules.CATALOG), used only to compute the
 * dashboard's CAUTION 75%-of-limit boundary. DANGER instead reads the real
 * fired alerts the fog already computed and the processor already stored on
 * each item -- it never recomputes alert logic itself.
 */
final class SafetyLimits {

    static final Map<String, Double> LIMITS = Map.of(
        "methane_ppm", 1000.0,
        "co_ppm", 50.0,
        "dust_concentration_mgm3", 10.0,
        "ground_vibration_mms", 25.0
    );

    static final double CAUTION_RATIO = 0.75;

    private SafetyLimits() {
    }
}
