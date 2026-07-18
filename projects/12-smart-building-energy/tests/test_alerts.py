import pytest

from conftest import load_module

alerts = load_module("fog_alerts", "fog/alerts.py")


class TestRuleValidation:
    def test_post_init_rejects_unsupported_field(self):
        with pytest.raises(ValueError):
            alerts.ThresholdRule("x", "median", ">", 1, "bad_field")

    def test_post_init_rejects_unsupported_operator(self):
        with pytest.raises(ValueError):
            alerts.ThresholdRule("x", "avg", "==", 1, "bad_op")

    def test_valid_rule_constructs_cleanly(self):
        rule = alerts.ThresholdRule("energy_consumption_kw", "avg", ">", 55, "peak_load_warning")
        assert rule.breaches({"avg": 56}) is True
        assert rule.breaches({"avg": 55}) is False


class TestEvaluate:
    @pytest.mark.parametrize("avg, expected", [(56.0, ["peak_load_warning"]), (54.9, [])])
    def test_energy_peak_load_rule(self, avg, expected):
        assert alerts.evaluate_thresholds("energy_consumption_kw", {"avg": avg}) == expected

    @pytest.mark.parametrize("avg, expected", [(1001.0, ["poor_air_quality"]), (999.0, [])])
    def test_co2_air_quality_rule(self, avg, expected):
        assert alerts.evaluate_thresholds("co2_ppm", {"avg": avg}) == expected

    def test_hvac_hot_rule_fires_above_26(self):
        assert alerts.evaluate_thresholds("hvac_temp_c", {"avg": 26.1}) == ["comfort_violation_hot"]

    def test_hvac_cold_rule_fires_below_18(self):
        assert alerts.evaluate_thresholds("hvac_temp_c", {"avg": 17.9}) == ["comfort_violation_cold"]

    def test_hvac_in_comfortable_band_fires_nothing(self):
        assert alerts.evaluate_thresholds("hvac_temp_c", {"avg": 21.0}) == []

    @pytest.mark.parametrize("avg, expected", [(20.1, ["leak_suspected"]), (19.9, [])])
    def test_water_leak_rule(self, avg, expected):
        assert alerts.evaluate_thresholds("water_usage_lpm", {"avg": avg}) == expected

    def test_occupancy_count_has_no_rules(self):
        assert alerts.evaluate_thresholds("occupancy_count", {"avg": 500.0}) == []

    def test_unknown_sensor_type_fires_nothing(self):
        assert alerts.evaluate_thresholds("not_a_real_sensor", {"avg": 999999}) == []


class TestThresholdsPayload:
    def test_matches_the_exact_brief_thresholds(self):
        payload = alerts.thresholds_payload()
        assert {"field": "avg", "op": ">", "limit": 55, "key": "peak_load_warning"} in payload["energy_consumption_kw"]
        assert {"field": "avg", "op": ">", "limit": 1000, "key": "poor_air_quality"} in payload["co2_ppm"]
        assert {"field": "avg", "op": ">", "limit": 26, "key": "comfort_violation_hot"} in payload["hvac_temp_c"]
        assert {"field": "avg", "op": "<", "limit": 18, "key": "comfort_violation_cold"} in payload["hvac_temp_c"]
        assert {"field": "avg", "op": ">", "limit": 20, "key": "leak_suspected"} in payload["water_usage_lpm"]

    def test_hvac_temp_c_has_exactly_two_rules(self):
        payload = alerts.thresholds_payload()
        assert len(payload["hvac_temp_c"]) == 2

    def test_occupancy_count_is_absent_from_the_descriptive_payload(self):
        assert "occupancy_count" not in alerts.thresholds_payload()
