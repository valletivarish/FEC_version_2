from aggregation import aggregate

READINGS = [
    {"ts": "t0", "value": 10.0},
    {"ts": "t1", "value": 20.0},
    {"ts": "t2", "value": 30.0},
]


def test_aggregate_basic_stats():
    agg = aggregate("temperature", "field-1", "C", READINGS, "start", "end")
    assert agg["count"] == 3
    assert agg["min"] == 10.0
    assert agg["max"] == 30.0
    assert agg["avg"] == 20.0
    assert agg["latest"] == 30.0


def test_aggregate_carries_metadata():
    agg = aggregate("humidity", "field-7", "%", READINGS, "s", "e")
    assert agg["sensor_type"] == "humidity"
    assert agg["site_id"] == "field-7"
    assert agg["unit"] == "%"
    assert agg["window_start"] == "s"
    assert agg["window_end"] == "e"


def test_latest_is_last_reading():
    readings = [{"ts": "t0", "value": 5.0}, {"ts": "t1", "value": 7.5}]
    assert aggregate("rainfall", "f", "mm", readings, "s", "e")["latest"] == 7.5
