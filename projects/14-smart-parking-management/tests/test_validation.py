import pytest

from conftest import load_module

validation = load_module("fog_validation", "fog/validation.py")


def valid_payload(**overrides):
    payload = {
        "sensor_type": "occupied_spaces",
        "site_id": "lot-a",
        "unit": "count",
        "readings": [{"ts": "t0", "value": 80.0}],
    }
    payload.update(overrides)
    return payload


class TestValidateBatch:
    def test_accepts_a_well_formed_batch(self):
        assert validation.validate_batch(valid_payload()) is None

    def test_accepts_batch_missing_optional_site_id_and_unit(self):
        payload = {"sensor_type": "occupied_spaces", "readings": [{"ts": "t0", "value": 1.0}]}
        assert validation.validate_batch(payload) is None

    @pytest.mark.parametrize("body", [None, [], "a string", 42])
    def test_rejects_non_object_body(self, body):
        assert validation.validate_batch(body) is not None

    def test_rejects_missing_sensor_type(self):
        payload = valid_payload()
        del payload["sensor_type"]
        assert validation.validate_batch(payload) is not None

    def test_rejects_empty_sensor_type(self):
        assert validation.validate_batch(valid_payload(sensor_type="")) is not None

    def test_rejects_non_string_sensor_type(self):
        assert validation.validate_batch(valid_payload(sensor_type=123)) is not None

    def test_rejects_missing_readings(self):
        payload = valid_payload()
        del payload["readings"]
        assert validation.validate_batch(payload) is not None

    def test_rejects_empty_readings_list(self):
        assert validation.validate_batch(valid_payload(readings=[])) is not None

    def test_rejects_readings_not_a_list(self):
        assert validation.validate_batch(valid_payload(readings="not-a-list")) is not None

    def test_rejects_reading_missing_value_field(self):
        assert validation.validate_batch(valid_payload(readings=[{"ts": "t0"}])) is not None

    def test_rejects_reading_with_non_numeric_value(self):
        assert validation.validate_batch(valid_payload(readings=[{"ts": "t0", "value": "full"}])) is not None

    def test_rejects_reading_with_boolean_value(self):
        assert validation.validate_batch(valid_payload(readings=[{"ts": "t0", "value": True}])) is not None

    def test_rejects_non_string_site_id_when_present(self):
        assert validation.validate_batch(valid_payload(site_id=7)) is not None

    def test_rejects_non_string_unit_when_present(self):
        assert validation.validate_batch(valid_payload(unit=7)) is not None
