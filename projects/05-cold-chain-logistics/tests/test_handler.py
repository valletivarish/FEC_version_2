import json

import pytest

import handler

SAMPLE_EVENT = {
    "sensor_type": "shock_vibration",
    "site_id": "container-1",
    "unit": "g",
    "window_start": "s",
    "window_end": "e",
    "count": 3,
    "min": 3.0, "max": 6.0, "avg": 5.0, "latest": 5.5,
    "alerts": ["impact_detected"],
}

MARSHAL_DISPATCH_CASES = [
    (True, {"BOOL": True}),
    (7, {"N": "7"}),
    (2.5, {"N": "2.5"}),
    ("hi", {"S": "hi"}),
    ([1, "x"], {"L": [{"N": "1"}, {"S": "x"}]}),
]


class RecordingDynamoStub:
    def __init__(self):
        self.put_calls = []

    def put_item(self, TableName, Item):
        self.put_calls.append({"TableName": TableName, "Item": Item})


@pytest.fixture
def dynamo_stub(monkeypatch):
    stub = RecordingDynamoStub()
    monkeypatch.setattr(handler, "_client", stub)
    return stub


def sqs_event(*bodies):
    return {"Records": [{"body": json.dumps(body)} for body in bodies]}


class TestLambdaHandler:
    @pytest.mark.parametrize("record_count", [1, 2, 5])
    def test_each_record_produces_one_put_call(self, dynamo_stub, record_count):
        result = handler.lambda_handler(sqs_event(*[SAMPLE_EVENT] * record_count), None)

        assert result == {"processed": record_count}
        assert len(dynamo_stub.put_calls) == record_count

    def test_written_item_reflects_source_fields(self, dynamo_stub):
        handler.lambda_handler(sqs_event(SAMPLE_EVENT), None)

        written = dynamo_stub.put_calls[0]
        assert written["TableName"] == handler.TABLE_NAME
        assert written["Item"]["sensor_type"] == {"S": "shock_vibration"}
        assert written["Item"]["avg"] == {"N": "5.0"}
        assert written["Item"]["alerts"] == {"L": [{"S": "impact_detected"}]}


class TestMarshal:
    @pytest.mark.parametrize("value,expected", MARSHAL_DISPATCH_CASES)
    def test_marshal_dispatches_by_type(self, value, expected):
        assert handler.marshal(value) == expected

    def test_unsupported_type_raises_type_error(self):
        with pytest.raises(TypeError):
            handler.marshal(object())

    def test_nested_mapping_recurses(self):
        item = handler.marshal_item({"meta": {"nested": 1}})
        assert item["meta"] == {"M": {"nested": {"N": "1"}}}

    def test_scalar_and_list_fields_via_marshal_item(self):
        record = {
            "site_id": "container-1",
            "count": 3,
            "avg": -18.5,
            "alerts": ["a", "b"],
        }
        item = handler.marshal_item(record)

        assert item["site_id"] == {"S": "container-1"}
        assert item["count"] == {"N": "3"}
        assert item["avg"] == {"N": "-18.5"}
        assert item["alerts"] == {"L": [{"S": "a"}, {"S": "b"}]}
