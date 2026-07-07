import os

import boto3

from reshape import reshape_message

TABLE_NAME = os.getenv("TABLE_NAME", "fcl-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_client = boto3.client("dynamodb", endpoint_url=ENDPOINT, region_name=REGION)


def marshal(value):
    """Recursively convert a plain Python value into DynamoDB's low-level
    typed-attribute wire format ({"S": ...}, {"N": ...}, etc). bool is
    checked before (int, float) since bool is a subclass of int in Python
    and would otherwise be marshalled as a number."""
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, (int, float)):
        return {"N": str(value)}
    if isinstance(value, str):
        return {"S": value}
    if isinstance(value, list):
        return {"L": [marshal(item) for item in value]}
    if isinstance(value, dict):
        return {"M": {key: marshal(val) for key, val in value.items()}}
    raise TypeError(f"cannot marshal value of type {type(value)!r}")


def marshal_item(record):
    return {key: marshal(val) for key, val in record.items()}


def lambda_handler(event, context):
    # SQS-triggered Lambda entry point (wired up by deploy_lambda.py via an
    # event source mapping): each invocation carries a batch of queue
    # messages in event["Records"], one per window-aggregate published by
    # the fog relay.
    records = event["Records"]
    for record in records:
        item = marshal_item(reshape_message(record["body"]))
        _client.put_item(TableName=TABLE_NAME, Item=item)
    return {"processed": len(records)}
