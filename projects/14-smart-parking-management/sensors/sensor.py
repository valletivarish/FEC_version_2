"""Parking sensor simulator: asyncio.gather runs sample/dispatch coroutines on one event loop, coordinated by an asyncio.Lock."""

import asyncio
import json
import os
import random
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class MetricProfile:
    unit: str
    lo: float
    hi: float
    start: float
    step: float


METRIC_PROFILES = {
    "occupied_spaces": MetricProfile(unit="count", lo=0, hi=300, start=80, step=20.0),
    "entry_rate_per_min": MetricProfile(unit="vehicles/min", lo=0, hi=30, start=5, step=3.0),
    "exit_rate_per_min": MetricProfile(unit="vehicles/min", lo=0, hi=30, start=5, step=3.0),
    "avg_dwell_time_min": MetricProfile(unit="min", lo=5, hi=480, start=60, step=25.0),
    "gate_fault_events": MetricProfile(unit="count", lo=0, hi=10, start=0, step=1.0),
}


class MetricDrift:
    """Bounded random walk: each step nudges by up to +/-profile.step, clamps into [lo, hi], and rounds to 2 decimals."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def step(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def ship_batch(url, payload):
    """POST a JSON batch to the fog node's /ingest endpoint; raises urllib.error.URLError on connection failure."""
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
        self.profile = METRIC_PROFILES[self.sensor_type]
        self.drift = MetricDrift(self.profile)
        self.buffer = []
        self.lock = asyncio.Lock()

    async def _do_sample(self):
        """One sampling tick, separate from sample_loop so tests can await it without a real sleep cadence."""
        value = self.drift.step()
        async with self.lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    async def _do_dispatch(self):
        """One dispatch tick: swaps the buffer out under the lock, ships it, and restores it on failure."""
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
        # Two coroutines on one event loop; neither cadence ever returns.
        await asyncio.gather(self.sample_loop(), self.dispatch_loop())


async def main():
    await ParkingSensorAgent().run()


if __name__ == "__main__":
    asyncio.run(main())
