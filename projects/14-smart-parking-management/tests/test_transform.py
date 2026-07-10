import json

import pytest

from conftest import load_module

transform = load_module("processor_transform", "backend/processor/transform.py")


def sample_message(**overrides):
    message = {
        "sensor_type": "occupied_spaces",
        "site_id": "lot-a",
        "unit": "count",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": "2026-01-01T00:00:10+00:00",
        "count": 5,
        "min": 70.0, "max": 90.0, "avg": 80.0, "latest": 85.0,
        "alerts": [],
    }
    message.update(overrides)
    return message


class TestToItem:
    def test_accepts_a_json_string_body(self):
        item = transform.to_item(json.dumps(sample_message()))
        assert item["sensor_type"] == "occupied_spaces"

    def test_accepts_an_already_decoded_dict(self):
        item = transform.to_item(sample_message())
        assert item["sensor_type"] == "occupied_spaces"

    def test_sort_key_is_window_end_hash_site_id(self):
        item = transform.to_item(sample_message(window_end="e1", site_id="lot-b"))
        assert item["sort_key"] == "e1#lot-b"

    def test_two_lots_in_the_same_flush_get_distinct_sort_keys(self):
        item_a = transform.to_item(sample_message(window_end="e1", site_id="lot-a"))
        item_b = transform.to_item(sample_message(window_end="e1", site_id="lot-b"))
        assert item_a["sort_key"] != item_b["sort_key"]

    def test_missing_site_id_defaults_to_lot_a(self):
        message = sample_message()
        del message["site_id"]
        item = transform.to_item(message)
        assert item["site_id"] == "lot-a"
        assert item["sort_key"].endswith("#lot-a")

    def test_missing_required_field_raises_key_error(self):
        message = sample_message()
        del message["avg"]
        with pytest.raises(KeyError):
            transform.to_item(message)

    def test_carries_alerts_through(self):
        item = transform.to_item(sample_message(alerts=["near_full_capacity"]))
        assert item["alerts"] == ["near_full_capacity"]
