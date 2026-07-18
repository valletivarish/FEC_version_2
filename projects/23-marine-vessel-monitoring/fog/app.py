"""Marine fog node on Tornado: class-based RequestHandler subclasses overriding get()/post(), routed via a (pattern, HandlerClass) list to tornado.web.Application, with PeriodicCallback driving the background flush."""

import json
import os
from datetime import datetime, timedelta, timezone

import tornado.ioloop
import tornado.web

import buffering
import publisher
from aggregation import aggregate
from alerts import evaluate, thresholds_payload
from validation import validate_batch

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "mvs-vessel-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEFAULT_SITE = "vessel-a"


def utcnow():
    return datetime.now(timezone.utc)


class HealthHandler(tornado.web.RequestHandler):
    def get(self):
        self.write({"status": "ok"})


class ThresholdsHandler(tornado.web.RequestHandler):
    def get(self):
        self.write(thresholds_payload())


class IngestHandler(tornado.web.RequestHandler):
    def post(self):
        raw = self.request.body
        if not raw:
            self.set_status(400)
            self.write({"error": "empty request body"})
            return
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.set_status(400)
            self.write({"error": "request body must be valid JSON"})
            return

        error = validate_batch(payload)
        if error is not None:
            self.set_status(400)
            self.write({"error": error})
            return

        buffering.record(
            payload["sensor_type"],
            payload.get("site_id", DEFAULT_SITE),
            payload.get("unit", ""),
            payload["readings"],
        )
        self.set_status(202)
        self.write({"accepted": len(payload["readings"])})


def build_messages(snapshot, units, window_start, window_end):
    messages = []
    for (sensor_type, site_id), readings in snapshot.items():
        summary = aggregate(sensor_type, site_id, units.get(sensor_type, ""), readings, window_start, window_end)
        summary["alerts"] = evaluate(sensor_type, summary)
        messages.append(summary)
    return messages


def flush(client, queue_url):
    """Snapshot+clear the buffer, aggregate and evaluate alerts for every
    non-empty (sensor_type, site_id) group, and fire-and-forget publish the
    whole window as one batched send (chunked at 10 entries). Returns the
    built messages (useful for tests and for the caller to log, even
    though publishing itself never blocks on them)."""
    window_end = utcnow()
    window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
    snapshot, units = buffering.snapshot_and_clear()
    if not snapshot:
        return []
    messages = build_messages(snapshot, units, window_start.isoformat(), window_end.isoformat())
    publisher.publish_batch(client, queue_url, messages)
    return messages


def make_app():
    return tornado.web.Application([
        (r"/health", HealthHandler),
        (r"/thresholds", ThresholdsHandler),
        (r"/ingest", IngestHandler),
    ])


def main():
    client = publisher.build_client(ENDPOINT, REGION)
    queue_url = publisher.resolve_queue_url(client, QUEUE_NAME)

    app = make_app()
    app.listen(8000)

    periodic = tornado.ioloop.PeriodicCallback(lambda: flush(client, queue_url), WINDOW_SECONDS * 1000)
    periodic.start()

    print(f"fog node listening on :8000 (window={WINDOW_SECONDS}s, queue={QUEUE_NAME})", flush=True)
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
