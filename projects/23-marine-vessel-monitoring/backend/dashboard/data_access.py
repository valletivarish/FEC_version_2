import datetime
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.getenv("TABLE_NAME", "mvs-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "mvs-vessel-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "mvs-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = [
    "engine_room_temp_c",
    "fuel_consumption_lph",
    "ballast_water_level_pct",
    "hull_vibration_mm",
    "passenger_count",
]
SITE_IDS = ["vessel-a", "vessel-b"]

# recent_log_entries fetches this many recent windows per sensor_type (across
# both vessels) before merging and trimming to the caller's requested limit.
LOG_FETCH_PER_SENSOR = 10

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
    """Most recent `limit` windows for one sensor_type across both vessels,
    oldest first (so chart/table consumers render left-to-right without
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
    oldest-first from recent_windows, so the last row seen per site_id while
    scanning ascending is that vessel's newest window."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def vessel_report():
    """One entry per configured vessel, carrying the latest window (or None
    if nothing has landed yet) for every sensor_type. Feeds the dashboard's
    primary Bridge Console -- a two-column vessel-a/vessel-b comparison
    panel, not a per-vessel card grid."""
    per_sensor = {sensor_type: latest_by_site(sensor_type) for sensor_type in SENSOR_TYPES}
    return [
        {
            "site_id": site_id,
            "readings": {st: per_sensor[st].get(site_id) for st in SENSOR_TYPES},
        }
        for site_id in SITE_IDS
    ]


def recent_log_entries(limit=25):
    """Chronological voyage-log feed: fetches each sensor_type's most recent
    windows (across both vessels) and merges them into one flat list of
    individual log entries, newest-first by window_end, trimmed to `limit`.
    This is the dashboard's secondary "voyage log" section -- a plain
    journal readout, not a per-sensor trend chart or a manifest table."""
    entries = []
    for sensor_type in SENSOR_TYPES:
        for row in recent_windows(sensor_type, LOG_FETCH_PER_SENSOR):
            entries.append({
                "window_end": row["window_end"],
                "site_id": row["site_id"],
                "sensor_type": sensor_type,
                "unit": row["unit"],
                "avg": row["avg"],
                "min": row["min"],
                "max": row["max"],
                "latest": row["latest"],
                "alerts": row["alerts"],
            })
    entries.sort(key=lambda entry: entry["window_end"], reverse=True)
    return entries[:limit]


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


def items_in_table():
    return table().scan(Select="COUNT")["Count"]
