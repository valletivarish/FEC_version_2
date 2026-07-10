import json

from conftest import load_module

transform = load_module("proc_transform", "backend/processor/transform.py")


def message(sensor_type="panel_temp_c", site_id="array-1", window_end="2026-01-01T00:00:10+00:00"):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": "C",
        "window_start": "2026-01-01T00:00:00+00:00", "window_end": window_end,
        "count": 5, "min": 30.0, "max": 42.0, "avg": 36.5, "latest": 35.0,
        "alerts": [],
    }


def test_to_item_builds_the_expected_flat_record():
    item = transform.to_item(json.dumps(message()))
    assert item["sensor_type"] == "panel_temp_c"
    assert item["site_id"] == "array-1"
    assert item["sort_key"] == "2026-01-01T00:00:10+00:00#array-1"
    assert item["avg"] == 36.5


def test_to_item_accepts_a_dict_body_not_only_a_json_string():
    item = transform.to_item(message(site_id="array-2"))
    assert item["sort_key"].endswith("#array-2")


def test_sort_key_disambiguates_same_window_end_across_sites():
    item1 = transform.to_item(message(site_id="array-1", window_end="t0"))
    item2 = transform.to_item(message(site_id="array-2", window_end="t0"))
    assert item1["sort_key"] != item2["sort_key"]
    assert item1["window_end"] == item2["window_end"] == "t0"


def test_missing_site_id_defaults_to_array_1():
    body = message()
    del body["site_id"]
    item = transform.to_item(body)
    assert item["site_id"] == "array-1"
    assert item["sort_key"].endswith("#array-1")


def test_alerts_default_to_empty_list_when_absent():
    body = message()
    del body["alerts"]
    item = transform.to_item(body)
    assert item["alerts"] == []
