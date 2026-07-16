import datetime
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.getenv("TABLE_NAME", "ecn-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "ecn-hub-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "ecn-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = ["charging_current_a", "battery_soc_pct", "station_temp_c", "grid_load_kw", "session_duration_min"]
SITE_IDS = ["hub-1", "hub-2"]

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
    """Most recent `limit` windows for one sensor_type across both hubs,
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
    oldest-first from recent_windows, so the last row seen per site_id
    while scanning ascending is that site's newest window."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def hub_report():
    """One entry per configured hub, carrying the latest window (or None if
    nothing has landed yet) for every sensor_type. This is the project's
    per-site grouping endpoint's data source -- app.py's /api/hubs handler
    serves this list as-is, with no extra derived scoring layered on top."""
    per_sensor = {sensor_type: latest_by_site(sensor_type) for sensor_type in SENSOR_TYPES}
    return [
        {
            "site_id": site_id,
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
    """Sums Scan(Select=COUNT) across every page. A single un-paginated
    call silently undercounts once the table's scanned data exceeds one
    Scan page (~1MB), since DynamoDB caps each Scan response at that size
    and signals more pages via LastEvaluatedKey rather than raising."""
    total = 0
    kwargs = {"Select": "COUNT"}
    while True:
        resp = table().scan(**kwargs)
        total += resp["Count"]
        last_key = resp.get("LastEvaluatedKey")
        if last_key is None:
            return total
        kwargs["ExclusiveStartKey"] = last_key
