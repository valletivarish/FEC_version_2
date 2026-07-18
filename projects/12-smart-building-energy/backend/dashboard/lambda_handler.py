"""API Gateway entry point: drives the existing DashboardHandler unchanged via an in-memory socket, so every do_GET route answers identically behind API Gateway."""

import io
from urllib.parse import urlencode

from app import DashboardHandler

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


class _MemorySocket:
    def __init__(self, request_bytes):
        self._in = io.BytesIO(request_bytes)
        self.out = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        return self.out if "w" in mode else self._in

    def sendall(self, data):
        self.out.write(data)

    def close(self):
        pass


class _Server:
    server_name = "lambda"
    server_port = 443


def _parse_response(raw):
    head, _, body = raw.partition(b"\r\n\r\n")
    lines = head.split(b"\r\n")
    status = int(lines[0].split(b" ", 2)[1]) if lines and lines[0] else 200
    headers = {}
    for line in lines[1:]:
        if b":" in line:
            key, value = line.split(b":", 1)
            headers[key.decode("latin-1").strip()] = value.decode("latin-1").strip()
    return status, headers, body.decode("utf-8", "replace")


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": dict(CORS), "body": ""}

    path = event.get("path", "/")
    query = urlencode(event.get("queryStringParameters") or {})
    target = f"{path}?{query}" if query else path
    request = (
        f"{event.get('httpMethod', 'GET')} {target} HTTP/1.1\r\n"
        "Host: lambda\r\nConnection: close\r\n\r\n"
    ).encode("latin-1")

    sock = _MemorySocket(request)
    DashboardHandler(sock, ("127.0.0.1", 0), _Server())
    status, headers, body = _parse_response(sock.out.getvalue())
    headers.update(CORS)
    return {"statusCode": status, "headers": headers, "body": body}
