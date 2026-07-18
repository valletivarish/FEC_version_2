import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from conftest import load_module

health = load_module("dash_health", "backend/dashboard/health.py")


def stub_recent_windows_fresh(sensor_type, limit, container_id=None):
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return [{"sensor_type": sensor_type, "site_id": "container-1", "window_end": now_iso,
              "min": 1.0, "max": 2.0, "avg": 1.5, "latest": 1.5, "count": 1, "unit": "x", "alerts": []}]


def stub_recent_windows_empty(sensor_type, limit, container_id=None):
    return []


class UrlopenStubResponse:
    def __init__(self, status, body=b""):
        self.status = status
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class SqsStubReachable:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": "http://queue"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:fcl-manifest-agg"}}


class SqsStubUnreachable:
    def get_queue_url(self, QueueName):
        raise RuntimeError("no queue")


class LambdaStubActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class LambdaStubPending:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Pending"}}


class LambdaStubMissing:
    def get_function(self, FunctionName):
        raise RuntimeError("function not found")


@pytest.fixture
def health_client():
    build = FastAPI()
    build.include_router(health.health_router)
    return TestClient(build)


@pytest.fixture
def urlopen_returning(monkeypatch):
    def _apply(status, body=b""):
        monkeypatch.setattr(health.urllib.request, "urlopen", lambda url, timeout: UrlopenStubResponse(status, body))
    return _apply


@pytest.fixture
def urlopen_raising(monkeypatch):
    def _apply(exc):
        def _raise(url, timeout):
            raise exc
        monkeypatch.setattr(health.urllib.request, "urlopen", _raise)
    return _apply


@pytest.fixture
def sqs_stub(monkeypatch):
    def _apply(stub):
        monkeypatch.setattr(health, "sqs", lambda: stub)
        return stub
    return _apply


@pytest.fixture
def lambda_stub(monkeypatch):
    def _apply(stub):
        monkeypatch.setattr(health, "lambda_client", lambda: stub)
        return stub
    return _apply


@pytest.fixture
def recent_windows_stub(monkeypatch):
    def _apply(stub_fn):
        monkeypatch.setattr(health, "recent_windows", stub_fn)
    return _apply


class TestCheckDepot:
    @pytest.mark.parametrize(
        "status, expected",
        [(200, True), (503, False), (404, False)],
    )
    def test_result_follows_http_status(self, urlopen_returning, status, expected):
        urlopen_returning(status)
        assert health.check_depot() is expected

    @pytest.mark.parametrize("exc", [OSError("unreachable"), ConnectionResetError("reset")])
    def test_false_when_urlopen_raises(self, urlopen_raising, exc):
        urlopen_raising(exc)
        assert health.check_depot() is False

    def test_false_on_url_error(self, urlopen_raising):
        urlopen_raising(health.urllib.error.URLError("connection refused"))
        assert health.check_depot() is False


class TestCheckQueue:
    @pytest.mark.parametrize(
        "stub_cls, expected",
        [(SqsStubReachable, True), (SqsStubUnreachable, False)],
    )
    def test_result_follows_queue_reachability(self, sqs_stub, stub_cls, expected):
        sqs_stub(stub_cls())
        assert health.check_queue() is expected


class TestCheckLambda:
    @pytest.mark.parametrize(
        "stub_cls, expected",
        [
            (LambdaStubActive, True),
            (LambdaStubMissing, False),
            (LambdaStubPending, False),
        ],
    )
    def test_result_follows_function_state(self, lambda_stub, stub_cls, expected):
        lambda_stub(stub_cls())
        assert health.check_lambda() is expected


class TestFreshestWindowAge:
    def test_returns_none_when_no_readings_anywhere(self, recent_windows_stub):
        recent_windows_stub(stub_recent_windows_empty)
        assert health.freshest_window_age() is None

    def test_returns_small_age_for_just_written_reading(self, recent_windows_stub):
        recent_windows_stub(stub_recent_windows_fresh)
        age = health.freshest_window_age()
        assert age is not None
        assert age < 5

    def test_picks_the_minimum_age_across_reading_types(self, recent_windows_stub):
        now = datetime.datetime.now(datetime.timezone.utc)
        stale = (now - datetime.timedelta(seconds=500)).isoformat()
        fresh = (now - datetime.timedelta(seconds=1)).isoformat()

        def mixed_recent(sensor_type, limit, container_id=None):
            window_end = fresh if sensor_type == "humidity" else stale
            return [{"sensor_type": sensor_type, "site_id": "container-1", "window_end": window_end,
                      "min": 1.0, "max": 2.0, "avg": 1.5, "latest": 1.5, "count": 1, "unit": "x", "alerts": []}]

        recent_windows_stub(mixed_recent)
        age = health.freshest_window_age()
        assert age < 5


class TestHealthRoute:
    def test_all_components_ok_when_everything_reachable_and_fresh(
        self, recent_windows_stub, sqs_stub, lambda_stub, urlopen_returning, health_client,
    ):
        recent_windows_stub(stub_recent_windows_fresh)
        sqs_stub(SqsStubReachable())
        lambda_stub(LambdaStubActive())
        urlopen_returning(200)

        body = health_client.get("/api/health").json()

        assert body == {
            "depot": True, "queue": True, "lambda": True,
            "pipeline": True, "freshest_age_seconds": body["freshest_age_seconds"],
        }
        assert body["freshest_age_seconds"] < 5

    def test_all_components_down_when_everything_unreachable(
        self, recent_windows_stub, sqs_stub, lambda_stub, urlopen_raising, health_client,
    ):
        recent_windows_stub(stub_recent_windows_empty)
        sqs_stub(SqsStubUnreachable())
        lambda_stub(LambdaStubMissing())
        urlopen_raising(health.urllib.error.URLError("connection refused"))

        body = health_client.get("/api/health").json()

        assert body["depot"] is False
        assert body["queue"] is False
        assert body["lambda"] is False
        assert body["pipeline"] is False
        assert body["freshest_age_seconds"] is None
