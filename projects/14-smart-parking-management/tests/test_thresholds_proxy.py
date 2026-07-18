"""fetch_thresholds is its own module so it is directly unit-testable: the success path hits a real local server and the failure path a closed TCP port."""

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from conftest import load_module

thresholds_proxy = load_module("dash_thresholds_proxy", "backend/dashboard/thresholds_proxy.py")

FAKE_RULES = {"occupied_spaces": [{"field": "avg", "op": ">", "limit": 270, "key": "near_full_capacity"}]}


class FakeThresholdsHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        body = json.dumps(FAKE_RULES).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def fake_upstream():
    server = HTTPServer(("127.0.0.1", 0), FakeThresholdsHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/thresholds"
    finally:
        server.shutdown()
        server.server_close()


def reserve_closed_port():
    """Binds then closes a real ephemeral TCP port so a connection to it is guaranteed to be refused."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


class TestFetchThresholdsSuccess:
    def test_fetches_and_parses_the_real_upstream_response(self, fake_upstream):
        body = thresholds_proxy.fetch_thresholds(fake_upstream)
        assert body == FAKE_RULES


class TestFetchThresholdsUnreachable:
    def test_raises_thresholds_unavailable_when_upstream_is_unreachable(self):
        port = reserve_closed_port()
        with pytest.raises(thresholds_proxy.ThresholdsUnavailable):
            thresholds_proxy.fetch_thresholds(f"http://127.0.0.1:{port}/thresholds", timeout=2)
