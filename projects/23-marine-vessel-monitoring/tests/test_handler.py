import json
from decimal import Decimal

from conftest import load_module

handler = load_module("mvs_processor_handler", "backend/processor/handler.py")

MESSAGE_BODY = json.dumps({
    "sensor_type": "ballast_water_level_pct",
    "site_id": "vessel-b",
    "unit": "%",
    "window_start": "2026-01-01T00:00:00+00:00",
    "window_end": "2026-01-01T00:00:10+00:00",
    "count": 2,
    "min": 88.0,
    "max": 93.0,
    "avg": 91.5,
    "latest": 93.0,
    "alerts": ["ballast_overfill_risk"],
})


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)


def test_to_item_converts_floats_to_decimal():
    item = handler.to_item({"avg": 91.5, "nested": {"max": 93.0}, "alerts": []})
    assert isinstance(item["avg"], Decimal)
    assert isinstance(item["nested"]["max"], Decimal)


def test_lambda_handler_writes_one_item_per_record(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    event = {"Records": [{"body": MESSAGE_BODY}]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 1}
    assert len(fake_table.items) == 1
    item = fake_table.items[0]
    assert item["sensor_type"] == "ballast_water_level_pct"
    assert item["sort_key"] == "2026-01-01T00:00:10+00:00#vessel-b"
    assert item["avg"] == Decimal("91.5")


def test_lambda_handler_processes_multiple_records(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    second_body = MESSAGE_BODY.replace("vessel-b", "vessel-a")
    event = {"Records": [{"body": MESSAGE_BODY}, {"body": second_body}]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 2}
    assert len(fake_table.items) == 2
