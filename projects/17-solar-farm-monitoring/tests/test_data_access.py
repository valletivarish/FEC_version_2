from conftest import load_module

data_access = load_module("dash_data_access", "backend/dashboard/data_access.py")
scoring = load_module("dash_scoring_2", "backend/dashboard/scoring.py")


def row(sensor_type, site_id, window_end, avg, minimum=None, maximum=None, unit="", alerts=None):
    return {
        "sensor_type": sensor_type, "site_id": site_id, "unit": unit,
        "window_start": "s", "window_end": window_end,
        "count": 3,
        "min": avg if minimum is None else minimum,
        "max": avg if maximum is None else maximum,
        "avg": avg, "latest": avg,
        "alerts": alerts or [],
    }


class FakeTable:
    def __init__(self, rows_by_sensor_type):
        # rows given oldest-first per sensor_type, exactly like real DynamoDB
        # query results after data_access.recent_windows() re-reverses them.
        self.rows_by_sensor_type = rows_by_sensor_type

    def query(self, KeyConditionExpression, ScanIndexForward, Limit):
        sensor_type = KeyConditionExpression.get_expression()["values"][1]
        rows = list(self.rows_by_sensor_type.get(sensor_type, []))
        if ScanIndexForward is False:
            rows = list(reversed(rows))
        return {"Items": rows[:Limit]}

    def scan(self, Select, ExclusiveStartKey=None):
        return {"Count": sum(len(v) for v in self.rows_by_sensor_type.values())}


class PagedCountTable:
    """Splits a fixed total count across `page_counts`, requiring the caller
    to follow LastEvaluatedKey to see anything past the first page -- proves
    items_in_table() doesn't stop after one Scan response."""

    def __init__(self, page_counts):
        self.page_counts = page_counts
        self.calls = []

    def scan(self, Select, ExclusiveStartKey=None):
        page = ExclusiveStartKey["page"] if ExclusiveStartKey else 0
        self.calls.append(ExclusiveStartKey)
        count = self.page_counts[page]
        resp = {"Count": count}
        if page + 1 < len(self.page_counts):
            resp["LastEvaluatedKey"] = {"page": page + 1}
        return resp


class FakeSqsHealthy:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": f"http://queue/{QueueName}"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "ApproximateNumberOfMessages" in AttributeNames:
            return {"Attributes": {"ApproximateNumberOfMessages": "3", "ApproximateNumberOfMessagesNotVisible": "1"}}
        return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:sfm-array-agg"}}


class FakeSqsDown:
    def get_queue_url(self, QueueName):
        raise RuntimeError("connection refused")


class FakeLambdaActive:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


def test_recent_windows_reverses_back_to_oldest_first(monkeypatch):
    fake = FakeTable({"panel_temp_c": [row("panel_temp_c", "array-1", f"t{i}", 40.0 + i) for i in range(5)]})
    monkeypatch.setattr(data_access, "table", lambda: fake)
    items = data_access.recent_windows("panel_temp_c", limit=3)
    assert [i["window_end"] for i in items] == ["t2", "t3", "t4"]


def test_latest_by_site_picks_the_newest_row_per_site(monkeypatch):
    fake = FakeTable({"inverter_output_kw": [
        row("inverter_output_kw", "array-1", "t0", 60.0),
        row("inverter_output_kw", "array-2", "t1", 61.0),
        row("inverter_output_kw", "array-1", "t2", 62.0),
    ]})
    monkeypatch.setattr(data_access, "table", lambda: fake)
    latest = data_access.latest_by_site("inverter_output_kw")
    assert latest["array-1"]["avg"] == 62.0
    assert latest["array-2"]["avg"] == 61.0


def test_site_windows_filters_to_one_site_and_keeps_order(monkeypatch):
    rows = [row("dc_voltage_v", "array-1" if i % 2 == 0 else "array-2", f"t{i}", 400.0 + i) for i in range(10)]
    fake = FakeTable({"dc_voltage_v": rows})
    monkeypatch.setattr(data_access, "table", lambda: fake)
    site_rows = data_access.site_windows("dc_voltage_v", "array-1", limit=3)
    assert [r["window_end"] for r in site_rows] == ["t4", "t6", "t8"]


