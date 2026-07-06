import io
import os
import time
import zipfile

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fcl-manifest-agg")
TABLE_NAME = os.getenv("TABLE_NAME", "fcl-readings")
FUNCTION_NAME = os.getenv("LAMBDA_FUNCTION_NAME", "fcl-processor")

INITIAL_BACKOFF_SECONDS = 0.5
MAX_BACKOFF_SECONDS = 10.0
BACKOFF_BUDGET_SECONDS = 180.0


class Retrier:
    """Polls a callable with exponential backoff until it succeeds or a budget expires."""

    def __init__(self, budget_seconds=BACKOFF_BUDGET_SECONDS,
                 initial_delay=INITIAL_BACKOFF_SECONDS, max_delay=MAX_BACKOFF_SECONDS):
        self.budget_seconds = budget_seconds
        self.initial_delay = initial_delay
        self.max_delay = max_delay

    def run(self, fn, failure_message):
        deadline = time.monotonic() + self.budget_seconds
        delay = self.initial_delay
        last_exc = None
        while time.monotonic() < deadline:
            try:
                return fn()
            except Exception as exc:
                last_exc = exc
                time.sleep(delay)
                delay = min(delay * 2, self.max_delay)
        raise RuntimeError(f"{failure_message}: {last_exc}")

    def poll_until(self, predicate, failure_message):
        deadline = time.monotonic() + self.budget_seconds
        delay = self.initial_delay
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(delay)
            delay = min(delay * 2, self.max_delay)
        raise RuntimeError(failure_message)


class LambdaDeployer:
    """Packages, publishes and wires the manifest-aggregation lambda to its queue."""

    def __init__(self, sqs_client, lambda_client, function_name, table_name,
                 queue_name, endpoint, region):
        self.sqs = sqs_client
        self.lam = lambda_client
        self.function_name = function_name
        self.table_name = table_name
        self.queue_name = queue_name
        self.endpoint = endpoint
        self.region = region
        self.retrier = Retrier()

    def deploy(self):
        self._ctx = {}
        pipeline = (
            self._step_resolve_queue_arn,
            self._step_publish_function,
            self._step_wait_active,
            self._step_wire_event_source,
        )
        for step in pipeline:
            step()
        del self._ctx
        return f"lambda {self.function_name} deployed and wired to queue {self.queue_name}"

    def _step_resolve_queue_arn(self):
        self._ctx["queue_arn"] = self._await_queue_arn()

    def _step_publish_function(self):
        self.retrier.run(self._publish_function, "dependency never became ready")

    def _step_wait_active(self):
        self._await_active()

    def _step_wire_event_source(self):
        self._wire_event_source(self._ctx["queue_arn"])

    def _package(self, *filenames):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for filename in filenames:
                zf.write(filename)
        return buf.getvalue()

    def _await_queue_arn(self):
        queue_url = self.retrier.run(
            lambda: self.sqs.get_queue_url(QueueName=self.queue_name)["QueueUrl"],
            "dependency never became ready",
        )
        attrs = self.sqs.get_queue_attributes(
            QueueUrl=queue_url, AttributeNames=["QueueArn"]
        )["Attributes"]
        return attrs["QueueArn"]

    def _publish_function(self):
        code = self._package("handler.py", "reshape.py")
        try:
            self.lam.create_function(
                FunctionName=self.function_name,
                Runtime="python3.12",
                Role="arn:aws:iam::000000000000:role/lambda-role",
                Handler="handler.lambda_handler",
                Code={"ZipFile": code},
                Timeout=30,
                Environment={"Variables": {
                    "TABLE_NAME": self.table_name,
                    "AWS_ENDPOINT_URL": self.endpoint,
                    "AWS_REGION": self.region,
                }},
            )
        except self.lam.exceptions.ResourceConflictException:
            self.lam.update_function_code(FunctionName=self.function_name, ZipFile=code)

    def _await_active(self):
        def is_active():
            state = self.lam.get_function(FunctionName=self.function_name)["Configuration"]["State"]
            return state == "Active"

        self.retrier.poll_until(is_active, f"lambda {self.function_name} never became active")

    def _wire_event_source(self, queue_arn):
        try:
            self.lam.create_event_source_mapping(
                EventSourceArn=queue_arn,
                FunctionName=self.function_name,
                BatchSize=10,
            )
        except self.lam.exceptions.ResourceConflictException:
            pass


def main():
    sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    lam = boto3.client("lambda", endpoint_url=ENDPOINT, region_name=REGION)

    deployer = LambdaDeployer(
        sqs_client=sqs,
        lambda_client=lam,
        function_name=FUNCTION_NAME,
        table_name=TABLE_NAME,
        queue_name=QUEUE_NAME,
        endpoint=ENDPOINT,
        region=REGION,
    )
    print(deployer.deploy(), flush=True)


if __name__ == "__main__":
    main()
