"""Frozen, self-validating Rule dataclasses in one flat RULES list, filtered by a single generator expression in evaluate() -- the 3rd distinct alert-rule idiom in this portfolio's Python projects."""

from dataclasses import dataclass

_VALID_FIELDS = ("count", "min", "max", "avg", "latest")
_VALID_OPS = ("<", ">")


@dataclass(frozen=True)
class Rule:
    sensor_type: str
    field: str
    op: str
    limit: float
    key: str

    def __post_init__(self):
        if self.field not in _VALID_FIELDS:
            raise ValueError(f"unsupported summary field: {self.field!r}")
        if self.op not in _VALID_OPS:
            raise ValueError(f"unsupported comparison operator: {self.op!r}")

    def fires(self, summary):
        value = summary[self.field]
        return value < self.limit if self.op == "<" else value > self.limit


# One Rule per exception condition. hvac_temp_c intentionally carries two
# rules (hot and cold) to show a sensor_type is not limited to one entry.
RULES = [
    Rule("energy_consumption_kw", "avg", ">", 55, "peak_load_warning"),
    Rule("co2_ppm", "avg", ">", 1000, "poor_air_quality"),
    Rule("hvac_temp_c", "avg", ">", 26, "comfort_violation_hot"),
    Rule("hvac_temp_c", "avg", "<", 18, "comfort_violation_cold"),
    Rule("water_usage_lpm", "avg", ">", 20, "leak_suspected"),
]


def evaluate(sensor_type, summary):
    """The rules that fire for this sensor_type's window summary, as a list
    of alert keys. A single filtering comprehension over the flat RULES
    list stands in for both the dict-lookup-then-loop shape (01) and the
    named-function dispatch-table shape (05)."""
    return [rule.key for rule in RULES if rule.sensor_type == sensor_type and rule.fires(summary)]


def thresholds_payload():
    """Group RULES by sensor_type for the purely-descriptive /thresholds
    endpoint. Built fresh from RULES on every call so the endpoint can never
    drift from the rules evaluate() actually enforces."""
    grouped = {}
    for rule in RULES:
        grouped.setdefault(rule.sensor_type, []).append(
            {"field": rule.field, "op": rule.op, "limit": rule.limit, "key": rule.key}
        )
    return grouped
