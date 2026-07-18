import os
from decimal import Decimal
import json

import boto3

from transform import to_reading_record

TABLE_NAME = os.getenv("TABLE_NAME", "sbe-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def _floats_to_decimal(record):
    # DynamoDB's Table API rejects native float; round-tripping through json with parse_float=Decimal converts every float without hand-walking the dict.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    """SQS-triggered entry point: one invocation carries a batch of queue messages in event["Records"], one per window-aggregate the fog node published."""
    records = event["Records"]
    for record in records:
        item = _floats_to_decimal(to_reading_record(record["body"]))
        _table.put_item(Item=item)
    return {"processed": len(records)}
