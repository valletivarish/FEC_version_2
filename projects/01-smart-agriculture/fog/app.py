import asyncio
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from pydantic import BaseModel

from aggregation import aggregate
from alerts import evaluate
from publisher import SqsPublisher

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fec-sensor-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")


class Reading(BaseModel):
    ts: str
    value: float


class Batch(BaseModel):
    sensor_type: str
    site_id: str = "field-1"
    unit: str = ""
    readings: list[Reading]


def utcnow():
    return datetime.now(timezone.utc)


def build_messages(snapshot, units, window_start, window_end):
    """One aggregate-plus-alerts message per (sensor_type, site_id) key
    present in this window's snapshot -- a key with no readings this window
    is simply absent from snapshot (see flush_once), not zero-filled."""
    messages = []
    for (sensor_type, site_id), readings in snapshot.items():
        agg = aggregate(sensor_type, site_id, units.get(sensor_type, ""),
                        readings, window_start, window_end)
        agg["alerts"] = evaluate(sensor_type, agg)
        messages.append(agg)
    return messages


@asynccontextmanager
async def lifespan(app):
    app.state.publisher = await asyncio.to_thread(SqsPublisher, ENDPOINT, REGION, QUEUE_NAME)
    task = asyncio.create_task(flush_loop(app))
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(lifespan=lifespan)
app.state.buffers = defaultdict(list)
app.state.units = {}
app.state.lock = asyncio.Lock()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ingest", status_code=202)
async def ingest(batch: Batch):
    key = (batch.sensor_type, batch.site_id)
    async with app.state.lock:
        app.state.buffers[key].extend(r.model_dump() for r in batch.readings)
        if batch.unit:
            app.state.units[batch.sensor_type] = batch.unit
    return {"accepted": len(batch.readings)}


async def flush_once(app):
    end = utcnow()
    start = end - timedelta(seconds=WINDOW_SECONDS)
    async with app.state.lock:
        # Snapshot-then-clear under the same lock ingest() writes under, so a
        # reading arriving mid-flush either lands in this window's snapshot
        # or the next one, never both and never dropped.
        snapshot = {k: v for k, v in app.state.buffers.items() if v}
        app.state.buffers.clear()
        units = dict(app.state.units)
    messages = build_messages(snapshot, units, start.isoformat(), end.isoformat())
    await asyncio.to_thread(app.state.publisher.publish_batch, messages)


async def flush_loop(app):
    while True:
        await asyncio.sleep(WINDOW_SECONDS)
        try:
            await flush_once(app)
        except Exception as exc:
            print(f"flush failed: {exc}", flush=True)
