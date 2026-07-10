import json

import pytest

from conftest import load_module

transform = load_module("processor_transform", "backend/processor/transform.py")


def sample_message(**overrides):
    message = {
        "sensor_type": "charging_current_a",
        "site_id": "hub-1",
        "unit": "A",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": "2026-01-01T00:00:10+00:00",
        "count": 5,
        "min": 15.0, "max": 20.0, "avg": 17.5, "latest": 18.0,
        "alerts": [],
    }
    message.update(overrides)
    return message


class TestToItem:
    def test_accepts_a_json_string_body(self):
        item = transform.to_item(json.dumps(sample_message()))
        assert item["sensor_type"] == "charging_current_a"

    def test_accepts_an_already_decoded_dict(self):
        item = transform.to_item(sample_message())
        assert item["sensor_type"] == "charging_current_a"

    def test_sort_key_is_window_end_hash_site_id(self):
        item = transform.to_item(sample_message(window_end="e1", site_id="hub-2"))
        assert item["sort_key"] == "e1#hub-2"

    def test_two_hubs_in_the_same_flush_get_distinct_sort_keys(self):
        item_a = transform.to_item(sample_message(window_end="e1", site_id="hub-1"))
        item_b = transform.to_item(sample_message(window_end="e1", site_id="hub-2"))
        assert item_a["sort_key"] != item_b["sort_key"]

    def test_missing_site_id_defaults_to_hub_1(self):
        message = sample_message()
        del message["site_id"]
        item = transform.to_item(message)
        assert item["site_id"] == "hub-1"
        assert item["sort_key"].endswith("#hub-1")

    def test_missing_required_field_raises_key_error(self):
        message = sample_message()
        del message["avg"]
        with pytest.raises(KeyError):
            transform.to_item(message)

    def test_carries_alerts_through(self):
        item = transform.to_item(sample_message(alerts=["overcurrent"]))
        assert item["alerts"] == ["overcurrent"]
