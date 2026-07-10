from conftest import load_module

aggregation = load_module("fog_aggregation", "fog/aggregation.py")


def make_readings(*values):
    return [{"ts": f"t{i}", "value": v} for i, v in enumerate(values)]


class TestAggregate:
    def test_computes_count_min_max_avg_latest(self):
        readings = make_readings(80.0, 100.0, 90.0)
        result = aggregation.aggregate("occupied_spaces", "lot-a", "count", readings, "s", "e")
        assert result["count"] == 3
        assert result["min"] == 80.0
        assert result["max"] == 100.0
        assert result["avg"] == 90.0
        assert result["latest"] == 90.0

    def test_latest_is_last_in_arrival_order_not_the_maximum(self):
        readings = make_readings(50.0, 10.0, 5.0)
        result = aggregation.aggregate("entry_rate_per_min", "lot-b", "vehicles/min", readings, "s", "e")
        assert result["latest"] == 5.0
        assert result["max"] == 50.0

    def test_avg_is_rounded_to_three_decimal_places(self):
        readings = make_readings(1.0, 2.0, 2.0)
        result = aggregation.aggregate("gate_fault_events", "lot-a", "count", readings, "s", "e")
        assert result["avg"] == round(5.0 / 3, 3)

    def test_carries_through_identity_and_window_fields(self):
        readings = make_readings(1.0)
        result = aggregation.aggregate("avg_dwell_time_min", "lot-b", "min", readings, "start-iso", "end-iso")
        assert result["sensor_type"] == "avg_dwell_time_min"
        assert result["site_id"] == "lot-b"
        assert result["unit"] == "min"
        assert result["window_start"] == "start-iso"
        assert result["window_end"] == "end-iso"

    def test_single_reading_window(self):
        result = aggregation.aggregate("exit_rate_per_min", "lot-a", "vehicles/min", make_readings(12.0), "s", "e")
        assert result == {
            "sensor_type": "exit_rate_per_min", "site_id": "lot-a", "unit": "vehicles/min",
            "window_start": "s", "window_end": "e",
            "count": 1, "min": 12.0, "max": 12.0, "avg": 12.0, "latest": 12.0,
        }
