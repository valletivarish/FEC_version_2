from conftest import load_module

alerts = load_module("fog_alerts", "fog/alerts.py")


class TestEvaluateRules:
    def test_evaluate_rules_is_a_generic_pure_function_over_any_rule_list(self):
        rules = [{"sensor_type": "x", "field": "avg", "op": ">", "limit": 10, "key": "too_high"}]
        assert alerts.evaluate_rules(rules, "x", {"avg": 11}) == ["too_high"]
        assert alerts.evaluate_rules(rules, "x", {"avg": 10}) == []

    def test_evaluate_rules_supports_the_less_than_operator_too(self):
        rules = [{"sensor_type": "x", "field": "min", "op": "<", "limit": 5, "key": "too_low"}]
        assert alerts.evaluate_rules(rules, "x", {"min": 4}) == ["too_low"]
        assert alerts.evaluate_rules(rules, "x", {"min": 5}) == []


class TestRealRules:
    def test_station_temp_overheat_rule(self):
        assert alerts.evaluate_rules(alerts.RULES, "station_temp_c", {"avg": 45.1}) == ["overheat_risk"]
        assert alerts.evaluate_rules(alerts.RULES, "station_temp_c", {"avg": 45.0}) == []

    def test_charging_current_overcurrent_rule(self):
        assert alerts.evaluate_rules(alerts.RULES, "charging_current_a", {"avg": 32.1}) == ["overcurrent"]
        assert alerts.evaluate_rules(alerts.RULES, "charging_current_a", {"avg": 32.0}) == []

    def test_grid_load_strain_rule(self):
        assert alerts.evaluate_rules(alerts.RULES, "grid_load_kw", {"avg": 80.1}) == ["grid_strain"]
        assert alerts.evaluate_rules(alerts.RULES, "grid_load_kw", {"avg": 80.0}) == []

    def test_session_duration_stalled_rule(self):
        assert alerts.evaluate_rules(alerts.RULES, "session_duration_min", {"avg": 180.1}) == ["stalled_session"]
        assert alerts.evaluate_rules(alerts.RULES, "session_duration_min", {"avg": 180.0}) == []

    def test_battery_soc_has_no_rules(self):
        assert alerts.evaluate_rules(alerts.RULES, "battery_soc_pct", {"avg": 999.0}) == []

    def test_unknown_sensor_type_fires_nothing(self):
        assert alerts.evaluate_rules(alerts.RULES, "not_a_real_sensor", {"avg": 999999}) == []


class TestThresholdsPayload:
    def test_matches_the_exact_brief_thresholds(self):
        payload = alerts.thresholds_payload(alerts.RULES)
        assert {"field": "avg", "op": ">", "limit": 45, "key": "overheat_risk"} in payload["station_temp_c"]
        assert {"field": "avg", "op": ">", "limit": 32, "key": "overcurrent"} in payload["charging_current_a"]
        assert {"field": "avg", "op": ">", "limit": 80, "key": "grid_strain"} in payload["grid_load_kw"]
        assert {"field": "avg", "op": ">", "limit": 180, "key": "stalled_session"} in payload["session_duration_min"]

    def test_battery_soc_pct_is_absent_from_the_descriptive_payload(self):
        assert "battery_soc_pct" not in alerts.thresholds_payload(alerts.RULES)

    def test_each_sensor_type_maps_to_exactly_one_rule(self):
        payload = alerts.thresholds_payload(alerts.RULES)
        assert len(payload) == 4
        assert all(len(rules) == 1 for rules in payload.values())
