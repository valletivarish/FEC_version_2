import json
from decimal import Decimal

from conftest import load_module

handler = load_module("proc_handler", "backend/processor/handler.py")


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)


def sqs_record(sensor_type, site_id, window_end, avg=50.0):
    body = {
        "sensor_type": sensor_type, "site_id": site_id, "unit": "kW",
        "window_start": "2026-01-01T00:00:00+00:00", "window_end": window_end,
        "count": 4, "min": avg - 5, "max": avg + 5, "avg": avg, "latest": avg,
        "alerts": [],
    }
    return {"body": json.dumps(body)}


def test_lambda_handler_writes_one_item_per_record(monkeypatch):
    fake = FakeTable()
    monkeypatch.setattr(handler, "_table", fake)

    event = {"Records": [
        sqs_record("inverter_output_kw", "array-1", "t0"),
        sqs_record("panel_temp_c", "array-2", "t0"),
    ]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 2}
    assert len(fake.items) == 2


def test_lambda_handler_converts_floats_to_decimal_for_dynamodb(monkeypatch):
    fake = FakeTable()
    monkeypatch.setattr(handler, "_table", fake)

    handler.lambda_handler({"Records": [sqs_record("dc_voltage_v", "array-1", "t0", avg=401.25)]}, None)

    stored = fake.items[0]
    assert isinstance(stored["avg"], Decimal)
    assert stored["avg"] == Decimal("401.25")


def test_lambda_handler_preserves_the_sort_key_from_transform(monkeypatch):
    fake = FakeTable()
    monkeypatch.setattr(handler, "_table", fake)

    handler.lambda_handler({"Records": [sqs_record("soiling_index_pct", "array-2", "2026-02-02T00:00:00+00:00")]}, None)

    assert fake.items[0]["sort_key"] == "2026-02-02T00:00:00+00:00#array-2"
