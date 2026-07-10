"""Threshold rules as a class-based Strategy pattern, the 4th distinct
alert-rule idiom in the portfolio's Python projects: 01 keeps a
dict-of-lists-of-tuples keyed by sensor_type and loops over agg[field]; 05
wires one hand-written _check_<key> function per exception through a
dict-dispatch table; 12 keeps a flat list of frozen dataclass instances
filtered by a generator expression at call time.

Here every rule is an instance of a concrete subclass of the abstract base
ThresholdRule (built on abc.ABC), each implementing its own evaluate(self,
summary) -> str | None. Rule instances live in one flat list, RULES, and
evaluate() below is just `for rule in RULES: ... rule.evaluate(summary)` --
a real polymorphic Strategy dispatch through the ABC's evaluate() contract,
not a lookup table or a comprehension over dataclass fields.
"""

from abc import ABC, abstractmethod


class ThresholdRule(ABC):
    """Strategy interface: one concrete rule per exception condition. Every
    subclass owns the sensor_type it applies to and the alert key it fires,
    and decides for itself (in evaluate()) whether a given window summary
    trips it."""

    def __init__(self, sensor_type, key):
        self.sensor_type = sensor_type
        self.key = key

    @abstractmethod
    def evaluate(self, summary):
        """Return self.key if summary trips this rule, else None. summary
        is only inspected if it belongs to this rule's sensor_type."""


class AboveLimitRule(ThresholdRule):
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


class BelowLimitRule(ThresholdRule):
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


# One rule instance per exception condition. irradiance_wm2 intentionally
# carries no rule -- it is an environmental input reading only.
RULES = [
    AboveLimitRule("panel_temp_c", "avg", 65, "thermal_derate_risk"),
    BelowLimitRule("inverter_output_kw", "avg", 50, "inverter_underperformance"),
    BelowLimitRule("dc_voltage_v", "min", 350, "undervoltage_fault"),
    AboveLimitRule("soiling_index_pct", "avg", 25, "cleaning_required"),
]


def evaluate(sensor_type, summary):
    """The alert keys that fire for this sensor_type's window summary.
    Calls .evaluate() on every rule in the flat RULES list -- each rule
    strategy decides for itself whether it applies and whether it fires,
    rather than the caller pre-filtering by sensor_type."""
    fired = []
    for rule in RULES:
        key = rule.evaluate(summary)
        if key is not None:
            fired.append(key)
    return fired


def thresholds_payload():
    """Group RULES by sensor_type for the purely-descriptive /thresholds
    endpoint. Built fresh from RULES (via each rule's own attributes) on
    every call, so the endpoint can never drift from what evaluate()
    actually enforces."""
    grouped = {}
    for rule in RULES:
        op = ">" if isinstance(rule, AboveLimitRule) else "<"
        grouped.setdefault(rule.sensor_type, []).append(
            {"field": rule.field, "op": op, "limit": rule.limit, "key": rule.key}
        )
    return grouped
