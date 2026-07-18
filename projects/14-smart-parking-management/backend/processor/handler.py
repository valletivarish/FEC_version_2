import json
import os
from decimal import Decimal

import boto3

from transform import to_item

TABLE_NAME = os.getenv("TABLE_NAME", "spm-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_dynamo_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def _to_dynamo_numbers(record):
    # Round-trip through json with parse_float=Decimal so the Table API accepts every float.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    """SQS-triggered entry point: event["Records"] carries one message per window-aggregate the fog node published."""
    records = event["Records"]
    for record in records:
        item = _to_dynamo_numbers(to_item(record["body"]))
        _dynamo_table.put_item(Item=item)
    return {"processed": len(records)}
