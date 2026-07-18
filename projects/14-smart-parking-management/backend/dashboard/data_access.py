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

_dynamo_table = None
_sqs_client = None
_lambda_conn = None


def table():
    global _dynamo_table
    if _dynamo_table is None:
        _dynamo_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)
    return _dynamo_table


def sqs():
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    return _sqs_client


def lambda_client():
    global _lambda_conn
    if _lambda_conn is None:
        _lambda_conn = boto3.client("lambda", endpoint_url=ENDPOINT, region_name=REGION)
    return _lambda_conn


def demote_decimals(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [demote_decimals(v) for v in value]
    if isinstance(value, dict):
        return {k: demote_decimals(v) for k, v in value.items()}
    return value


def recent_windows(sensor_type, limit=60):
    """Most recent `limit` windows for one sensor_type across both lots, oldest first."""
    resp = table().query(
        KeyConditionExpression=Key("sensor_type").eq(sensor_type),
        ScanIndexForward=False,
        Limit=limit,
    )
    items = [demote_decimals(i) for i in resp.get("Items", [])]
    items.reverse()
    return items


def latest_by_site(sensor_type, limit=20):
    """Most recent window per site_id; rows arrive oldest-first so the last row seen per site is its newest window."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def lot_report():
    """One entry per configured lot carrying the latest window (or None) for every sensor_type, plus the fixed capacity."""
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
    """Sum scan(Select=COUNT) across every page, following LastEvaluatedKey until it is absent."""
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
