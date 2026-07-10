"""Structural integrity index: a documented 0-100% score for one bridge
span, combining that window's strain_microstrain average and
deck_vibration_mms peak against configured safe/critical bounds.

Each component is scored independently on a linear scale -- 100 at or below
the safe bound, 0 at or beyond the critical bound -- then averaged. The
critical bounds are set to the same numbers fog/alerts.py itself alerts on
(avg > 1200 microstrain, max > 20 mm/s), so the index reaches 0 exactly
where an engineer would already be looking at an active alert, rather than
using an unrelated second set of numbers.

    strain_score     = 100 - 100 * (strain_avg - 400) / (1200 - 400)   [clamped to 0..100]
    vibration_score   = 100 - 100 * (vibration_max - 8) / (20 - 8)      [clamped to 0..100]
    integrity_index    = round((strain_score + vibration_score) / 2, 1)
"""

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
