import io
import os
import time
import zipfile

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "sbe-floor-agg")
TABLE_NAME = os.getenv("TABLE_NAME", "sbe-readings")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "sbe-processor")


def build_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write("handler.py")
        zf.write("transform.py")
    return buf.getvalue()


def wait_for(fn, attempts=60, delay=3):
    last_exc = None
    for _ in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            time.sleep(delay)
    raise RuntimeError(f"dependency never became ready: {last_exc}")


def wait_until_active(lam, attempts=60, delay=3):
    for _ in range(attempts):
        state = lam.get_function(FunctionName=FUNCTION_NAME)["Configuration"]["State"]
        if state == "Active":
            return
        time.sleep(delay)
    raise RuntimeError(f"lambda {FUNCTION_NAME} never became active")


def create_or_update_function(lam):
    code = build_zip()
    try:
        lam.create_function(
            FunctionName=FUNCTION_NAME,
            Runtime="python3.12",
            Role="arn:aws:iam::000000000000:role/lambda-role",
            Handler="handler.lambda_handler",
            Code={"ZipFile": code},
            Timeout=30,
            Environment={"Variables": {
                "TABLE_NAME": TABLE_NAME,
                "AWS_ENDPOINT_URL": ENDPOINT,
                "AWS_REGION": REGION,
            }},
        )
    except lam.exceptions.ResourceConflictException:
        lam.update_function_code(FunctionName=FUNCTION_NAME, ZipFile=code)


def ensure_event_source_mapping(lam, queue_arn):
    try:
        lam.create_event_source_mapping(
            EventSourceArn=queue_arn,
            FunctionName=FUNCTION_NAME,
            BatchSize=10,
        )
    except lam.exceptions.ResourceConflictException:
        pass


def main():
    sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    lam = boto3.client("lambda", endpoint_url=ENDPOINT, region_name=REGION)

    queue_url = wait_for(lambda: sqs.get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"])
    queue_arn = sqs.get_queue_attributes(
        QueueUrl=queue_url, AttributeNames=["QueueArn"]
    )["Attributes"]["QueueArn"]

    wait_for(lambda: create_or_update_function(lam))
    wait_until_active(lam)
    ensure_event_source_mapping(lam, queue_arn)
    print(f"lambda {FUNCTION_NAME} deployed and wired to queue {QUEUE_NAME}", flush=True)


if __name__ == "__main__":
    main()
