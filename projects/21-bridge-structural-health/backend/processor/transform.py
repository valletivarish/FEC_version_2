"""Pure transform: one fog window-aggregate message -> one DynamoDB item."""

import json


def process(message_body):
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "span-a")
    return {
        "sensor_type": data["sensor_type"],
        # window_end alone would collide when span-a and span-b flush in
        # the same window, since sensor_type is the DynamoDB partition key
        # -- concatenating site_id disambiguates the two spans.
        "sort_key": f"{data['window_end']}#{site_id}",
        "window_end": data["window_end"],
        "window_start": data["window_start"],
        "site_id": site_id,
        "unit": data.get("unit", ""),
        "count": data["count"],
        "min": data["min"],
        "max": data["max"],
        "avg": data["avg"],
        "latest": data["latest"],
        "alerts": data.get("alerts", []),
    }
