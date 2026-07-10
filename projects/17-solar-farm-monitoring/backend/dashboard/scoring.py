"""Live per-array efficiency index.

Combines the two readings that most directly describe how well a panel
string is currently converting sunlight into usable power -- the array's
inverter_output_kw window average (how much it is actually delivering) and
its panel_temp_c window average (how far above its optimal operating band
the panels are running, since crystalline-silicon panels lose conversion
efficiency as they heat up) -- against two independently configured
"optimal range" constants below, into a single 0-100 index.

This is deliberately independent of the alert thresholds in
fog/alerts.py: an array can drift toward "inefficient" well before it ever
trips thermal_derate_risk or inverter_underperformance, so the index gives
an earlier, graded signal instead of a binary ok/alert flag -- the same
principle as 12-smart-building-energy's efficiency_score, but rendered here
as a heatmap grid cell per recent window rather than a single letter-grade
badge (see backend/dashboard/static/style.css for the grid).

Formula:
  1. output_component: a "rising" band -- 0 at or below OUTPUT_POOR_KW,
     100 at or above OUTPUT_OPTIMAL_KW, linear in between. Higher inverter
     output is better.
  2. thermal_component: a "falling" band -- 100 at or below TEMP_OPTIMAL_C,
     0 at or above TEMP_POOR_C, linear in between. Lower panel temperature
     (up to the optimal band) is better.
  3. efficiency_index = round((output_component + thermal_component) / 2, 1)
"""

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
