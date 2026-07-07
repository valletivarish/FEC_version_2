import json
import os
import random
import sched
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ReadingProfile:
    """Bounds and step size for one reading type's simulated random walk.

    `lo`/`hi` clamp the walk to physically plausible values for the sensor
    (e.g. a reefer container's storage temperature never wanders above 5C),
    `start` is the seed value, and `step` is the max drift applied per tick.
    """

    unit: str
    lo: float
    hi: float
    start: float
    step: float


# One profile per reading type this sensor image can simulate. SENSOR_TYPE
# (see SensorAgent) selects which profile a given container instance uses.
PROFILES = {
    "storage_temperature": ReadingProfile(unit="C", lo=-25, hi=5, start=-18, step=1.0),
    "humidity": ReadingProfile(unit="%", lo=20, hi=95, start=55, step=3.0),
    "door_open_seconds": ReadingProfile(unit="s", lo=0, hi=600, start=20, step=30.0),
    "shock_vibration": ReadingProfile(unit="g", lo=0, hi=8, start=0.3, step=0.3),
    "co2_level": ReadingProfile(unit="ppm", lo=350, hi=2000, start=450, step=60.0),
}


class RandomWalk:
    """Bounded random walk: each step nudges the value by up to +/-profile.step
    and clamps it back into [lo, hi] so it never drifts outside the profile's
    physically valid range."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def step(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def ship_batch(url, payload):
    """POST a JSON batch to the depot relay's /ingest endpoint. Raises
    urllib.error.URLError on connection failure so the caller can decide
    whether to retry or requeue."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class SensorAgent:
    def __init__(self):
        self.reading_type = os.environ["SENSOR_TYPE"]
        self.container_id = os.getenv("SITE_ID", "container-1")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.depot_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.reading_type]
        self.walk = RandomWalk(self.profile)
        self.manifest = []
        self.clock = sched.scheduler(time.monotonic, time.sleep)

    def _sample(self):
        # Runs every sample_interval seconds; only buffers the reading
        # locally, the separate dispatch tick decides when to ship it.
        value = self.walk.step()
        self.manifest.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        self.clock.enter(self.sample_interval, 1, self._sample)

    def _dispatch(self):
        # Runs every dispatch_interval seconds. Swaps the manifest buffer out
        # atomically before shipping so newly sampled readings during the
        # network call land in a fresh buffer rather than being lost or
        # racing with the batch in flight.
        if self.manifest:
            batch, self.manifest = self.manifest, []
            payload = {
                "sensor_type": self.reading_type,
                "site_id": self.container_id,
                "unit": self.profile.unit,
                "readings": batch,
            }
            try:
                ship_batch(self.depot_url, payload)
                print(f"{self.reading_type} dispatched {len(batch)} readings", flush=True)
            except urllib.error.URLError as exc:
                # Depot relay unreachable: put the batch back in front of
                # anything sampled since, so nothing is dropped, and retry
                # on the next dispatch tick.
                self.manifest = batch + self.manifest
                print(f"{self.reading_type} dispatch failed, will retry: {exc}", flush=True)
        self.clock.enter(self.dispatch_interval, 2, self._dispatch)

    def run(self):
        print(
            f"{self.reading_type}@{self.container_id} sampling every "
            f"{self.sample_interval}s, dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        self.clock.enter(self.sample_interval, 1, self._sample)
        self.clock.enter(self.dispatch_interval, 2, self._dispatch)
        self.clock.run()


def run():
    # Entry point used by the container image; one SensorAgent per process,
    # configured entirely from environment variables set in docker-compose.
    SensorAgent().run()


if __name__ == "__main__":
    run()
