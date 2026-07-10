"""Parking sensor simulator: one process per (sensor_type, site_id) pair.

4th distinct sensor-loop structure in the portfolio's Python projects. 01
uses a single `while True: ... time.sleep(sample_interval)` loop where the
dispatch check is an elapsed-time comparison inside that same loop. 05 uses
the stdlib `sched` scheduler with two events re-entering themselves on one
scheduler queue, driven by a single thread calling `clock.run()`. 12 uses
two independently self-rearming `threading.Timer` chains, each tick a
genuine separate OS thread.

This project uses real `asyncio`: `asyncio.run(main())` drives two
independent coroutines -- `sample_loop` and `dispatch_loop` -- concurrently
via `asyncio.gather`, each with its own `while True: await asyncio.sleep(...)`
cadence on a single event loop thread. There is no OS-thread concurrency and
no central scheduler object; the two loops interleave cooperatively, and the
only coordination between them is an `asyncio.Lock` guarding the shared
reading buffer.
"""

import asyncio
import json
import os
import random
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ReadingProfile:
    unit: str
    lo: float
    hi: float
    start: float
    step: float


PROFILES = {
    "occupied_spaces": ReadingProfile(unit="count", lo=0, hi=300, start=80, step=20.0),
    "entry_rate_per_min": ReadingProfile(unit="vehicles/min", lo=0, hi=30, start=5, step=3.0),
    "exit_rate_per_min": ReadingProfile(unit="vehicles/min", lo=0, hi=30, start=5, step=3.0),
    "avg_dwell_time_min": ReadingProfile(unit="min", lo=5, hi=480, start=60, step=25.0),
    "gate_fault_events": ReadingProfile(unit="count", lo=0, hi=10, start=0, step=1.0),
}


class RandomWalk:
    """Bounded random walk: each step nudges the value by up to +/-profile.step
    and clamps it back into [lo, hi] so it never drifts outside the profile's
    physically plausible range, then rounds to 2 decimals."""

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
    whether to retry or requeue. Blocking (urllib), deliberately run off the
    event loop via asyncio.to_thread so it never stalls the sample loop."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class ParkingSensorAgent:
    def __init__(self):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "lot-a")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.sensor_type]
        self.walk = RandomWalk(self.profile)
        self.buffer = []
        self.lock = asyncio.Lock()

    async def _do_sample(self):
        """One sampling tick's work, kept separate from sample_loop so tests
        can await it directly without running a real sleep cadence."""
        value = self.walk.step()
        async with self.lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    async def _do_dispatch(self):
        """One dispatch tick's work: swaps the buffer out atomically under
        the lock so readings sampled during the network call land in a
        fresh buffer instead of racing the in-flight POST, then ships it.
        On failure the batch is put back in front of the buffer so nothing
        sampled is silently dropped."""
        async with self.lock:
            batch, self.buffer = self.buffer, []
        if not batch:
            return None
        payload = {
            "sensor_type": self.sensor_type,
            "site_id": self.site_id,
            "unit": self.profile.unit,
            "readings": batch,
        }
        try:
            await asyncio.to_thread(ship_batch, self.fog_url, payload)
            print(f"{self.sensor_type}@{self.site_id} dispatched {len(batch)} readings", flush=True)
            return payload
        except urllib.error.URLError as exc:
            async with self.lock:
                self.buffer = batch + self.buffer
            print(f"{self.sensor_type}@{self.site_id} dispatch failed, will retry: {exc}", flush=True)
            return None

    async def sample_loop(self):
        while True:
            await asyncio.sleep(self.sample_interval)
            await self._do_sample()

    async def dispatch_loop(self):
        while True:
            await asyncio.sleep(self.dispatch_interval)
            await self._do_dispatch()

    async def run(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        # Two independent coroutines on one event loop, not two OS threads --
        # asyncio.gather runs both cadences concurrently for as long as the
        # process lives; neither loop ever returns.
        await asyncio.gather(self.sample_loop(), self.dispatch_loop())


async def main():
    await ParkingSensorAgent().run()


if __name__ == "__main__":
    asyncio.run(main())
