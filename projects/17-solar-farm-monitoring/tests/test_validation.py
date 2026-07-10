import pytest

from conftest import load_module

validation = load_module("fog_validation", "fog/validation.py")


def valid_payload(**overrides):
    payload = {
        "sensor_type": "irradiance_wm2",
        "site_id": "array-1",
        "unit": "W/m2",
        "readings": [{"ts": "t0", "value": 600.0}],
    }
    payload.update(overrides)
    return payload


def test_valid_payload_returns_none():
    assert validation.validate_batch(valid_payload()) is None


def test_defaults_are_accepted_when_site_id_and_unit_are_omitted():
    payload = valid_payload()
    del payload["site_id"]
    del payload["unit"]
    assert validation.validate_batch(payload) is None


@pytest.mark.parametrize("body", [None, "a string", 42, [1, 2, 3]])
def test_non_dict_body_is_rejected(body):
    assert validation.validate_batch(body) is not None


@pytest.mark.parametrize("bad_sensor_type", [None, "", 42])
def test_missing_or_invalid_sensor_type_is_rejected(bad_sensor_type):
    assert validation.validate_batch(valid_payload(sensor_type=bad_sensor_type)) is not None


def test_empty_site_id_is_rejected():
    assert validation.validate_batch(valid_payload(site_id="")) is not None


def test_non_string_unit_is_rejected():
    assert validation.validate_batch(valid_payload(unit=123)) is not None


@pytest.mark.parametrize("bad_readings", [None, [], "not a list", {"value": 1}])
def test_missing_empty_or_wrong_type_readings_is_rejected(bad_readings):
    assert validation.validate_batch(valid_payload(readings=bad_readings)) is not None


def test_reading_missing_value_field_is_rejected():
    assert validation.validate_batch(valid_payload(readings=[{"ts": "t0"}])) is not None


def test_reading_with_non_numeric_value_is_rejected():
    assert validation.validate_batch(valid_payload(readings=[{"ts": "t0", "value": "bright"}])) is not None


def test_reading_with_boolean_value_is_rejected():
    # bool is a subclass of int in Python -- must be explicitly excluded.
    assert validation.validate_batch(valid_payload(readings=[{"ts": "t0", "value": True}])) is not None


def test_reading_that_is_not_a_dict_is_rejected():
    assert validation.validate_batch(valid_payload(readings=["not-a-dict"])) is not None
