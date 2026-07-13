"""Graded 0-100 efficiency_index (rising output band + falling thermal band, averaged) giving an earlier signal than fog/alerts.py's binary thresholds -- the same idiom as 12-smart-building-energy's efficiency_score, here rendered as a heatmap cell instead of a letter grade."""

OUTPUT_POOR_KW = 20.0
OUTPUT_OPTIMAL_KW = 110.0
TEMP_OPTIMAL_C = 45.0
TEMP_POOR_C = 72.0

BAND_CUTOFFS = (
    (80.0, "excellent"),
    (60.0, "good"),
    (40.0, "fair"),
    (20.0, "poor"),
)


def _rising_band(value, poor, optimal):
    """0 at or below `poor`, 100 at or above `optimal`, linear between.
    Assumes poor < optimal (higher value is better)."""
    if value <= poor:
        return 0.0
    if value >= optimal:
        return 100.0
    return 100.0 * (value - poor) / (optimal - poor)


def _falling_band(value, optimal, poor):
    """100 at or below `optimal`, 0 at or above `poor`, linear between.
    Assumes optimal < poor (lower value is better)."""
    if value <= optimal:
        return 100.0
    if value >= poor:
        return 0.0
    return 100.0 * (poor - value) / (poor - optimal)


def efficiency_index(inverter_output_avg_kw, panel_temp_avg_c):
    output_component = _rising_band(inverter_output_avg_kw, OUTPUT_POOR_KW, OUTPUT_OPTIMAL_KW)
    thermal_component = _falling_band(panel_temp_avg_c, TEMP_OPTIMAL_C, TEMP_POOR_C)
    return round((output_component + thermal_component) / 2, 1)


def index_band(index):
    """Coarse band label used to pick the heatmap cell's colour class."""
    for cutoff, band in BAND_CUTOFFS:
        if index >= cutoff:
            return band
    return "critical"
