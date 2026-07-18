import json
import os
from decimal import Decimal

import boto3

from process import process

TABLE_NAME = os.getenv("TABLE_NAME", "fec-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def to_item(record):
    # DynamoDB's resource-level Table API rejects native Python float; round
    # tripping through json with parse_float=Decimal converts every float in
    # the record into a Decimal without hand-walking the dict.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    """SQS-triggered entry point, wired up by an event source mapping: one invocation carries
    a batch of queue messages in event["Records"], one per window-aggregate
    the fog node published."""
    for record in event["Records"]:
        _table.put_item(Item=to_item(process(record["body"])))
    return {"processed": len(event["Records"])}
