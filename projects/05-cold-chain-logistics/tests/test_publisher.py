import json

import pytest

import publisher


class FakeSqsClient:
    def __init__(self, url_results):
        self.url_results = list(url_results)
        self.sent = []

    def get_queue_url(self, QueueName):
        result = self.url_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return {"QueueUrl": result}

    def send_message(self, QueueUrl, MessageBody):
        self.sent.append((QueueUrl, MessageBody))


class ManualClock:
    """Fakes time.monotonic/time.sleep so backoff delays advance a virtual clock."""

    def __init__(self, start=0.0):
        self.now = start
        self.slept = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def failures_then_success(count, url="http://queue-url", error=RuntimeError):
    return [error("not ready")] * count + [url]


@pytest.fixture
def no_jitter(monkeypatch):
    monkeypatch.setattr(publisher.random, "uniform", lambda *_: 0.0)
    return monkeypatch


@pytest.fixture
def recorded_sleeps(monkeypatch):
    """Patch publisher.time.sleep to record every delay instead of actually waiting."""
    delays = []
    monkeypatch.setattr(publisher.time, "sleep", lambda seconds: delays.append(seconds))
    return delays


@pytest.fixture
def manual_clock(monkeypatch):
    clock = ManualClock()
    monkeypatch.setattr(publisher.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(publisher.time, "sleep", clock.sleep)
    return clock


def build_link(monkeypatch, fake_client):
    monkeypatch.setattr(publisher.boto3, "client", lambda *a, **kw: fake_client)
    return publisher.ShipmentLink("http://localstack:4566", "eu-west-1", "fcl-manifest-agg")


def bare_link(fake_client):
    """A ShipmentLink with only _client set, for exercising _find_queue directly."""
    link = publisher.ShipmentLink.__new__(publisher.ShipmentLink)
    link._client = fake_client
    return link


class TestQueueDiscovery:
    @pytest.mark.parametrize(
        "failures, expected_url",
        [
            (0, "http://queue-url"),
            (2, "http://queue-url"),
            (1, "http://other-queue"),
        ],
    )
    def test_resolves_queue_url_once_client_stops_erroring(self, monkeypatch, no_jitter, failures, expected_url):
        monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
        fake_client = FakeSqsClient(failures_then_success(failures, url=expected_url))
        link = build_link(monkeypatch, fake_client)
        assert link._queue_url == expected_url


class TestBackoffSchedule:
    @pytest.mark.parametrize(
        "failures, expected_delays",
        [
            (4, [0.25, 0.5, 1.0, 2.0]),
            (3, [0.25, 0.5, 1.0]),
        ],
    )
    def test_delay_sequence_doubles_up_to_the_cap(self, monkeypatch, no_jitter, recorded_sleeps, failures, expected_delays):
        fake_client = FakeSqsClient(failures_then_success(failures))
        link = build_link(monkeypatch, fake_client)
        assert link._queue_url == "http://queue-url"
        assert recorded_sleeps == expected_delays

    def test_delay_never_exceeds_the_configured_max_backoff(self, monkeypatch, no_jitter, recorded_sleeps):
        fake_client = FakeSqsClient(failures_then_success(8))
        build_link(monkeypatch, fake_client)
        assert max(recorded_sleeps) <= publisher.MAX_BACKOFF_SECONDS
        assert recorded_sleeps[-3:] == [publisher.MAX_BACKOFF_SECONDS] * 3

    def test_each_delay_before_the_cap_is_roughly_double_the_previous(self, monkeypatch, no_jitter, recorded_sleeps):
        fake_client = FakeSqsClient(failures_then_success(3))
        build_link(monkeypatch, fake_client)
        for prior, current in zip(recorded_sleeps, recorded_sleeps[1:]):
            if current >= publisher.MAX_BACKOFF_SECONDS:
                continue
            assert current == pytest.approx(prior * 2)

    def test_jitter_is_added_on_top_of_the_base_delay(self, monkeypatch, recorded_sleeps):
        fake_client = FakeSqsClient(failures_then_success(1))
        monkeypatch.setattr(publisher.random, "uniform", lambda lo, hi: hi)
        build_link(monkeypatch, fake_client)
        assert recorded_sleeps == [publisher.INITIAL_BACKOFF_SECONDS + publisher.JITTER_MAX_SECONDS]


class TestBackoffBudget:
    def test_gives_up_once_the_time_budget_is_exceeded(self, no_jitter, manual_clock):
        link = bare_link(FakeSqsClient([RuntimeError("never ready")] * 1000))
        with pytest.raises(RuntimeError, match="fcl-manifest-agg"):
            link._find_queue("fcl-manifest-agg")
        assert manual_clock.now >= publisher.BACKOFF_BUDGET_SECONDS

    def test_stops_retrying_promptly_after_the_deadline_rather_than_overshooting_far(self, no_jitter, manual_clock):
        link = bare_link(FakeSqsClient([RuntimeError("never ready")] * 1000))
        with pytest.raises(RuntimeError):
            link._find_queue("fcl-manifest-agg")
        overshoot = manual_clock.now - publisher.BACKOFF_BUDGET_SECONDS
        assert overshoot < publisher.MAX_BACKOFF_SECONDS + publisher.JITTER_MAX_SECONDS

    @pytest.mark.parametrize("failures", [0, 3])
    def test_succeeding_before_the_deadline_does_not_raise(self, no_jitter, manual_clock, failures):
        link = bare_link(FakeSqsClient(failures_then_success(failures)))
        assert link._find_queue("fcl-manifest-agg") == "http://queue-url"


class TestShip:
    @pytest.mark.parametrize(
        "payloads",
        [
            [{"sensor_type": "storage_temperature", "avg": -18.0}],
            [{"seq": 1}, {"seq": 2}],
        ],
    )
    def test_ship_sends_json_encoded_payloads_in_order(self, monkeypatch, no_jitter, payloads):
        monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
        fake_client = FakeSqsClient(["http://queue-url"])
        link = build_link(monkeypatch, fake_client)

        for payload in payloads:
            link.ship(payload)

        assert [json.loads(body) for _, body in fake_client.sent] == payloads
        assert all(queue_url == "http://queue-url" for queue_url, _ in fake_client.sent)


class TestContextManagerUsage:
    def test_link_used_as_its_own_context_manager_returns_itself(self, monkeypatch, no_jitter):
        monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
        fake_client = FakeSqsClient(["http://queue-url"])
        link = build_link(monkeypatch, fake_client)

        with link as entered:
            assert entered is link

    def test_open_shipment_link_yields_a_connected_link_ready_to_ship(self, monkeypatch, no_jitter):
        monkeypatch.setattr(publisher.time, "sleep", lambda *_: None)
        fake_client = FakeSqsClient(["http://queue-url"])
        monkeypatch.setattr(publisher.boto3, "client", lambda *a, **kw: fake_client)

        with publisher.open_shipment_link("http://localstack:4566", "eu-west-1", "fcl-manifest-agg") as link:
            link.ship({"seq": 1})

        assert json.loads(fake_client.sent[0][1]) == {"seq": 1}

    def test_open_shipment_link_propagates_queue_discovery_failure(self, monkeypatch, no_jitter, manual_clock):
        fake_client = FakeSqsClient([RuntimeError("never ready")] * 1000)
        monkeypatch.setattr(publisher.boto3, "client", lambda *a, **kw: fake_client)

        with pytest.raises(RuntimeError, match="fcl-manifest-agg"):
            with publisher.open_shipment_link("http://localstack:4566", "eu-west-1", "fcl-manifest-agg"):
                pass
