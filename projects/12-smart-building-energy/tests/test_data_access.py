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


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "4", "ApproximateNumberOfMessagesNotVisible": "1"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:sbe-floor-agg"}}


class FakeSqsBroken:
    def get_queue_url(self, QueueName):
        raise RuntimeError("queue not found")


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class FakeLambdaMissing:
    def get_function(self, FunctionName):
        raise RuntimeError("function not found")


def item(sensor_type, site_id, window_end, avg, unit="kW", alerts=None):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": unit,
        "window_start": "s", "window_end": window_end,
        "count": 3, "min": Decimal("1"), "max": Decimal("2"), "avg": Decimal(str(avg)), "latest": Decimal(str(avg)),
        "alerts": alerts or [],
    }


class TestRecentWindows:
    def test_unwraps_decimal_to_float_and_returns_oldest_first(self, monkeypatch):
        fixture = {
            "energy_consumption_kw": [
                item("energy_consumption_kw", "floor-1", "e1", 20.0),
                item("energy_consumption_kw", "floor-1", "e2", 30.0),
            ]
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))

        items = data_access.recent_windows("energy_consumption_kw", limit=10)

        assert [i["window_end"] for i in items] == ["e1", "e2"]
        assert isinstance(items[0]["avg"], float)


class TestLatestBySite:
    def test_keeps_only_the_newest_row_per_site(self, monkeypatch):
        fixture = {
            "co2_ppm": [
                item("co2_ppm", "floor-1", "e1", 600.0),
                item("co2_ppm", "floor-1", "e2", 650.0),
                item("co2_ppm", "floor-2", "e1", 700.0),
            ]
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))

        latest = data_access.latest_by_site("co2_ppm")

        assert latest["floor-1"]["window_end"] == "e2"
        assert latest["floor-2"]["window_end"] == "e1"


class TestFloorReport:
    def test_reports_none_for_sensor_types_with_no_data_yet(self, monkeypatch):
        monkeypatch.setattr(data_access, "table", lambda: FakeTable({}))
        report = data_access.floor_report()
        assert {f["site_id"] for f in report} == {"floor-1", "floor-2"}
        for floor in report:
            assert all(reading is None for reading in floor["readings"].values())

    def test_reports_the_latest_reading_per_sensor_type_and_floor(self, monkeypatch):
        fixture = {
            "energy_consumption_kw": [item("energy_consumption_kw", "floor-1", "e1", 40.0)],
            "co2_ppm": [item("co2_ppm", "floor-1", "e1", 620.0, unit="ppm")],
        }
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))
        report = data_access.floor_report()
        floor1 = next(f for f in report if f["site_id"] == "floor-1")
        assert floor1["readings"]["energy_consumption_kw"]["avg"] == 40.0
        assert floor1["readings"]["co2_ppm"]["avg"] == 620.0
        assert floor1["readings"]["hvac_temp_c"] is None


class TestFreshestWindowAge:
    def test_returns_the_minimum_age_across_sensor_types(self, monkeypatch):
        now = datetime.datetime.now(datetime.timezone.utc)
        recent = (now - datetime.timedelta(seconds=5)).isoformat()
        older = (now - datetime.timedelta(seconds=50)).isoformat()
        fixture = {
            "energy_consumption_kw": [item("energy_consumption_kw", "floor-1", older, 30.0)],
            "co2_ppm": [item("co2_ppm", "floor-1", recent, 600.0)],
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
        fixture = {"energy_consumption_kw": [item("energy_consumption_kw", "floor-1", "e1", 30.0)]}
        monkeypatch.setattr(data_access, "table", lambda: FakeTable(fixture))
        assert data_access.items_in_table() == 1
