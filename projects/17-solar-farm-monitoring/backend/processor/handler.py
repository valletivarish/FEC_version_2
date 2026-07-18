import json
import os
from decimal import Decimal

import boto3

from transform import to_item

TABLE_NAME = os.getenv("TABLE_NAME", "sfm-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def _floats_to_decimals(record):
    # DynamoDB's Table API rejects native float; a json round-trip with parse_float=Decimal converts them all.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    """SQS-triggered entry point: one invocation carries a batch of window-aggregate messages in event["Records"]."""
    records = event["Records"]
    for record in records:
        item = _floats_to_decimals(to_item(record["body"]))
        _table.put_item(Item=item)
    return {"processed": len(records)}
