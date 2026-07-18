import pytest
from fastapi.testclient import TestClient

from conftest import load_module

routes = load_module("dash_routes", "backend/dashboard/routes.py")

READINGS_BY_TYPE = {
    "storage_temperature": [
        {"sensor_type": "storage_temperature", "site_id": "container-1", "window_end": "e1",
         "min": -20.0, "max": -18.0, "avg": -19.0, "latest": -18.5, "count": 4, "unit": "C", "alerts": []},
        {"sensor_type": "storage_temperature", "site_id": "container-2", "window_end": "e1",
         "min": -12.0, "max": -8.0, "avg": -10.0, "latest": -9.0, "count": 4, "unit": "C", "alerts": ["cold_chain_breach"]},
    ],
    "humidity": [
        {"sensor_type": "humidity", "site_id": "container-1", "window_end": "e1",
         "min": 50.0, "max": 55.0, "avg": 52.0, "latest": 53.0, "count": 3, "unit": "%", "alerts": []},
    ],
}


def stub_recent_windows(sensor_type, limit, container_id=None):
    items = READINGS_BY_TYPE.get(sensor_type, [])
    if container_id is not None:
        items = [entry for entry in items if entry["site_id"] == container_id]
    return items[-limit:]


class SqsStubReachable:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": "http://queue"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        return {"Attributes": {"ApproximateNumberOfMessages": "3", "ApproximateNumberOfMessagesNotVisible": "1"}}


class SqsStubUnreachable:
    def get_queue_url(self, QueueName):
        raise RuntimeError("no queue")


class DdbStubCount:
    def scan(self, TableName, Select):
        return {"Count": 42}


class DdbStubCountPaginated:
    """Splits the count across three Scan pages so the caller must follow LastEvaluatedKey."""

    def __init__(self):
        self.seen_start_keys = []

    def scan(self, TableName, Select, ExclusiveStartKey=None):
        self.seen_start_keys.append(ExclusiveStartKey)
        pages = {
            None: {"Count": 20, "LastEvaluatedKey": {"sort_key": "a"}},
            "a": {"Count": 15, "LastEvaluatedKey": {"sort_key": "b"}},
            "b": {"Count": 7},
        }
        key = ExclusiveStartKey["sort_key"] if ExclusiveStartKey else None
        return pages[key]


@pytest.fixture
def routes_app():
    from fastapi import FastAPI
    build = FastAPI()
    build.include_router(routes.readings_router)
    build.include_router(routes.ops_router)
    return TestClient(build)


@pytest.fixture
def recent_windows_stub(monkeypatch):
    def _apply(stub_fn):
        monkeypatch.setattr(routes, "recent_windows", stub_fn)
    return _apply


@pytest.fixture
def sqs_stub(monkeypatch):
    def _apply(stub):
        monkeypatch.setattr(routes, "sqs", lambda: stub)
        return stub
    return _apply


class TestReadingsRoute:
    def test_returns_all_items_for_type(self, recent_windows_stub, routes_app):
        recent_windows_stub(stub_recent_windows)
        body = routes_app.get("/api/readings?sensor_type=storage_temperature&limit=60").json()
        assert body["sensor_type"] == "storage_temperature"
        assert len(body["items"]) == 2

    def test_site_id_query_param_narrows_results(self, recent_windows_stub, routes_app):
        recent_windows_stub(stub_recent_windows)
        body = routes_app.get(
            "/api/readings?sensor_type=storage_temperature&limit=60&site_id=container-2"
        ).json()
        assert len(body["items"]) == 1
        assert body["items"][0]["site_id"] == "container-2"


class TestManifestRoute:
    def test_groups_by_container_rather_than_reading_type(self, recent_windows_stub, routes_app):
        recent_windows_stub(stub_recent_windows)
        body = routes_app.get("/api/manifest").json()
        by_id = {entry["container_id"]: entry for entry in body["containers"]}

        assert set(by_id) == {"container-1", "container-2"}
        assert by_id["container-1"]["readings"]["storage_temperature"]["latest"] == -18.5
        assert by_id["container-1"]["readings"]["humidity"]["latest"] == 53.0
        assert by_id["container-2"]["readings"]["storage_temperature"]["alerts"] == ["cold_chain_breach"]
        assert "humidity" not in by_id["container-2"]["readings"]


class TestBackendStatsRoute:
    def test_reports_queue_depth_and_item_count(self, sqs_stub, monkeypatch, routes_app):
        sqs_stub(SqsStubReachable())
        monkeypatch.setattr(routes, "table", lambda: DdbStubCount())
        body = routes_app.get("/api/backend-stats").json()
        assert body == {"queue": {"waiting": 3, "in_flight": 1}, "items_in_table": 42}

    def test_queue_depth_is_none_when_queue_lookup_fails(self, sqs_stub, monkeypatch, routes_app):
        sqs_stub(SqsStubUnreachable())
        monkeypatch.setattr(routes, "table", lambda: DdbStubCount())
        body = routes_app.get("/api/backend-stats").json()
        assert body["queue"] is None
        assert body["items_in_table"] == 42

    def test_item_count_sums_every_scan_page_not_just_the_first(self, sqs_stub, monkeypatch, routes_app):
        sqs_stub(SqsStubUnreachable())
        stub = DdbStubCountPaginated()
        monkeypatch.setattr(routes, "table", lambda: stub)
        body = routes_app.get("/api/backend-stats").json()
        assert body["items_in_table"] == 20 + 15 + 7
        assert stub.seen_start_keys == [None, {"sort_key": "a"}, {"sort_key": "b"}]


class TestThresholdsRoute:
    def test_response_is_proxied_and_cached_after_first_call(self, monkeypatch, routes_app):
        routes._thresholds_cache.reset()
        seen_urls = []

        class UrlopenStubResponse:
            def __init__(self, body):
                self._body = body

            def read(self):
                return self._body

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def fake_urlopen(url, timeout):
            seen_urls.append(url)
            return UrlopenStubResponse(
                b'{"storage_temperature": [{"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}]}',
            )

        monkeypatch.setattr(routes.urllib.request, "urlopen", fake_urlopen)

        first = routes_app.get("/api/thresholds").json()
        second = routes_app.get("/api/thresholds").json()

        assert first["storage_temperature"][0]["key"] == "cold_chain_breach"
        assert second == first
        assert len(seen_urls) == 1


class TestDeserializeItem:
    def test_converts_dynamodb_wire_format_to_native_types(self):
        raw = {
            "sensor_type": {"S": "storage_temperature"},
            "site_id": {"S": "container-1"},
            "count": {"N": "4"},
            "avg": {"N": "-19.5"},
            "alerts": {"L": [{"S": "cold_chain_breach"}]},
        }
        item = routes.deserialize_item(raw)
        assert item["sensor_type"] == "storage_temperature"
        assert item["count"] == 4
        assert isinstance(item["avg"], float)
        assert item["avg"] == -19.5
        assert item["alerts"] == ["cold_chain_breach"]

    @pytest.mark.parametrize("attr,expected", [
        ({"S": "x"}, "x"),
        ({"N": "10"}, 10),
        ({"N": "10.5"}, 10.5),
        ({"BOOL": True}, True),
    ])
    def test_scalar_attribute_types(self, attr, expected):
        item = routes.deserialize_item({"field": attr})
        assert item["field"] == expected
        if isinstance(expected, float):
            assert isinstance(item["field"], float)
