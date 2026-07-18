import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI

from aggregation import ReeferTally
from alerts import flag_container
from ingest_routes import router as ingest_router
from publisher import open_shipment_link
from status_routes import router as status_router

WINDOW_SECONDS = float(os.getenv("WINDOW_SECONDS", "10"))
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fcl-manifest-agg")
ENDPOINT = os.getenv("AWS_ENDPOINT_URL")
REGION = os.getenv("AWS_REGION", "eu-west-1")

# Max queued intake batches absorbed per consumer tick, so bursts don't starve the shipper.
MAX_DRAIN_PER_TICK = 200


def depot_now():
    return datetime.now(timezone.utc)


class ManifestWindow:
    """Holds one ReeferTally per (sensor_type, site_id) for the open window until it is drained."""

    def __init__(self):
        self._tallies = {}
        self._units = {}

    def absorb(self, batch):
        key = (batch.sensor_type, batch.site_id)
        tally = self._tallies.get(key)
        if tally is None:
            tally = ReeferTally()
            self._tallies[key] = tally
        for reading in batch.readings:
            tally.add(reading.value)
        if batch.unit:
            # Unit is tracked per sensor_type since every container reports the same unit for it.
            self._units[batch.sensor_type] = batch.unit

    def is_empty(self):
        return not self._tallies

    def drain_messages(self, window_start, window_end):
        messages = []
        for (sensor_type, site_id), tally in self._tallies.items():
            if len(tally) == 0:
                continue
            unit = self._units.get(sensor_type, "")
            summary = tally.snapshot(sensor_type, site_id, unit, window_start, window_end)
            summary["alerts"] = flag_container(sensor_type, summary)
            messages.append(summary)
        self._tallies.clear()
        return messages


def _collect_ready_batches(inbox, limit):
    """Non-blocking pull of up to `limit` already-queued items; stops on empty or cap."""
    drained = []
    for _ in range(limit):
        try:
            drained.append(inbox.get_nowait())
        except asyncio.QueueEmpty:
            break
    return drained


async def intake_worker(app):
    # Blocks on the first item, then greedily drains the rest of the burst in one pass.
    accumulator = app.state.accumulator
    inbox = app.state.inbox
    while True:
        first = await inbox.get()
        batches = [first] + _collect_ready_batches(inbox, MAX_DRAIN_PER_TICK - 1)
        try:
            for batch in batches:
                accumulator.absorb(batch)
        finally:
            for _ in batches:
                inbox.task_done()


async def window_shipper(app):
    # Fires once per WINDOW_SECONDS, closing out the window and shipping its aggregates.
    while True:
        await asyncio.sleep(WINDOW_SECONDS)
        window_end = depot_now()
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
    # Wires the dispatch queue and the intake/shipper tasks to the app lifetime, tearing both down on shutdown.
    link_ctx = open_shipment_link(ENDPOINT, REGION, QUEUE_NAME)
    app.state.link = await asyncio.to_thread(link_ctx.__enter__)
    app.state.inbox = asyncio.Queue()
    app.state.accumulator = ManifestWindow()
    consumer_task = asyncio.create_task(intake_worker(app))
    publisher_task = asyncio.create_task(window_shipper(app))
    try:
        yield
    finally:
        consumer_task.cancel()
        publisher_task.cancel()
        link_ctx.__exit__(None, None, None)


app = FastAPI(lifespan=lifespan)
app.include_router(ingest_router)
app.include_router(status_router)
