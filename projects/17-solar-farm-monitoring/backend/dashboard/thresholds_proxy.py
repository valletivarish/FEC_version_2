"""Isolated so it is unit-testable against a real local server standing in for the fog node, without booting the dashboard."""

import json
import urllib.error
import urllib.request


class ThresholdsUnavailable(Exception):
    """Raised when the upstream fog node is unreachable or returns non-JSON."""


def fetch_thresholds(url, timeout=5):
    """GET `url` and parse the response body as JSON; takes the URL as a parameter so it stays directly testable."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, OSError) as exc:
        raise ThresholdsUnavailable(f"could not reach {url}: {exc}") from exc
