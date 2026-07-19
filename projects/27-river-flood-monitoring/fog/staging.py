"""Multi-band flood stage on the window peak; other signals carry one rule each, turbidity none. The rate-of-rise leading indicator is derived at the dashboard from the level trend, not from a single 10 s window."""

STAGES = [(5.5, "flood_warning"), (4.5, "flood_watch"), (3.5, "flood_advisory")]

RULES_DOC = {
    "river_level_m": [
        {"field": "max", "op": ">=", "limit": 3.5, "key": "flood_advisory"},
        {"field": "max", "op": ">=", "limit": 4.5, "key": "flood_watch"},
        {"field": "max", "op": ">=", "limit": 5.5, "key": "flood_warning"},
    ],
    "rainfall_mmph": [{"field": "avg", "op": ">", "limit": 40, "key": "torrential_rain"}],
    "flow_velocity_ms": [{"field": "max", "op": ">", "limit": 4.0, "key": "dangerous_current"}],
    "soil_moisture_pct": [{"field": "avg", "op": ">", "limit": 90, "key": "saturated_catchment"}],
    "turbidity_ntu": [],
}


def stage_key(level_max):
    for cutoff, key in STAGES:
        if level_max >= cutoff:
            return key
    return None


def evaluate(sensor_type, agg):
    keys = []
    if sensor_type == "river_level_m":
        s = stage_key(agg["max"])
        if s:
            keys.append(s)
    elif sensor_type == "rainfall_mmph" and agg["avg"] > 40:
        keys.append("torrential_rain")
    elif sensor_type == "flow_velocity_ms" and agg["max"] > 4.0:
        keys.append("dangerous_current")
    elif sensor_type == "soil_moisture_pct" and agg["avg"] > 90:
        keys.append("saturated_catchment")
    return keys


def thresholds_payload():
    return RULES_DOC
