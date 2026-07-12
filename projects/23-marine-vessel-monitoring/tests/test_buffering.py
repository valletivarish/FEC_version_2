import pytest
from conftest import load_module

buffering = load_module("mvs_fog_buffering", "fog/buffering.py")


@pytest.fixture(autouse=True)
def clean_buffers():
    # snapshot_and_clear() intentionally never clears _units (a sensor
    # type's unit is expected to persist across windows in production, see
    # buffering.py) -- tests reset it explicitly for isolation between
    # test cases.
    buffering.snapshot_and_clear()
    buffering._units.clear()
    yield
    buffering.snapshot_and_clear()
    buffering._units.clear()


def test_record_groups_by_sensor_type_and_site_id():
    buffering.record("engine_room_temp_c", "vessel-a", "C", [{"ts": "t1", "value": 60.0}])
    buffering.record("engine_room_temp_c", "vessel-a", "C", [{"ts": "t2", "value": 65.0}])
    buffering.record("engine_room_temp_c", "vessel-b", "C", [{"ts": "t3", "value": 50.0}])

    snapshot, units = buffering.snapshot_and_clear()
    assert snapshot[("engine_room_temp_c", "vessel-a")] == [
        {"ts": "t1", "value": 60.0}, {"ts": "t2", "value": 65.0},
    ]
    assert snapshot[("engine_room_temp_c", "vessel-b")] == [{"ts": "t3", "value": 50.0}]
    assert units["engine_room_temp_c"] == "C"


def test_snapshot_and_clear_resets_buffer_for_next_window():
    buffering.record("hull_vibration_mm", "vessel-a", "mm/s", [{"ts": "t1", "value": 2.0}])
    buffering.snapshot_and_clear()
    snapshot, _units = buffering.snapshot_and_clear()
    assert snapshot == {}


def test_snapshot_omits_empty_groups():
    buffering._buffers[("passenger_count", "vessel-a")] = []
    snapshot, _units = buffering.snapshot_and_clear()
    assert ("passenger_count", "vessel-a") not in snapshot


def test_record_without_unit_does_not_overwrite_previously_seen_unit():
    buffering.record("fuel_consumption_lph", "vessel-a", "L/h", [{"ts": "t1", "value": 100.0}])
    buffering.record("fuel_consumption_lph", "vessel-a", "", [{"ts": "t2", "value": 110.0}])
    _snapshot, units = buffering.snapshot_and_clear()
    assert units["fuel_consumption_lph"] == "L/h"
