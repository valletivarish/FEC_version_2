import json

from conftest import load_module

transform = load_module("bshm_transform", "backend/processor/transform.py")


def sample_message(**overrides):
    message = {
        "sensor_type": "strain_microstrain",
        "site_id": "span-a",
        "unit": "microstrain",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": "2026-01-01T00:00:10+00:00",
        "count": 5,
        "min": 300.0,
        "max": 1300.0,
        "avg": 900.0,
        "latest": 1300.0,
        "alerts": ["structural_stress_warning"],
    }
    message.update(overrides)
    return message


def test_process_accepts_dict():
    item = transform.process(sample_message())
    assert item["sensor_type"] == "strain_microstrain"
    assert item["avg"] == 900.0


def test_process_accepts_json_string():
    item = transform.process(json.dumps(sample_message()))
    assert item["sensor_type"] == "strain_microstrain"


def test_sort_key_is_window_end_hash_site_id():
    item = transform.process(sample_message())
    assert item["sort_key"] == "2026-01-01T00:00:10+00:00#span-a"


def test_sort_key_disambiguates_two_sites_same_window():
    item_a = transform.process(sample_message(site_id="span-a"))
    item_b = transform.process(sample_message(site_id="span-b"))
    assert item_a["sort_key"] != item_b["sort_key"]
    assert item_a["window_end"] == item_b["window_end"]


def test_site_id_defaults_to_span_a():
    message = sample_message()
    del message["site_id"]
    item = transform.process(message)
    assert item["site_id"] == "span-a"
    assert item["sort_key"].endswith("#span-a")


def test_alerts_default_to_empty_list():
    message = sample_message()
    del message["alerts"]
    item = transform.process(message)
    assert item["alerts"] == []
