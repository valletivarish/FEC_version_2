from conftest import load_module

data_access = load_module("bshm_data_access", "backend/dashboard/data_access.py")


class QueryScriptedTable:
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

    def scan(self, Select=None, ExclusiveStartKey=None):
        return {"Count": len(self.rows)}


def make_row(sensor_type, site_id, window_end, avg, max_value=None):
    return {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": "microstrain" if sensor_type == "strain_microstrain" else "mm/s",
        "window_start": "2026-01-01T00:00:00+00:00",
        "window_end": window_end,
        "count": 3,
        "min": avg - 10,
        "max": max_value if max_value is not None else avg + 10,
        "avg": avg,
        "latest": avg,
        "alerts": [],
    }


STRAIN_ROWS = [
    make_row("strain_microstrain", "span-a", "2026-01-01T00:00:10+00:00", 500.0),
    make_row("strain_microstrain", "span-b", "2026-01-01T00:00:10+00:00", 600.0),
    make_row("strain_microstrain", "span-a", "2026-01-01T00:00:20+00:00", 900.0),
    make_row("strain_microstrain", "span-b", "2026-01-01T00:00:20+00:00", 700.0),
]

VIBRATION_ROWS = [
    make_row("deck_vibration_mms", "span-a", "2026-01-01T00:00:10+00:00", 4.0, max_value=5.0),
    make_row("deck_vibration_mms", "span-b", "2026-01-01T00:00:10+00:00", 3.0, max_value=4.0),
    make_row("deck_vibration_mms", "span-a", "2026-01-01T00:00:20+00:00", 6.0, max_value=25.0),
    make_row("deck_vibration_mms", "span-b", "2026-01-01T00:00:20+00:00", 2.0, max_value=3.0),
]


def patched_table(monkeypatch, rows):
    fake = QueryScriptedTable(rows)
    monkeypatch.setattr(data_access, "table", lambda: fake)
    return fake


def test_recent_windows_returns_oldest_first(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS)
    items = data_access.recent_windows("strain_microstrain", limit=10)
    assert [item["window_end"] for item in items] == [
        "2026-01-01T00:00:10+00:00",
        "2026-01-01T00:00:10+00:00",
        "2026-01-01T00:00:20+00:00",
        "2026-01-01T00:00:20+00:00",
    ]


def test_latest_by_site_picks_newest_window_per_site(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS)
    latest = data_access.latest_by_site("strain_microstrain")
    assert latest["span-a"]["avg"] == 900.0
    assert latest["span-b"]["avg"] == 700.0


def test_site_windows_filters_to_one_span(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS)
    rows = data_access.site_windows("strain_microstrain", "span-a")
    assert [row["site_id"] for row in rows] == ["span-a", "span-a"]
    assert [row["avg"] for row in rows] == [500.0, 900.0]


def test_integrity_history_pairs_strain_and_vibration(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS + VIBRATION_ROWS)
    history = data_access.integrity_history("span-a")
    assert len(history) == 2
    # window 1: strain avg 500 (score 100, below safe 400? actually >400 so partial), vibration max 5 (safe)
    assert history[0]["window_end"] == "2026-01-01T00:00:10+00:00"
    assert history[1]["window_end"] == "2026-01-01T00:00:20+00:00"
    for point in history:
        assert 0.0 <= point["structural_integrity_index"] <= 100.0


def test_span_report_includes_all_sensor_types_and_index(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS + VIBRATION_ROWS)
    reports = data_access.span_report()
    by_site = {r["site_id"]: r for r in reports}

    assert set(by_site.keys()) == {"span-a", "span-b"}
    span_a = by_site["span-a"]
    assert set(span_a["readings"].keys()) == set(data_access.SENSOR_TYPES)
    assert span_a["readings"]["strain_microstrain"]["avg"] == 900.0
    assert span_a["structural_integrity_index"] is not None
    assert span_a["integrity_band"] is not None

    # tilt/traffic/expansion never landed in the fake table, so their
    # readings entries must be None rather than raising.
    assert span_a["readings"]["tilt_angle_deg"] is None


