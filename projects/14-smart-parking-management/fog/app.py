"""Smart-parking fog node: a raw `app(environ, start_response)` WSGI callable served via wsgiref.simple_server + socketserver.ThreadingMixIn (stdlib only, no framework) -- a distinct stdlib HTTP model from project 12's http.server.BaseHTTPRequestHandler."""

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

from aggregation import aggregate
from alerts import evaluate, thresholds_payload
from buffering import add_readings, snapshot_and_clear
from publisher import make_publisher
from validation import validate_batch

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "spm-lot-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEFAULT_SITE = "lot-a"

_REASON = {200: "OK", 202: "Accepted", 400: "Bad Request", 404: "Not Found", 500: "Internal Server Error"}


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class QuietWSGIRequestHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        # Silence the default per-request stderr access log; container logs
        # stay limited to the explicit prints below.
        pass


def utcnow():
    return datetime.now(timezone.utc)


def _json_response(start_response, status, body):
    payload = json.dumps(body).encode("utf-8")
    status_line = f"{status} {_REASON.get(status, 'OK')}"
    headers = [("Content-Type", "application/json"), ("Content-Length", str(len(payload)))]
    start_response(status_line, headers)
    return [payload]


def _read_json_body(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        length = 0
    raw = environ["wsgi.input"].read(length) if length else b""
    if not raw:
        raise ValueError("empty request body")
    return json.loads(raw)


def _handle_ingest(environ, start_response):
    try:
        payload = _read_json_body(environ)
    except (ValueError, json.JSONDecodeError):
        return _json_response(start_response, 400, {"error": "request body must be valid JSON"})

    error = validate_batch(payload)
    if error is not None:
        return _json_response(start_response, 400, {"error": error})

    add_readings(
        payload["sensor_type"],
        payload.get("site_id", DEFAULT_SITE),
        payload.get("unit", ""),
        payload["readings"],
    )
    return _json_response(start_response, 202, {"accepted": len(payload["readings"])})


def app(environ, start_response):
    """The WSGI application callable itself -- environ/start_response only,
    no framework request/response objects anywhere in this call chain."""
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "")
    try:
        if method == "GET" and path == "/health":
            return _json_response(start_response, 200, {"status": "ok"})
        if method == "GET" and path == "/thresholds":
            return _json_response(start_response, 200, thresholds_payload())
        if method == "POST" and path == "/ingest":
            return _handle_ingest(environ, start_response)
        return _json_response(start_response, 404, {"error": f"no such route: {path}"})
    except Exception as exc:
        return _json_response(start_response, 500, {"error": "internal server error", "detail": str(exc)})


def flush_once(publish):
    """Snapshot + clear the ring buffers, aggregate and evaluate alerts for
    every non-empty (sensor_type, site_id) group, then ship the whole
    window's summaries in one publish.batch() call rather than one
    SendMessage per group. Never reduces a raw list without going through
    aggregate(), so the published payload always carries genuine window
    statistics."""
    window_end = utcnow()
    window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
    snapshot, units = snapshot_and_clear()

    summaries = []
    for (sensor_type, site_id), readings in snapshot.items():
        summary = aggregate(
            sensor_type, site_id, units.get(sensor_type, ""),
            readings, window_start.isoformat(), window_end.isoformat(),
        )
        summary["alerts"] = evaluate(sensor_type, summary)
        summaries.append(summary)

    if summaries:
        publish.batch(summaries)


def flush_loop(publish):
    while True:
        time.sleep(WINDOW_SECONDS)
        try:
            flush_once(publish)
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)


def start_flush_thread(publish):
    thread = threading.Thread(target=flush_loop, args=(publish,), name="fog-window-flush", daemon=True)
    thread.start()
    return thread


def main():
    publish = make_publisher(ENDPOINT, REGION, QUEUE_NAME)
    start_flush_thread(publish)
    with make_server("0.0.0.0", 8000, app, ThreadingWSGIServer, handler_class=QuietWSGIRequestHandler) as httpd:
        print(f"fog node listening on :8000 (window={WINDOW_SECONDS}s, queue={QUEUE_NAME})", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
