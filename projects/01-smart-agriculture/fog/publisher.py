import json
import time

import boto3


class SqsPublisher:
    def __init__(self, endpoint_url, region, queue_name):
        self._sqs = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)
        self._queue_url = self._resolve_queue(queue_name)

    def _resolve_queue(self, queue_name, attempts=30):
        for _ in range(attempts):
            try:
                return self._sqs.get_queue_url(QueueName=queue_name)["QueueUrl"]
            except Exception:
                time.sleep(2)
        raise RuntimeError(f"queue {queue_name} never became available")

    def publish(self, message):
        self._sqs.send_message(QueueUrl=self._queue_url, MessageBody=json.dumps(message))
