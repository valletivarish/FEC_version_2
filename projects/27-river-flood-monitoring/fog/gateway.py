"""Fog node on aiohttp: async ingest into a lock-free per-group buffer, background window flush to SQS."""
import asyncio
import os
from datetime import datetime, timedelta, timezone

from aiohttp import web

import publisher
from staging import evaluate, thresholds_payload
from windowing import summarise

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "rfw-catchment-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

REQUIRED = ("sensor_type", "site_id", "readings")


def validate(body):
    if not isinstance(body, dict):
        return "body must be an object"
    for field in REQUIRED:
        if field not in body:
            return f"missing field: {field}"
    if not isinstance(body["readings"], list) or not body["readings"]:
        return "readings must be a non-empty list"
    for reading in body["readings"]:
        if not isinstance(reading, dict) or not isinstance(reading.get("value"), (int, float)):
            return "each reading needs a numeric value"
    return None


async def ingest(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid JSON"}, status=400)
    error = validate(body)
    if error:
        return web.json_response({"error": error}, status=400)
    key = (body["sensor_type"], body["site_id"])
    request.app["buffers"].setdefault(key, []).extend(body["readings"])
    request.app["units"][body["sensor_type"]] = body.get("unit", "")
    return web.json_response({"accepted": len(body["readings"])}, status=202)


async def health(request):
    return web.json_response({"status": "ok"})


async def thresholds(request):
    return web.json_response(thresholds_payload())


def drain(buffers):
    snapshot = {key: values for key, values in buffers.items() if values}
    buffers.clear()
    return snapshot


async def flush_loop(app):
    while True:
        await asyncio.sleep(WINDOW_SECONDS)
        snapshot = drain(app["buffers"])
        if not snapshot:
            continue
        end = datetime.now(timezone.utc)
        start = end - timedelta(seconds=WINDOW_SECONDS)
        messages = []
        for (sensor_type, site_id), readings in snapshot.items():
            agg = summarise(sensor_type, site_id, app["units"].get(sensor_type, ""),
                            readings, start.isoformat(), end.isoformat(), WINDOW_SECONDS)
            agg["alerts"] = evaluate(sensor_type, agg)
            messages.append(agg)
        try:
            await asyncio.to_thread(publisher.send_window, messages)
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)


async def on_start(app):
    await asyncio.to_thread(publisher.configure, ENDPOINT, REGION, QUEUE_NAME)
    app["flusher"] = asyncio.create_task(flush_loop(app))


def build_app():
    app = web.Application()
    app["buffers"] = {}
    app["units"] = {}
    app.add_routes([
        web.post("/ingest", ingest),
        web.get("/health", health),
        web.get("/thresholds", thresholds),
    ])
    return app


def main():
    app = build_app()
    app.on_startup.append(on_start)
    print(f"fog listening on :8000 (window={WINDOW_SECONDS}s)", flush=True)
    web.run_app(app, host="0.0.0.0", port=8000, print=None)


if __name__ == "__main__":
    main()
