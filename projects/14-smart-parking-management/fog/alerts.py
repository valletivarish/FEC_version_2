"""Per-sensor_type alert rules keyed by a LotAlert enum member to a predicate, evaluated by one filtering comprehension."""

from enum import Enum
from typing import Callable


class LotAlert(Enum):
    NEAR_FULL_CAPACITY = "near_full_capacity"
    SURGE_INFLOW = "surge_inflow"
    LONG_STAY_ANOMALY = "long_stay_anomaly"
    GATE_FAULT_DETECTED = "gate_fault_detected"


# exit_rate_per_min has no rule and evaluate() returns [] for any absent sensor_type.
LOT_ALERT_RULES: dict[str, dict[LotAlert, Callable[[dict], bool]]] = {
    "occupied_spaces": {
        LotAlert.NEAR_FULL_CAPACITY: lambda agg: agg["avg"] > 270,
    },
    "entry_rate_per_min": {
        LotAlert.SURGE_INFLOW: lambda agg: agg["avg"] > 20,
    },
    "avg_dwell_time_min": {
        LotAlert.LONG_STAY_ANOMALY: lambda agg: agg["avg"] > 300,
    },
    "gate_fault_events": {
        LotAlert.GATE_FAULT_DETECTED: lambda agg: agg["max"] > 3,
    },
}

# Introspectable mirror of LOT_ALERT_RULES for the /thresholds endpoint; kept beside it and cross-checked in tests.
LOT_ALERT_DESCRIPTIONS = {
    "occupied_spaces": [
        {"field": "avg", "op": ">", "limit": 270, "key": LotAlert.NEAR_FULL_CAPACITY.value},
    ],
    "entry_rate_per_min": [
        {"field": "avg", "op": ">", "limit": 20, "key": LotAlert.SURGE_INFLOW.value},
    ],
    "avg_dwell_time_min": [
        {"field": "avg", "op": ">", "limit": 300, "key": LotAlert.LONG_STAY_ANOMALY.value},
    ],
    "gate_fault_events": [
        {"field": "max", "op": ">", "limit": 3, "key": LotAlert.GATE_FAULT_DETECTED.value},
    ],
}


def evaluate(sensor_type, agg):
    """Alert keys (as strings) that fire for this sensor_type's window summary; unknown types produce none."""
    predicates = LOT_ALERT_RULES.get(sensor_type, {})
    return [key.value for key, predicate in predicates.items() if predicate(agg)]


def thresholds_payload():
    return LOT_ALERT_DESCRIPTIONS
