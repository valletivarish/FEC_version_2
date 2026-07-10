import json
import os
from decimal import Decimal

import boto3

from transform import to_item

TABLE_NAME = os.getenv("TABLE_NAME", "spm-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)


def _as_dynamo_number_safe(record):
    # DynamoDB's resource-level Table API rejects native Python float; round
    # tripping through json with parse_float=Decimal converts every float in
    # the record into a Decimal without hand-walking the dict.
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    """SQS-triggered entry point (wired up by deploy_lambda.py via a real
    event source mapping): one invocation carries a batch of queue messages
    in event["Records"], one per window-aggregate the fog node published."""
    records = event["Records"]
    for record in records:
        item = _as_dynamo_number_safe(to_item(record["body"]))
        _table.put_item(Item=item)
    return {"processed": len(records)}
