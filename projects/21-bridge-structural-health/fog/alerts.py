"""Rules as immutable typing.NamedTuple records dispatched via match/case on rule.op (PEP 634 structural pattern matching)."""

import typing


class Rule(typing.NamedTuple):
    field: str
    op: str
    limit: float
    key: str
    sensor_type: str


# One rule per structural exception condition. expansion_joint_mm carries
# no rule at all -- it is an informational thermal-movement reading only,
# shown in the dashboard's secondary detail section without an alert badge.
RULES = [
    Rule(field="avg", op="avg_gt", limit=1200, key="structural_stress_warning", sensor_type="strain_microstrain"),
    Rule(field="max", op="max_gt", limit=20, key="excessive_vibration_alert", sensor_type="deck_vibration_mms"),
    Rule(field="avg", op="avg_gt", limit=2.5, key="deformation_risk", sensor_type="tilt_angle_deg"),
    Rule(field="avg", op="avg_gt", limit=150, key="overload_risk", sensor_type="traffic_load_tonnes"),
]


def evaluate(sensor_type, summary):
    """The alert keys that fire for this sensor_type's window summary.
    Every rule for this sensor_type is checked; rule.op is dispatched via
    match/case rather than a dict lookup or a generic comparison helper."""
    fired = []
    for rule in RULES:
        if rule.sensor_type != sensor_type:
            continue
        match rule.op:
            case "avg_gt":
                hit = summary["avg"] > rule.limit
            case "max_gt":
                hit = summary["max"] > rule.limit
            case _:
                hit = False
        if hit:
            fired.append(rule.key)
    return fired


def thresholds_payload():
    """Group RULES by sensor_type for the purely-descriptive /thresholds
    endpoint. Built fresh from RULES on every call so it can never drift
    from what evaluate() actually enforces."""
    grouped = {}
    for rule in RULES:
        grouped.setdefault(rule.sensor_type, []).append(
            {"field": rule.field, "op": rule.op, "limit": rule.limit, "key": rule.key}
        )
    return grouped
