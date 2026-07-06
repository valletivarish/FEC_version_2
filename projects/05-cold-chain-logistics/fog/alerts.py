THRESHOLD_DESCRIPTIONS = {
    "storage_temperature": [{"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}],
    "humidity":            [{"field": "avg", "op": ">", "limit": 85, "key": "humidity_breach"}],
    "door_open_seconds":   [{"field": "avg", "op": ">", "limit": 300, "key": "door_open_alert"}],
    "shock_vibration":     [{"field": "avg", "op": ">", "limit": 4, "key": "impact_detected"}],
    "co2_level":           [{"field": "avg", "op": ">", "limit": 1000, "key": "air_quality_warning"}],
}


def _check_cold_chain_breach(summary):
    return ["cold_chain_breach"] if summary["avg"] > -15 else []


def _check_humidity_breach(summary):
    return ["humidity_breach"] if summary["avg"] > 85 else []


def _check_door_open_alert(summary):
    return ["door_open_alert"] if summary["avg"] > 300 else []


def _check_impact_detected(summary):
    return ["impact_detected"] if summary["avg"] > 4 else []


def _check_air_quality_warning(summary):
    return ["air_quality_warning"] if summary["avg"] > 1000 else []


_EVALUATORS = {
    "storage_temperature": _check_cold_chain_breach,
    "humidity": _check_humidity_breach,
    "door_open_seconds": _check_door_open_alert,
    "shock_vibration": _check_impact_detected,
    "co2_level": _check_air_quality_warning,
}


def flag_container(reading_type, summary):
    evaluator = _EVALUATORS.get(reading_type)
    if evaluator is None:
        return []
    return evaluator(summary)
