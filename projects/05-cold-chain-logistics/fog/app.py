import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI

from aggregation import RollingStat
from alerts import flag_container
from ingest_routes import router as ingest_router
from publisher import open_shipment_link
from status_routes import router as status_router

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fcl-manifest-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

# Cap on how many queued ingest batches one consumer tick absorbs before
# yielding back to the event loop; keeps a burst of arrivals from starving
# the window_publisher task on the same loop.
MAX_DRAIN_PER_TICK = 200


def right_now():
    return datetime.now(timezone.utc)


class WindowAccumulator:
    """Holds one RollingStat per (sensor_type, site_id) for the current
    window. Readings are absorbed incrementally as ingest batches arrive;
    drain_messages() closes out the window, evaluates alerts per reading
    type, and resets state for the next window."""

    def __init__(self):
        self._stats = {}
        self._units = {}

    def absorb(self, batch):
        key = (batch.sensor_type, batch.site_id)
        stat = self._stats.get(key)
        if stat is None:
            stat = RollingStat()
            self._stats[key] = stat
        for reading in batch.readings:
            stat.add(reading.value)
        if batch.unit:
            # Remember the unit per sensor_type (not per site) since every
            # container's sensor of a given type reports the same unit.
            self._units[batch.sensor_type] = batch.unit

    def is_empty(self):
        return not self._stats

    def drain_messages(self, window_start, window_end):
        messages = []
        for (sensor_type, site_id), stat in self._stats.items():
            if len(stat) == 0:
                continue
            unit = self._units.get(sensor_type, "")
            summary = stat.snapshot(sensor_type, site_id, unit, window_start, window_end)
            summary["alerts"] = flag_container(sensor_type, summary)
            messages.append(summary)
        self._stats.clear()
        return messages


def _drain_ready_batches(inbox, limit):
    """Pull whatever is already sitting in the queue, up to limit items,
    without blocking. Returns as soon as the queue reports empty or the
    cap is hit, so a single slow tick can't starve the rest of the app."""
    drained = []
    for _ in range(limit):
        try:
            drained.append(inbox.get_nowait())
        except asyncio.QueueEmpty:
            break
    return drained


async def inbox_consumer(app):
    # Background task: blocks on the first item, then greedily drains
    # whatever else is already queued (bounded by MAX_DRAIN_PER_TICK) so
    # bursts of sensor batches are absorbed in one pass rather than one
    # event-loop iteration per batch.
    accumulator = app.state.accumulator
    inbox = app.state.inbox
    while True:
        first = await inbox.get()
        batches = [first] + _drain_ready_batches(inbox, MAX_DRAIN_PER_TICK - 1)
        try:
            for batch in batches:
                accumulator.absorb(batch)
        finally:
            for _ in batches:
                inbox.task_done()


async def window_publisher(app):
    # Background task: fires once per WINDOW_SECONDS, closes out whatever
    # the accumulator collected during that window, and ships one aggregate
    # message per (sensor_type, site_id) to the queue. Shipping runs in a
    # worker thread since boto3's SQS client is synchronous.
    while True:
        await asyncio.sleep(WINDOW_SECONDS)
        window_end = right_now()
        window_start = window_end - timedelta(seconds=WINDOW_SECONDS)
        accumulator = app.state.accumulator
        if accumulator.is_empty():
            continue
        messages = accumulator.drain_messages(window_start.isoformat(), window_end.isoformat())
        try:
            await asyncio.to_thread(app.state.link.ship_batch, messages)
        except Exception as exc:
            print(f"window publish failed: {exc}", flush=True)


@asynccontextmanager
async def lifespan(app):
    # Wires up the queue connection and the two background tasks (ingest
    # consumer, window publisher) around the app's lifetime, and tears both
    # down cleanly on shutdown so no task keeps running against a closed link.
    link_ctx = open_shipment_link(ENDPOINT, REGION, QUEUE_NAME)
    app.state.link = await asyncio.to_thread(link_ctx.__enter__)
    app.state.inbox = asyncio.Queue()
    app.state.accumulator = WindowAccumulator()
    consumer_task = asyncio.create_task(inbox_consumer(app))
    publisher_task = asyncio.create_task(window_publisher(app))
    try:
        yield
    finally:
        consumer_task.cancel()
        publisher_task.cancel()
        link_ctx.__exit__(None, None, None)


app = FastAPI(lifespan=lifespan)
app.include_router(ingest_router)
app.include_router(status_router)
