"""RULES keyed by sensor_type then by a named AlertKey enum member to a lambda predicate, evaluated via one filtering comprehension -- the 4th distinct alert-rule idiom in this portfolio's Python projects."""

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
