"""Structural integrity index: 0-100 average of linearly-clamped strain and vibration scores, with critical bounds matched to fog/alerts.py's own alert thresholds so the index hits 0 exactly when an alert would already be firing."""

SAFE_STRAIN_MICROSTRAIN = 400.0
CRITICAL_STRAIN_MICROSTRAIN = 1200.0
SAFE_VIBRATION_MMS = 8.0
CRITICAL_VIBRATION_MMS = 20.0

# (inclusive floor, label) pairs, checked highest floor first.
INDEX_BANDS = [
    (85.0, "excellent"),
    (65.0, "good"),
    (45.0, "fair"),
    (25.0, "poor"),
    (0.0, "critical"),
]


def _band_score(value, safe, critical):
    """100 at or below `safe`, 0 at or beyond `critical`, linear in between."""
    if value <= safe:
        return 100.0
    if value >= critical:
        return 0.0
    return 100.0 * (critical - value) / (critical - safe)


def structural_integrity_index(strain_avg, vibration_max):
    strain_score = _band_score(strain_avg, SAFE_STRAIN_MICROSTRAIN, CRITICAL_STRAIN_MICROSTRAIN)
    vibration_score = _band_score(vibration_max, SAFE_VIBRATION_MMS, CRITICAL_VIBRATION_MMS)
    return round((strain_score + vibration_score) / 2, 1)


def index_band(index):
    for floor, label in INDEX_BANDS:
        if index >= floor:
            return label
    return INDEX_BANDS[-1][1]
