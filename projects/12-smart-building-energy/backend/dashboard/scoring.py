"""Per-floor efficiency score: energy_consumption_kw and co2_ppm are each linearly band-scored to 0-100 and averaged, then mapped to an A-F letter grade, independent of the fog node's threshold alerts."""

ENERGY_EFFICIENT_KW = 30.0
ENERGY_POOR_KW = 70.0
CO2_EFFICIENT_PPM = 600.0
CO2_POOR_PPM = 1200.0

GRADE_BANDS = (
    (90.0, "A"),
    (75.0, "B"),
    (60.0, "C"),
    (40.0, "D"),
)


def _band_score(value, efficient, poor):
    """100 at or below `efficient`, 0 at or above `poor`, linear in between (assumes efficient < poor)."""
    if value <= efficient:
        return 100.0
    if value >= poor:
        return 0.0
    return 100.0 * (poor - value) / (poor - efficient)


def efficiency_score(energy_avg_kw, co2_avg_ppm):
    energy_component = _band_score(energy_avg_kw, ENERGY_EFFICIENT_KW, ENERGY_POOR_KW)
    co2_component = _band_score(co2_avg_ppm, CO2_EFFICIENT_PPM, CO2_POOR_PPM)
    return round((energy_component + co2_component) / 2, 1)


def letter_grade(score):
    for cutoff, grade in GRADE_BANDS:
        if score >= cutoff:
            return grade
    return "F"
