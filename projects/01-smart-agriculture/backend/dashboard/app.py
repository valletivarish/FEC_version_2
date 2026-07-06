import datetime
import os
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

TABLE_NAME = os.getenv("TABLE_NAME", "fec-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fec-sensor-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "fec-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
FOG_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")

SENSOR_TYPES = ["soil_moisture", "temperature", "humidity", "light_intensity", "rainfall"]
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI()
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


def latest_readings(sensor_type, limit):
    resp = table().query(
        KeyConditionExpression=Key("sensor_type").eq(sensor_type),
        ScanIndexForward=False,
        Limit=limit,
    )
    items = [unwrap(i) for i in resp.get("Items", [])]
    items.reverse()
    return items


@app.get("/api/readings")
def readings(sensor_type: str, limit: int = 60):
    return {"sensor_type": sensor_type, "items": latest_readings(sensor_type, limit)}


@app.get("/api/summary")
def summary():
    out = []
    for sensor_type in SENSOR_TYPES:
        recent = latest_readings(sensor_type, 20)
        by_site = {}
        for item in recent:
            by_site[item["site_id"]] = item
        sites = [
            {
                "site_id": site_id,
                "latest": item["latest"],
                "unit": item["unit"],
                "min": item["min"],
                "max": item["max"],
                "count": item["count"],
                "window_end": item["window_end"],
                "alerts": item["alerts"],
            }
            for site_id, item in sorted(by_site.items())
        ]
        out.append({"sensor_type": sensor_type, "sites": sites})
    return {"sensors": out}


PIPELINE_FRESH_SECONDS = 30


@app.get("/api/health")
def health():
    fog_ok = False
    try:
        with urllib.request.urlopen(FOG_HEALTH_URL, timeout=2) as resp:
            fog_ok = resp.status == 200
    except (urllib.error.URLError, OSError):
        fog_ok = False

    queue_ok = False
    try:
        queue_url = sqs().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        sqs().get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
        queue_ok = True
    except Exception:
        queue_ok = False

    lambda_ok = False
    try:
        state = lambda_client().get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"]
        lambda_ok = state == "Active"
    except Exception:
        lambda_ok = False

    now = datetime.datetime.now(datetime.timezone.utc)
    freshest_age = None
    for sensor_type in SENSOR_TYPES:
        recent = latest_readings(sensor_type, 1)
        if not recent:
            continue
        age = (now - datetime.datetime.fromisoformat(recent[-1]["window_end"])).total_seconds()
        if freshest_age is None or age < freshest_age:
            freshest_age = age
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS

    return {
        "fog": fog_ok,
        "queue": queue_ok,
        "lambda": lambda_ok,
        "pipeline": pipeline_ok,
        "freshest_age_seconds": freshest_age,
    }


@app.get("/api/backend-stats")
def backend_stats():
    queue_depth = None
    try:
        queue_url = sqs().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        attrs = sqs().get_queue_attributes(
            QueueUrl=queue_url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        queue_depth = {
            "waiting": int(attrs["ApproximateNumberOfMessages"]),
            "in_flight": int(attrs["ApproximateNumberOfMessagesNotVisible"]),
        }
    except Exception:
        queue_depth = None

    items_in_table = table().scan(Select="COUNT")["Count"]
    return {"queue": queue_depth, "items_in_table": items_in_table}


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store"
    return response
