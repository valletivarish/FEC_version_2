"""One asyncio gauge process per (signal, reach); sampler and dispatcher share a plain list, lock-free on the event loop."""
import asyncio
import os
from datetime import datetime, timezone

import aiohttp

PROFILES = {
    "river_level_m":     {"unit": "m",    "base": 2.0,  "lo": 0.5,  "hi": 8.0,  "calm": 0.05, "surge": 0.30},
    "rainfall_mmph":     {"unit": "mm/h", "base": 1.0,  "lo": 0.0,  "hi": 90.0, "calm": 0.8,  "surge": 8.0},
    "flow_velocity_ms":  {"unit": "m/s",  "base": 0.8,  "lo": 0.1,  "hi": 6.0,  "calm": 0.06, "surge": 0.45},
    "soil_moisture_pct": {"unit": "%",    "base": 45.0, "lo": 10.0, "hi": 100.0,"calm": 0.5,  "surge": 2.4},
    "turbidity_ntu":     {"unit": "NTU",  "base": 15.0, "lo": 1.0,  "hi": 800.0,"calm": 2.0,  "surge": 45.0},
}

import random


class RegimeGauge:
    def __init__(self, profile, rng=None):
        self.p = profile
        self.rng = rng or random.Random()
        self.value = profile["base"]
        self.storm_ticks = 0

    def next(self):
        p = self.p
        if self.storm_ticks == 0 and self.rng.random() < 0.04:
            self.storm_ticks = self.rng.randint(8, 20)
        if self.storm_ticks > 0:
            self.value += abs(self.rng.gauss(0, 1)) * p["surge"]
            self.storm_ticks -= 1
        else:
            self.value += (p["base"] - self.value) * 0.08 + self.rng.gauss(0, p["calm"])
        self.value = max(p["lo"], min(p["hi"], round(self.value, 2)))
        return self.value


async def _sample(gauge, buf, interval):
    while True:
        await asyncio.sleep(interval)
        buf.append({"ts": datetime.now(timezone.utc).isoformat(), "value": gauge.next()})


async def flush_once(session, url, buf, envelope):
    if not buf:
        return None
    batch = buf[:]
    del buf[:]
    payload = dict(envelope, readings=batch)
    try:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            await resp.read()
        return len(batch)
    except Exception:
        buf[:0] = batch
        return None


async def _dispatch(session, url, buf, interval, envelope):
    while True:
        await asyncio.sleep(interval)
        sent = await flush_once(session, url, buf, envelope)
        if sent:
            print(f"{envelope['sensor_type']}@{envelope['site_id']} sent {sent}", flush=True)


async def main():
    sensor_type = os.environ["SENSOR_TYPE"]
    profile = PROFILES[sensor_type]
    envelope = {
        "sensor_type": sensor_type,
        "site_id": os.getenv("SITE_ID", "reach-a"),
        "unit": profile["unit"],
    }
    sample_interval = float(os.getenv("SAMPLE_INTERVAL", "2"))
    dispatch_interval = float(os.getenv("DISPATCH_INTERVAL", "10"))
    fog_url = os.getenv("FOG_URL", "http://fog:8000/ingest")

    buf = []
    gauge = RegimeGauge(profile)
    async with aiohttp.ClientSession() as session:
        await asyncio.gather(
            _sample(gauge, buf, sample_interval),
            _dispatch(session, fog_url, buf, dispatch_interval, envelope),
        )


if __name__ == "__main__":
    asyncio.run(main())
