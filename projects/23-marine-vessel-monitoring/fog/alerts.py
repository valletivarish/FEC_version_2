"""Threshold rules store operator.gt/operator.lt themselves as the "op" value, invoked directly in evaluate() with no string/lambda/class dispatch -- the 8th distinct alert-rule idiom in this portfolio's Python projects."""

import operator

_OP_SYMBOLS = {operator.gt: ">", operator.lt: "<"}

# One rule per exception condition, matching the CA brief's thresholds
# exactly. passenger_count carries no rule at all -- secondary detail only,
# always evaluates to [].
RULES = [
    {"sensor_type": "engine_room_temp_c", "field": "avg", "op": operator.gt, "limit": 75, "key": "engine_overheat_risk"},
    {"sensor_type": "fuel_consumption_lph", "field": "avg", "op": operator.gt, "limit": 350, "key": "fuel_burn_excessive"},
    {"sensor_type": "ballast_water_level_pct", "field": "avg", "op": operator.gt, "limit": 90, "key": "ballast_overfill_risk"},
    {"sensor_type": "hull_vibration_mm", "field": "max", "op": operator.gt, "limit": 15, "key": "hull_stress_warning"},
]


def evaluate(sensor_type, summary):
    """The alert keys that fire for this sensor_type's window summary.
    Every matching rule's "op" callable is invoked directly against the
    summary field and the limit -- unknown sensor_types simply match no
    rule and produce no alerts."""
    fired = []
    for rule in RULES:
        if rule["sensor_type"] != sensor_type:
            continue
        if rule["op"](summary[rule["field"]], rule["limit"]):
            fired.append(rule["key"])
    return fired


def thresholds_payload():
    """Group RULES by sensor_type for the purely-descriptive /thresholds
    endpoint. Built fresh from RULES on every call so it can never drift
    from what evaluate() actually enforces."""
    grouped = {}
    for rule in RULES:
        grouped.setdefault(rule["sensor_type"], []).append({
            "field": rule["field"],
            "op": _OP_SYMBOLS[rule["op"]],
            "limit": rule["limit"],
            "key": rule["key"],
        })
    return grouped