def test_paired_history_computes_the_real_efficiency_index_per_window(monkeypatch):
    fake = FakeTable({
        "inverter_output_kw": [row("inverter_output_kw", "array-1", "t0", 110.0)],
        "panel_temp_c": [row("panel_temp_c", "array-1", "t0", 45.0)],
    })
    monkeypatch.setattr(data_access, "table", lambda: fake)
    history = data_access.paired_history("array-1")
    assert history == [{"window_end": "t0", "efficiency_index": scoring.efficiency_index(110.0, 45.0)}]
    assert history[0]["efficiency_index"] == 100.0


def test_paired_history_trims_to_the_shorter_series(monkeypatch):
    fake = FakeTable({
        "inverter_output_kw": [row("inverter_output_kw", "array-1", f"t{i}", 60.0) for i in range(3)],
        "panel_temp_c": [row("panel_temp_c", "array-1", f"t{i}", 40.0) for i in range(1)],
    })
    monkeypatch.setattr(data_access, "table", lambda: fake)
    history = data_access.paired_history("array-1")
    assert len(history) == 1


def test_array_report_covers_both_configured_sites(monkeypatch):
    fake = FakeTable({
        "irradiance_wm2": [row("irradiance_wm2", "array-1", "t0", 600.0)],
        "panel_temp_c": [row("panel_temp_c", "array-1", "t0", 40.0)],
        "inverter_output_kw": [row("inverter_output_kw", "array-1", "t0", 90.0)],
        "dc_voltage_v": [],
        "soiling_index_pct": [],
    })
    monkeypatch.setattr(data_access, "table", lambda: fake)
    report = data_access.array_report()
    by_site = {r["site_id"]: r for r in report}
    assert set(by_site) == {"array-1", "array-2"}
    assert by_site["array-1"]["readings"]["irradiance_wm2"]["avg"] == 600.0
    assert by_site["array-1"]["efficiency_index"] is not None
    assert by_site["array-2"]["efficiency_index"] is None
    assert by_site["array-2"]["readings"]["irradiance_wm2"] is None


def test_freshest_window_age_returns_the_minimum_age_across_sensor_types(monkeypatch):
    import datetime
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    stale = (now - datetime.timedelta(seconds=100)).isoformat()
    fresh = (now - datetime.timedelta(seconds=5)).isoformat()
    fake = FakeTable({
        "irradiance_wm2": [row("irradiance_wm2", "array-1", stale, 1.0)],
        "panel_temp_c": [row("panel_temp_c", "array-1", fresh, 1.0)],
        "inverter_output_kw": [], "dc_voltage_v": [], "soiling_index_pct": [],
    })
    monkeypatch.setattr(data_access, "table", lambda: fake)
    age = data_access.freshest_window_age(now)
    assert age == 5.0


def test_queue_depth_reports_waiting_and_in_flight(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsHealthy())
    assert data_access.queue_depth() == {"waiting": 3, "in_flight": 1}


def test_queue_depth_returns_none_when_unreachable(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsDown())
    assert data_access.queue_depth() is None


def test_queue_reachable_true_and_false(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsHealthy())
    assert data_access.queue_reachable() is True
    monkeypatch.setattr(data_access, "sqs", lambda: FakeSqsDown())
    assert data_access.queue_reachable() is False


def test_lambda_active_true(monkeypatch):
    monkeypatch.setattr(data_access, "lambda_client", lambda: FakeLambdaActive())
    assert data_access.lambda_active() is True


def test_items_in_table_scans_with_count_select(monkeypatch):
    fake = FakeTable({"irradiance_wm2": [row("irradiance_wm2", "array-1", "t0", 1.0)]})
    monkeypatch.setattr(data_access, "table", lambda: fake)
    assert data_access.items_in_table() == 1


def test_items_in_table_follows_pagination_across_multiple_scan_pages(monkeypatch):
    paged = PagedCountTable(page_counts=[400, 400, 137])
    monkeypatch.setattr(data_access, "table", lambda: paged)
    assert data_access.items_in_table() == 937
    assert paged.calls == [None, {"page": 1}, {"page": 2}]
