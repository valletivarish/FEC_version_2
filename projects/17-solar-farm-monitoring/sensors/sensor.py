"""Solar farm sensor simulator: one process per (sensor_type, site_id) pair.

5th distinct sensor-loop structure in the portfolio's Python projects. 01
uses a single `while True: ... time.sleep(...)` loop. 05 uses the stdlib
`sched` scheduler with two self-re-entering events on one queue. 12 uses two
independently self-rearming `threading.Timer` chains.

Here sampling and dispatch are two genuinely separate `threading.Thread`
loops, each driven by `threading.Event().wait(timeout)` instead of
`time.sleep`: the wait doubles as both the tick delay and the shutdown
signal (a set stop_event returns True from wait() immediately and both
loops exit), so no third mechanism is needed to stop the threads cleanly.
Unlike 12's Timer chains -- which discard and re-arm a new Timer object
every tick -- these two threads live for the process lifetime and simply
loop internally.
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


# One profile per reading type this sensor image can simulate. SENSOR_TYPE
# (see PanelSensorAgent) selects which profile a given container instance
# uses.
PROFILES = {
    "irradiance_wm2": ReadingProfile(unit="W/m2", lo=0, hi=1200, start=600, step=80.0),
    "panel_temp_c": ReadingProfile(unit="C", lo=10, hi=80, start=35, step=3.0),
    "inverter_output_kw": ReadingProfile(unit="kW", lo=0, hi=150, start=70, step=10.0),
    "dc_voltage_v": ReadingProfile(unit="V", lo=300, hi=500, start=400, step=10.0),
    "soiling_index_pct": ReadingProfile(unit="%", lo=0, hi=60, start=8, step=2.0),
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


class PanelSensorAgent:
    def __init__(self):
        self.sensor_type = os.environ["SENSOR_TYPE"]
        self.site_id = os.getenv("SITE_ID", "array-1")
        self.sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
        self.dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
        self.fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
        self.profile = PROFILES[self.sensor_type]
        self.walk = RandomWalk(self.profile)
        self.buffer = []
        self.buffer_lock = threading.Lock()
        self.stop_event = threading.Event()

    def _do_sample(self):
        """One sampling tick's work, kept separate from the loop body so
        tests can call it directly without spinning up real threads."""
        value = self.walk.step()
        with self.buffer_lock:
            self.buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        return value

    def _do_dispatch(self):
        """One dispatch tick's work: swaps the buffer out atomically so
        readings sampled during the network call land in a fresh buffer
        instead of racing the in-flight POST. On failure the batch is put
        back in front of the buffer so nothing is dropped."""
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
            ship_batch(self.fog_url, payload)
            print(f"{self.sensor_type}@{self.site_id} dispatched {len(batch)} readings", flush=True)
            return payload
        except urllib.error.URLError as exc:
            with self.buffer_lock:
                self.buffer = batch + self.buffer
            print(f"{self.sensor_type}@{self.site_id} dispatch failed, will retry: {exc}", flush=True)
            return None

    def _sample_loop(self):
        # wait() returns True the instant stop_event is set, so the loop
        # exits promptly instead of finishing out a stale sleep.
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
