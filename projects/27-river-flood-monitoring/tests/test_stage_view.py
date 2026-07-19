import stage_view


def _level(alerts, rise):
    return {"latest": 4.0, "alerts": alerts, "rise_mph": rise}


def test_stage_picks_worst_alert():
    status = stage_view.reach_status({"river_level_m": _level(["flood_advisory", "flood_watch"], 0.0)})
    assert status["stage"] == "watch"


def test_stage_normal_without_alerts():
    assert stage_view.reach_status({"river_level_m": _level([], 0.0)})["stage"] == "normal"


def test_trend_bands():
    assert stage_view.reach_status({"river_level_m": _level([], 0.3)})["trend"] == "rising"
    assert stage_view.reach_status({"river_level_m": _level([], -0.3)})["trend"] == "falling"
    assert stage_view.reach_status({"river_level_m": _level([], 0.1)})["trend"] == "steady"


def test_pending_when_no_level_window():
    status = stage_view.reach_status({"rainfall_mmph": {"latest": 5, "alerts": []}})
    assert status["stage"] == "pending"


def test_active_alerts_span_all_signals():
    readings = {"river_level_m": _level(["flood_watch"], 0.0), "rainfall_mmph": {"alerts": ["torrential_rain"]}}
    active = stage_view.reach_status(readings)["active_alerts"]
    assert "flood_watch" in active and "torrential_rain" in active


def test_catchment_is_worst_reach():
    assert stage_view.catchment_stage([{"stage": "advisory"}, {"stage": "warning"}, {"stage": "normal"}]) == "warning"


def test_catchment_normal_when_all_normal():
    assert stage_view.catchment_stage([{"stage": "normal"}, {"stage": "normal"}]) == "normal"


def test_pending_reach_excluded_from_catchment():
    assert stage_view.catchment_stage([{"stage": "pending"}, {"stage": "advisory"}]) == "advisory"
