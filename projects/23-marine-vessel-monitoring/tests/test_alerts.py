import operator

from conftest import load_module

alerts = load_module("mvs_fog_alerts", "fog/alerts.py")


class TestRulesAreRealOperatorCallables:
    def test_every_rule_op_is_a_function_from_the_operator_module(self):
        for rule in alerts.RULES:
            assert rule["op"] in (operator.gt, operator.lt)
            assert callable(rule["op"])

    def test_op_symbols_covers_every_op_used_in_rules(self):
        used_ops = {rule["op"] for rule in alerts.RULES}
        assert used_ops.issubset(alerts._OP_SYMBOLS.keys())


class TestEvaluateMatchesBriefExactly:
    def test_engine_overheat_risk_fires_above_75_avg(self):
        assert alerts.evaluate("engine_room_temp_c", {"avg": 75.1, "max": 75.1}) == ["engine_overheat_risk"]
        assert alerts.evaluate("engine_room_temp_c", {"avg": 75.0, "max": 75.0}) == []
        assert alerts.evaluate("engine_room_temp_c", {"avg": 74.9, "max": 74.9}) == []

    def test_fuel_burn_excessive_fires_above_350_avg(self):
        assert alerts.evaluate("fuel_consumption_lph", {"avg": 350.1}) == ["fuel_burn_excessive"]
        assert alerts.evaluate("fuel_consumption_lph", {"avg": 350.0}) == []

    def test_ballast_overfill_risk_fires_above_90_avg(self):
        assert alerts.evaluate("ballast_water_level_pct", {"avg": 90.1}) == ["ballast_overfill_risk"]
        assert alerts.evaluate("ballast_water_level_pct", {"avg": 90.0}) == []

    def test_hull_stress_warning_fires_above_15_max_not_avg(self):
        assert alerts.evaluate("hull_vibration_mm", {"avg": 5.0, "max": 15.1}) == ["hull_stress_warning"]
        # a high average with a max at or below 15 must not fire -- the rule
        # is keyed on "max", not "avg".
        assert alerts.evaluate("hull_vibration_mm", {"avg": 20.0, "max": 15.0}) == []

    def test_passenger_count_never_fires_any_alert(self):
        assert alerts.evaluate("passenger_count", {"avg": 1_000_000, "max": 1_000_000}) == []

    def test_unknown_sensor_type_produces_no_alerts(self):
        assert alerts.evaluate("not_a_real_sensor", {"avg": 999}) == []


class TestThresholdsPayload:
    def test_groups_by_sensor_type_and_uses_display_symbols(self):
        payload = alerts.thresholds_payload()
        assert payload["engine_room_temp_c"] == [{"field": "avg", "op": ">", "limit": 75, "key": "engine_overheat_risk"}]
        assert payload["hull_vibration_mm"] == [{"field": "max", "op": ">", "limit": 15, "key": "hull_stress_warning"}]
        assert "passenger_count" not in payload

    def test_thresholds_payload_never_drifts_from_evaluate(self):
        payload = alerts.thresholds_payload()
        for sensor_type, rules in payload.items():
            for rule in rules:
                limit = rule["limit"]
                just_over = {rule["field"]: limit + 0.01}
                assert alerts.evaluate(sensor_type, just_over) == [rule["key"]]
