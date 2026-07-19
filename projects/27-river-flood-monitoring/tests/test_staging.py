from staging import evaluate, stage_key, thresholds_payload


def _level(maximum):
    return {"max": maximum, "avg": maximum}


def test_stage_key_bands():
    assert stage_key(3.0) is None
    assert stage_key(3.5) == "flood_advisory"
    assert stage_key(4.4) == "flood_advisory"
    assert stage_key(4.5) == "flood_watch"
    assert stage_key(5.4) == "flood_watch"
    assert stage_key(5.5) == "flood_warning"
    assert stage_key(7.9) == "flood_warning"


def test_level_normal_produces_no_alert():
    assert evaluate("river_level_m", _level(3.0)) == []


def test_level_advisory_boundary():
    assert evaluate("river_level_m", _level(3.5)) == ["flood_advisory"]


def test_level_warning_at_top_band():
    assert evaluate("river_level_m", _level(6.0)) == ["flood_warning"]


def test_fog_does_not_raise_rate_alerts():
    # rate-of-rise is a dashboard-derived indicator; the fog only raises stage bands
    assert evaluate("river_level_m", _level(2.0)) == []


def test_torrential_rain():
    assert evaluate("rainfall_mmph", {"avg": 41, "max": 41}) == ["torrential_rain"]
    assert evaluate("rainfall_mmph", {"avg": 40, "max": 40}) == []


def test_dangerous_current_reads_max():
    assert evaluate("flow_velocity_ms", {"avg": 1.0, "max": 4.1}) == ["dangerous_current"]
    assert evaluate("flow_velocity_ms", {"avg": 3.9, "max": 4.0}) == []


def test_saturated_catchment():
    assert evaluate("soil_moisture_pct", {"avg": 91, "max": 95}) == ["saturated_catchment"]
    assert evaluate("soil_moisture_pct", {"avg": 90, "max": 95}) == []


def test_turbidity_is_context_only():
    assert evaluate("turbidity_ntu", {"avg": 700, "max": 800}) == []


def test_thresholds_payload_shape():
    payload = thresholds_payload()
    assert payload["turbidity_ntu"] == []
    keys = {rule["key"] for rule in payload["river_level_m"]}
    assert {"flood_advisory", "flood_watch", "flood_warning"} == keys