def test_freshest_window_age_uses_minimum_across_types(monkeypatch):
    import datetime

    patched_table(monkeypatch, STRAIN_ROWS + VIBRATION_ROWS)
    now = datetime.datetime.fromisoformat("2026-01-01T00:00:25+00:00")
    age = data_access.freshest_window_age(now)
    assert age == 5.0


def test_freshest_window_age_none_when_table_empty(monkeypatch):
    import datetime

    patched_table(monkeypatch, [])
    age = data_access.freshest_window_age(datetime.datetime.now(datetime.timezone.utc))
    assert age is None


def test_items_in_table_counts_rows(monkeypatch):
    patched_table(monkeypatch, STRAIN_ROWS)
    assert data_access.items_in_table() == len(STRAIN_ROWS)


class PagedQueryScriptedTable:
    """A Scan(Select=COUNT) that reports LastEvaluatedKey across four pages
    (620, 275, 190, 88), asserting each page resumes from the previous
    page's key -- exactly the multi-page shape a single un-paginated Scan
    call would silently undercount."""

    def __init__(self):
        self.pages = [
            {"Count": 620, "LastEvaluatedKey": {"sensor_type": "a"}},
            {"Count": 275, "LastEvaluatedKey": {"sensor_type": "b"}},
            {"Count": 190, "LastEvaluatedKey": {"sensor_type": "c"}},
            {"Count": 88},
        ]
        self.calls = 0
        self.seen_start_keys = []

    def scan(self, Select=None, ExclusiveStartKey=None):
        self.seen_start_keys.append(ExclusiveStartKey)
        page = self.pages[self.calls]
        self.calls += 1
        return page


def test_items_in_table_sums_every_scan_page(monkeypatch):
    fake = PagedQueryScriptedTable()
    monkeypatch.setattr(data_access, "table", lambda: fake)

    assert data_access.items_in_table() == 1173
    assert fake.calls == 4
    assert fake.seen_start_keys[0] is None
    assert fake.seen_start_keys[1] == {"sensor_type": "a"}
    assert fake.seen_start_keys[2] == {"sensor_type": "b"}
    assert fake.seen_start_keys[3] == {"sensor_type": "c"}


class QueueLookupFailingStub:
    def get_queue_url(self, QueueName):
        raise RuntimeError("queue not found")


class QueueAttributesStub:
    def get_queue_url(self, QueueName):
        return {"QueueUrl": "http://queue-url"}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        if "QueueArn" in AttributeNames:
            return {"Attributes": {"QueueArn": "arn:aws:sqs:eu-west-1:000000000000:bshm-span-agg"}}
        return {"Attributes": {"ApproximateNumberOfMessages": "3", "ApproximateNumberOfMessagesNotVisible": "1"}}


def test_queue_reachable_true_and_false(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: QueueAttributesStub())
    assert data_access.queue_reachable() is True

    monkeypatch.setattr(data_access, "sqs", lambda: QueueLookupFailingStub())
    assert data_access.queue_reachable() is False


def test_queue_depth_returns_waiting_and_in_flight(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: QueueAttributesStub())
    depth = data_access.queue_depth()
    assert depth == {"waiting": 3, "in_flight": 1}


def test_queue_depth_none_when_unreachable(monkeypatch):
    monkeypatch.setattr(data_access, "sqs", lambda: QueueLookupFailingStub())
    assert data_access.queue_depth() is None


class LambdaActiveStub:
    def get_function(self, FunctionName):
        return {"Configuration": {"State": "Active"}}


class LambdaLookupFailingStub:
    def get_function(self, FunctionName):
        raise RuntimeError("not found")


def test_lambda_active_true_and_false(monkeypatch):
    monkeypatch.setattr(data_access, "lambda_client", lambda: LambdaActiveStub())
    assert data_access.lambda_active() is True

    monkeypatch.setattr(data_access, "lambda_client", lambda: LambdaLookupFailingStub())
    assert data_access.lambda_active() is False
