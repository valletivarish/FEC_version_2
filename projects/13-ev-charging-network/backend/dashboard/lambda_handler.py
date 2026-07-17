"""AWS Lambda entry point for the dashboard behind an API Gateway REST API.

Rather than re-declaring the routes or pulling in an adapter dependency, this
is a small hand-rolled WSGI bridge: it turns the API Gateway proxy event into
a WSGI ``environ``, invokes the existing Flask application object from app.py
as a plain WSGI callable, and translates the captured response back into the
API Gateway proxy shape. Every route app.py already serves therefore answers
identically behind API Gateway, with a wildcard cross-origin header attached
on the way out so the S3-hosted frontend can call it from its own origin.
"""

import io

from app import app  # the existing Flask WSGI application, reused unchanged

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


def _build_environ(event):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}
    query = "&".join(f"{key}={value}" for key, value in params.items())
    body = (event.get("body") or "").encode("utf-8")
    headers = event.get("headers") or {}

    environ = {
        "REQUEST_METHOD": method,
        "SCRIPT_NAME": "",
        "PATH_INFO": path,
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
    content_type = headers.get("Content-Type") or headers.get("content-type")
    if content_type:
        environ["CONTENT_TYPE"] = content_type
    for key, value in headers.items():
        environ["HTTP_" + key.upper().replace("-", "_")] = value
    return environ


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": dict(CORS), "body": ""}

    captured = {}

    def start_response(status, response_headers, exc_info=None):
        captured["status"] = int(status.split(" ", 1)[0])
        captured["headers"] = {key: value for key, value in response_headers}

    chunks = app(_build_environ(event), start_response)
    body = b"".join(chunks).decode("utf-8")

    headers = captured.get("headers", {})
    headers.update(CORS)
    return {
        "statusCode": captured.get("status", 200),
        "headers": headers,
        "body": body,
    }
