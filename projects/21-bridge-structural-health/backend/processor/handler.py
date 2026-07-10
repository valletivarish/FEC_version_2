"""Lambda entry point: one SQS event -> one put_item per record."""

import json
import os
from decimal import Decimal

import boto3

from transform import process

TABLE_NAME = os.getenv("TABLE_NAME", "bshm-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def to_item(record):
    # DynamoDB's resource API rejects native floats; round-tripping through
    # json.dumps/json.loads(parse_float=Decimal) converts every float in
    # the record to Decimal without hand-walking the structure.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    for record in event["Records"]:
        _table.put_item(Item=to_item(process(record["body"])))
    return {"processed": len(event["Records"])}
