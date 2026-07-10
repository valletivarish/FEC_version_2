import json

from conftest import load_module

handler = load_module("processor_handler", "backend/processor/handler.py")

MESSAGE = {
    "sensor_type": "grid_load_kw",
    "site_id": "hub-1",
    "unit": "kW",
    "window_start": "s",
    "window_end": "e",
    "count": 3,
    "min": 40.0, "max": 60.0, "avg": 50.0, "latest": 55.0,
    "alerts": ["grid_strain"],
}


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)


class TestLambdaHandler:
    def test_writes_each_record_to_the_table(self, monkeypatch):
        fake_table = FakeTable()
        monkeypatch.setattr(handler, "_table", fake_table)

        event = {"Records": [{"body": json.dumps(MESSAGE)}]}
        result = handler.lambda_handler(event, None)

        assert result == {"processed": 1}
        assert fake_table.items[0]["sensor_type"] == "grid_load_kw"
        assert fake_table.items[0]["sort_key"] == "e#hub-1"
        assert fake_table.items[0]["avg"] == 50.0

    def test_processes_a_batch_of_multiple_records(self, monkeypatch):
        fake_table = FakeTable()
        monkeypatch.setattr(handler, "_table", fake_table)

        event = {"Records": [{"body": json.dumps(MESSAGE)}, {"body": json.dumps(MESSAGE)}]}
        result = handler.lambda_handler(event, None)

        assert result == {"processed": 2}
        assert len(fake_table.items) == 2

    def test_float_fields_are_converted_to_decimal_for_dynamodb(self, monkeypatch):
        from decimal import Decimal

        fake_table = FakeTable()
        monkeypatch.setattr(handler, "_table", fake_table)

        handler.lambda_handler({"Records": [{"body": json.dumps(MESSAGE)}]}, None)

        assert isinstance(fake_table.items[0]["avg"], Decimal)
        assert isinstance(fake_table.items[0]["min"], Decimal)
