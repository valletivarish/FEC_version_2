"""Building sensor simulator: two independently self-rearming Timer chains for sampling and dispatch, with no central scheduler and coordination only via a shared-buffer lock."""

import json
import os
import random
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class MeterProfile:
    unit: str
    lo: float
    hi: float
    start: float
    step: float


METER_PROFILES = {
    "energy_consumption_kw": MeterProfile(unit="kW", lo=2, hi=80, start=25, step=4.0),
    "co2_ppm": MeterProfile(unit="ppm", lo=350, hi=1500, start=550, step=30.0),
    "occupancy_count": MeterProfile(unit="people", lo=0, hi=120, start=20, step=8.0),
    "hvac_temp_c": MeterProfile(unit="C", lo=14, hi=30, start=22, step=0.6),
    "water_usage_lpm": MeterProfile(unit="L/min", lo=0, hi=40, start=6, step=2.0),
}


class DriftingMeter:
    """Bounded random walk: each step nudges the value by up to +/-profile.step and clamps it back into [lo, hi]."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def advance(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def post_readings(url, payload):
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
        self.profile = METER_PROFILES[self.sensor_type]
        self.meter = DriftingMeter(self.profile)
        self.pending_readings = []
        self.lock = threading.Lock()

    def _capture_reading(self):
        """One sampling tick with no scheduling side effects, so tests can call it without spawning a real Timer chain."""
        value = self.meter.advance()
        with self.lock:
            self.pending_readings.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _flush_readings(self):
        """One dispatch tick: swap the buffer out atomically so readings sampled mid-POST land in a fresh buffer, then ship it; on failure the batch is re-prepended so nothing is dropped."""
        with self.lock:
            batch, self.pending_readings = self.pending_readings, []
        if not batch:
            return None
        payload = {
            "sensor_type": self.sensor_type,
            "site_id": self.site_id,
            "unit": self.profile.unit,
            "readings": batch,
        }
        try:
            post_readings(self.fog_url, payload)
            print(f"{self.sensor_type} dispatched {len(batch)} readings", flush=True)
            return payload
        except urllib.error.URLError as exc:
            with self.lock:
                self.pending_readings = batch + self.pending_readings
            print(f"{self.sensor_type} dispatch failed, will retry: {exc}", flush=True)
            return None

    def _sample_cycle(self):
        self._capture_reading()
        threading.Timer(self.sample_interval, self._sample_cycle).start()

    def _dispatch_cycle(self):
        self._flush_readings()
        threading.Timer(self.dispatch_interval, self._dispatch_cycle).start()

    def run(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        # Independent self-rearming sample and dispatch chains, so tuning one interval never skews the other's cadence.
        threading.Timer(self.sample_interval, self._sample_cycle).start()
        threading.Timer(self.dispatch_interval, self._dispatch_cycle).start()
        threading.Event().wait()


def run():
    BuildingSensorAgent().run()


if __name__ == "__main__":
    run()
