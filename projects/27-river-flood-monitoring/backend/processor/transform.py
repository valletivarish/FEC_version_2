"""SQS message body to DynamoDB item; sort_key = window_end#site_id keeps the two reaches distinct per signal."""
import json


def to_item(body):
    data = json.loads(body) if isinstance(body, str) else body
    site = data.get("site_id", "reach-a")
    return {
        "sensor_type": data["sensor_type"],
        "sort_key": f"{data['window_end']}#{site}",
        "site_id": site,
        "unit": data.get("unit", ""),
        "window_start": data["window_start"],
        "window_end": data["window_end"],
        "count": data["count"],
        "min": data["min"],
        "max": data["max"],
        "avg": data["avg"],
        "latest": data["latest"],
        "rise_mph": data.get("rise_mph", 0),
        "alerts": data.get("alerts", []),
    }
