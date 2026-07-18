import json

# Fields the depot relay always includes; a missing one means a malformed aggregate.
_REQUIRED_FIELDS = ("sensor_type", "window_start", "window_end", "count", "min", "max", "avg", "latest")
_DEFAULT_SITE = "container-1"


def _decode_body(message_body):
    # SQS delivers a JSON string; tests sometimes pass an already-decoded dict, so accept both.
    if isinstance(message_body, str):
        return json.loads(message_body)
    return message_body


def to_manifest_record(message_body):
    """Flatten a depot window-aggregate into the stored record, adding a per-container sort_key."""
    payload = _decode_body(message_body)

    record = {}
    for field in _REQUIRED_FIELDS:
        record[field] = payload[field]

    site_id = payload.get("site_id") or _DEFAULT_SITE
    record["site_id"] = site_id
    record["unit"] = payload.get("unit", "")
    record["alerts"] = payload.get("alerts", [])
    # window_end first for chronological sort order; site_id disambiguates same-window containers.
    record["sort_key"] = "#".join((record["window_end"], site_id))

    return record
