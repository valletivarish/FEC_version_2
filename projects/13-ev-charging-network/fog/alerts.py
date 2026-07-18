"""Rules as a flat list of plain dicts with no class/dataclass/dispatch table."""

RULES = [
    {"sensor_type": "station_temp_c", "field": "avg", "op": ">", "limit": 45, "key": "overheat_risk"},
    {"sensor_type": "charging_current_a", "field": "avg", "op": ">", "limit": 32, "key": "overcurrent"},
    {"sensor_type": "grid_load_kw", "field": "avg", "op": ">", "limit": 80, "key": "grid_strain"},
    {"sensor_type": "session_duration_min", "field": "avg", "op": ">", "limit": 180, "key": "stalled_session"},
]


def evaluate_rules(rules, sensor_type, summary):
    """Return every alert key among `rules` whose sensor_type matches and
    whose comparison against `summary` trips. battery_soc_pct has no entry
    in RULES at all, so it always evaluates to [] -- the charging-bay UI
    shows it as a secondary reading with no alert badge, by design."""
    fired = []
    for rule in rules:
        if rule["sensor_type"] != sensor_type:
            continue
        value = summary[rule["field"]]
        op, limit = rule["op"], rule["limit"]
        if (op == ">" and value > limit) or (op == "<" and value < limit):
            fired.append(rule["key"])
    return fired


def thresholds_payload(rules):
    """Group `rules` by sensor_type for the purely-descriptive /thresholds
    endpoint. Built fresh from `rules` on every call so it can never drift
    from what evaluate_rules() actually enforces. Sensor types absent from
    `rules` (battery_soc_pct) are simply absent from the payload, rather
    than padded with an empty list, since they carry no rule at all."""
    grouped = {}
    for rule in rules:
        grouped.setdefault(rule["sensor_type"], []).append(
            {"field": rule["field"], "op": rule["op"], "limit": rule["limit"], "key": rule["key"]}
        )
    return grouped
