from windowing import summarise


def _readings(values):
    return [{"ts": str(i), "value": v} for i, v in enumerate(values)]


def test_basic_stats():
    agg = summarise("river_level_m", "reach-a", "m", _readings([2.0, 4.0, 3.0]), "s", "e", 10)
    assert agg["count"] == 3
    assert agg["min"] == 2.0 and agg["max"] == 4.0
    assert agg["avg"] == 3.0
    assert agg["latest"] == 3.0


def test_no_per_window_rate_field():
    # rate-of-rise is derived at the dashboard from the level trend, not per window
    agg = summarise("river_level_m", "reach-a", "m", _readings([2.0, 3.0]), "s", "e", 10)
    assert "rise_mph" not in agg


def test_window_seconds_is_optional():
    agg = summarise("river_level_m", "reach-a", "m", _readings([3.0, 3.0]), "s", "e")
    assert agg["latest"] == 3.0


def test_latest_is_last_in_order():
    agg = summarise("turbidity_ntu", "reach-b", "NTU", _readings([10, 90, 20]), "s", "e", 10)
    assert agg["latest"] == 20
    assert agg["max"] == 90


def test_carries_identity_fields():
    agg = summarise("rainfall_mmph", "reach-b", "mm/h", _readings([1.0]), "start", "end", 10)
    assert agg["sensor_type"] == "rainfall_mmph"
    assert agg["site_id"] == "reach-b"
    assert agg["window_start"] == "start" and agg["window_end"] == "end"
