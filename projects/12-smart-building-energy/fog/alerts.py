"""Frozen, self-validating ThresholdRule dataclasses in one flat THRESHOLD_RULES list, filtered by a single generator expression in evaluate_thresholds()."""

from dataclasses import dataclass

_SUMMARY_FIELDS = ("count", "min", "max", "avg", "latest")
_COMPARISON_OPS = ("<", ">")


@dataclass(frozen=True)
class ThresholdRule:
    sensor_type: str
    field: str
    op: str
    limit: float
    key: str

    def __post_init__(self):
        if self.field not in _SUMMARY_FIELDS:
            raise ValueError(f"unsupported summary field: {self.field!r}")
        if self.op not in _COMPARISON_OPS:
            raise ValueError(f"unsupported comparison operator: {self.op!r}")

    def breaches(self, summary):
        value = summary[self.field]
        return value < self.limit if self.op == "<" else value > self.limit


# One rule per exception condition; hvac_temp_c carries both a hot and a cold rule.
THRESHOLD_RULES = [
    ThresholdRule("energy_consumption_kw", "avg", ">", 55, "peak_load_warning"),
    ThresholdRule("co2_ppm", "avg", ">", 1000, "poor_air_quality"),
    ThresholdRule("hvac_temp_c", "avg", ">", 26, "comfort_violation_hot"),
    ThresholdRule("hvac_temp_c", "avg", "<", 18, "comfort_violation_cold"),
    ThresholdRule("water_usage_lpm", "avg", ">", 20, "leak_suspected"),
]


def evaluate_thresholds(sensor_type, summary):
    """Alert keys for the rules that breach on this sensor_type's window summary."""
    return [rule.key for rule in THRESHOLD_RULES if rule.sensor_type == sensor_type and rule.breaches(summary)]


def thresholds_payload():
    """Group THRESHOLD_RULES by sensor_type for the descriptive /thresholds endpoint, rebuilt fresh each call so it never drifts from what evaluate_thresholds enforces."""
    by_sensor_type = {}
    for rule in THRESHOLD_RULES:
        by_sensor_type.setdefault(rule.sensor_type, []).append(
            {"field": rule.field, "op": rule.op, "limit": rule.limit, "key": rule.key}
        )
    return by_sensor_type
