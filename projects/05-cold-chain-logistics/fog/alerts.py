# Machine-readable mirror of the numeric rules the _check_* functions below
# enforce in code. Exposed as-is via fog's /thresholds endpoint so any API
# consumer (including the dashboard) can discover the real exception rules
# without the dashboard hardcoding a second copy of the numbers.
THRESHOLD_DESCRIPTIONS = {
    "storage_temperature": [{"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}],
    "humidity":            [{"field": "avg", "op": ">", "limit": 85, "key": "humidity_breach"}],
    "door_open_seconds":   [{"field": "avg", "op": ">", "limit": 300, "key": "door_open_alert"}],
    "shock_vibration":     [{"field": "avg", "op": ">", "limit": 4, "key": "impact_detected"}],
    "co2_level":           [{"field": "avg", "op": ">", "limit": 1000, "key": "air_quality_warning"}],
}


def _check_cold_chain_breach(summary):
    # Reefer containers must stay well below freezing on average per window;
    # crossing -15C on average risks spoiling temperature-sensitive cargo.
    return ["cold_chain_breach"] if summary["avg"] > -15 else []


def _check_humidity_breach(summary):
    return ["humidity_breach"] if summary["avg"] > 85 else []


def _check_door_open_alert(summary):
    return ["door_open_alert"] if summary["avg"] > 300 else []


def _check_impact_detected(summary):
    return ["impact_detected"] if summary["avg"] > 4 else []


def _check_air_quality_warning(summary):
    return ["air_quality_warning"] if summary["avg"] > 1000 else []


# One evaluator per reading type; kept as a dict dispatch rather than an
# if/elif chain so THRESHOLD_DESCRIPTIONS and the evaluators stay easy to
# scan side by side and extend together.
_EVALUATORS = {
    "storage_temperature": _check_cold_chain_breach,
    "humidity": _check_humidity_breach,
    "door_open_seconds": _check_door_open_alert,
    "shock_vibration": _check_impact_detected,
    "co2_level": _check_air_quality_warning,
}


def flag_container(reading_type, summary):
    """Return the list of exception keys (zero or more) that this window's
    summary trips for the given reading type. Unknown reading types produce
    no exceptions rather than raising, since new sensor types may be added
    without every caller of this function being updated in lockstep."""
    evaluator = _EVALUATORS.get(reading_type)
    if evaluator is None:
        return []
    return evaluator(summary)
