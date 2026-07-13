"""SQS publishing as one plain function taking an already-built client and resolved queue URL as explicit parameters and caching nothing -- the 7th and leanest publisher shape in this portfolio's Python projects."""

import json


def publish(client, queue_url, payload):
    client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(payload))
