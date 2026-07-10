"""Building sensor simulator: one process per (sensor_type, site_id) pair.

3rd distinct sensor-loop structure in the portfolio's Python projects. 01
uses a single `while True: ... time.sleep(sample_interval)` loop where the
dispatch check is just an elapsed-time comparison inside that same loop.
05 uses the stdlib `sched` scheduler with two events re-entered on their own
scheduler queue, but still driven by one thread calling `clock.run()`.

Here sampling and dispatch are two independently self-rearming
`threading.Timer` chains -- each tick spawns its own OS thread via Timer,
does its work, then arms the next Timer for the same tick. There is no
central loop or scheduler object at all; the two cadences are genuinely
concurrent real threads coordinated only by a lock around the shared
reading buffer, not by one thread's single-file event queue.
"""

import json
import os
import random
import threading
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
    "energy_consumption_kw": ReadingProfile(unit="kW", lo=2, hi=80, start=25, step=4.0),
    "co2_ppm": ReadingProfile(unit="ppm", lo=350, hi=1500, start=550, step=30.0),
    "occupancy_count": ReadingProfile(unit="people", lo=0, hi=120, start=20, step=8.0),
    "hvac_temp_c": ReadingProfile(unit="C", lo=14, hi=30, start=22, step=0.6),
    "water_usage_lpm": ReadingProfile(unit="L/min", lo=0, hi=40, start=6, step=2.0),
}


class RandomWalk:
    """Bounded random walk: each step nudges the value by up to +/-profile.step
    and clamps it back into [lo, hi]."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def step(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def ship_batch(url, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class BuildingSensorAgent:
    def __init__(self):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "floor-1")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.sensor_type]
        self.walk = RandomWalk(self.profile)
        self.buffer = []
        self.lock = threading.Lock()

    def _do_sample(self):
        """One sampling tick's work, with no scheduling side effects --
        kept separate from _sample_tick so tests can call it directly
        without spawning a real Timer chain."""
        value = self.walk.step()
        with self.lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _do_dispatch(self):
        """One dispatch tick's work: swaps the buffer out atomically so
        readings sampled during the network call land in a fresh buffer
        instead of racing the in-flight POST, then ships it. On failure the
        batch is put back in front of the buffer so nothing is dropped."""
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

    def _sample_tick(self):
        self._do_sample()
        threading.Timer(self.sample_interval, self._sample_tick).start()

    def _dispatch_tick(self):
        self._do_dispatch()
        threading.Timer(self.dispatch_interval, self._dispatch_tick).start()

    def run(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        # Two independent self-rearming Timer chains -- sampling and
        # dispatch never share a tick, so tuning one interval never skews
        # the other's cadence.
        threading.Timer(self.sample_interval, self._sample_tick).start()
        threading.Timer(self.dispatch_interval, self._dispatch_tick).start()
        threading.Event().wait()


def run():
    BuildingSensorAgent().run()


if __name__ == "__main__":
    run()
