"""Fault rules as a Strategy pattern: one concrete rule per exception condition, dispatched through a polymorphic evaluate()."""

from abc import ABC, abstractmethod


class FaultRule(ABC):
    """Strategy interface: each rule owns the sensor_type it applies to and the alert key it fires."""

    def __init__(self, sensor_type, key):
        self.sensor_type = sensor_type
        self.key = key

    @abstractmethod
    def evaluate(self, summary):
        """Return self.key if summary trips this rule, else None."""


class CeilingFaultRule(FaultRule):
    def __init__(self, sensor_type, field, limit, key):
        super().__init__(sensor_type, key)
        self.field = field
        self.limit = limit

    def evaluate(self, summary):
        if summary["sensor_type"] != self.sensor_type:
            return None
        if summary[self.field] > self.limit:
            return self.key
        return None


class FloorFaultRule(FaultRule):
    def __init__(self, sensor_type, field, limit, key):
        super().__init__(sensor_type, key)
        self.field = field
        self.limit = limit

    def evaluate(self, summary):
        if summary["sensor_type"] != self.sensor_type:
            return None
        if summary[self.field] < self.limit:
            return self.key
        return None


# One rule per exception condition; irradiance_wm2 carries no rule as it is an environmental input only.
FAULT_RULES = [
    CeilingFaultRule("panel_temp_c", "avg", 65, "thermal_derate_risk"),
    FloorFaultRule("inverter_output_kw", "avg", 50, "inverter_underperformance"),
    FloorFaultRule("dc_voltage_v", "min", 350, "undervoltage_fault"),
    CeilingFaultRule("soiling_index_pct", "avg", 25, "cleaning_required"),
]


def evaluate(sensor_type, summary):
    """The alert keys that fire for this sensor_type's window summary; each rule decides for itself whether it applies."""
    tripped = []
    for rule in FAULT_RULES:
        key = rule.evaluate(summary)
        if key is not None:
            tripped.append(key)
    return tripped


def thresholds_payload():
    """Group FAULT_RULES by sensor_type for the descriptive /thresholds endpoint, rebuilt fresh on every call."""
    by_sensor = {}
    for rule in FAULT_RULES:
        operator_symbol = ">" if isinstance(rule, CeilingFaultRule) else "<"
        by_sensor.setdefault(rule.sensor_type, []).append(
            {"field": rule.field, "op": operator_symbol, "limit": rule.limit, "key": rule.key}
        )
    return by_sensor
