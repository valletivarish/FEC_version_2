import threading

from conftest import load_module

buffering = load_module("fog_buffering", "fog/buffering.py")


def test_record_appends_into_active_buffer():
    buf = buffering.CombinerBuffer()
    buf.record("irradiance_wm2", "array-1", "W/m2", [{"ts": "t0", "value": 500.0}])
    buf.record("irradiance_wm2", "array-1", "W/m2", [{"ts": "t1", "value": 510.0}])
    assert buf.active[("irradiance_wm2", "array-1")] == [
        {"ts": "t0", "value": 500.0}, {"ts": "t1", "value": 510.0},
    ]


def test_swap_returns_only_non_empty_groups_and_units():
    buf = buffering.CombinerBuffer()
    buf.record("panel_temp_c", "array-1", "C", [{"ts": "t0", "value": 40.0}])
    buf.record("dc_voltage_v", "array-2", "V", [{"ts": "t0", "value": 400.0}])

    snapshot, units = buf.swap()

    assert snapshot == {
        ("panel_temp_c", "array-1"): [{"ts": "t0", "value": 40.0}],
        ("dc_voltage_v", "array-2"): [{"ts": "t0", "value": 400.0}],
    }
    assert units == {"panel_temp_c": "C", "dc_voltage_v": "V"}


def test_swap_is_a_reference_swap_not_a_copy():
    buf = buffering.CombinerBuffer()
    original_active_obj = buf.active
    original_flushing_obj = buf.flushing

    buf.swap()

    # After one swap the objects trade roles, proving swap() re-points the two names rather than allocating fresh dicts.
    assert buf.flushing is original_active_obj
    assert buf.active is original_flushing_obj


def test_readings_recorded_after_a_swap_land_in_the_new_active_buffer_not_the_old_one():
    buf = buffering.CombinerBuffer()
    buf.record("soiling_index_pct", "array-1", "%", [{"ts": "t0", "value": 5.0}])
    snapshot, _ = buf.swap()
    assert snapshot == {("soiling_index_pct", "array-1"): [{"ts": "t0", "value": 5.0}]}

    buf.record("soiling_index_pct", "array-1", "%", [{"ts": "t1", "value": 6.0}])
    snapshot2, _ = buf.swap()
    assert snapshot2 == {("soiling_index_pct", "array-1"): [{"ts": "t1", "value": 6.0}]}


def test_swap_with_nothing_recorded_returns_empty_snapshot():
    buf = buffering.CombinerBuffer()
    snapshot, units = buf.swap()
    assert snapshot == {}
    assert units == {}


def test_concurrent_record_calls_do_not_lose_readings():
    buf = buffering.CombinerBuffer()

    def writer(offset):
        for i in range(200):
            buf.record("inverter_output_kw", "array-1", "kW", [{"ts": str(offset + i), "value": float(i)}])

    threads = [threading.Thread(target=writer, args=(t * 1000,)) for t in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    snapshot, _ = buf.swap()
    assert len(snapshot[("inverter_output_kw", "array-1")]) == 800
