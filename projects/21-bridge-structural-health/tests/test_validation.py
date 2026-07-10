import pytest
from conftest import load_module

validation = load_module("bshm_validation", "fog/validation.py")


def valid_payload():
    return {
        "sensor_type": "strain_microstrain",
        "site_id": "span-a",
        "unit": "microstrain",
        "readings": [{"ts": "2026-01-01T00:00:00Z", "value": 310.5}],
    }


def test_valid_payload_passes():
    assert validation.validate_batch(valid_payload()) is None


def test_payload_must_be_object():
    assert validation.validate_batch("not a dict") is not None
    assert validation.validate_batch(None) is not None
    assert validation.validate_batch([1, 2, 3]) is not None


@pytest.mark.parametrize("field", ["sensor_type", "readings"])
def test_missing_required_field(field):
    payload = valid_payload()
    del payload[field]
    assert validation.validate_batch(payload) is not None


def test_empty_sensor_type_rejected():
    payload = valid_payload()
    payload["sensor_type"] = ""
    assert validation.validate_batch(payload) is not None


def test_readings_must_be_non_empty_list():
    payload = valid_payload()
    payload["readings"] = []
    assert validation.validate_batch(payload) is not None
    payload["readings"] = "not-a-list"
    assert validation.validate_batch(payload) is not None


def test_reading_missing_ts_or_value_rejected():
    payload = valid_payload()
    payload["readings"] = [{"value": 1.0}]
    assert validation.validate_batch(payload) is not None

    payload["readings"] = [{"ts": "2026-01-01T00:00:00Z"}]
    assert validation.validate_batch(payload) is not None


def test_reading_value_must_be_numeric():
    payload = valid_payload()
    payload["readings"] = [{"ts": "t1", "value": "not-a-number"}]
    assert validation.validate_batch(payload) is not None

    payload["readings"] = [{"ts": "t1", "value": True}]
    assert validation.validate_batch(payload) is not None


def test_negative_value_is_valid_for_expansion_joint():
    # expansion_joint_mm can legitimately be negative (contraction).
    payload = valid_payload()
    payload["sensor_type"] = "expansion_joint_mm"
    payload["readings"] = [{"ts": "t1", "value": -12.5}]
    assert validation.validate_batch(payload) is None


def test_site_id_defaults_are_not_required():
    payload = valid_payload()
    del payload["site_id"]
    del payload["unit"]
    assert validation.validate_batch(payload) is None


def test_bad_site_id_type_rejected():
    payload = valid_payload()
    payload["site_id"] = 123
    assert validation.validate_batch(payload) is not None


def test_bad_unit_type_rejected():
    payload = valid_payload()
    payload["unit"] = 123
    assert validation.validate_batch(payload) is not None
