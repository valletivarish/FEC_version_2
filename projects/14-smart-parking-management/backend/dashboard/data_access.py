import datetime
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.getenv("TABLE_NAME", "spm-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "spm-lot-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "spm-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = ["occupied_spaces", "entry_rate_per_min", "exit_rate_per_min", "avg_dwell_time_min", "gate_fault_events"]
SITE_IDS = ["lot-a", "lot-b"]
LOT_CAPACITY = 300

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
    """Most recent `limit` windows for one sensor_type across both lots,
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
    scanning ascending is that site's newest window."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def lot_report():
    """One entry per configured lot, carrying the latest window (or None if
    nothing has landed yet) for every sensor_type, plus the fixed capacity.
    Consumed by app.py's /api/lots handler, which layers the occupancy
    percentage/status badge on top of this raw per-reading data."""
    per_sensor = {sensor_type: latest_by_site(sensor_type) for sensor_type in SENSOR_TYPES}
    return [
        {
            "site_id": site_id,
            "capacity": LOT_CAPACITY,
            "readings": {st: per_sensor[st].get(site_id) for st in SENSOR_TYPES},
        }
        for site_id in SITE_IDS
    ]


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
    """A single Scan(Select=COUNT) call silently undercounts once a table's
    scanned page exceeds DynamoDB's 1MB response limit -- LastEvaluatedKey
    signals there's another page, and it must be followed until exhausted.
    Expressed here as a plain summing loop over successive scan() calls,
    reusing whatever ExclusiveStartKey the prior page handed back."""
    total = 0
    start_key = None
    while True:
        kwargs = {"Select": "COUNT"}
        if start_key is not None:
            kwargs["ExclusiveStartKey"] = start_key
        resp = table().scan(**kwargs)
        total += resp["Count"]
        start_key = resp.get("LastEvaluatedKey")
        if start_key is None:
            return total
