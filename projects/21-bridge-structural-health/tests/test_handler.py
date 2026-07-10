import json
from decimal import Decimal

from conftest import load_module

handler = load_module("bshm_handler", "backend/processor/handler.py")


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)


def sqs_record(sensor_type="strain_microstrain", site_id="span-a", window_end="2026-01-01T00:00:10+00:00"):
    body = {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": "microstrain",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": window_end,
        "count": 3,
        "min": 300.0,
        "max": 1300.5,
        "avg": 900.25,
        "latest": 1300.5,
        "alerts": ["structural_stress_warning"],
    }
    return {"body": json.dumps(body)}


def test_to_item_converts_floats_to_decimal():
    item = handler.to_item({"avg": 900.25, "count": 3, "alerts": []})
    assert isinstance(item["avg"], Decimal)
    assert item["avg"] == Decimal("900.25")


def test_lambda_handler_writes_one_item_per_record(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    event = {"Records": [sqs_record()]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 1}
    assert len(fake_table.items) == 1
    assert fake_table.items[0]["sensor_type"] == "strain_microstrain"
    assert fake_table.items[0]["sort_key"] == "2026-01-01T00:00:10+00:00#span-a"
    assert fake_table.items[0]["avg"] == Decimal("900.25")


def test_lambda_handler_handles_multi_record_batch(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    event = {"Records": [
        sqs_record(site_id="span-a"),
        sqs_record(site_id="span-b"),
        sqs_record(sensor_type="deck_vibration_mms", site_id="span-a"),
    ]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 3}
    assert len(fake_table.items) == 3
    # Uniqueness is (sensor_type, sort_key) together, not sort_key alone --
    # two different sensor_types may legitimately share a sort_key since
    # sensor_type is the partition key.
    keys = {(item["sensor_type"], item["sort_key"]) for item in fake_table.items}
    assert len(keys) == 3
