"""EV charging-hub fog node: Flask (@app.route decorators, manual
request.get_json() parsing, real 400 responses, no Pydantic anywhere) --
the 4th distinct HTTP framework/idiom across this portfolio's Python
projects (01/05 use FastAPI; 12 uses plain http.server.ThreadingHTTPServer).

Buffering is a plain dict guarded directly by a threading.Lock -- no
queue.Queue, no asyncio.Queue, no WindowAccumulator/RollingStat object at
all. Every /ingest request (Flask's dev server runs each request on its
own worker thread when threaded=True) takes the lock, mutates _buffer in
place, and releases it; the background flush thread takes the same lock
only long enough to snapshot-and-clear it.

Responsibilities:
  GET  /health       -> {"status": "ok"}
  GET  /thresholds   -> descriptive mirror of alerts.RULES (does not drive
                        evaluation -- evaluate_rules() is the real engine)
  POST /ingest       -> validates the batch (validation.py), then buffers
                        it under _lock
  (background)       -> every WINDOW_SECONDS, flush_once() snapshots +
                        clears the buffer, aggregates + evaluates alerts
                        per (sensor_type, site_id) group, and publishes one
                        message per group to SQS.
"""

import os
import threading
import time
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, request

from aggregation import aggregate
from alerts import RULES, evaluate_rules, thresholds_payload
from publisher import publish
from validation import validate_batch

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
DEFAULT_SITE = "hub-1"

app = Flask(__name__)

_buffer = {}
_units = {}
_lock = threading.Lock()


def utcnow():
    return datetime.now(timezone.utc)


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "no such route"}), 404


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/thresholds", methods=["GET"])
def thresholds():
    return jsonify(thresholds_payload(RULES)), 200


@app.route("/ingest", methods=["POST"])
def ingest():
    payload = request.get_json(silent=True)
    error = validate_batch(payload)
    if error is not None:
        return jsonify({"error": error}), 400

    sensor_type = payload["sensor_type"]
    site_id = payload.get("site_id", DEFAULT_SITE)
    unit = payload.get("unit", "")
    readings = payload["readings"]

    key = (sensor_type, site_id)
    with _lock:
        _buffer.setdefault(key, []).extend(readings)
        if unit:
            _units[sensor_type] = unit

    return jsonify({"accepted": len(readings)}), 202


def flush_once():
    """Snapshot + clear the buffer under the lock, then aggregate and
    evaluate alerts for every non-empty (sensor_type, site_id) group
    outside the lock, so a slow SQS publish never blocks incoming /ingest
    requests."""
    window_end = utcnow()
    window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
    with _lock:
        snapshot = {key: values for key, values in _buffer.items() if values}
        _buffer.clear()
        units = dict(_units)

    for (sensor_type, site_id), readings in snapshot.items():
        summary = aggregate(
            sensor_type, site_id, units.get(sensor_type, ""),
            readings, window_start.isoformat(), window_end.isoformat(),
        )
        summary["alerts"] = evaluate_rules(RULES, sensor_type, summary)
        publish(summary)


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


if __name__ == "__main__":
    start_flush_thread()
    app.run(host="0.0.0.0", port=8000, threaded=True)
