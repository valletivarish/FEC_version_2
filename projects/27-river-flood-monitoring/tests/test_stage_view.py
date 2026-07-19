import stage_view


def _level(alerts):
    return {"latest": 4.0, "alerts": alerts}


def test_stage_picks_worst_alert():
    status = stage_view.reach_status({"river_level_m": _level(["flood_advisory", "flood_watch"])})
    assert status["stage"] == "watch"


def test_stage_normal_without_alerts():
    assert stage_view.reach_status({"river_level_m": _level([])})["stage"] == "normal"


def test_trend_bands_from_smoothed_rise():
    assert stage_view.reach_status({"river_level_m": _level([])}, 2.0)["trend"] == "rising"
    assert stage_view.reach_status({"river_level_m": _level([])}, -2.0)["trend"] == "falling"
    assert stage_view.reach_status({"river_level_m": _level([])}, 1.0)["trend"] == "steady"
    assert stage_view.reach_status({"river_level_m": _level([])}, None)["trend"] == "steady"


def test_rapid_rise_flagged_only_on_a_genuine_surge():
    hot = stage_view.reach_status({"river_level_m": _level([])}, 12.0)
    assert "rapid_rise" in hot["active_alerts"]
    calm = stage_view.reach_status({"river_level_m": _level([])}, 4.0)
    assert "rapid_rise" not in calm["active_alerts"]


def test_pending_when_no_level_window():
    status = stage_view.reach_status({"rainfall_mmph": {"latest": 5, "alerts": []}})
    assert status["stage"] == "pending"


def test_active_alerts_span_all_signals():
    readings = {"river_level_m": _level(["flood_watch"]), "rainfall_mmph": {"alerts": ["torrential_rain"]}}
    active = stage_view.reach_status(readings)["active_alerts"]
    assert "flood_watch" in active and "torrential_rain" in active


def test_rise_over_smooths_across_windows():
    # +1.0 m over 600 s of windows -> 6.0 m/h
    series = [
        {"avg": 2.0, "window_end": "2026-01-01T00:00:00+00:00"},
        {"avg": 2.5, "window_end": "2026-01-01T00:05:00+00:00"},
        {"avg": 3.0, "window_end": "2026-01-01T00:10:00+00:00"},
    ]
    assert stage_view.rise_over(series) == 6.0


def test_rise_over_needs_two_points():
    assert stage_view.rise_over([{"avg": 2.0, "window_end": "2026-01-01T00:00:00+00:00"}]) is None
    assert stage_view.rise_over([]) is None


def test_catchment_is_worst_reach():
    assert stage_view.catchment_stage([{"stage": "advisory"}, {"stage": "warning"}, {"stage": "normal"}]) == "warning"


def test_catchment_normal_when_all_normal():
    assert stage_view.catchment_stage([{"stage": "normal"}, {"stage": "normal"}]) == "normal"


def test_pending_reach_excluded_from_catchment():
    assert stage_view.catchment_stage([{"stage": "pending"}, {"stage": "advisory"}]) == "advisory"
