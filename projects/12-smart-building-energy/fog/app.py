"""Fog node on a bare http.server ThreadingHTTPServer with hand-dispatched do_GET/do_POST routing and plain json.loads/dumps -- no FastAPI/Flask/ASGI/Pydantic anywhere."""

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from aggregation import aggregate
from alerts import evaluate, thresholds_payload
from ingest_pipeline import enqueue_batch, snapshot_and_clear, start_consumer_thread
from publisher import publish_batch
from validation import validate_batch

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "sbe-floor-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEFAULT_SITE = "floor-1"


def utcnow():
    return datetime.now(timezone.utc)


def flush_once():
    """Snapshot + clear the buffer, aggregate and evaluate alerts for every
    non-empty (sensor_type, site_id) group, then ship the whole window's
    summaries to SQS in one publish_batch() call rather than one
    send_message per group. Never reduces on a raw list without going
    through aggregate(), so each published payload always carries genuine
    window statistics."""
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

    publish_batch(ENDPOINT, REGION, QUEUE_NAME, summaries)


def flush_loop():
    while True:
        time.sleep(WINDOW_SECONDS)
        try:
            flush_once()
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)


def start_flush_thread():
    thread = threading.Thread(target=flush_loop, name="fog-window-flush", daemon=True)
    thread.start()
    return thread


class FogHandler(BaseHTTPRequestHandler):
    server_version = "SmartBuildingFog/1.0"

    def log_message(self, fmt, *args):
        # Silence BaseHTTPRequestHandler's default per-request stderr access
        # log; container logs stay limited to our own explicit prints.
        pass

    def _send_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if not raw:
            raise ValueError("empty request body")
        return json.loads(raw)

    def do_GET(self):
        try:
            if self.path == "/health":
                self._send_json(200, {"status": "ok"})
            elif self.path == "/thresholds":
                self._send_json(200, thresholds_payload())
            else:
                self._send_json(404, {"error": f"no such route: {self.path}"})
        except Exception as exc:
            self._send_json(500, {"error": "internal server error", "detail": str(exc)})

    def do_POST(self):
        try:
            if self.path == "/ingest":
                self._handle_ingest()
            else:
                self._send_json(404, {"error": f"no such route: {self.path}"})
        except Exception as exc:
            self._send_json(500, {"error": "internal server error", "detail": str(exc)})

    def _handle_ingest(self):
        try:
            payload = self._read_json_body()
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": "request body must be valid JSON"})
            return

        error = validate_batch(payload)
        if error is not None:
            self._send_json(400, {"error": error})
            return

        enqueue_batch(
            payload["sensor_type"],
            payload.get("site_id", DEFAULT_SITE),
            payload.get("unit", ""),
            payload["readings"],
        )
        self._send_json(202, {"accepted": len(payload["readings"])})


def main():
    start_consumer_thread()
    start_flush_thread()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), FogHandler)
    print(f"fog node listening on :8000 (window={WINDOW_SECONDS}s, queue={QUEUE_NAME})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
