"""Threshold rules as a flat list of typing.NamedTuple records, dispatched
through PEP 634 structural pattern matching -- the 7th distinct alert-rule
idiom in the portfolio's Python projects.

01's fog/alerts.py keeps THRESHOLDS as a dict-of-lists-of-tuples keyed by
sensor_type and loops over agg[field] with an if/elif on the operator
string. 05's fog/alerts.py wires one hand-written _check_<key> function per
exception through a dict-dispatch table (_EVALUATORS). 12's fog/alerts.py
defines a frozen, __post_init__-validated Rule dataclass filtered by a
generator expression at call time. 13's fog/alerts.py keeps a flat list of
plain dicts consumed by a generic evaluate_rules(rules, sensor_type,
summary) function. 14's fog/alerts.py keys an enum.Enum-tagged dict of
sensor_type -> {AlertKey: lambda}. 17's fog/alerts.py builds an abc.ABC
Strategy hierarchy (ThresholdRule with AboveLimitRule/BelowLimitRule
subclasses) and calls rule.evaluate(summary) polymorphically.

None of those six use typing.NamedTuple, and none dispatch on the
comparison operator via Python's match/case statement. Here every rule is
a plain, immutable Rule NamedTuple -- no class hierarchy, no dataclass
validation, no dict-dispatch table, no lambda. evaluate() below resolves
which summary field a rule cares about and how to compare it purely by
`match rule.op: case "avg_gt": ... case "max_gt": ...`, structural pattern
matching over the op string rather than a lookup table or a generic
operator function.
"""

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
