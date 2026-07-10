import pytest

from conftest import load_module

status = load_module("dash_status", "backend/dashboard/status.py")


class TestOccupancyPct:
    def test_computes_percentage_rounded_to_one_decimal(self):
        assert status.occupancy_pct(150, 300) == 50.0
        assert status.occupancy_pct(1, 3) == pytest.approx(33.3)

    def test_zero_capacity_returns_zero_instead_of_dividing_by_zero(self):
        assert status.occupancy_pct(10, 0) == 0.0


class TestLotStatus:
    def test_normal_below_busy_threshold(self):
        assert status.lot_status(50.0, alert_count=0) == "normal"

    def test_busy_at_or_above_busy_threshold(self):
        assert status.lot_status(75.0, alert_count=0) == "busy"
        assert status.lot_status(89.9, alert_count=0) == "busy"

    def test_near_full_at_or_above_near_full_threshold(self):
        assert status.lot_status(90.0, alert_count=0) == "near_full"
        assert status.lot_status(100.0, alert_count=0) == "near_full"

    def test_any_active_alert_forces_alert_status_regardless_of_percentage(self):
        assert status.lot_status(10.0, alert_count=1) == "alert"
        assert status.lot_status(95.0, alert_count=2) == "alert"
