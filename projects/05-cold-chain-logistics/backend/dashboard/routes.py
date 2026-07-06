import dataclasses
import itertools
import json
import os
import urllib.request
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeDeserializer
from fastapi import APIRouter

TABLE_NAME = os.getenv("TABLE_NAME", "fcl-readings")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fcl-manifest-agg")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "fcl-processor")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEPOT_THRESHOLDS_URL = os.getenv("FOG_THRESHOLDS_URL", "http://fog:8000/thresholds")

READING_TYPES = ["storage_temperature", "humidity", "door_open_seconds", "shock_vibration", "co2_level"]


def _to_native(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_to_native(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_native(v) for k, v in value.items()}
    return value


class DataAccess:
    def __init__(self, endpoint_url, region_name):
        self.ddb = boto3.client("dynamodb", endpoint_url=endpoint_url, region_name=region_name)
        self.sqs_client = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region_name)
        self.lambda_client_ = boto3.client("lambda", endpoint_url=endpoint_url, region_name=region_name)
        self.wire_reader = TypeDeserializer()

    def row_to_record(self, wire_row):
        plain_by_key = {key: self.wire_reader.deserialize(attr) for key, attr in wire_row.items()}
        return _to_native(plain_by_key)

    def query_page(self, reading_type, page_size):
        resp = self.ddb.query(
            TableName=TABLE_NAME,
            KeyConditionExpression="sensor_type = :st",
            ExpressionAttributeValues={":st": {"S": reading_type}},
            ScanIndexForward=False,
            Limit=page_size,
        )
        return [self.row_to_record(row) for row in resp.get("Items", [])]

    def queue_url(self):
        return self.sqs_client.get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]

    def queue_attributes(self, queue_url, attribute_names):
        return self.sqs_client.get_queue_attributes(QueueUrl=queue_url, AttributeNames=attribute_names)["Attributes"]

    def function_state(self):
        return self.lambda_client_.get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"]

    def table_row_count(self):
        return self.ddb.scan(TableName=TABLE_NAME, Select="COUNT")["Count"]


_repo = DataAccess(ENDPOINT, REGION)


def table():
    return _repo.ddb


def sqs():
    return _repo.sqs_client


def lambda_client():
    return _repo.lambda_client_


def deserialize_item(raw_item):
    return _repo.row_to_record(raw_item)


def _newest_first(reading_type, page_size):
    return _repo.query_page(reading_type, page_size)


def recent_windows(reading_type, limit, container_id=None):
    page_size = limit if container_id is None else max(limit * 4, 40)
    candidates = _newest_first(reading_type, page_size)
    if container_id is not None:
        candidates = [row for row in candidates if row["site_id"] == container_id][:limit]
    return list(reversed(candidates))


readings_router = APIRouter(prefix="/api")


@readings_router.get("/readings")
def readings(sensor_type: str, limit: int = 60, site_id: str | None = None):
    return {"sensor_type": sensor_type, "items": recent_windows(sensor_type, limit, site_id)}


@dataclasses.dataclass
class ReadingSummary:
    latest: object
    unit: object
    min: object
    max: object
    count: object
    window_end: object
    alerts: object

    @classmethod
    def from_row(cls, row):
        return cls(
            latest=row["latest"],
            unit=row["unit"],
            min=row["min"],
            max=row["max"],
            count=row["count"],
            window_end=row["window_end"],
            alerts=row["alerts"],
        )


@dataclasses.dataclass
class ContainerManifestEntry:
    container_id: str
    readings: dict


def _latest_by_site(rows):
    keyed = sorted(rows, key=lambda row: row["site_id"])
    for site_id, bucket in itertools.groupby(keyed, key=lambda row: row["site_id"]):
        *_, last = bucket
        yield site_id, last


def _site_reading_pairs():
    for reading_type in READING_TYPES:
        for site_id, row in _latest_by_site(recent_windows(reading_type, 20)):
            yield site_id, reading_type, ReadingSummary.from_row(row)


def _build_manifest():
    pairs = sorted(_site_reading_pairs(), key=lambda triple: triple[0])
    for container_id, group in itertools.groupby(pairs, key=lambda triple: triple[0]):
        readings_by_type = {reading_type: dataclasses.asdict(summary) for _, reading_type, summary in group}
        yield ContainerManifestEntry(container_id=container_id, readings=readings_by_type)


@readings_router.get("/manifest")
def manifest():
    return {"containers": [dataclasses.asdict(entry) for entry in _build_manifest()]}


class ThresholdsCache:
    def __init__(self):
        self.value = None

    def get(self, fetch_url):
        if self.value is None:
            with urllib.request.urlopen(fetch_url, timeout=5) as resp:
                self.value = json.loads(resp.read())
        return self.value

    def reset(self):
        self.value = None


_thresholds_cache = ThresholdsCache()


@readings_router.get("/thresholds")
def thresholds():
    return _thresholds_cache.get(DEPOT_THRESHOLDS_URL)


ops_router = APIRouter(prefix="/api")


@ops_router.get("/backend-stats")
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

    items_in_table = table().scan(TableName=TABLE_NAME, Select="COUNT")["Count"]
    return {"queue": queue_depth, "items_in_table": items_in_table}
