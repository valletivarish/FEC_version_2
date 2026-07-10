"""Threshold rules as an enum.Enum of alert keys mapped through
dict[str, dict[AlertKey, Callable[[dict], bool]]] -- the 4th distinct
alert-rule idiom in the portfolio's Python projects.

01 keeps THRESHOLDS as a dict-of-lists-of-tuples keyed by sensor_type and
loops over agg[field] with an if/elif on the operator string. 05 keeps one
hand-written _check_<key> function per exception, wired through a
dict-dispatch table (_EVALUATORS). 12 defines every rule as a frozen,
__post_init__-validated Rule dataclass instance in one flat RULES list (not
keyed by sensor_type at all) and filters that flat list.

Here every alert has a named AlertKey enum member (no bare strings floating
around as rule identifiers), and RULES is keyed first by sensor_type, then
by AlertKey, straight to a lambda predicate over the window summary --
sensor_type lookup is an O(1) dict access rather than a linear scan or a
list filter, and evaluate() itself is a single filtering comprehension over
that inner dict's items.
"""

from enum import Enum
from typing import Callable


class AlertKey(Enum):
    NEAR_FULL_CAPACITY = "near_full_capacity"
    SURGE_INFLOW = "surge_inflow"
    LONG_STAY_ANOMALY = "long_stay_anomaly"
    GATE_FAULT_DETECTED = "gate_fault_detected"


# sensor_type -> {AlertKey: predicate(window_summary) -> bool}. exit_rate_per_min
# is deliberately absent -- it has no alert rule, only ever shown as secondary
# detail, and evaluate() below returns [] for any sensor_type with no entry here.
RULES: dict[str, dict[AlertKey, Callable[[dict], bool]]] = {
    "occupied_spaces": {
        AlertKey.NEAR_FULL_CAPACITY: lambda agg: agg["avg"] > 270,
    },
    "entry_rate_per_min": {
        AlertKey.SURGE_INFLOW: lambda agg: agg["avg"] > 20,
    },
    "avg_dwell_time_min": {
        AlertKey.LONG_STAY_ANOMALY: lambda agg: agg["avg"] > 300,
    },
    "gate_fault_events": {
        AlertKey.GATE_FAULT_DETECTED: lambda agg: agg["max"] > 3,
    },
}

# Descriptive mirror of RULES for the purely-informational /thresholds
# endpoint -- field/op/limit written out explicitly since a lambda's
# internals aren't introspectable. Kept directly beside RULES so the two
# never drift apart; tests/test_alerts.py cross-checks both against each
# other and against the exact numbers in the CA brief.
THRESHOLD_DESCRIPTIONS = {
    "occupied_spaces": [
        {"field": "avg", "op": ">", "limit": 270, "key": AlertKey.NEAR_FULL_CAPACITY.value},
    ],
    "entry_rate_per_min": [
        {"field": "avg", "op": ">", "limit": 20, "key": AlertKey.SURGE_INFLOW.value},
    ],
    "avg_dwell_time_min": [
        {"field": "avg", "op": ">", "limit": 300, "key": AlertKey.LONG_STAY_ANOMALY.value},
    ],
    "gate_fault_events": [
        {"field": "max", "op": ">", "limit": 3, "key": AlertKey.GATE_FAULT_DETECTED.value},
    ],
}


def evaluate(sensor_type, agg):
    """The alert keys (as plain strings) that fire for this sensor_type's
    window summary. A single filtering comprehension over the inner dict's
    items -- unknown sensor_types simply have no entry in RULES and produce
    no alerts rather than raising."""
    predicates = RULES.get(sensor_type, {})
    return [key.value for key, predicate in predicates.items() if predicate(agg)]


def thresholds_payload():
    return THRESHOLD_DESCRIPTIONS
