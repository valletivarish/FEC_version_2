"""Bottle (@app.route decorators, bottle.HTTPResponse for 400s) is the portfolio's 7th distinct Python HTTP framework, after FastAPI, stdlib http.server, Flask, wsgiref, and aiohttp."""

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, make_server

import boto3
from bottle import Bottle, HTTPResponse, request, response

import aggregation
import alerts
import buffering
import publisher
import validation

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "bshm-span-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEFAULT_SITE = "span-a"

app = Bottle()


def utcnow():
    return datetime.now(timezone.utc)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/thresholds")
def thresholds():
    # Purely descriptive metadata -- does not drive evaluation, which reads
    # alerts.RULES directly at flush time.
    return alerts.thresholds_payload()


@app.post("/ingest")
def ingest():
    payload = request.json
    error = validation.validate_batch(payload)
    if error is not None:
        return HTTPResponse(
            status=400,
            body=json.dumps({"error": error}),
            headers={"Content-Type": "application/json"},
        )

    sensor_type = payload["sensor_type"]
    site_id = payload.get("site_id", DEFAULT_SITE)
    unit = payload.get("unit", "")
    readings = payload["readings"]

    buffering.set_unit(sensor_type, unit)
    for reading in readings:
        buffering.record(sensor_type, site_id, reading["value"], reading["ts"])

    response.status = 202
    return {"accepted": len(readings)}


def build_messages(raw_readings, units, window_start, window_end):
    """Group the flushed raw readings by key (once, here, at flush time --
    see buffering.group_by_key), aggregate each group, and attach alerts."""
    grouped = buffering.group_by_key(raw_readings)
    messages = []
    for (sensor_type, site_id), pairs in grouped.items():
        if not pairs:
            continue
        summary = aggregation.aggregate(
            sensor_type, site_id, units.get(sensor_type, ""), pairs, window_start, window_end
        )
        summary["alerts"] = alerts.evaluate(sensor_type, summary)
        messages.append(summary)
    return messages


def flush_once(client, queue_url):
    window_end = utcnow()
    window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
    raw, units = buffering.snapshot_and_clear()
    if not raw:
        return []
    messages = build_messages(raw, units, window_start.isoformat(), window_end.isoformat())
    publisher.publish_batch(client, queue_url, messages)
    return messages


def flush_loop(client, queue_url, stop_event):
    while not stop_event.wait(WINDOW_SECONDS):
        try:
            flush_once(client, queue_url)
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)


def build_sqs_client():
    return boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)


def resolve_queue_url(client, queue_name, attempts=30, delay=2):
    """Queue-url resolution is startup bootstrapping, not part of the
    publish-call contract -- it lives here, in the caller, so publisher.py
    stays a single stateless function."""
    last_error = None
    for _ in range(attempts):
        try:
            return client.get_queue_url(QueueName=queue_name)["QueueUrl"]
        except Exception as exc:
            last_error = exc
            time.sleep(delay)
    raise RuntimeError(f"queue {queue_name} never became available") from last_error


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def make_threaded_server(wsgi_app, host, port):
    """A real, thread-per-request WSGI server (stdlib only) -- used both
    for the production run and for the real-socket /ingest validation
    test, so the test exercises the exact same server class as prod."""
    return make_server(host, port, wsgi_app, server_class=ThreadingWSGIServer)


def start_flush_thread(client, queue_url):
    stop_event = threading.Event()
    thread = threading.Thread(target=flush_loop, args=(client, queue_url, stop_event), daemon=True)
    thread.start()
    return thread, stop_event


def main():
    client = build_sqs_client()
    queue_url = resolve_queue_url(client, QUEUE_NAME)
    start_flush_thread(client, queue_url)

    httpd = make_threaded_server(app, "0.0.0.0", 8000)
    print(f"fog node listening on :8000, window={WINDOW_SECONDS}s, queue={QUEUE_NAME}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
