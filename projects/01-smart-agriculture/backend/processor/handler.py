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
    return json.loads(json.dumps(record), parse_float=Decimal)


def lambda_handler(event, context):
    for record in event["Records"]:
        _table.put_item(Item=to_item(process(record["body"])))
    return {"processed": len(event["Records"])}
