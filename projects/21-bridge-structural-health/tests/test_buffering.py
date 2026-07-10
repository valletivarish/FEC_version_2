import threading

import pytest
from conftest import load_module


@pytest.fixture
def buffering():
    # Fresh module import per test so RAW/_units don't leak between tests.
    return load_module("bshm_buffering", "fog/buffering.py")


def test_record_appends_flat_tuple(buffering):
    buffering.record("strain_microstrain", "span-a", 310.5, "t1")
    assert buffering.RAW == [("strain_microstrain", "span-a", 310.5, "t1")]


def test_raw_is_a_plain_list_not_a_mapping(buffering):
    assert isinstance(buffering.RAW, list)
    buffering.record("tilt_angle_deg", "span-b", 0.4, "t1")
    buffering.record("strain_microstrain", "span-a", 300.0, "t2")
    # Nothing about RAW is keyed by (sensor_type, site_id) -- it is just an
    # append-ordered list of the raw tuples.
    assert buffering.RAW == [
        ("tilt_angle_deg", "span-b", 0.4, "t1"),
        ("strain_microstrain", "span-a", 300.0, "t2"),
    ]


def test_group_by_key_is_pure_and_does_not_touch_raw(buffering):
    raw = [
        ("strain_microstrain", "span-a", 100.0, "t1"),
        ("strain_microstrain", "span-b", 200.0, "t2"),
        ("strain_microstrain", "span-a", 150.0, "t3"),
    ]
    grouped = buffering.group_by_key(raw)
    assert grouped == {
        ("strain_microstrain", "span-a"): [(100.0, "t1"), (150.0, "t3")],
        ("strain_microstrain", "span-b"): [(200.0, "t2")],
    }
    # group_by_key never mutates its input or the live buffer.
    assert raw == [
        ("strain_microstrain", "span-a", 100.0, "t1"),
        ("strain_microstrain", "span-b", 200.0, "t2"),
        ("strain_microstrain", "span-a", 150.0, "t3"),
    ]
    assert buffering.RAW == []


def test_snapshot_and_clear_resets_raw(buffering):
    buffering.record("strain_microstrain", "span-a", 1.0, "t1")
    buffering.record("strain_microstrain", "span-a", 2.0, "t2")
    raw, units = buffering.snapshot_and_clear()
    assert raw == [
        ("strain_microstrain", "span-a", 1.0, "t1"),
        ("strain_microstrain", "span-a", 2.0, "t2"),
    ]
    assert buffering.RAW == []


def test_snapshot_and_clear_returns_unit_map(buffering):
    buffering.set_unit("strain_microstrain", "microstrain")
    buffering.record("strain_microstrain", "span-a", 1.0, "t1")
    _raw, units = buffering.snapshot_and_clear()
    assert units == {"strain_microstrain": "microstrain"}


def test_writes_after_swap_land_in_fresh_list(buffering):
    buffering.record("strain_microstrain", "span-a", 1.0, "t1")
    buffering.snapshot_and_clear()
    buffering.record("strain_microstrain", "span-a", 2.0, "t2")
    assert buffering.RAW == [("strain_microstrain", "span-a", 2.0, "t2")]


def test_concurrent_record_calls_lose_no_readings(buffering):
    def writer(n):
        for i in range(n):
            buffering.record("strain_microstrain", "span-a", float(i), f"t{i}")

    threads = [threading.Thread(target=writer, args=(200,)) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(buffering.RAW) == 1600
