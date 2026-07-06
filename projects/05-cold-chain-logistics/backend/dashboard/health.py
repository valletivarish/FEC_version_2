import datetime
import os
import urllib.error
import urllib.request

from fastapi import APIRouter

from routes import FUNCTION_NAME, QUEUE_NAME, READING_TYPES, lambda_client, recent_windows, sqs

DEPOT_HEALTH_URL = os.getenv("FOG_HEALTH_URL", "http://fog:8000/health")
PIPELINE_FRESH_SECONDS = 30


def check_fog():
    try:
        with urllib.request.urlopen(DEPOT_HEALTH_URL, timeout=2) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError):
        return False


def check_queue():
    try:
        queue_url = sqs().get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]
        sqs().get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
        return True
    except Exception:
        return False


def check_lambda():
    try:
        state = lambda_client().get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"]
        return state == "Active"
    except Exception:
        return False


def freshest_window_age():
    now = datetime.datetime.now(datetime.timezone.utc)
    ages = (
        (now - datetime.datetime.fromisoformat(rows[-1]["window_end"])).total_seconds()
        for rows in (recent_windows(reading_type, 1) for reading_type in READING_TYPES)
        if rows
    )
    return min(ages, default=None)


CHECKS = [
    ("depot", check_fog),
    ("queue", check_queue),
    ("lambda", check_lambda),
]

health_router = APIRouter(prefix="/api")


@health_router.get("/health")
def health():
    freshest_age = freshest_window_age()
    pipeline_ok = freshest_age is not None and freshest_age <= PIPELINE_FRESH_SECONDS
    report = {name: check_fn() for name, check_fn in CHECKS}
    report["pipeline"] = pipeline_ok
    report["freshest_age_seconds"] = freshest_age
    return report
