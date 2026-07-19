"""Read-time reach status: a stage band from the stored stage alerts, a rising/steady/falling trend from the rate-of-rise, and a catchment roll-up."""

STAGE_ORDER = ["normal", "advisory", "watch", "warning"]
_ALERT_TO_STAGE = {"flood_advisory": "advisory", "flood_watch": "watch", "flood_warning": "warning"}


def _stage_from_alerts(alerts):
    stage = "normal"
    for alert in alerts or []:
        mapped = _ALERT_TO_STAGE.get(alert)
        if mapped and STAGE_ORDER.index(mapped) > STAGE_ORDER.index(stage):
            stage = mapped
    return stage


def _trend(rise_mph):
    if rise_mph is None:
        return "steady"
    if rise_mph >= 0.2:
        return "rising"
    if rise_mph <= -0.2:
        return "falling"
    return "steady"


def reach_status(readings):
    level = readings.get("river_level_m")
    if not level:
        return {"stage": "pending", "trend": "steady", "level": None, "rise_mph": None, "active_alerts": []}
    active = []
    for reading in readings.values():
        if reading:
            active.extend(reading.get("alerts", []))
    return {
        "stage": _stage_from_alerts(level.get("alerts", [])),
        "trend": _trend(level.get("rise_mph")),
        "level": level.get("latest"),
        "rise_mph": level.get("rise_mph"),
        "active_alerts": active,
    }


def catchment_stage(statuses):
    worst = "normal"
    for status in statuses:
        stage = status["stage"]
        if stage in STAGE_ORDER and STAGE_ORDER.index(stage) > STAGE_ORDER.index(worst):
            worst = stage
    return worst
