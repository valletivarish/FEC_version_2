from conftest import load_module

aggregation = load_module("fog_aggregation", "fog/aggregation.py")


def test_aggregate_computes_count_min_max_avg_latest():
    readings = [{"ts": "t0", "value": 60.0}, {"ts": "t1", "value": 70.0}, {"ts": "t2", "value": 65.0}]
    summary = aggregation.aggregate("inverter_output_kw", "array-1", "kW", readings, "start", "end")
    assert summary == {
        "sensor_type": "inverter_output_kw",
        "site_id": "array-1",
        "unit": "kW",
        "window_start": "start",
        "window_end": "end",
        "count": 3,
        "min": 60.0,
        "max": 70.0,
        "avg": 65.0,
        "latest": 65.0,
    }


def test_avg_is_rounded_to_3_decimals():
    readings = [{"ts": "t0", "value": 1.0}, {"ts": "t1", "value": 2.0}, {"ts": "t2", "value": 2.0}]
    summary = aggregation.aggregate("panel_temp_c", "array-1", "C", readings, "s", "e")
    assert summary["avg"] == round(5.0 / 3, 3)


def test_latest_is_last_in_arrival_order_not_max_timestamp():
    # ts strings are deliberately out of order -- latest must reflect
    # arrival order (last element), not a re-sort by timestamp.
    readings = [
        {"ts": "2026-01-01T00:00:05Z", "value": 10.0},
        {"ts": "2026-01-01T00:00:01Z", "value": 20.0},
    ]
    summary = aggregation.aggregate("dc_voltage_v", "array-2", "V", readings, "s", "e")
    assert summary["latest"] == 20.0
