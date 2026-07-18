import datetime
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from scoring import efficiency_index, index_band

TABLE_NAME = os.getenv("TABLE_NAME", "sfm-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "sfm-array-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "sfm-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

SENSOR_TYPES = ["irradiance_wm2", "panel_temp_c", "inverter_output_kw", "dc_voltage_v", "soiling_index_pct"]
SITE_IDS = ["array-1", "array-2"]

# recent_windows interleaves both arrays by window_end, so over-fetch by this factor before filtering to one site.
SITE_OVERFETCH_MULTIPLIER = 6
HEATMAP_HISTORY_LENGTH = 12

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


def decode_decimals(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [decode_decimals(v) for v in value]
    if isinstance(value, dict):
        return {k: decode_decimals(v) for k, v in value.items()}
    return value


def recent_windows(sensor_type, limit=60):
    """Most recent `limit` windows for one sensor_type across both arrays, oldest first."""
    resp = table().query(
        KeyConditionExpression=Key("sensor_type").eq(sensor_type),
        ScanIndexForward=False,
        Limit=limit,
    )
    items = [decode_decimals(i) for i in resp.get("Items", [])]
    items.reverse()
    return items


def latest_by_site(sensor_type, limit=20):
    """Most recent window per site_id for one sensor_type; ascending scan means the last row per site is newest."""
    latest = {}
    for row in recent_windows(sensor_type, limit):
        latest[row["site_id"]] = row
    return latest


def site_windows(sensor_type, site_id, limit=HEATMAP_HISTORY_LENGTH):
    """Most recent `limit` windows for one sensor_type filtered to one site, oldest first (over-fetches first)."""
    rows = recent_windows(sensor_type, limit * SITE_OVERFETCH_MULTIPLIER)
    return [row for row in rows if row["site_id"] == site_id][-limit:]


def paired_history(site_id, limit=HEATMAP_HISTORY_LENGTH):
    """Efficiency-index heatmap row for one array: zip its inverter_output_kw and panel_temp_c windows position-by-position, trimmed to the shorter series."""
    inverter_rows = site_windows("inverter_output_kw", site_id, limit)
    temp_rows = site_windows("panel_temp_c", site_id, limit)
    n = min(len(inverter_rows), len(temp_rows))
    inverter_rows, temp_rows = inverter_rows[-n:], temp_rows[-n:]
    return [
        {
            "window_end": inv["window_end"],
            "efficiency_index": efficiency_index(inv["avg"], temp["avg"]),
        }
        for inv, temp in zip(inverter_rows, temp_rows)
    ]


def array_report():
    """One entry per array with the latest raw reading per sensor_type plus its derived efficiency-index heatmap history."""
    per_sensor = {sensor_type: latest_by_site(sensor_type) for sensor_type in SENSOR_TYPES}
    reports = []
    for site_id in SITE_IDS:
        history = paired_history(site_id)
        current_index = history[-1]["efficiency_index"] if history else None
        reports.append({
            "site_id": site_id,
            "efficiency_index": current_index,
            "efficiency_band": index_band(current_index) if current_index is not None else None,
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


def items_in_table():
    """Walk every Scan(Select=COUNT) page via ExclusiveStartKey/LastEvaluatedKey and sum the counts."""
    total = 0
    scan_kwargs = {"Select": "COUNT"}
    while True:
        resp = table().scan(**scan_kwargs)
        total += resp["Count"]
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            return total
        scan_kwargs["ExclusiveStartKey"] = last_key
