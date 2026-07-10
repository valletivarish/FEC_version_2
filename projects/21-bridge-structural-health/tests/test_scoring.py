from conftest import load_module

scoring = load_module("bshm_scoring", "backend/dashboard/scoring.py")


def test_index_is_100_when_both_components_at_or_below_safe():
    assert scoring.structural_integrity_index(400.0, 8.0) == 100.0
    assert scoring.structural_integrity_index(100.0, 2.0) == 100.0


def test_index_is_0_when_both_components_at_or_beyond_critical():
    assert scoring.structural_integrity_index(1200.0, 20.0) == 0.0
    assert scoring.structural_integrity_index(2000.0, 30.0) == 0.0


def test_index_is_midpoint_when_one_component_is_halfway():
    # strain halfway between safe(400) and critical(1200) -> strain_score 50;
    # vibration at safe bound -> vibration_score 100. Average = 75.
    assert scoring.structural_integrity_index(800.0, 8.0) == 75.0


def test_index_clamps_beyond_critical_rather_than_going_negative():
    assert scoring.structural_integrity_index(5000.0, 100.0) == 0.0


def test_index_is_rounded_to_one_decimal():
    index = scoring.structural_integrity_index(700.0, 12.0)
    assert index == round(index, 1)


class TestIndexBand:
    def test_excellent_at_or_above_85(self):
        assert scoring.index_band(85.0) == "excellent"
        assert scoring.index_band(100.0) == "excellent"

    def test_good_band(self):
        assert scoring.index_band(70.0) == "good"

    def test_fair_band(self):
        assert scoring.index_band(50.0) == "fair"

    def test_poor_band(self):
        assert scoring.index_band(30.0) == "poor"

    def test_critical_band(self):
        assert scoring.index_band(10.0) == "critical"
        assert scoring.index_band(0.0) == "critical"
