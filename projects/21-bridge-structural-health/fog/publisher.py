"""SQS publishing as one plain function -- the 7th and deliberately leanest
publisher shape in the portfolio's Python projects.

01's fog/publisher.py is a class (SqsPublisher) that resolves the queue URL
with a retry loop in __init__ and caches both the client and the URL as
instance state. 05's fog/publisher.py is a @contextmanager factory
(open_shipment_link) yielding a dataclass-backed ShipmentLink that caches
its client/URL as instance state. 12's fog/publisher.py is a pair of
functools.lru_cache-memoized functions (_client, _queue_url) caching a
bare boto3 client and its resolved URL at module scope. 13's
fog/publisher.py is a manual module-level singleton (_client / _queue_url
globals plus a get_client() function) hand-rolling the same kind of cache.
14's fog/publisher.py is a closure factory (make_publisher) that captures a
client and a resolved queue URL as closure variables around a returned
publish(message) function. 17's fog/publisher.py runs a dedicated
background thread draining a queue.SimpleQueue and shipping batches via
send_message_batch, with the client and queue URL held as thread-local
setup state.

Every one of those six caches something -- an instance, a module global, a
closure cell, or thread state. This module caches nothing at all: publish()
takes an already-constructed boto3 SQS client and an already-resolved
queue URL as explicit parameters on every call. Building the client and
resolving the queue URL are the caller's job (fog/app.py does both once at
startup); this function has no memory between calls.
"""

import json


def publish(client, queue_url, payload):
    client.send_message(QueueUrl=queue_url, MessageBody=json.dumps(payload))
