import json

from conftest import load_module

transform = load_module("mvs_processor_transform", "backend/processor/transform.py")

MESSAGE = {
    "sensor_type": "engine_room_temp_c",
    "site_id": "vessel-a",
    "unit": "C",
    "window_start": "2026-01-01T00:00:00+00:00",
    "window_end": "2026-01-01T00:00:10+00:00",
    "count": 3,
    "min": 60.0,
    "max": 80.0,
    "avg": 70.0,
    "latest": 75.0,
    "alerts": ["engine_overheat_risk"],
}


def test_process_builds_sort_key_from_window_end_and_site_id():
    record = transform.process(json.dumps(MESSAGE))
    assert record["sort_key"] == "2026-01-01T00:00:10+00:00#vessel-a"


def test_process_accepts_dict_or_json_string():
    from_dict = transform.process(dict(MESSAGE))
    from_str = transform.process(json.dumps(MESSAGE))
    assert from_dict == from_str


def test_process_preserves_all_fields():
    record = transform.process(dict(MESSAGE))
    assert record["sensor_type"] == "engine_room_temp_c"
    assert record["site_id"] == "vessel-a"
    assert record["unit"] == "C"
    assert record["min"] == 60.0
    assert record["max"] == 80.0
    assert record["avg"] == 70.0
    assert record["latest"] == 75.0
    assert record["alerts"] == ["engine_overheat_risk"]


def test_process_defaults_site_id_when_absent():
    payload = dict(MESSAGE)
    del payload["site_id"]
    record = transform.process(payload)
    assert record["site_id"] == "vessel-a"
    assert record["sort_key"].endswith("#vessel-a")


def test_process_defaults_unit_and_alerts_when_absent():
    payload = dict(MESSAGE)
    del payload["unit"]
    del payload["alerts"]
    record = transform.process(payload)
    assert record["unit"] == ""
    assert record["alerts"] == []


def test_two_vessels_same_window_end_get_distinct_sort_keys():
    a = transform.process({**MESSAGE, "site_id": "vessel-a"})
    b = transform.process({**MESSAGE, "site_id": "vessel-b"})
    assert a["sort_key"] != b["sort_key"]
