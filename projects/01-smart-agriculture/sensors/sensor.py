import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

PROFILES = {
    "soil_moisture":  {"unit": "%",   "lo": 8,  "hi": 45,     "start": 30,    "step": 1.5},
    "temperature":    {"unit": "C",   "lo": 2,  "hi": 42,     "start": 22,    "step": 0.8},
    "humidity":       {"unit": "%",   "lo": 25, "hi": 98,     "start": 60,    "step": 2.0},
    "light_intensity":{"unit": "lux", "lo": 0,  "hi": 100000, "start": 40000, "step": 6000},
    "rainfall":       {"unit": "mm",  "lo": 0,  "hi": 18,     "start": 0,     "step": 3.0},
}


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def next_value(current, profile):
    drift = random.uniform(-profile["step"], profile["step"])
    return round(clamp(current + drift, profile["lo"], profile["hi"]), 2)


def post_batch(url, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


def main():
    sensor_type = os.environ["SENSOR_TYPE"]
    site_id = os.getenv("SITE_ID", "field-1")
    sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
    dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
    fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")

    profile = PROFILES[sensor_type]
    value = profile["start"]
    buffer = []
    last_dispatch = time.monotonic()

    print(f"{sensor_type}@{site_id} sampling every {sample_interval}s, dispatching every {dispatch_interval}s", flush=True)

    while True:
        value = next_value(value, profile)
        buffer.append({"ts": datetime.now(timezone.utc).isoformat(), "value": value})

        if time.monotonic() - last_dispatch >= dispatch_interval and buffer:
            payload = {
                "sensor_type": sensor_type,
                "site_id": site_id,
                "unit": profile["unit"],
                "readings": buffer,
            }
            try:
                post_batch(fog_url, payload)
                print(f"{sensor_type} dispatched {len(buffer)} readings", flush=True)
                buffer = []
                last_dispatch = time.monotonic()
            except urllib.error.URLError as exc:
                print(f"{sensor_type} dispatch failed, will retry: {exc}", flush=True)

        time.sleep(sample_interval)


if __name__ == "__main__":
    main()
