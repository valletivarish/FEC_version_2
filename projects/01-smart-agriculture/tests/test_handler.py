import json

import handler

MESSAGE = {
    "sensor_type": "temperature",
    "site_id": "field-1",
    "unit": "C",
    "window_start": "s",
    "window_end": "e",
    "count": 3,
    "min": 20.0, "max": 24.0, "avg": 22.0, "latest": 23.0,
    "alerts": ["heat_stress"],
}


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):
        self.items.append(Item)


def test_lambda_handler_writes_each_record(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    event = {"Records": [{"body": json.dumps(MESSAGE)}]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 1}
    assert fake_table.items[0]["sensor_type"] == "temperature"
    assert fake_table.items[0]["avg"] == 22.0


def test_lambda_handler_processes_batch(monkeypatch):
    fake_table = FakeTable()
    monkeypatch.setattr(handler, "_table", fake_table)

    event = {"Records": [{"body": json.dumps(MESSAGE)}, {"body": json.dumps(MESSAGE)}]}
    result = handler.lambda_handler(event, None)

    assert result == {"processed": 2}
    assert len(fake_table.items) == 2
