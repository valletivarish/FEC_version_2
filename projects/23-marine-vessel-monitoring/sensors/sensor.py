"""Marine vessel sensor simulator: self-re-arming loop.call_later ticks on a single asyncio event loop (no thread/process/coroutine per tick) -- the 8th distinct sensor-loop structure in this portfolio's Python projects, and the only one whose shared buffer needs no lock."""

import asyncio
import json
import os
import random
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ReadingProfile:
    unit: str
    lo: float
    hi: float
    start: float
    step: float


# One profile per reading type this sensor image can simulate. SENSOR_TYPE
# (see VesselSensorAgent) selects which profile a given container instance
# uses. passenger_count has no bearing on any alert rule -- it is shown in
# the dashboard purely as secondary detail.
PROFILES = {
    "engine_room_temp_c": ReadingProfile(unit="C", lo=20, hi=90, start=45, step=4.0),
    "fuel_consumption_lph": ReadingProfile(unit="L/h", lo=0, hi=500, start=150, step=30.0),
    "ballast_water_level_pct": ReadingProfile(unit="%", lo=0, hi=100, start=50, step=6.0),
    "hull_vibration_mm": ReadingProfile(unit="mm/s", lo=0, hi=20, start=2, step=1.5),
    "passenger_count": ReadingProfile(unit="people", lo=0, hi=3000, start=800, step=150.0),
}


class RandomWalk:
    """Bounded random walk: each step nudges the value by up to +/-profile.step
    and clamps it back into [lo, hi], then rounds to 2 decimals."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def step(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def ship_batch(url, payload):
    """POST a JSON batch to the fog node's /ingest endpoint. Raises
    urllib.error.URLError on connection failure so the caller can decide
    whether to requeue and retry. Deliberately blocking (urllib) -- callers
    run it on the dedicated dispatch executor, never on the event-loop
    thread itself."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class VesselSensorAgent:
    def __init__(self, loop=None):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "vessel-a")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.sensor_type]
        self.walk = RandomWalk(self.profile)
        self.buffer = []
        self.loop = loop or asyncio.get_event_loop()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dispatch")

    def _do_sample(self):
        """One sampling tick's work. Called directly from _sample_tick,
        which only ever runs on the event-loop thread, so appending to
        self.buffer needs no lock -- nothing else touches it concurrently."""
        value = self.walk.step()
        self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _swap_buffer(self):
        """Detach the current buffer and replace it with a fresh empty list,
        atomically with respect to other event-loop callbacks (there is
        exactly one thread running this code at a time)."""
        batch, self.buffer = self.buffer, []
        return batch

    def _merge_failed_batch(self, batch):
        """Put a batch that failed to ship back in front of whatever has
        been sampled since, so nothing is silently dropped."""
        self.buffer = batch + self.buffer

    def _on_dispatch_done(self, batch, future):
        """Runs back on the event-loop thread (see _do_dispatch, which
        schedules this via loop.call_soon_threadsafe from the executor
        thread). Folding a failed batch back into self.buffer here, rather
        than on the executor thread, is what keeps the buffer lock-free."""
        exc = future.exception()
        if exc is None:
            print(f"{self.sensor_type}@{self.site_id} dispatched {len(batch)} readings", flush=True)
        else:
            self._merge_failed_batch(batch)
            print(f"{self.sensor_type}@{self.site_id} dispatch failed, will retry: {exc}", flush=True)

    def _do_dispatch(self):
        """One dispatch tick's work: swap the buffer out synchronously
        (safe -- see _swap_buffer), then hand the actual blocking POST to
        the one-worker executor so it never stalls the event loop that is
        also driving the sample cadence."""
        batch = self._swap_buffer()
        if not batch:
            return
        payload = {
            "sensor_type": self.sensor_type,
            "site_id": self.site_id,
            "unit": self.profile.unit,
            "readings": batch,
        }
        future = self.executor.submit(ship_batch, self.fog_url, payload)
        future.add_done_callback(
            lambda f: self.loop.call_soon_threadsafe(self._on_dispatch_done, batch, f)
        )

    def _sample_tick(self):
        self._do_sample()
        self.loop.call_later(self.sample_interval, self._sample_tick)

    def _dispatch_tick(self):
        self._do_dispatch()
        self.loop.call_later(self.dispatch_interval, self._dispatch_tick)

    def start(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        # Two independent call_later chains on one event loop -- no
        # coroutine, thread, or process handles the recurrence; the loop's
        # own timer wheel does.
        self.loop.call_later(self.sample_interval, self._sample_tick)
        self.loop.call_later(self.dispatch_interval, self._dispatch_tick)


def run():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    agent = VesselSensorAgent(loop=loop)
    agent.start()
    loop.run_forever()


if __name__ == "__main__":
    run()
