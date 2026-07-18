import datetime
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from scoring import index_band, structural_integrity_index

TABLE_NAME = os.getenv("TABLE_NAME", "bshm-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "bshm-span-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "bshm-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = [
    "strain_microstrain",
    "deck_vibration_mms",
    "tilt_angle_deg",
    "traffic_load_tonnes",
    "expansion_joint_mm",
]
SITE_IDS = ["span-a", "span-b"]

# recent_windows(sensor_type, N) returns the N most recent rows across BOTH
# spans combined (sort_key interleaves them by window_end). To reliably get
# N windows for one specific span, over-fetch by this multiplier before
# filtering -- cheap for a 2-span bridge, and documented rather than silent.
SITE_HISTORY_FETCH_MULTIPLIER = 6
TREND_HISTORY_LENGTH = 12

_table = None
_sqs = None
_lambda = None


def table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)
    return _table


def sqs():
    global _sqs
    if _sqs is None:
        _sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    return _sqs


def lambda_client():
    global _lambda
    if _lambda is None:
        _lambda = boto3.client("lambda", endpoint_url=ENDPOINT, region_name=REGION)
    return _lambda


def unwrap(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [unwrap(v) for v in value]
    if isinstance(value, dict):
        return {k: unwrap(v) for k, v in value.items()}
    return value


def recent_windows(sensor_type, limit=60):
    """Most recent `limit` windows for one sensor_type across both spans,
    oldest first (so chart consumers render left-to-right without
    re-sorting)."""
    resp = table().query(
        KeyConditionExpression=Key("sensor_type").eq(sensor_type),
        ScanIndexForward=False,
        Limit=limit,
    )
    items = [unwrap(i) for i in resp.get("Items", [])]
    items.reverse()
    return items


def latest_by_site(sensor_type, limit=20):
    """Most recent window per site_id for one sensor_type. Rows arrive
    oldest-first from recent_windows, so the last row seen per site_id
    while scanning ascending is that site's newest window."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def site_windows(sensor_type, site_id, limit=TREND_HISTORY_LENGTH):
    """Most recent `limit` windows for one sensor_type, filtered down to one
    span, oldest first."""
    rows = recent_windows(sensor_type, limit * SITE_HISTORY_FETCH_MULTIPLIER)
    return [row for row in rows if row["site_id"] == site_id][-limit:]


def integrity_history(site_id, limit=TREND_HISTORY_LENGTH):
    """The structural integrity index trend for one span: pairs that span's
    most recent strain_microstrain and deck_vibration_mms windows position-
    by-position (both queried oldest-first) and runs each pair through
    scoring.structural_integrity_index. Trimmed to the shorter of the two
    series so a lopsided arrival pattern never zips mismatched windows
    together."""
    strain_rows = site_windows("strain_microstrain", site_id, limit)
    vibration_rows = site_windows("deck_vibration_mms", site_id, limit)
    n = min(len(strain_rows), len(vibration_rows))
    strain_rows, vibration_rows = strain_rows[-n:], vibration_rows[-n:]
    return [
        {
            "window_end": strain["window_end"],
            "structural_integrity_index": structural_integrity_index(strain["avg"], vibration["max"]),
        }
        for strain, vibration in zip(strain_rows, vibration_rows)
    ]


def span_report():
    """One entry per configured span, carrying the latest raw reading (or
    None if nothing has landed yet) for every sensor_type plus the derived
    structural-integrity-index trend. Consumed by app.py's /api/spans
    handler."""
    per_sensor = {sensor_type: latest_by_site(sensor_type) for sensor_type in SENSOR_TYPES}
    reports = []
    for site_id in SITE_IDS:
        history = integrity_history(site_id)
        current_index = history[-1]["structural_integrity_index"] if history else None
        reports.append({
            "site_id": site_id,
            "structural_integrity_index": current_index,
            "integrity_band": index_band(current_index) if current_index is not None else None,
            "history": history,
            "readings": {st: per_sensor[st].get(site_id) for st in SENSOR_TYPES},
        })
    return reports


def freshest_window_age(now):
    ages = []
    for sensor_type in SENSOR_TYPES:
        rows = recent_windows(sensor_type, 1)
        if rows:
            age = (now - datetime.datetime.fromisoformat(rows[-1]["window_end"])).total_seconds()
            ages.append(age)
    return min(ages) if ages else None


def queue_depth():
    try:
        queue_url = sqs().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        attrs = sqs().get_queue_attributes(
            QueueUrl=queue_url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        return {
            "waiting": int(attrs["ApproximateNumberOfMessages"]),
            "in_flight": int(attrs["ApproximateNumberOfMessagesNotVisible"]),
        }
    except Exception:
        return None


def queue_reachable():
    try:
        queue_url = sqs().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        sqs().get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
        return True
    except Exception:
        return False


def lambda_active():
    try:
        state = lambda_client().get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"]
        return state == "Active"
    except Exception:
        return False


class _ScanCountPages:
    """Manual Python iterator over a table's Scan(Select=COUNT) pages,
    following LastEvaluatedKey until DynamoDB stops returning one. Implemented
    with the classic __iter__/__next__ protocol rather than a generator
    function, a recursive helper, or the SDK's own paginator."""

    def __init__(self, tbl):
        self._table = tbl
        self._cursor = None
        self._done = False

    def __iter__(self):
        return self

    def __next__(self):
        if self._done:
            raise StopIteration
        kwargs = {"Select": "COUNT"}
        if self._cursor is not None:
            kwargs["ExclusiveStartKey"] = self._cursor
        page = self._table.scan(**kwargs)
        self._cursor = page.get("LastEvaluatedKey")
        self._done = self._cursor is None
        return page["Count"]


def items_in_table():
    return sum(_ScanCountPages(table()))
