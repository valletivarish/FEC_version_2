from conftest import load_module

alerts = load_module("fog_alerts", "fog/alerts.py")


def summary(sensor_type, **fields):
    base = {"sensor_type": sensor_type, "count": 3, "min": 0, "max": 0, "avg": 0, "latest": 0}
    base.update(fields)
    return base


class TestFaultRuleIsAbstract:
    def test_cannot_instantiate_the_abstract_base_directly(self):
        import pytest
        with pytest.raises(TypeError):
            alerts.FaultRule("x", "y")


class TestExactThresholds:
    def test_panel_temp_avg_above_65_fires_thermal_derate_risk(self):
        assert alerts.evaluate("panel_temp_c", summary("panel_temp_c", avg=65.1)) == ["thermal_derate_risk"]

    def test_panel_temp_avg_at_65_does_not_fire(self):
        assert alerts.evaluate("panel_temp_c", summary("panel_temp_c", avg=65.0)) == []

    def test_inverter_output_avg_below_50_fires_underperformance(self):
        assert alerts.evaluate("inverter_output_kw", summary("inverter_output_kw", avg=49.9)) == ["inverter_underperformance"]

    def test_inverter_output_avg_at_50_does_not_fire(self):
        assert alerts.evaluate("inverter_output_kw", summary("inverter_output_kw", avg=50.0)) == []

    def test_dc_voltage_min_below_350_fires_undervoltage_fault(self):
        assert alerts.evaluate("dc_voltage_v", summary("dc_voltage_v", min=349.9)) == ["undervoltage_fault"]

    def test_dc_voltage_min_at_350_does_not_fire(self):
        assert alerts.evaluate("dc_voltage_v", summary("dc_voltage_v", min=350.0)) == []

    def test_soiling_avg_above_25_fires_cleaning_required(self):
        assert alerts.evaluate("soiling_index_pct", summary("soiling_index_pct", avg=25.1)) == ["cleaning_required"]

    def test_soiling_avg_at_25_does_not_fire(self):
        assert alerts.evaluate("soiling_index_pct", summary("soiling_index_pct", avg=25.0)) == []

    def test_irradiance_has_no_rules(self):
        assert alerts.evaluate("irradiance_wm2", summary("irradiance_wm2", avg=1199.0, min=0.0)) == []


class TestRuleIsolationAcrossSensorTypes:
    def test_a_rule_never_fires_for_a_different_sensor_type(self):
        # Feed the dc_voltage_v min<350 rule a panel_temp_c summary with a tiny min and confirm it does not cross-fire.
        assert alerts.evaluate("panel_temp_c", summary("panel_temp_c", avg=10.0, min=1.0)) == []


class TestThresholdsPayload:
    def test_groups_by_sensor_type_and_matches_evaluate_exactly(self):
        payload = alerts.thresholds_payload()
        assert payload["panel_temp_c"] == [{"field": "avg", "op": ">", "limit": 65, "key": "thermal_derate_risk"}]
        assert payload["inverter_output_kw"] == [{"field": "avg", "op": "<", "limit": 50, "key": "inverter_underperformance"}]
        assert payload["dc_voltage_v"] == [{"field": "min", "op": "<", "limit": 350, "key": "undervoltage_fault"}]
        assert payload["soiling_index_pct"] == [{"field": "avg", "op": ">", "limit": 25, "key": "cleaning_required"}]
        assert "irradiance_wm2" not in payload
