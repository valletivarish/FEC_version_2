import datetime
from decimal import Decimal

import pytest

from conftest import load_module

data_access = load_module("dash_data_access", "backend/dashboard/data_access.py")


class FakeTable:
    """Stands in for the boto3 dynamodb Table resource. Items are supplied
    chronological-ascending per sensor_type (like real inserts would land);
    query() mimics ScanIndexForward=False by returning them newest-first,
    same as a real DynamoDB query would.
    """

    def __init__(self, items_by_sensor_type):
        self.items_by_sensor_type = items_by_sensor_type

    def query(self, KeyConditionExpression, ScanIndexForward, Limit):
        sensor_type = KeyConditionExpression.get_expression()["values"][1]
        items = list(self.items_by_sensor_type.get(sensor_type, []))
        if ScanIndexForward is False:
            items = list(reversed(items))
        return {"Items": items[:Limit]}

    def scan(self, Select):
        total = sum(len(v) for v in self.items_by_sensor_type.values())
        return {"Count": total}


class FakePaginatedCountTable:
    """A Scan(Select=COUNT) that splits its result across pages of
    `page_size`, signalling more pages via LastEvaluatedKey the same way
    a real DynamoDB table does once scanned data crosses ~1MB -- distinct
    from FakeTable's single-page scan() so a pagination-undercount
    regression (stopping after the first page) gets caught."""

    def __init__(self, total_items, page_size):
        self.total_items = total_items
        self.page_size = page_size
        self.scan_calls = 0

    def scan(self, Select, ExclusiveStartKey=None):
        self.scan_calls += 1
        start = ExclusiveStartKey or 0
        end = min(start + self.page_size, self.total_items)
        resp = {"Count": end - start}
        if end < self.total_items:
            resp["LastEvaluatedKey"] = end
        return resp


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "4", "ApproximateNumberOfMessagesNotVisible": "1"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:ecn-hub-agg"}}


class FakeSqsBroken:
    def get_queue_url(self, QueueName):
        raise RuntimeError("queue not found")


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class FakeLambdaMissing:
    def get_function(self, FunctionName):
        raise RuntimeError("function not found")


def item(sensor_type, site_id, window_end, avg, unit="A", alerts=None):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": unit,
        "window_start": "s", "window_end": window_end,
        "count": 3, "min": Decimal("1"), "max": Decimal("2"), "avg": Decimal(str(avg)), "latest": Decimal(str(avg)),
        "alerts": alerts or [],
    }


class TestRecentWindows:
    def test_unwraps_decimal_to_float_and_returns_oldest_first(self, monkeypatch):
        fixture = {
            "charging_current_a": [
                item("charging_current_a", "hub-1", "e1", 20.0),
                item("charging_current_a", "hub-1", "e2", 30.0),
            ]
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))

        items = data_access.recent_windows("charging_current_a", limit=10)

        assert [i["window_end"] for i in items] == ["e1", "e2"]
        assert isinstance(items[0]["avg"], float)


class TestLatestBySite:
    def test_keeps_only_the_newest_row_per_site(self, monkeypatch):
        fixture = {
            "station_temp_c": [
                item("station_temp_c", "hub-1", "e1", 30.0),
                item("station_temp_c", "hub-1", "e2", 32.0),
                item("station_temp_c", "hub-2", "e1", 29.0),
            ]
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))

        latest = data_access.latest_by_site("station_temp_c")

        assert latest["hub-1"]["window_end"] == "e2"
        assert latest["hub-2"]["window_end"] == "e1"


class TestHubReport:
    def test_reports_none_for_sensor_types_with_no_data_yet(self, monkeypatch):
        monkeypatch.setattr(data_access, "table", lambda: FakeTable({}))
        report = data_access.hub_report()
        assert {h["site_id"] for h in report} == {"hub-1", "hub-2"}
        for hub in report:
            assert all(reading is None for reading in hub["readings"].values())

    def test_reports_the_latest_reading_per_sensor_type_and_hub(self, monkeypatch):
        fixture = {
            "charging_current_a": [item("charging_current_a", "hub-1", "e1", 22.0)],
            "station_temp_c": [item("station_temp_c", "hub-1", "e1", 31.0, unit="C")],
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))
        report = data_access.hub_report()
        hub1 = next(h for h in report if h["site_id"] == "hub-1")
        assert hub1["readings"]["charging_current_a"]["avg"] == 22.0
        assert hub1["readings"]["station_temp_c"]["avg"] == 31.0
        assert hub1["readings"]["grid_load_kw"] is None


class TestFreshestWindowAge:
    def test_returns_the_minimum_age_across_sensor_types(self, monkeypatch):
        now = datetime.datetime.now(datetime.timezone.utc)
        recent = (now - datetime.timedelta(seconds=5)).isoformat()
        older = (now - datetime.timedelta(seconds=50)).isoformat()
        fixture = {
            "charging_current_a": [item("charging_current_a", "hub-1", older, 20.0)],
            "station_temp_c": [item("station_temp_c", "hub-1", recent, 30.0)],
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))
        age = data_access.freshest_window_age(now)
        assert age < 10

    def test_returns_none_when_nothing_has_landed(self, monkeypatch):
        monkeypatch.setattr(data_access, "table", lambda: FakeTable({}))
        assert data_access.freshest_window_age(datetime.datetime.now(datetime.timezone.utc)) is None


class TestQueueAndLambdaChecks:
    def test_queue_depth_reports_waiting_and_in_flight(self, monkeypatch):
        monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsHealthy())
        assert data_access.queue_depth() == {"waiting": 4, "in_flight": 1}

    def test_queue_depth_is_none_when_queue_unreachable(self, monkeypatch):
        monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsBroken())
        assert data_access.queue_depth() is None

    def test_queue_reachable_true_and_false(self, monkeypatch):
        monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsHealthy())
        assert data_access.queue_reachable() is True
        monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsBroken())
        assert data_access.queue_reachable() is False

    def test_lambda_active_true_and_false(self, monkeypatch):
        monkeypatch.setattr(data_access, "lambda_client", lambda: FakeLambdaActive())
        assert data_access.lambda_active() is True
        monkeypatch.setattr(data_access, "lambda_client", lambda: FakeLambdaMissing())
        assert data_access.lambda_active() is False

    def test_items_in_table_returns_scan_count(self, monkeypatch):
        fixture = {"charging_current_a": [item("charging_current_a", "hub-1", "e1", 20.0)]}
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))
        assert data_access.items_in_table() == 1

    def test_items_in_table_sums_the_count_across_every_page(self, monkeypatch):
        fake_table = FakePaginatedCountTable(total_items=25, page_size=10)
        monkeypatch.setattr(data_access, "table", lambda: fake_table)
        assert data_access.items_in_table() == 25
        assert fake_table.scan_calls == 3
