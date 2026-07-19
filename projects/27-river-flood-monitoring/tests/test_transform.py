from transform import to_item


def test_sort_key_combines_window_and_site():
    item = to_item({"sensor_type": "river_level_m", "site_id": "reach-b", "window_start": "s",
                    "window_end": "e", "count": 3, "min": 1, "max": 2, "avg": 1.5, "latest": 2,
                    "rise_mph": 0.3, "alerts": ["flood_advisory"]})
    assert item["sort_key"] == "e#reach-b"
    assert item["rise_mph"] == 0.3
    assert item["alerts"] == ["flood_advisory"]


def test_accepts_json_string_body():
    item = to_item('{"sensor_type":"rainfall_mmph","window_start":"s","window_end":"e","count":1,"min":1,"max":1,"avg":1,"latest":1}')
    assert item["site_id"] == "reach-a"
    assert item["alerts"] == []


def test_defaults_missing_optional_fields():
    item = to_item({"sensor_type": "flow_velocity_ms", "site_id": "reach-a", "window_start": "s",
                    "window_end": "e", "count": 1, "min": 0, "max": 1, "avg": 0.5, "latest": 1})
    assert item["unit"] == ""
    assert item["rise_mph"] == 0
