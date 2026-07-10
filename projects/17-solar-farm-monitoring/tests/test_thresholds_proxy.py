"""fetch_thresholds is tested against a real local http.server on an
ephemeral port (success path) and a real closed TCP socket (genuine
unreachable-upstream failure), not a mocked transport."""

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from conftest import load_module

thresholds_proxy = load_module("dash_thresholds_proxy", "backend/dashboard/thresholds_proxy.py")


class FakeThresholdsHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        body = json.dumps({"panel_temp_c": [{"field": "avg", "op": ">", "limit": 65, "key": "thermal_derate_risk"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def running_fake_fog():
    server = HTTPServer(("127.0.0.1", 0), FakeThresholdsHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/thresholds"
    finally:
        server.shutdown()
        server.server_close()


def find_unused_port_then_close_it():
    """Bind a real socket to grab a genuinely free ephemeral port, then
    close it immediately -- nothing is listening there, so a connection
    attempt gets a real, deterministic 'connection refused'."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def test_fetch_thresholds_returns_parsed_json_on_success(running_fake_fog):
    body = thresholds_proxy.fetch_thresholds(running_fake_fog)
    assert body["panel_temp_c"][0]["key"] == "thermal_derate_risk"


def test_fetch_thresholds_raises_on_a_genuinely_unreachable_upstream():
    dead_port = find_unused_port_then_close_it()
    with pytest.raises(thresholds_proxy.ThresholdsUnavailable):
        thresholds_proxy.fetch_thresholds(f"http://127.0.0.1:{dead_port}/thresholds", timeout=2)
