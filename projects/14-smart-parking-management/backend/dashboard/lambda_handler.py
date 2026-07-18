"""API Gateway entry point: a thin WSGI bridge that reuses the existing app() from app.py unchanged."""

import io
import urllib.parse

from app import app

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


def _environ(event):
    params = event.get("queryStringParameters") or {}
    query = urllib.parse.urlencode(params)
    headers = event.get("headers") or {}
    body = (event.get("body") or "").encode("utf-8")
    return {
        "REQUEST_METHOD": event.get("httpMethod", "GET"),
        "SCRIPT_NAME": "",
        "PATH_INFO": event.get("path", "/"),
        "QUERY_STRING": query,
        "SERVER_NAME": headers.get("Host", "lambda"),
        "SERVER_PORT": "443",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "CONTENT_LENGTH": str(len(body)),
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "https",
        "wsgi.input": io.BytesIO(body),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": dict(CORS), "body": ""}

    captured = {}

    def start_response(status, response_headers, exc_info=None):
        captured["status"] = int(status.split(" ", 1)[0])
        captured["headers"] = dict(response_headers)

    chunks = app(_environ(event), start_response)
    payload = b"".join(chunks).decode("utf-8")

    headers = captured.get("headers", {})
    headers.update(CORS)
    return {"statusCode": captured.get("status", 200), "headers": headers, "body": payload}
