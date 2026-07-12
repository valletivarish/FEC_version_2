import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from conftest import load_module

thresholds_proxy = load_module("mvs_thresholds_proxy", "backend/dashboard/thresholds_proxy.py")


class ThresholdsHandler(BaseHTTPRequestHandler):
    payload = {"engine_room_temp_c": [{"field": "avg", "op": ">", "limit": 75, "key": "engine_overheat_risk"}]}

    def do_GET(self):
        body = json.dumps(self.payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # keep test output quiet


@pytest.fixture
def real_thresholds_server():
    httpd = HTTPServer(("127.0.0.1", 0), ThresholdsHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}/thresholds"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)


def test_fetch_thresholds_success_against_real_server(real_thresholds_server):
    payload = thresholds_proxy.fetch_thresholds(real_thresholds_server)
    assert payload == ThresholdsHandler.payload


def test_fetch_thresholds_raises_on_unreachable_upstream():
    # Bind a real socket, then close it immediately so the port is
    # genuinely refusing connections rather than being mocked away.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    with pytest.raises(thresholds_proxy.ThresholdsUnavailable):
        thresholds_proxy.fetch_thresholds(f"http://127.0.0.1:{port}/thresholds", timeout=1)
