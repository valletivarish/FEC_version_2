import json

# Fields the fog relay always includes in a window-aggregate message; missing
# any of these means the upstream aggregate is malformed, so reshape_message
# lets the KeyError propagate rather than silently writing a partial record.
_REQUIRED_FIELDS = ("sensor_type", "window_start", "window_end", "count", "min", "max", "avg", "latest")
_DEFAULT_SITE = "container-1"


def _coerce(message_body):
    # SQS delivers the message body as a JSON string; tests sometimes pass an
    # already-decoded dict directly, so accept both.
    if isinstance(message_body, str):
        return json.loads(message_body)
    return message_body


def reshape_message(message_body):
    """Pure transform from a raw SQS message body (fog's window-aggregate
    JSON) into the flat dict shape the DynamoDB table stores, adding a
    sort_key so multiple containers' rows for the same sensor_type partition
    key don't collide and sort newest-window-first per container."""
    payload = _coerce(message_body)

    record = {}
    for field in _REQUIRED_FIELDS:
        record[field] = payload[field]

    site_id = payload.get("site_id") or _DEFAULT_SITE
    record["site_id"] = site_id
    record["unit"] = payload.get("unit", "")
    record["alerts"] = payload.get("alerts", [])
    # window_end first so DynamoDB's natural sort_key ordering is
    # chronological; site_id disambiguates containers sharing a window_end.
    record["sort_key"] = "#".join((record["window_end"], site_id))

    return record
