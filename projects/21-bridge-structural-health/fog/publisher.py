"""SQS publishing as plain functions taking an already-built client and resolved queue URL as explicit parameters and caching nothing."""

import json

BATCH_LIMIT = 10


def publish(client, queue_url, payload):
    client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(payload))


def publish_batch(client, queue_url, payloads):
    """Send a whole window's messages in as few SendMessageBatch calls as
    possible, chunked at the ten-entry API limit, instead of one
    SendMessage call per message."""
    calls = 0
    for start in range(0, len(payloads), BATCH_LIMIT):
        chunk = payloads[start:start + BATCH_LIMIT]
        entries = [
            {"Id": str(start + offset), "MessageBody": json.dumps(payload)}
            for offset, payload in enumerate(chunk)
        ]
        client.send_message_batch(QueueUrl=queue_url, Entries=entries)
        calls += 1
    return calls
