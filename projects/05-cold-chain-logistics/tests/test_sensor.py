import pytest

import sensor

EXPECTED_PROFILE_KEYS = {
    "storage_temperature", "humidity", "door_open_seconds", "shock_vibration", "co2_level",
}


class TestProfileCatalog:
    def test_registers_exactly_the_five_expected_reading_types(self):
        assert set(sensor.PROFILES) == EXPECTED_PROFILE_KEYS

    @pytest.mark.parametrize("profile_key", list(sensor.PROFILES))
    def test_each_entry_is_a_reading_profile_instance(self, profile_key):
        assert isinstance(sensor.PROFILES[profile_key], sensor.ReadingProfile)


class TestRandomWalkBounds:
    @pytest.mark.parametrize("profile_key", list(sensor.PROFILES))
    def test_step_stays_within_lo_hi_across_many_iterations(self, profile_key):
        profile = sensor.PROFILES[profile_key]
        walk = sensor.RandomWalk(profile)
        assert all(profile.lo <= walk.step() <= profile.hi for _ in range(500))

    def test_initial_value_matches_profile_start(self):
        profile = sensor.PROFILES["humidity"]
        assert sensor.RandomWalk(profile).value == profile.start

    def test_single_step_never_exceeds_configured_step_size(self):
        profile = sensor.ReadingProfile(unit="x", lo=0, hi=100, start=50, step=2.0)
        walk = sensor.RandomWalk(profile)
        assert abs(walk.step() - 50) <= profile.step
