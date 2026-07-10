from conftest import load_module

aggregation = load_module("fog_aggregation", "fog/aggregation.py")


def make_readings(*values):
    return [{"ts": f"t{i}", "value": v} for i, v in enumerate(values)]


class TestAggregate:
    def test_computes_count_min_max_avg_latest(self):
        readings = make_readings(20.0, 30.0, 25.0)
        result = aggregation.aggregate("grid_load_kw", "hub-1", "kW", readings, "s", "e")
        assert result["count"] == 3
        assert result["min"] == 20.0
        assert result["max"] == 30.0
        assert result["avg"] == 25.0
        assert result["latest"] == 25.0

    def test_latest_is_last_in_arrival_order_not_the_maximum(self):
        readings = make_readings(50.0, 10.0, 5.0)
        result = aggregation.aggregate("station_temp_c", "hub-2", "C", readings, "s", "e")
        assert result["latest"] == 5.0
        assert result["max"] == 50.0

    def test_avg_is_rounded_to_three_decimal_places(self):
        readings = make_readings(1.0, 2.0, 2.0)
        result = aggregation.aggregate("charging_current_a", "hub-1", "A", readings, "s", "e")
        assert result["avg"] == round(5.0 / 3, 3)

    def test_carries_through_identity_and_window_fields(self):
        readings = make_readings(1.0)
        result = aggregation.aggregate("session_duration_min", "hub-2", "min", readings, "start-iso", "end-iso")
        assert result["sensor_type"] == "session_duration_min"
        assert result["site_id"] == "hub-2"
        assert result["unit"] == "min"
        assert result["window_start"] == "start-iso"
        assert result["window_end"] == "end-iso"

    def test_single_reading_window(self):
        result = aggregation.aggregate("battery_soc_pct", "hub-1", "%", make_readings(42.0), "s", "e")
        assert result == {
            "sensor_type": "battery_soc_pct", "site_id": "hub-1", "unit": "%",
            "window_start": "s", "window_end": "e",
            "count": 1, "min": 42.0, "max": 42.0, "avg": 42.0, "latest": 42.0,
        }
