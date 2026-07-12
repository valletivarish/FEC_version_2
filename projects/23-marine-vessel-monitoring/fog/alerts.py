"""Threshold rules as a flat list of plain dicts whose "op" value is a real
function object imported from the stdlib operator module (operator.gt /
operator.lt) -- the 8th distinct alert-rule idiom in the portfolio's Python
projects.

01's fog/alerts.py keeps THRESHOLDS as a dict-of-lists-of-tuples keyed by
sensor_type and loops over agg[field] with an if/elif on the operator
string. 05's fog/alerts.py wires one hand-written _check_<key> function per
exception through a dict-dispatch table (_EVALUATORS). 12's fog/alerts.py
defines a frozen, __post_init__-validated Rule dataclass filtered by a
generator expression at call time. 13's fog/alerts.py keeps a flat list of
plain dicts consumed by a generic evaluate_rules(rules, sensor_type,
summary) function, again dispatching on the operator string. 14's
fog/alerts.py keys an enum.Enum-tagged dict[str, dict[AlertKey, Callable]]
of lambdas. 17's fog/alerts.py builds an abc.ABC Strategy hierarchy
(ThresholdRule with AboveLimitRule/BelowLimitRule subclasses) and calls
rule.evaluate(summary) polymorphically. 21's fog/alerts.py keeps a flat list
of typing.NamedTuple records dispatched via `match rule.op: case "avg_gt":
...`.

None of those seven store the comparison itself as a first-class callable
-- every one of them re-derives "greater than"/"less than" behaviour from a
string tag at evaluation time (if/elif, match/case, dict-dispatch, or a
lambda hand-written to match the intended comparison). Here operator.gt /
operator.lt ARE the rule's "op" value: evaluate() calls
rule["op"](summary[rule["field"]], rule["limit"]) directly -- no string
comparison, lambda, dispatch table, or class method anywhere in the
evaluation path. thresholds_payload() maps each function object back to its
display symbol (">"/"<") only for the purely-descriptive /thresholds
endpoint, via _OP_SYMBOLS, since operator.gt/operator.lt themselves are not
JSON-serialisable and evaluate() never consults _OP_SYMBOLS.
"""

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
