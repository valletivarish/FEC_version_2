import pytest

from aggregation import RollingStat, roll_up

FREEZER_VALUES = [-20.0, -18.0, -16.0]
FREEZER_READINGS = [{"ts": f"t{i}", "value": v} for i, v in enumerate(FREEZER_VALUES)]

COMPUTED_FIELD_CASES = [
    ("count", 3),
    ("min", -20.0),
    ("max", -16.0),
    ("avg", -18.0),
    ("latest", -16.0),
]


def build_stat(values):
    stat = RollingStat()
    for value in values:
        stat.add(value)
    return stat


class TestRollUp:
    @pytest.mark.parametrize("field, expected", COMPUTED_FIELD_CASES)
    def test_computed_field_matches_expected(self, field, expected):
        summary = roll_up("storage_temperature", "container-1", "C", FREEZER_READINGS, "start", "end")
        assert summary[field] == expected

    @pytest.mark.parametrize(
        "field, expected",
        [
            ("sensor_type", "humidity"),
            ("site_id", "container-9"),
            ("unit", "%"),
            ("window_start", "s"),
            ("window_end", "e"),
        ],
    )
    def test_passthrough_metadata_is_preserved(self, field, expected):
        summary = roll_up("humidity", "container-9", "%", FREEZER_READINGS, "s", "e")
        assert summary[field] == expected

    def test_latest_reflects_last_reading_in_sequence(self):
        readings = [{"ts": "t0", "value": 5.0}, {"ts": "t1", "value": 7.5}]
        assert roll_up("co2_level", "c", "ppm", readings, "s", "e")["latest"] == 7.5


class TestRollingStat:
    def test_starts_empty(self):
        assert len(RollingStat()) == 0

    @pytest.mark.parametrize("field, expected", COMPUTED_FIELD_CASES)
    def test_snapshot_field_after_sequential_adds(self, field, expected):
        stat = build_stat(FREEZER_VALUES)
        assert len(stat) == len(FREEZER_VALUES)
        snap = stat.snapshot("storage_temperature", "container-1", "C", "s", "e")
        assert snap[field] == expected

    @pytest.mark.parametrize(
        "field, expected",
        [
            ("min", -5.0),
            ("max", 10.0),
            ("latest", 0.0),
        ],
    )
    def test_min_max_track_correctly_when_values_arrive_out_of_order(self, field, expected):
        stat = build_stat([3.0, -5.0, 10.0, 0.0])
        snap = stat.snapshot("humidity", "c", "%", "s", "e")
        assert snap[field] == expected

    def test_snapshot_without_any_observations_raises_value_error(self):
        with pytest.raises(ValueError):
            RollingStat().snapshot("humidity", "c", "%", "s", "e")
