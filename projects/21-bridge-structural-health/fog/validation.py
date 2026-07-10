"""Standalone /ingest payload validation, kept separate from the Bottle
route so it can be unit-tested with plain dicts and exercised through a
real HTTP request without needing a running server in the same test."""

REQUIRED_BATCH_FIELDS = ("sensor_type", "readings")


def validate_batch(payload):
    """Return an error message string if payload is not a well-formed
    ingest batch, or None if it is valid."""
    if not isinstance(payload, dict):
        return "payload must be a JSON object"

    for field in REQUIRED_BATCH_FIELDS:
        if field not in payload:
            return f"missing required field: {field}"

    if not isinstance(payload["sensor_type"], str) or not payload["sensor_type"]:
        return "sensor_type must be a non-empty string"

    readings = payload["readings"]
    if not isinstance(readings, list) or not readings:
        return "readings must be a non-empty list"

    for reading in readings:
        if not isinstance(reading, dict):
            return "each reading must be an object"
        if "ts" not in reading or "value" not in reading:
            return "each reading requires ts and value"
        if not isinstance(reading["ts"], str) or not reading["ts"]:
            return "reading ts must be a non-empty string"
        if isinstance(reading["value"], bool) or not isinstance(reading["value"], (int, float)):
            return "reading value must be numeric"

    site_id = payload.get("site_id", "span-a")
    if not isinstance(site_id, str) or not site_id:
        return "site_id must be a non-empty string when present"

    unit = payload.get("unit", "")
    if not isinstance(unit, str):
        return "unit must be a string when present"

    return None
