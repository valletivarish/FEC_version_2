from windowing import summarise


def _readings(values):
    return [{"ts": str(i), "value": v} for i, v in enumerate(values)]


def test_basic_stats():
    agg = summarise("river_level_m", "reach-a", "m", _readings([2.0, 4.0, 3.0]), "s", "e", 10)
    assert agg["count"] == 3
    assert agg["min"] == 2.0 and agg["max"] == 4.0
    assert agg["avg"] == 3.0
    assert agg["latest"] == 3.0


def test_rise_mph_positive_over_window():
    # +1.0 m over a 10 s window is 360 m/h
    agg = summarise("river_level_m", "reach-a", "m", _readings([2.0, 3.0]), "s", "e", 10)
    assert agg["rise_mph"] == 360.0


def test_rise_mph_negative_when_falling():
    agg = summarise("river_level_m", "reach-a", "m", _readings([3.0, 2.5]), "s", "e", 3600)
    assert agg["rise_mph"] == -0.5


def test_rise_mph_zero_window_is_safe():
    agg = summarise("river_level_m", "reach-a", "m", _readings([3.0, 3.0]), "s", "e", 0)
    assert agg["rise_mph"] == 0.0


def test_latest_is_last_in_order():
    agg = summarise("turbidity_ntu", "reach-b", "NTU", _readings([10, 90, 20]), "s", "e", 10)
    assert agg["latest"] == 20
    assert agg["max"] == 90


def test_carries_identity_fields():
    agg = summarise("rainfall_mmph", "reach-b", "mm/h", _readings([1.0]), "start", "end", 10)
    assert agg["sensor_type"] == "rainfall_mmph"
    assert agg["site_id"] == "reach-b"
    assert agg["window_start"] == "start" and agg["window_end"] == "end"
