"""Solar farm fog node: an aiohttp.web service that ingests sensor batches, buffers them per window, and publishes window aggregates to SQS."""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

from aiohttp import web

from aggregation import aggregate
from alerts import evaluate, thresholds_payload
from buffering import CombinerBuffer
from publisher import enqueue, start_flusher_thread
from validation import validate_batch

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "sfm-array-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")
DEFAULT_SITE = "array-1"

COMBINER_KEY = web.AppKey("combiner", CombinerBuffer)
ENABLE_BACKGROUND_KEY = web.AppKey("enable_background", bool)
FLUSH_TASK_KEY = web.AppKey("flush_task", asyncio.Task)


def utcnow():
    return datetime.now(timezone.utc)


async def health(request):
    return web.json_response({"status": "ok"})


async def thresholds(request):
    return web.json_response(thresholds_payload())


async def ingest(request):
    raw_body = await request.read()
    if not raw_body:
        return web.json_response({"error": "empty request body"}, status=400)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return web.json_response({"error": "request body must be valid JSON"}, status=400)

    problem = validate_batch(payload)
    if problem is not None:
        return web.json_response({"error": problem}, status=400)

    request.app[COMBINER_KEY].record(
        payload["sensor_type"],
        payload.get("site_id", DEFAULT_SITE),
        payload.get("unit", ""),
        payload["readings"],
    )
    return web.json_response({"accepted": len(payload["readings"])}, status=202)


async def flush_window(app):
    """Swap the combiner, summarise every non-empty group, evaluate faults, and enqueue one message per group."""
    window_end = utcnow()
    window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
    pending, unit_map = app[COMBINER_KEY].swap()
    for (sensor_type, site_id), readings in pending.items():
        window_summary = aggregate(
            sensor_type, site_id, unit_map.get(sensor_type, ""),
            readings, window_start.isoformat(), window_end.isoformat(),
        )
        window_summary["alerts"] = evaluate(sensor_type, window_summary)
        enqueue(window_summary)


async def window_flush_loop(app):
    while True:
        await asyncio.sleep(WINDOW_SECONDS)
        try:
            await flush_window(app)
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)


async def on_startup(app):
    app[COMBINER_KEY] = CombinerBuffer()
    if app[ENABLE_BACKGROUND_KEY]:
        start_flusher_thread(ENDPOINT, REGION, QUEUE_NAME)
        app[FLUSH_TASK_KEY] = asyncio.create_task(window_flush_loop(app))


async def on_cleanup(app):
    task = app.get(FLUSH_TASK_KEY)
    if task is not None:
        task.cancel()


def create_app(enable_background=True):
    """Factory so each test builds a fresh app (fresh combiner, no background tasks) instead of sharing module state."""
    app = web.Application()
    app[ENABLE_BACKGROUND_KEY] = enable_background
    app.router.add_get("/health", health)
    app.router.add_get("/thresholds", thresholds)
    app.router.add_post("/ingest", ingest)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


def main():
    print(f"fog node listening on :8000 (window={WINDOW_SECONDS}s, queue={QUEUE_NAME})", flush=True)
    web.run_app(create_app(), host="0.0.0.0", port=8000, print=None)


if __name__ == "__main__":
    main()
