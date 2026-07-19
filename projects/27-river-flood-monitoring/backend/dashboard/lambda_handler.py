"""API Gateway entry point: dispatch the proxy event's path to the shared view functions and add CORS."""
import json

import views

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


def _normalise(path):
    return path[:-1] if len(path) > 1 and path.endswith("/") else path


def _response(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", **CORS}, "body": json.dumps(body)}


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": dict(CORS), "body": ""}
    view = views.ROUTES.get(_normalise(event.get("path", "/")))
    if view is None:
        return _response(404, {"error": "not found"})
    status, body = view(event.get("queryStringParameters") or {})
    return _response(status, body)
