from conftest import load_module

scoring = load_module("dash_scoring", "backend/dashboard/scoring.py")


def test_output_at_or_below_poor_scores_zero_component_regardless_of_temp():
    index = scoring.efficiency_index(inverter_output_avg_kw=20.0, panel_temp_avg_c=45.0)
    # output_component=0, thermal_component=100 (45 == optimal) -> avg 50
    assert index == 50.0


def test_output_at_or_above_optimal_and_temp_at_or_below_optimal_scores_100():
    index = scoring.efficiency_index(inverter_output_avg_kw=110.0, panel_temp_avg_c=45.0)
    assert index == 100.0


def test_output_at_poor_and_temp_at_poor_scores_zero():
    index = scoring.efficiency_index(inverter_output_avg_kw=20.0, panel_temp_avg_c=72.0)
    assert index == 0.0


def test_midpoint_values_score_halfway():
    # output halfway between 20 and 110 -> 50; temp halfway between 45 and 72 -> 50
    index = scoring.efficiency_index(inverter_output_avg_kw=65.0, panel_temp_avg_c=58.5)
    assert index == 50.0


def test_result_is_rounded_to_one_decimal():
    index = scoring.efficiency_index(inverter_output_avg_kw=73.0, panel_temp_avg_c=50.0)
    assert index == round(index, 1)


def test_values_outside_the_bands_are_clamped_not_extrapolated():
    over_optimal = scoring.efficiency_index(inverter_output_avg_kw=500.0, panel_temp_avg_c=-10.0)
    assert over_optimal == 100.0
    under_poor = scoring.efficiency_index(inverter_output_avg_kw=-50.0, panel_temp_avg_c=500.0)
    assert under_poor == 0.0


class TestIndexBand:
    def test_band_cutoffs(self):
        assert scoring.index_band(100.0) == "excellent"
        assert scoring.index_band(80.0) == "excellent"
        assert scoring.index_band(79.9) == "good"
        assert scoring.index_band(60.0) == "good"
        assert scoring.index_band(59.9) == "fair"
        assert scoring.index_band(40.0) == "fair"
        assert scoring.index_band(39.9) == "poor"
        assert scoring.index_band(20.0) == "poor"
        assert scoring.index_band(19.9) == "critical"
        assert scoring.index_band(0.0) == "critical"
