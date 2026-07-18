import json


def to_item(message_body):
    """Transform a window-aggregate SQS body into the flat DynamoDB record; sort_key is window_end#site_id to keep both arrays distinct."""
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "array-1")
    return {
        "sensor_type": data["sensor_type"],
        "sort_key": f"{data['window_end']}#{site_id}",
        "window_start": data["window_start"],
        "window_end": data["window_end"],
        "site_id": site_id,
        "unit": data.get("unit", ""),
        "count": data["count"],
        "min": data["min"],
        "max": data["max"],
        "avg": data["avg"],
        "latest": data["latest"],
        "alerts": data.get("alerts", []),
    }
