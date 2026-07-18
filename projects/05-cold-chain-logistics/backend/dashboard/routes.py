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


def _to_plain(value):
    # DynamoDB Decimals aren't JSON-serialisable, so convert them (recursively) to native types.
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_to_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_plain(v) for k, v in value.items()}
    return value


class ManifestRepository:
    def __init__(self, endpoint_url, region_name):
        self.ddb = boto3.client("dynamodb", endpoint_url=endpoint_url, region_name=region_name)
        self.sqs_client = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region_name)
        self.lambda_client_ = boto3.client("lambda", endpoint_url=endpoint_url, region_name=region_name)
        self.wire_reader = TypeDeserializer()

    def row_to_record(self, wire_row):
        plain_by_key = {key: self.wire_reader.deserialize(attr) for key, attr in wire_row.items()}
        return _to_plain(plain_by_key)

    def query_page(self, reading_type, page_size):
        # sensor_type is the partition key; ScanIndexForward=False yields newest-window-first rows.
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


_repo = ManifestRepository(ENDPOINT, REGION)


def table():
    return _repo.ddb


def sqs():
    return _repo.sqs_client


def lambda_client():
    return _repo.lambda_client_


def deserialize_item(raw_item):
    return _repo.row_to_record(raw_item)


def _query_newest(reading_type, page_size):
    return _repo.query_page(reading_type, page_size)


def recent_windows(reading_type, limit, container_id=None):
    # Per-container filtering can't use the key, so over-fetch a wider page and filter in Python.
    page_size = limit if container_id is None else max(limit * 4, 40)
    candidates = _query_newest(reading_type, page_size)
    if container_id is not None:
        candidates = [row for row in candidates if row["site_id"] == container_id][:limit]
    # Reverse newest-first into chronological order for chart/table consumers.
    return list(reversed(candidates))


readings_router = APIRouter(prefix="/api")


@readings_router.get("/readings")
def readings(sensor_type: str, limit: int = 60, site_id: str | None = None):
    return {"sensor_type": sensor_type, "items": recent_windows(sensor_type, limit, site_id)}


@dataclasses.dataclass
class ManifestCell:
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


def _latest_per_container(rows):
    # rows arrive chronological, so the last item per site_id group is its most recent window.
    keyed = sorted(rows, key=lambda row: row["site_id"])
    for site_id, bucket in itertools.groupby(keyed, key=lambda row: row["site_id"]):
        *_, last = bucket
        yield site_id, last


def _container_reading_pairs():
    # Small fixed fan-out (5 reading types x up to 20 recent windows each) over the containers.
    for reading_type in READING_TYPES:
        for site_id, row in _latest_per_container(recent_windows(reading_type, 20)):
            yield site_id, reading_type, ManifestCell.from_row(row)


def _assemble_manifest():
    # Pivot the (site_id, reading_type) -> cell triples into one manifest row per container.
    pairs = sorted(_container_reading_pairs(), key=lambda triple: triple[0])
    for container_id, group in itertools.groupby(pairs, key=lambda triple: triple[0]):
        readings_by_type = {reading_type: dataclasses.asdict(cell) for _, reading_type, cell in group}
        yield ContainerManifestEntry(container_id=container_id, readings=readings_by_type)


@readings_router.get("/manifest")
def manifest():
    return {"containers": [dataclasses.asdict(entry) for entry in _assemble_manifest()]}


class ExcursionRuleCache:
    """Caches fog's /thresholds response after the first fetch since the rules are static."""

    def __init__(self):
        self.value = None

    def get(self, fetch_url):
        if self.value is None:
            with urllib.request.urlopen(fetch_url, timeout=5) as resp:
                self.value = json.loads(resp.read())
        return self.value

    def reset(self):
        self.value = None


_thresholds_cache = ExcursionRuleCache()


@readings_router.get("/thresholds")
def thresholds():
    return _thresholds_cache.get(DEPOT_THRESHOLDS_URL)


ops_router = APIRouter(prefix="/api")


def _table_row_counts():
    # Walk every Scan(Select=COUNT) page via LastEvaluatedKey so large tables aren't undercounted.
    scan_kwargs = {"TableName": TABLE_NAME, "Select": "COUNT"}
    while True:
        page = table().scan(**scan_kwargs)
        yield page["Count"]
        cursor = page.get("LastEvaluatedKey")
        if not cursor:
            return
        scan_kwargs["ExclusiveStartKey"] = cursor


@ops_router.get("/backend-stats")
def backend_stats():
    # Best-effort ops stats; queue depth may be unavailable without failing the whole endpoint.
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

    items_in_table = sum(_table_row_counts())
    return {"queue": queue_depth, "items_in_table": items_in_table}
