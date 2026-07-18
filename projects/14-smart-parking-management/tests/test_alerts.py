from conftest import load_module

alerts = load_module("fog_alerts", "fog/alerts.py")


class TestLotAlertEnum:
    def test_every_rule_key_is_an_alertkey_member(self):
        for sensor_rules in alerts.LOT_ALERT_RULES.values():
            for key in sensor_rules:
                assert isinstance(key, alerts.LotAlert)


class TestEvaluate:
    def test_occupied_spaces_near_full_capacity_rule(self):
        assert alerts.evaluate("occupied_spaces", {"avg": 271.0}) == ["near_full_capacity"]
        assert alerts.evaluate("occupied_spaces", {"avg": 270.0}) == []

    def test_entry_rate_surge_inflow_rule(self):
        assert alerts.evaluate("entry_rate_per_min", {"avg": 20.1}) == ["surge_inflow"]
        assert alerts.evaluate("entry_rate_per_min", {"avg": 20.0}) == []

    def test_avg_dwell_time_long_stay_anomaly_rule(self):
        assert alerts.evaluate("avg_dwell_time_min", {"avg": 300.1}) == ["long_stay_anomaly"]
        assert alerts.evaluate("avg_dwell_time_min", {"avg": 300.0}) == []

    def test_gate_fault_events_uses_max_not_avg(self):
        assert alerts.evaluate("gate_fault_events", {"avg": 0.5, "max": 4}) == ["gate_fault_detected"]
        assert alerts.evaluate("gate_fault_events", {"avg": 3.9, "max": 3}) == []

    def test_exit_rate_per_min_has_no_alert_rule(self):
        assert alerts.evaluate("exit_rate_per_min", {"avg": 999.0, "max": 999.0}) == []

    def test_unknown_sensor_type_fires_nothing(self):
        assert alerts.evaluate("not_a_real_sensor", {"avg": 999999}) == []


class TestThresholdsPayload:
    def test_matches_the_exact_brief_thresholds(self):
        payload = alerts.thresholds_payload()
        assert {"field": "avg", "op": ">", "limit": 270, "key": "near_full_capacity"} in payload["occupied_spaces"]
        assert {"field": "avg", "op": ">", "limit": 20, "key": "surge_inflow"} in payload["entry_rate_per_min"]
        assert {"field": "avg", "op": ">", "limit": 300, "key": "long_stay_anomaly"} in payload["avg_dwell_time_min"]
        assert {"field": "max", "op": ">", "limit": 3, "key": "gate_fault_detected"} in payload["gate_fault_events"]

    def test_exit_rate_per_min_is_absent_from_the_descriptive_payload(self):
        assert "exit_rate_per_min" not in alerts.thresholds_payload()

    def test_descriptions_agree_with_the_real_evaluate_predicates(self):
        """Each description's (field, op, limit) must make evaluate() fire the key it names."""
        for sensor_type, rules in alerts.LOT_ALERT_DESCRIPTIONS.items():
            for rule in rules:
                just_over = {rule["field"]: rule["limit"] + 0.01}
                just_under = {rule["field"]: rule["limit"]}
                assert rule["key"] in alerts.evaluate(sensor_type, just_over)
                assert rule["key"] not in alerts.evaluate(sensor_type, just_under)
