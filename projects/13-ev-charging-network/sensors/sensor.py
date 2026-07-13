"""EV charging-hub sensor simulator -- 4th distinct sensor-loop structure in this portfolio's Python projects: recurring sample/dispatch jobs re-arm themselves via Future.add_done_callback on a ThreadPoolExecutor, so the executor itself owns the recurrence instead of a Timer chain or scheduler queue."""

import json
import os
import random
import threading
import time
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


# One profile per reading type this sensor image can simulate. Every value
# is a hub-level aggregate across that hub's active charging bays, not a
# single bay's reading.
PROFILES = {
    "charging_current_a": ReadingProfile(unit="A", lo=0, hi=50, start=16, step=3.0),
    "battery_soc_pct": ReadingProfile(unit="%", lo=0, hi=100, start=45, step=6.0),
    "station_temp_c": ReadingProfile(unit="C", lo=10, hi=55, start=28, step=2.0),
    "grid_load_kw": ReadingProfile(unit="kW", lo=10, hi=100, start=45, step=5.0),
    "session_duration_min": ReadingProfile(unit="min", lo=0, hi=240, start=30, step=15.0),
}


class RandomWalk:
    """Bounded random walk: each step nudges the value by up to
    +/-profile.step and clamps it back into [lo, hi]."""

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
    whether to requeue and retry."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class HubSensorAgent:
    def __init__(self):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "hub-1")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.sensor_type]
        self.walk = RandomWalk(self.profile)
        self.buffer = []
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=2)

    def _do_sample(self):
        """One sampling tick's work, with no scheduling side effects, so
        tests can call it directly without touching the executor."""
        value = self.walk.step()
        with self.lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _do_dispatch(self):
        """One dispatch tick's work: swaps the buffer out atomically so
        readings sampled during the network call land in a fresh buffer
        instead of racing the in-flight POST. On failure the batch is put
        back in front of the buffer so nothing is dropped."""
        with self.lock:
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
            ship_batch(self.fog_url, payload)
            print(f"{self.sensor_type} dispatched {len(batch)} readings", flush=True)
            return payload
        except urllib.error.URLError as exc:
            with self.lock:
                self.buffer = batch + self.buffer
            print(f"{self.sensor_type} dispatch failed, will retry: {exc}", flush=True)
            return None

    def _sample_job(self):
        time.sleep(self.sample_interval)
        self._do_sample()

    def _dispatch_job(self):
        time.sleep(self.dispatch_interval)
        self._do_dispatch()

    def _resubmit(self, job, on_done, future):
        exc = future.exception()
        if exc is not None:
            print(f"{self.sensor_type} recurring job raised: {exc}", flush=True)
        self.executor.submit(job).add_done_callback(on_done)

    def run(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        # Two recurring jobs on the same pool, each re-arming itself via a
        # done_callback on its own Future -- there is no central loop or
        # scheduler object; the executor plus the callback chain is the
        # entire scheduling mechanism.
        on_sample_done = lambda future: self._resubmit(self._sample_job, on_sample_done, future)
        on_dispatch_done = lambda future: self._resubmit(self._dispatch_job, on_dispatch_done, future)
        self.executor.submit(self._sample_job).add_done_callback(on_sample_done)
        self.executor.submit(self._dispatch_job).add_done_callback(on_dispatch_done)
        threading.Event().wait()


def run():
    HubSensorAgent().run()


if __name__ == "__main__":
    run()
