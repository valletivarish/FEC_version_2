import json

import pytest

from reshape import to_manifest_record

RAW_EVENT = {
    "sensor_type": "storage_temperature",
    "site_id": "container-1",
    "unit": "C",
    "window_start": "s",
    "window_end": "e",
    "count": 4,
    "min": -20.0, "max": -16.0, "avg": -18.0, "latest": -17.0,
    "alerts": [],
}

REQUIRED_ONLY_KEYS = ("sensor_type", "window_start", "window_end", "count", "min", "max", "avg", "latest")


@pytest.fixture
def base_event():
    return dict(RAW_EVENT)


class TestPayloadCoercion:
    @pytest.mark.parametrize("wrap", [
        pytest.param(json.dumps, id="json_string"),
        pytest.param(lambda body: body, id="plain_dict"),
    ])
    def test_accepts_string_or_dict_payload(self, base_event, wrap):
        outcome = to_manifest_record(wrap(base_event))
        assert outcome["sensor_type"] == "storage_temperature"
        assert outcome["avg"] == -18.0

    def test_preserves_window_end_field(self, base_event):
        assert to_manifest_record(base_event)["window_end"] == "e"


class TestFieldDefaults:
    def test_missing_optionals_fall_back(self):
        required_only = {key: RAW_EVENT[key] for key in REQUIRED_ONLY_KEYS}
        outcome = to_manifest_record(required_only)
        assert outcome["alerts"] == []
        assert outcome["site_id"] == "container-1"

    @pytest.mark.parametrize("site_id_override", ["", None], ids=["empty_string", "none"])
    def test_falsy_site_id_defaults_to_container_one(self, base_event, site_id_override):
        outcome = to_manifest_record({**base_event, "site_id": site_id_override})
        assert outcome["site_id"] == "container-1"
        assert outcome["sort_key"] == "e#container-1"


class TestSortKey:
    @pytest.mark.parametrize("site_a,site_b", [
        ("container-1", "container-2"),
        ("container-7", "container-8"),
    ])
    def test_shared_window_end_still_yields_distinct_keys(self, base_event, site_a, site_b):
        record_a, record_b = (
            to_manifest_record({**base_event, "site_id": site}) for site in (site_a, site_b)
        )

        assert record_a["window_end"] == record_b["window_end"] == "e"
        assert record_a["sort_key"] != record_b["sort_key"]
        assert record_a["sort_key"] == f"e#{site_a}"
        assert record_b["sort_key"] == f"e#{site_b}"
