import json

from process import process

MESSAGE = {
    "sensor_type": "soil_moisture",
    "site_id": "field-1",
    "unit": "%",
    "window_start": "s",
    "window_end": "e",
    "count": 4,
    "min": 12.0, "max": 18.0, "avg": 15.0, "latest": 14.0,
    "alerts": ["irrigation_needed"],
}


def test_process_accepts_json_string():
    record = process(json.dumps(MESSAGE))
    assert record["sensor_type"] == "soil_moisture"
    assert record["avg"] == 15.0
    assert record["alerts"] == ["irrigation_needed"]


def test_process_accepts_dict():
    assert process(MESSAGE)["window_end"] == "e"


def test_process_defaults_missing_optionals():
    minimal = {k: MESSAGE[k] for k in
               ("sensor_type", "window_start", "window_end", "count", "min", "max", "avg", "latest")}
    record = process(minimal)
    assert record["alerts"] == []
    assert record["site_id"] == "field-1"


def test_process_sort_key_disambiguates_sites_sharing_a_window():
    message_a = {**MESSAGE, "site_id": "field-1"}
    message_b = {**MESSAGE, "site_id": "field-2"}
    record_a = process(message_a)
    record_b = process(message_b)
    assert record_a["window_end"] == record_b["window_end"] == "e"
    assert record_a["sort_key"] != record_b["sort_key"]
