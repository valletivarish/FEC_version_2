import os

import boto3

from reshape import to_manifest_record

TABLE_NAME = os.getenv("TABLE_NAME", "fcl-readings")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

_client = boto3.client("dynamodb", endpoint_url=ENDPOINT, region_name=REGION)


def marshal(value):
    """Convert a plain value into DynamoDB typed-attribute form; bool before int since bool subclasses int."""
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
    # SQS-triggered entry point; each event["Records"] item is one window-aggregate to store.
    records = event["Records"]
    for record in records:
        item = marshal_item(to_manifest_record(record["body"]))
        _client.put_item(TableName=TABLE_NAME, Item=item)
    return {"processed": len(records)}
