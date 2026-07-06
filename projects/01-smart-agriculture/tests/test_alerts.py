from alerts import evaluate


def test_low_soil_moisture_triggers_irrigation():
    assert evaluate("soil_moisture", {"avg": 15}) == ["irrigation_needed"]


def test_healthy_soil_moisture_is_silent():
    assert evaluate("soil_moisture", {"avg": 30}) == []


def test_temperature_can_raise_two_alerts():
    fired = evaluate("temperature", {"avg": 36, "min": 2})
    assert "heat_stress" in fired
    assert "frost_risk" in fired


def test_heavy_rain_uses_max_not_avg():
    assert evaluate("rainfall", {"avg": 3, "max": 12}) == ["heavy_rain"]


def test_unknown_sensor_has_no_rules():
    assert evaluate("pressure", {"avg": 999, "max": 999}) == []
