import pytest

from conftest import load_module

scoring = load_module("dash_scoring", "backend/dashboard/scoring.py")


class TestBandScore:
    def test_at_or_below_efficient_scores_100(self):
        assert scoring._band_score(30.0, 30.0, 70.0) == 100.0
        assert scoring._band_score(10.0, 30.0, 70.0) == 100.0

    def test_at_or_above_poor_scores_0(self):
        assert scoring._band_score(70.0, 30.0, 70.0) == 0.0
        assert scoring._band_score(200.0, 30.0, 70.0) == 0.0

    def test_midpoint_scores_50(self):
        assert scoring._band_score(50.0, 30.0, 70.0) == 50.0


class TestEfficiencyScore:
    def test_both_readings_efficient_scores_100(self):
        assert scoring.efficiency_score(30.0, 600.0) == 100.0

    def test_both_readings_poor_scores_0(self):
        assert scoring.efficiency_score(70.0, 1200.0) == 0.0

    def test_one_efficient_one_poor_averages_to_50(self):
        assert scoring.efficiency_score(30.0, 1200.0) == 50.0

    def test_result_is_rounded_to_one_decimal(self):
        score = scoring.efficiency_score(45.5, 733.0)
        assert score == round(score, 1)


class TestLetterGrade:
    @pytest.mark.parametrize(
        "score, expected",
        [
            (100.0, "A"), (90.0, "A"),
            (89.9, "B"), (75.0, "B"),
            (74.9, "C"), (60.0, "C"),
            (59.9, "D"), (40.0, "D"),
            (39.9, "F"), (0.0, "F"),
        ],
    )
    def test_cutoffs(self, score, expected):
        assert scoring.letter_grade(score) == expected
