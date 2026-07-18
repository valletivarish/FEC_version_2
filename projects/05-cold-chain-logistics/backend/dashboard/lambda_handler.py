"""API Gateway entry point: a minimal ASGI bridge that drives the existing FastAPI app unchanged."""

import asyncio
from urllib.parse import urlencode

from app import app

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


async def _invoke(event):
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}
    body = (event.get("body") or "").encode("utf-8")
    headers = event.get("headers") or {}
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": event.get("httpMethod", "GET"),
        "scheme": "https",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": urlencode(params).encode("utf-8"),
        "root_path": "",
        "headers": [(k.lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in headers.items()],
        "server": ("lambda", 443),
        "client": ("127.0.0.1", 0),
    }

    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    captured = {"status": 200, "headers": [], "body": b""}

    async def send(message):
        if message["type"] == "http.response.start":
            captured["status"] = message["status"]
            captured["headers"] = message.get("headers", [])
        elif message["type"] == "http.response.body":
            captured["body"] += message.get("body", b"")

    await app(scope, receive, send)
    out_headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in captured["headers"]}
    out_headers.update(CORS)
    return {"statusCode": captured["status"], "headers": out_headers, "body": captured["body"].decode("utf-8")}


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": dict(CORS), "body": ""}
    return asyncio.run(_invoke(event))
