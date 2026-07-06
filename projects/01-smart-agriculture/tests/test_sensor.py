import sensor


def test_clamp_keeps_value_in_range():
    assert sensor.clamp(50, 0, 10) == 10
    assert sensor.clamp(-5, 0, 10) == 0
    assert sensor.clamp(5, 0, 10) == 5


def test_next_value_stays_within_profile_bounds():
    profile = sensor.PROFILES["soil_moisture"]
    value = profile["start"]
    for _ in range(500):
        value = sensor.next_value(value, profile)
        assert profile["lo"] <= value <= profile["hi"]


def test_all_five_sensor_types_have_profiles():
    assert set(sensor.PROFILES) == {
        "soil_moisture", "temperature", "humidity", "light_intensity", "rainfall",
    }


def test_next_value_moves_by_at_most_step():
    profile = {"lo": 0, "hi": 100, "start": 50, "step": 2.0}
    new_value = sensor.next_value(50, profile)
    assert abs(new_value - 50) <= profile["step"]
