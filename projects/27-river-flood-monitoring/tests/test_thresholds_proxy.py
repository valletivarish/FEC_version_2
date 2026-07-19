import pytest

from thresholds_proxy import ThresholdsUnavailable, fetch


def test_unreachable_url_raises():
    with pytest.raises(ThresholdsUnavailable):
        fetch("http://127.0.0.1:9/none", timeout=0.2)


def test_fetch_parses_json(monkeypatch):
    class _Resp:
        def read(self):
            return b'{"river_level_m": []}'

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr("urllib.request.urlopen", lambda url, timeout=5: _Resp())
    assert fetch("http://fog/thresholds") == {"river_level_m": []}
