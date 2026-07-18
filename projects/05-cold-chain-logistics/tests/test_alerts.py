import pytest

from alerts import EXCURSION_RULES, flag_container

METRIC_KEYS = {
    "storage_temperature", "humidity", "door_open_seconds", "shock_vibration", "co2_level",
}


class TestAlertEvaluation:
    @pytest.mark.parametrize(
        "reading_type, avg_value, expected_flags",
        [
            ("storage_temperature", -10, ["cold_chain_breach"]),
            ("storage_temperature", -20, []),
            ("humidity", 90, ["humidity_breach"]),
            ("door_open_seconds", 400, ["door_open_alert"]),
            ("shock_vibration", 5.5, ["impact_detected"]),
            ("co2_level", 1200, ["air_quality_warning"]),
            ("pressure", 999, []),
        ],
    )
    def test_flag_container_for_metric_value(self, reading_type, avg_value, expected_flags):
        assert flag_container(reading_type, {"avg": avg_value}) == expected_flags


class TestThresholdDescriptions:
    def test_cold_chain_rule_metadata_matches_breach_definition(self):
        rule = {"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}
        assert rule in EXCURSION_RULES["storage_temperature"]

    def test_registers_rules_for_every_tracked_metric(self):
        assert set(EXCURSION_RULES.keys()) == METRIC_KEYS
