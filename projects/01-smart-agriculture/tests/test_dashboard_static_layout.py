import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "backend" / "dashboard" / "static"
CSS = (STATIC_DIR / "style.css").read_text()
HTML = (STATIC_DIR / "index.html").read_text()

SENSOR_TYPES = ["soil_moisture", "temperature", "humidity", "light_intensity", "rainfall"]


def _grid_rule():
    match = re.search(r"\.grid\s*\{([^}]*)\}", CSS)
    assert match, ".grid rule not found in style.css"
    return match.group(1)


def _minmax_floor(rule):
    """Extract the first argument of minmax(...) inside repeat(auto-fit, ...),
    correctly handling the nested parens from a min()/clamp() floor."""
    start = rule.index("minmax(") + len("minmax(")
    depth = 1
    i = start
    while depth > 0:
        if rule[i] == "(":
            depth += 1
        elif rule[i] == ")":
            depth -= 1
        i += 1
    inner = rule[start:i - 1]  # full minmax(...) contents, top-level commas only
    # split on the first top-level comma (separates floor from the `1fr` ceiling)
    depth = 0
    for j, ch in enumerate(inner):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            return inner[:j].strip()
    raise AssertionError(f"could not split minmax() contents: {inner!r}")


def _grid_horizontal_padding_px():
    rule = _grid_rule()
    match = re.search(r"padding:\s*([\d.]+)px\s+([\d.]+)px", rule)
    assert match, "expected a top/right(/bottom) padding shorthand on .grid"
    return float(match.group(2)) * 2


def test_viewport_meta_present():
    assert 'name="viewport"' in HTML
    assert "width=device-width" in HTML


def test_all_sensor_types_have_a_card():
    for sensor_type in SENSOR_TYPES:
        assert f'id="{sensor_type}"' in HTML, f"missing chart canvas for {sensor_type}"
        assert f'class="swatch {sensor_type}"' in HTML, f"missing swatch for {sensor_type}"


def test_layout_sections_wrap_instead_of_overflowing():
    for selector in [".fleet", ".health", ".pipeline", ".summary"]:
        rule_match = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", CSS)
        assert rule_match, f"{selector} rule not found"
        assert "flex-wrap: wrap" in rule_match.group(1), f"{selector} must wrap on narrow viewports"


def test_grid_column_floor_never_exceeds_available_width_at_320px():
    """Regression test: .grid's minmax() column floor must be wrapped in min()/clamp() with a percentage term subtracting at least the grid's own padding, or a 320px viewport (e.g. iPhone SE) overflows horizontally."""
    rule = _grid_rule()
    assert "repeat(auto-fit," in rule, "expected repeat(auto-fit, minmax(...)) on .grid"
    floor = _minmax_floor(rule)

    padding = _grid_horizontal_padding_px()
    assert padding > 0

    # The floor must be viewport-relative (via min()/clamp()/calc() with a
    # percentage term), not a bare px value — otherwise it cannot shrink
    # below its own value regardless of viewport width.
    assert "min(" in floor or "clamp(" in floor, (
        f".grid column floor {floor!r} is a fixed length; it must be wrapped in "
        f"min()/clamp() against a percentage so it yields on narrow viewports"
    )
    assert "%" in floor, f".grid column floor {floor!r} has no viewport-relative term"

    # The percentage-based fallback term must subtract at least the grid's
    # own horizontal padding, otherwise the overflow bug reappears.
    calc_match = re.search(r"100%\s*-\s*([\d.]+)px", floor)
    assert calc_match, f".grid column floor {floor!r} does not subtract padding from 100%"
    subtracted = float(calc_match.group(1))
    assert subtracted >= padding, (
        f".grid subtracts only {subtracted}px from 100% but has {padding}px of horizontal "
        f"padding; a 320px-wide viewport would overflow by {padding - subtracted}px"
    )
