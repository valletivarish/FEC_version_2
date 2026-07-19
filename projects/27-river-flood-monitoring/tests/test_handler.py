import handler


class _Writer:
    def __init__(self, sink):
        self.sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def put_item(self, Item):
        self.sink.append(Item)


class _Table:
    def __init__(self):
        self.items = []

    def batch_writer(self):
        return _Writer(self.items)


def test_handler_batch_writes_every_record(monkeypatch):
    table = _Table()
    monkeypatch.setattr(handler, "_table", table)
    event = {"Records": [
        {"body": '{"sensor_type":"river_level_m","site_id":"reach-a","window_start":"s","window_end":"e","count":1,"min":3,"max":3,"avg":3,"latest":3,"rise_mph":0.1,"alerts":[]}'},
        {"body": '{"sensor_type":"rainfall_mmph","site_id":"reach-b","window_start":"s","window_end":"e2","count":1,"min":1,"max":1,"avg":1,"latest":1}'},
    ]}
    result = handler.lambda_handler(event, None)
    assert result["processed"] == 2
    assert len(table.items) == 2
    assert table.items[0]["sort_key"] == "e#reach-a"
