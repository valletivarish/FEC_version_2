"""Read-time reach status: a stage band from the stored stage alerts, and a smoothed rate-of-rise derived from the level trend over recent windows (real elapsed time), not from a single noisy 10 s window."""
import datetime

STAGE_ORDER = ["normal", "advisory", "watch", "warning"]
_ALERT_TO_STAGE = {"flood_advisory": "advisory", "flood_watch": "watch", "flood_warning": "warning"}
RAPID_RISE_MPH = 8.0
TREND_MPH = 1.5


def _stage_from_alerts(alerts):
    stage = "normal"
    for alert in alerts or []:
        mapped = _ALERT_TO_STAGE.get(alert)
        if mapped and STAGE_ORDER.index(mapped) > STAGE_ORDER.index(stage):
            stage = mapped
    return stage


def rise_over(series):
    points = [p for p in (series or []) if p.get("avg") is not None and p.get("window_end")]
    if len(points) < 2:
        return None
    first, last = points[0], points[-1]
    elapsed = (datetime.datetime.fromisoformat(last["window_end"]) - datetime.datetime.fromisoformat(first["window_end"])).total_seconds()
    if elapsed <= 0:
        return None
    return round((last["avg"] - first["avg"]) / (elapsed / 3600.0), 2)


def _trend(rise_mph):
    if rise_mph is None:
        return "steady"
    if rise_mph >= TREND_MPH:
        return "rising"
    if rise_mph <= -TREND_MPH:
        return "falling"
    return "steady"


def reach_status(readings, rise_mph=None):
    level = readings.get("river_level_m")
    if not level:
        return {"stage": "pending", "trend": "steady", "level": None, "rise_mph": None, "active_alerts": []}
    active = []
    for reading in readings.values():
        if reading:
            active.extend(reading.get("alerts", []))
    if rise_mph is not None and rise_mph >= RAPID_RISE_MPH:
        active.append("rapid_rise")
    return {
        "stage": _stage_from_alerts(level.get("alerts", [])),
        "trend": _trend(rise_mph),
        "level": level.get("latest"),
        "rise_mph": rise_mph,
        "active_alerts": active,
    }


def catchment_stage(statuses):
    worst = "normal"
    for status in statuses:
        stage = status["stage"]
        if stage in STAGE_ORDER and STAGE_ORDER.index(stage) > STAGE_ORDER.index(worst):
            worst = stage
    return worst
