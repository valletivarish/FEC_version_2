import datetime

from conftest import load_module

data_access = load_module("mvs_data_access", "backend/dashboard/data_access.py")


class FakeTable:
    """Rows are stored oldest-first, mirroring real insertion order. query()
    honours ScanIndexForward/Limit the same way DynamoDB does, reading the
    sensor_type equality value straight out of the boto3 Key condition."""

    def __init__(self, rows):
        self.rows = rows

    def query(self, KeyConditionExpression, ScanIndexForward=True, Limit=None):
        sensor_type = KeyConditionExpression._values[1]
        matching = [r for r in self.rows if r["sensor_type"] == sensor_type]
        if not ScanIndexForward:
            matching = list(reversed(matching))
        if Limit is not None:
            matching = matching[:Limit]
        return {"Items": matching}

    def scan(self, Select=None):
        return {"Count": len(self.rows)}


def make_row(sensor_type, site_id, window_end, avg, max_value=None, alerts=None):
    return {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": "C" if sensor_type == "engine_room_temp_c" else "mm/s",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": window_end,
        "count": 3,
        "min": avg - 10,
        "max": max_value if max_value is not None else avg + 10,
        "avg": avg,
        "latest": avg,
        "alerts": alerts or [],
    }


ENGINE_ROWS = [
    make_row("engine_room_temp_c", "vessel-a", "2026-01-01T00:00:10+00:00", 60.0),
    make_row("engine_room_temp_c", "vessel-b", "2026-01-01T00:00:10+00:00", 65.0),
    make_row("engine_room_temp_c", "vessel-a", "2026-01-01T00:00:20+00:00", 80.0, alerts=["engine_overheat_risk"]),
    make_row("engine_room_temp_c", "vessel-b", "2026-01-01T00:00:20+00:00", 70.0),
]

HULL_ROWS = [
    make_row("hull_vibration_mm", "vessel-a", "2026-01-01T00:00:10+00:00", 3.0, max_value=4.0),
]


def patched_table(monkeypatch, rows):
    fake = FakeTable(rows)
    monkeypatch.setattr(data_access, "table", lambda: fake)
    return fake


def test_recent_windows_returns_oldest_first(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS)
    items = data_access.recent_windows("engine_room_temp_c", limit=10)
    assert [item["window_end"] for item in items] == [
        "2026-01-01T00:00:10+00:00",
        "2026-01-01T00:00:10+00:00",
        "2026-01-01T00:00:20+00:00",
        "2026-01-01T00:00:20+00:00",
    ]


def test_latest_by_site_picks_newest_window_per_site(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS)
    latest = data_access.latest_by_site("engine_room_temp_c")
    assert latest["vessel-a"]["avg"] == 80.0
    assert latest["vessel-b"]["avg"] == 70.0


def test_vessel_report_includes_all_sensor_types_and_none_when_missing(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS + HULL_ROWS)
    report = data_access.vessel_report()
    by_site = {r["site_id"]: r for r in report}

    assert set(by_site.keys()) == {"vessel-a", "vessel-b"}
    vessel_a = by_site["vessel-a"]
    assert set(vessel_a["readings"].keys()) == set(data_access.SENSOR_TYPES)
    assert vessel_a["readings"]["engine_room_temp_c"]["avg"] == 80.0
    assert vessel_a["readings"]["hull_vibration_mm"]["max"] == 4.0
    # fuel/ballast/passenger never landed in the fake table -> None, not a raise.
    assert vessel_a["readings"]["fuel_consumption_lph"] is None


def test_recent_log_entries_sorted_newest_first_and_trimmed(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS + HULL_ROWS)
    entries = data_access.recent_log_entries(limit=2)
    assert len(entries) == 2
    assert entries[0]["window_end"] >= entries[1]["window_end"]
    assert entries[0]["window_end"] == "2026-01-01T00:00:20+00:00"


def test_recent_log_entries_carries_alerts_through(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS)
    entries = data_access.recent_log_entries(limit=10)
    alerted = [e for e in entries if e["alerts"]]
    assert len(alerted) == 1
    assert alerted[0]["alerts"] == ["engine_overheat_risk"]
    assert alerted[0]["site_id"] == "vessel-a"


def test_freshest_window_age_uses_minimum_across_types(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS + HULL_ROWS)
    now = datetime.datetime.fromisoformat("2026-01-01T00:00:25+00:00")
    age = data_access.freshest_window_age(now)
    assert age == 5.0


def test_freshest_window_age_none_when_table_empty(monkeypatch):
    patched_table(monkeypatch, [])
    age = data_access.freshest_window_age(datetime.datetime.now(datetime.timezone.utc))
    assert age is None


def test_items_in_table_counts_rows(monkeypatch):
    patched_table(monkeypatch, ENGINE_ROWS)
    assert data_access.items_in_table() == len(ENGINE_ROWS)


class FakeSqsUnreachable:
    def get_queue_url(self, QueueName):
        raise RuntimeError("queue not found")


class FakeSqsReachable:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": "http://queue-url"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "QueueArn" in AttributeNames:
            return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:mvs-vessel-agg"}}
        return {"Attributes": {"ApproximateNumberOfMessages": "3", "ApproximateNumberOfMessagesNotVisible": "1"}}


def test_queue_reachable_true_and_false(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsReachable())
    assert data_access.queue_reachable() is True

    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsUnreachable())
    assert data_access.queue_reachable() is False


def test_queue_depth_returns_waiting_and_in_flight(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsReachable())
    depth = data_access.queue_depth()
    assert depth == {"waiting": 3, "in_flight": 1}


def test_queue_depth_none_when_unreachable(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsUnreachable())
    assert data_access.queue_depth() is None


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class FakeLambdaMissing:
    def get_function(self, FunctionName):
        raise RuntimeError("not found")


def test_lambda_active_true_and_false(monkeypatch):
    monkeypatch.setattr(data_access, "lambda_client", lambda: FakeLambdaActive())
    assert data_access.lambda_active() is True

    monkeypatch.setattr(data_access, "lambda_client", lambda: FakeLambdaMissing())
    assert data_access.lambda_active() is False
