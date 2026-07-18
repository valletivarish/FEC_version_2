"""Solar farm sensor simulator: separate sample and dispatch threads, each gated by an Event().wait(timeout) that doubles as tick delay and shutdown signal."""

import json
import os
import random
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class PanelMetricProfile:
    unit: str
    lo: float
    hi: float
    start: float
    step: float


# One profile per metric this image can simulate; SENSOR_TYPE selects which one a container instance uses.
METRIC_PROFILES = {
    "irradiance_wm2": PanelMetricProfile(unit="W/m2", lo=0, hi=1200, start=600, step=80.0),
    "panel_temp_c": PanelMetricProfile(unit="C", lo=10, hi=80, start=35, step=3.0),
    "inverter_output_kw": PanelMetricProfile(unit="kW", lo=0, hi=150, start=70, step=10.0),
    "dc_voltage_v": PanelMetricProfile(unit="V", lo=300, hi=500, start=400, step=10.0),
    "soiling_index_pct": PanelMetricProfile(unit="%", lo=0, hi=60, start=8, step=2.0),
}


class PanelDriftWalk:
    """Bounded random walk: each step nudges the value by up to +/-profile.step and clamps it into [lo, hi]."""

    def __init__(self, profile):
        self.profile = profile
        self.value = profile.start

    def step(self):
        drift = random.uniform(-self.profile.step, self.profile.step)
        bounded = max(self.profile.lo, min(self.profile.hi, self.value + drift))
        self.value = round(bounded, 2)
        return self.value


def push_to_gateway(url, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


class PanelSensorAgent:
    def __init__(self):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "array-1")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = METRIC_PROFILES[self.sensor_type]
        self.walk = PanelDriftWalk(self.profile)
        self.buffer = []
        self.buffer_lock = threading.Lock()
        self.stop_event = threading.Event()

    def _do_sample(self):
        """One sampling tick, kept off the loop body so tests can call it without real threads."""
        value = self.walk.step()
        with self.buffer_lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _do_dispatch(self):
        """One dispatch tick: swap the buffer out atomically, then POST it; on failure requeue the batch so nothing drops."""
        with self.buffer_lock:
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
            push_to_gateway(self.fog_url, payload)
            print(f"{self.sensor_type}@{self.site_id} dispatched {len(batch)} readings", flush=True)
            return payload
        except urllib.error.URLError as exc:
            with self.buffer_lock:
                self.buffer = batch + self.buffer
            print(f"{self.sensor_type}@{self.site_id} dispatch failed, will retry: {exc}", flush=True)
            return None

    def _sample_loop(self):
        # wait() returns True the instant stop_event is set, so the loop exits without finishing a stale sleep.
        while not self.stop_event.wait(self.sample_interval):
            self._do_sample()

    def _dispatch_loop(self):
        while not self.stop_event.wait(self.dispatch_interval):
            self._do_dispatch()

    def run(self):
        print(
            f"{self.sensor_type}@{self.site_id} sampling every {self.sample_interval}s, "
            f"dispatching every {self.dispatch_interval}s",
            flush=True,
        )
        sampler = threading.Thread(target=self._sample_loop, name="sample-loop", daemon=True)
        dispatcher = threading.Thread(target=self._dispatch_loop, name="dispatch-loop", daemon=True)
        sampler.start()
        dispatcher.start()
        sampler.join()
        dispatcher.join()


def run():
    PanelSensorAgent().run()


if __name__ == "__main__":
    run()
