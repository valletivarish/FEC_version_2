from conftest import load_module

aggregation = load_module("bshm_aggregation", "fog/aggregation.py")


def test_basic_stats():
    pairs = [(100.0, "t1"), (200.0, "t2"), (300.0, "t3")]
    summary = aggregation.aggregate("strain_microstrain", "span-a", "microstrain", pairs, "start", "end")
    assert summary["count"] == 3
    assert summary["min"] == 100.0
    assert summary["max"] == 300.0
    assert summary["avg"] == 200.0


def test_metadata_passthrough():
    pairs = [(1.0, "t1")]
    summary = aggregation.aggregate("tilt_angle_deg", "span-b", "deg", pairs, "2026-01-01T00:00:00", "2026-01-01T00:00:10")
    assert summary["sensor_type"] == "tilt_angle_deg"
    assert summary["site_id"] == "span-b"
    assert summary["unit"] == "deg"
    assert summary["window_start"] == "2026-01-01T00:00:00"
    assert summary["window_end"] == "2026-01-01T00:00:10"


def test_latest_is_last_in_order_not_max():
    # The largest value arrives first, then a smaller one -- latest must
    # reflect arrival order, not the maximum.
    pairs = [(900.0, "t1"), (150.0, "t2")]
    summary = aggregation.aggregate("strain_microstrain", "span-a", "microstrain", pairs, "s", "e")
    assert summary["latest"] == 150.0
    assert summary["max"] == 900.0


def test_avg_rounds_to_three_decimals():
    pairs = [(1.0, "t1"), (2.0, "t2"), (2.0, "t3")]
    summary = aggregation.aggregate("traffic_load_tonnes", "span-a", "tonnes", pairs, "s", "e")
    assert summary["avg"] == round(5.0 / 3, 3)
