# Machine-readable mirror of the numeric excursion rules, served as-is on /thresholds.
EXCURSION_RULES = {
    "storage_temperature": [{"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}],
    "humidity":            [{"field": "avg", "op": ">", "limit": 85, "key": "humidity_breach"}],
    "door_open_seconds":   [{"field": "avg", "op": ">", "limit": 300, "key": "door_open_alert"}],
    "shock_vibration":     [{"field": "avg", "op": ">", "limit": 4, "key": "impact_detected"}],
    "co2_level":           [{"field": "avg", "op": ">", "limit": 1000, "key": "air_quality_warning"}],
}


def _screen_cold_chain(summary):
    # Reefer cargo must stay well below freezing on average; above -15C risks spoilage.
    return ["cold_chain_breach"] if summary["avg"] > -15 else []


def _screen_humidity(summary):
    return ["humidity_breach"] if summary["avg"] > 85 else []


def _screen_door_dwell(summary):
    return ["door_open_alert"] if summary["avg"] > 300 else []


def _screen_handling_shock(summary):
    return ["impact_detected"] if summary["avg"] > 4 else []


def _screen_air_quality(summary):
    return ["air_quality_warning"] if summary["avg"] > 1000 else []


# One screener per reading type; a dict dispatch kept in step with EXCURSION_RULES.
_SCREENERS = {
    "storage_temperature": _screen_cold_chain,
    "humidity": _screen_humidity,
    "door_open_seconds": _screen_door_dwell,
    "shock_vibration": _screen_handling_shock,
    "co2_level": _screen_air_quality,
}


def flag_container(reading_type, summary):
    """Return the excursion keys this window's summary trips; unknown types raise nothing."""
    screener = _SCREENERS.get(reading_type)
    if screener is None:
        return []
    return screener(summary)
