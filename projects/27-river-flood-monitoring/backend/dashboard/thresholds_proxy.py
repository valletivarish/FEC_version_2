"""Fetch the fog node's /thresholds catalogue; isolated so it is unit-testable against a stub server."""
import json
import urllib.error
import urllib.request


class ThresholdsUnavailable(Exception):
    pass


def fetch(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, OSError) as exc:
        raise ThresholdsUnavailable(str(exc)) from exc
