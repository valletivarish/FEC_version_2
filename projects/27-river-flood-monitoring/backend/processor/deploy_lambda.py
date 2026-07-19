"""One-shot local wiring: create the queue + table, package the handler, register the Lambda and its SQS trigger in LocalStack."""
import io
import os
import time
import zipfile

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localstack:4566")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE = os.getenv("SQS_QUEUE_NAME", "rfw-catchment-agg")
TABLE = os.getenv("TABLE_NAME", "rfw-readings")
FUNCTION = os.getenv("LAMBDA_FUNCTION_NAME", "rfw-processor")

_kw = dict(endpoint_url=ENDPOINT, region_name=REGION, aws_access_key_id="test", aws_secret_access_key="test")
sqs = boto3.client("sqs", **_kw)
ddb = boto3.client("dynamodb", **_kw)
lam = boto3.client("lambda", **_kw)


def _package():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.write("handler.py")
        archive.write("transform.py")
    return buffer.getvalue()


def main():
    queue_url = sqs.create_queue(QueueName=QUEUE)["QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    try:
        ddb.create_table(
            TableName=TABLE,
            AttributeDefinitions=[{"AttributeName": "sensor_type", "AttributeType": "S"},
                                  {"AttributeName": "sort_key", "AttributeType": "S"}],
            KeySchema=[{"AttributeName": "sensor_type", "KeyType": "HASH"},
                       {"AttributeName": "sort_key", "KeyType": "RANGE"}],
            BillingMode="PAY_PER_REQUEST")
    except ddb.exceptions.ResourceInUseException:
        pass
    env = {"Variables": {"AWS_ENDPOINT_URL": ENDPOINT, "TABLE_NAME": TABLE, "AWS_REGION": REGION}}
    try:
        lam.create_function(FunctionName=FUNCTION, Runtime="python3.12",
                            Role="arn:aws:iam::000000000000:role/lambda",
                            Handler="handler.lambda_handler", Code={"ZipFile": _package()},
                            Environment=env, Timeout=30)
    except lam.exceptions.ResourceConflictException:
        lam.update_function_code(FunctionName=FUNCTION, ZipFile=_package())
    time.sleep(2)
    lam.create_event_source_mapping(EventSourceArn=queue_arn, FunctionName=FUNCTION, BatchSize=10)
    print("local wiring complete", flush=True)


if __name__ == "__main__":
    main()
