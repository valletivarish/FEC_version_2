"""DynamoDB reads for the flood dashboard: recent windows per signal and the per-reach latest window."""
import datetime
import functools
from decimal import Decimal
import os

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.getenv("TABLE_NAME", "rfw-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "rfw-catchment-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "rfw-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = ["river_level_m", "rainfall_mmph", "flow_velocity_ms", "soil_moisture_pct", "turbidity_ntu"]
SITE_IDS = ["reach-a", "reach-b"]


@functools.lru_cache(maxsize=None)
def _resource(service):
    if service == "table":
        return boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)
    return boto3.client(service, endpoint_url=ENDPOINT, region_name=REGION)


def _plain(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    return value


def recent_windows(sensor_type, limit=60):
    response = _resource("table").query(
        KeyConditionExpression=Key("sensor_type").eq(sensor_type),
        ScanIndexForward=False,
        Limit=limit,
    )
    rows = [_plain(item) for item in response.get("Items", [])]
    rows.reverse()
    return rows


def latest_per_reach(sensor_type):
    latest = {}
    for row in recent_windows(sensor_type, 12):
        latest[row["site_id"]] = row
    return latest


def reach_windows():
    per_signal = {st: latest_per_reach(st) for st in SENSOR_TYPES}
    return {
        site: {st: per_signal[st].get(site) for st in SENSOR_TYPES}
        for site in SITE_IDS
    }


def freshest_age_seconds(now):
    youngest = None
    for sensor_type in SENSOR_TYPES:
        rows = recent_windows(sensor_type, 1)
        if rows:
            age = (now - datetime.datetime.fromisoformat(rows[-1]["window_end"])).total_seconds()
            youngest = age if youngest is None else min(youngest, age)
    return youngest


def queue_stats():
    try:
        url = _resource("sqs").get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        attrs = _resource("sqs").get_queue_attributes(
            QueueUrl=url, AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"])["Attributes"]
        return {"waiting": int(attrs["ApproximateNumberOfMessages"]), "in_flight": int(attrs["ApproximateNumberOfMessagesNotVisible"])}
    except Exception:
        return None


def queue_reachable():
    try:
        _resource("sqs").get_queue_url(QueueName=QUEUE_NAME)
        return True
    except Exception:
        return False


def lambda_active():
    try:
        return _resource("lambda").get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"] == "Active"
    except Exception:
        return False


def stored_count():
    total = 0
    kwargs = {"Select": "COUNT"}
    while True:
        response = _resource("table").scan(**kwargs)
        total += response["Count"]
        if "LastEvaluatedKey" not in response:
            return total
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
