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

# recent_windows(sensor_type, N) returns the N most recent rows across BOTH
# sites combined (sort_key interleaves them by window_end). To reliably get
# N windows for one specific site, over-fetch by this multiplier before
# filtering -- cheap for a 2-site farm, and documented rather than silent.
SITE_HISTORY_FETCH_MULTIPLIER = 6
GRID_HISTORY_LENGTH = 12

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
    """Most recent `limit` windows for one sensor_type across both arrays,
    oldest first (so chart/grid consumers render left-to-right without
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


def site_windows(sensor_type, site_id, limit=GRID_HISTORY_LENGTH):
    """Most recent `limit` windows for one sensor_type, filtered down to one
    site, oldest first. See SITE_HISTORY_FETCH_MULTIPLIER for why this
    over-fetches before filtering."""
    rows = recent_windows(sensor_type, limit * SITE_HISTORY_FETCH_MULTIPLIER)
    return [row for row in rows if row["site_id"] == site_id][-limit:]


def paired_history(site_id, limit=GRID_HISTORY_LENGTH):
    """The efficiency-index heatmap row for one array: pairs that array's
    most recent inverter_output_kw and panel_temp_c windows position-by-
    position (both queried oldest-first) and runs each pair through
    scoring.efficiency_index. Trimmed to the shorter of the two series so a
    lopsided arrival pattern never zips mismatched windows together."""
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
    """One entry per configured array, carrying the latest raw reading (or
    None if nothing has landed yet) for every sensor_type plus the derived
    efficiency-index heatmap history. Consumed by app.py's /api/arrays
    handler."""
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
    return table().scan(Select="COUNT")["Count"]
