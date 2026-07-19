"""SQS-triggered Lambda: one batch_writer per invocation folds every window record into DynamoDB."""
import json
import os
from decimal import Decimal

import boto3

from transform import to_item

TABLE_NAME = os.getenv("TABLE_NAME", "rfw-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def _decimalise(record):
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    records = event["Records"]
    with _table.batch_writer() as writer:
        for record in records:
            writer.put_item(Item=_decimalise(to_item(record["body"])))
    return {"processed": len(records)}
