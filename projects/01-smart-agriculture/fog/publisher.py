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

    # SendMessageBatch caps at 10 entries per call, so a window that closes
    # more than 10 aggregates at once (more sensor-type/site pairs than fit
    # in one batch) is chunked into successive batch calls rather than
    # falling back to one send_message call per aggregate.
    def publish_batch(self, messages):
        if not messages:
            return
        for start in range(0, len(messages), 10):
            chunk = messages[start:start + 10]
            entries = [{"Id": str(i), "MessageBody": json.dumps(m)} for i, m in enumerate(chunk)]
            self._sqs.send_message_batch(QueueUrl=self._queue_url, Entries=entries)
