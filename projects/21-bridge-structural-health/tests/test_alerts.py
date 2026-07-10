from conftest import load_module

alerts = load_module("bshm_alerts", "fog/alerts.py")


def test_rule_is_namedtuple_instance():
    rule = alerts.RULES[0]
    assert isinstance(rule, tuple)
    assert hasattr(rule, "_fields")
    assert rule._fields == ("field", "op", "limit", "key", "sensor_type")


def test_strain_avg_gt_fires_structural_stress_warning():
    summary = {"avg": 1250.0, "max": 1400.0}
    fired = alerts.evaluate("strain_microstrain", summary)
    assert fired == ["structural_stress_warning"]


def test_strain_avg_at_or_below_limit_does_not_fire():
    summary = {"avg": 1200.0, "max": 1200.0}
    fired = alerts.evaluate("strain_microstrain", summary)
    assert fired == []


def test_vibration_uses_max_not_avg():
    # avg stays under the limit while a single spike drives max over it --
    # the rule is defined on max, so it must fire based on max alone.
    summary = {"avg": 5.0, "max": 25.0}
    fired = alerts.evaluate("deck_vibration_mms", summary)
    assert fired == ["excessive_vibration_alert"]


def test_tilt_deformation_risk():
    assert alerts.evaluate("tilt_angle_deg", {"avg": 2.6, "max": 2.6}) == ["deformation_risk"]
    assert alerts.evaluate("tilt_angle_deg", {"avg": 2.4, "max": 2.4}) == []


def test_traffic_overload_risk():
    assert alerts.evaluate("traffic_load_tonnes", {"avg": 151.0, "max": 151.0}) == ["overload_risk"]
    assert alerts.evaluate("traffic_load_tonnes", {"avg": 149.0, "max": 149.0}) == []


def test_expansion_joint_has_no_rule():
    summary = {"avg": 45.0, "max": 49.0}
    assert alerts.evaluate("expansion_joint_mm", summary) == []


def test_unknown_sensor_type_produces_no_alerts():
    assert alerts.evaluate("unknown_sensor", {"avg": 999999, "max": 999999}) == []


def test_thresholds_payload_matches_rules_exactly():
    payload = alerts.thresholds_payload()
    assert set(payload.keys()) == {
        "strain_microstrain",
        "deck_vibration_mms",
        "tilt_angle_deg",
        "traffic_load_tonnes",
    }
    assert payload["strain_microstrain"] == [
        {"field": "avg", "op": "avg_gt", "limit": 1200, "key": "structural_stress_warning"}
    ]
    assert payload["deck_vibration_mms"] == [
        {"field": "max", "op": "max_gt", "limit": 20, "key": "excessive_vibration_alert"}
    ]
