from conftest import load_module

validation = load_module("mvs_fog_validation", "fog/validation.py")

VALID_BATCH = {
    "sensor_type": "engine_room_temp_c",
    "site_id": "vessel-a",
    "unit": "C",
    "readings": [{"ts": "2026-01-01T00:00:00Z", "value": 60.0}],
}


def test_valid_batch_returns_none():
    assert validation.validate_batch(dict(VALID_BATCH)) is None


def test_non_dict_payload_rejected():
    assert validation.validate_batch(["not", "a", "dict"]) is not None
    assert validation.validate_batch("string") is not None
    assert validation.validate_batch(None) is not None


def test_missing_sensor_type_rejected():
    payload = dict(VALID_BATCH)
    del payload["sensor_type"]
    assert validation.validate_batch(payload) is not None


def test_non_string_sensor_type_rejected():
    payload = {**VALID_BATCH, "sensor_type": 123}
    assert validation.validate_batch(payload) is not None


def test_empty_string_sensor_type_rejected():
    payload = {**VALID_BATCH, "sensor_type": ""}
    assert validation.validate_batch(payload) is not None


def test_site_id_defaults_when_absent():
    payload = dict(VALID_BATCH)
    del payload["site_id"]
    assert validation.validate_batch(payload) is None


def test_non_string_site_id_rejected():
    payload = {**VALID_BATCH, "site_id": 42}
    assert validation.validate_batch(payload) is not None


def test_empty_site_id_rejected():
    payload = {**VALID_BATCH, "site_id": ""}
    assert validation.validate_batch(payload) is not None


def test_unit_defaults_when_absent():
    payload = dict(VALID_BATCH)
    del payload["unit"]
    assert validation.validate_batch(payload) is None


def test_non_string_unit_rejected():
    payload = {**VALID_BATCH, "unit": 7}
    assert validation.validate_batch(payload) is not None


def test_missing_readings_rejected():
    payload = dict(VALID_BATCH)
    del payload["readings"]
    assert validation.validate_batch(payload) is not None


def test_non_list_readings_rejected():
    payload = {**VALID_BATCH, "readings": "not-a-list"}
    assert validation.validate_batch(payload) is not None


def test_empty_readings_list_rejected():
    payload = {**VALID_BATCH, "readings": []}
    assert validation.validate_batch(payload) is not None


def test_non_dict_reading_rejected():
    payload = {**VALID_BATCH, "readings": [1, 2, 3]}
    assert validation.validate_batch(payload) is not None


def test_reading_missing_value_field_rejected():
    payload = {**VALID_BATCH, "readings": [{"ts": "t1"}]}
    assert validation.validate_batch(payload) is not None


def test_reading_with_string_value_rejected():
    payload = {**VALID_BATCH, "readings": [{"ts": "t1", "value": "hot"}]}
    assert validation.validate_batch(payload) is not None


def test_reading_with_bool_value_rejected():
    payload = {**VALID_BATCH, "readings": [{"ts": "t1", "value": True}]}
    assert validation.validate_batch(payload) is not None


def test_reading_with_int_value_accepted():
    payload = {**VALID_BATCH, "readings": [{"ts": "t1", "value": 60}]}
    assert validation.validate_batch(payload) is None


def test_multiple_readings_all_validated():
    payload = {**VALID_BATCH, "readings": [
        {"ts": "t1", "value": 60.0},
        {"ts": "t2", "value": "bad"},
    ]}
    assert validation.validate_batch(payload) is not None
