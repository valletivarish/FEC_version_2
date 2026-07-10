"""Per-floor sustainability efficiency score/grade.

Combines the two heaviest-impact readings -- energy_consumption_kw and
co2_ppm (a poorly-ventilated, over-occupied floor drives both up together)
-- into a single 0-100 score, then maps that score onto a school-report-card
letter grade (A-F). This is deliberately independent of the alert
thresholds in fog/alerts.py: a floor can drift toward "inefficient" well
before it ever trips peak_load_warning or poor_air_quality, so the score
gives an earlier, graded signal instead of a binary ok/alert flag.

Formula (documented here and in readme.txt REUSE section):
  1. Each reading gets its own 0-100 band score via _band_score, linearly
     interpolating between an "efficient" reference point (scores 100) and
     a "poor" reference point (scores 0), clamped at both ends:
       energy_consumption_kw: efficient <= 30 kW, poor >= 70 kW
       co2_ppm:                efficient <= 600 ppm, poor >= 1200 ppm
  2. The two band scores are averaged with equal weight into one
     efficiency_score, rounded to 1 decimal place.
  3. That score is mapped to a letter grade: A >= 90, B >= 75, C >= 60,
     D >= 40, else F.
"""

ENERGY_EFFICIENT_KW = 30.0
ENERGY_POOR_KW = 70.0
CO2_EFFICIENT_PPM = 600.0
CO2_POOR_PPM = 1200.0

GRADE_CUTOFFS = (
    (90.0, "A"),
    (75.0, "B"),
    (60.0, "C"),
    (40.0, "D"),
)


def _band_score(value, efficient, poor):
    """100 at or below `efficient`, 0 at or above `poor`, linear in between.
    Assumes efficient < poor."""
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
    for cutoff, grade in GRADE_CUTOFFS:
        if score >= cutoff:
            return grade
    return "F"
