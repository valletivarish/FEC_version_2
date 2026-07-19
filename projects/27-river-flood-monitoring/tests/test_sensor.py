import random

from sensor import PROFILES, RegimeGauge, flush_once


class _NoStorm:
    def random(self):
        return 1.0

    def gauss(self, mu, sigma):
        return 0.0

    def randint(self, a, b):
        return a


class _AlwaysStorm:
    def random(self):
        return 0.0

    def gauss(self, mu, sigma):
        return 1.0

    def randint(self, a, b):
        return b


def test_gauge_stays_in_bounds():
    profile = PROFILES["river_level_m"]
    gauge = RegimeGauge(profile, random.Random(7))
    for _ in range(400):
        value = gauge.next()
        assert profile["lo"] <= value <= profile["hi"]


def test_gauge_recedes_toward_base_without_storm():
    gauge = RegimeGauge(PROFILES["river_level_m"], _NoStorm())
    gauge.value = 7.0
    assert gauge.next() < 7.0


def test_gauge_storm_pushes_up():
    gauge = RegimeGauge(PROFILES["river_level_m"], _AlwaysStorm())
    before = gauge.value
    gauge.next()
    assert gauge.value > before


class _OkResp:
    async def read(self):
        return b""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class _OkSession:
    def __init__(self):
        self.sent = []

    def post(self, url, json, timeout):
        self.sent.append(json)
        return _OkResp()


class _FailSession:
    def post(self, url, json, timeout):
        raise RuntimeError("down")


async def test_flush_sends_and_clears():
    buf = [{"ts": "t", "value": 3.0}]
    session = _OkSession()
    sent = await flush_once(session, "http://fog/ingest", buf,
                            {"sensor_type": "river_level_m", "site_id": "reach-a", "unit": "m"})
    assert sent == 1
    assert buf == []
    assert session.sent[0]["sensor_type"] == "river_level_m"


async def test_flush_retains_batch_on_failure():
    buf = [{"ts": "t", "value": 3.0}]
    sent = await flush_once(_FailSession(), "http://fog/ingest", buf,
                            {"sensor_type": "river_level_m", "site_id": "reach-a", "unit": "m"})
    assert sent is None
    assert len(buf) == 1


async def test_flush_empty_buffer_is_noop():
    assert await flush_once(_OkSession(), "u", [], {}) is None
