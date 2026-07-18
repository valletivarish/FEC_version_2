"""Bridge sensor simulator: sampling and dispatch run as two separate OS processes linked only by a multiprocessing.Queue (a real OS pipe)."""

import json
import multiprocessing as mp
import os
import queue
import random
import signal
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
# selects which profile a given container instance uses. expansion_joint_mm
# can go negative (contraction), unlike every other bridge reading.
PROFILES = {
    "strain_microstrain": ReadingProfile(unit="microstrain", lo=0, hi=2000, start=300, step=100.0),
    "deck_vibration_mms": ReadingProfile(unit="mm/s", lo=0, hi=30, start=2, step=1.5),
    "tilt_angle_deg": ReadingProfile(unit="deg", lo=0, hi=5, start=0.3, step=0.15),
    "traffic_load_tonnes": ReadingProfile(unit="tonnes", lo=0, hi=200, start=40, step=15.0),
    "expansion_joint_mm": ReadingProfile(unit="mm", lo=-50, hi=50, start=5, step=3.0),
}


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def next_value(current, profile):
    drift = random.uniform(-profile.step, profile.step)
    return round(clamp(current + drift, profile.lo, profile.hi), 2)


def ship_batch(url, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


def sample_process(outbox, sensor_type, sample_interval, stop_event):
    """Runs as its own OS process for the lifetime of the container. Every
    sample_interval seconds it nudges the random walk and puts one
    {"ts", "value"} reading onto the shared outbox queue. Never talks to
    the network -- that is the dispatch process's job."""
    profile = PROFILES[sensor_type]
    value = profile.start
    while not stop_event.is_set():
        value = next_value(value, profile)
        outbox.put({"ts": datetime.now(timezone.utc).isoformat(), "value": value})
        stop_event.wait(sample_interval)


def dispatch_process(outbox, sensor_type, site_id, unit, dispatch_interval, fog_url, stop_event):
    """Runs as its own OS process for the lifetime of the container. Every
    dispatch_interval seconds it drains whatever the sample process has
    queued and POSTs it as one batch to the fog node. On failure the drained
    batch is kept and retried on the next tick so no reading is dropped by
    a transient network error."""
    buffer = []
    while True:
        stop_event.wait(dispatch_interval)
        while True:
            try:
                buffer.append(outbox.get_nowait())
            except queue.Empty:
                break

        if buffer:
            payload = {
                "sensor_type": sensor_type,
                "site_id": site_id,
                "unit": unit,
                "readings": buffer,
            }
            try:
                ship_batch(fog_url, payload)
                print(f"{sensor_type}@{site_id} dispatched {len(buffer)} readings", flush=True)
                buffer = []
            except urllib.error.URLError as exc:
                print(f"{sensor_type}@{site_id} dispatch failed, will retry: {exc}", flush=True)

        if stop_event.is_set():
            break


def run():
    sensor_type = os.environ["SENSOR_TYPE"]
    site_id = os.getenv("SITE_ID", "span-a")
    sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
    dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
    fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")
    profile = PROFILES[sensor_type]

    outbox = mp.Queue()
    stop_event = mp.Event()

    sampler = mp.Process(
        target=sample_process,
        args=(outbox, sensor_type, sample_interval, stop_event),
        name="sampler",
    )
    dispatcher = mp.Process(
        target=dispatch_process,
        args=(outbox, sensor_type, site_id, profile.unit, dispatch_interval, fog_url, stop_event),
        name="dispatcher",
    )

    def handle_termination(signum, frame):
        # Docker sends SIGTERM to PID 1 (this process) on `docker stop`.
        # stop_event is a real multiprocessing.Event backed by shared OS
        # synchronisation primitives, so setting it here wakes both child
        # processes' stop_event.wait() calls immediately.
        stop_event.set()

    signal.signal(signal.SIGTERM, handle_termination)
    signal.signal(signal.SIGINT, handle_termination)

    sampler.start()
    dispatcher.start()
    print(
        f"{sensor_type}@{site_id} sampling every {sample_interval}s "
        f"(pid {sampler.pid}), dispatching every {dispatch_interval}s (pid {dispatcher.pid})",
        flush=True,
    )

    while not stop_event.is_set():
        stop_event.wait(1)

    sampler.join(timeout=5)
    dispatcher.join(timeout=5)
    if sampler.is_alive():
        sampler.terminate()
    if dispatcher.is_alive():
        dispatcher.terminate()


if __name__ == "__main__":
    # Docker's Linux containers already default to "fork", but the start
    # method is set explicitly so behaviour never silently changes if the
    # base image or Python version ever switches the platform default.
    try:
        mp.set_start_method("fork")
    except RuntimeError:
        pass
    run()
