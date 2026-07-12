from conftest import load_module

aggregation = load_module("mvs_fog_aggregation", "fog/aggregation.py")


def test_aggregate_computes_count_min_max_avg_latest():
    readings = [{"ts": "t1", "value": 10.0}, {"ts": "t2", "value": 20.0}, {"ts": "t3", "value": 15.0}]
    result = aggregation.aggregate("engine_room_temp_c", "vessel-a", "C", readings, "start", "end")
    assert result == {
        "sensor_type": "engine_room_temp_c",
        "site_id": "vessel-a",
        "unit": "C",
        "window_start": "start",
        "window_end": "end",
        "count": 3,
        "min": 10.0,
        "max": 20.0,
        "avg": 15.0,
        "latest": 15.0,
    }


def test_avg_rounds_to_three_decimal_places():
    readings = [{"ts": "t1", "value": 1.0}, {"ts": "t2", "value": 2.0}, {"ts": "t3", "value": 2.0}]
    result = aggregation.aggregate("hull_vibration_mm", "vessel-b", "mm/s", readings, "s", "e")
    assert result["avg"] == round(5.0 / 3, 3)


def test_latest_is_last_reading_in_arrival_order_not_max():
    readings = [{"ts": "t1", "value": 99.0}, {"ts": "t2", "value": 1.0}]
    result = aggregation.aggregate("fuel_consumption_lph", "vessel-a", "L/h", readings, "s", "e")
    assert result["latest"] == 1.0
    assert result["max"] == 99.0


def test_single_reading_window():
    readings = [{"ts": "t1", "value": 42.0}]
    result = aggregation.aggregate("passenger_count", "vessel-a", "people", readings, "s", "e")
    assert result["count"] == 1
    assert result["min"] == result["max"] == result["avg"] == result["latest"] == 42.0
