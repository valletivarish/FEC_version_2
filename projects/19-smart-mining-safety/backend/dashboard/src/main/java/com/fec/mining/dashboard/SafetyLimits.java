package com.fec.mining.dashboard;

import java.util.Map;

// Local mirror of the fog's threshold limits, used only for the dashboard's CAUTION boundary.
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
