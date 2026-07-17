"""Tests for the dashboard's AWS Lambda WSGI bridge (lambda_handler.py):
OPTIONS preflight handling, a wildcard CORS header on every response, and
that a genuine Flask route is reached through the bridge and its response
translated back into the API Gateway proxy shape. DynamoDB is faked; nothing
here touches real AWS or LocalStack.
"""

import json
import sys

from conftest import load_module

lh = load_module("lambda_handler", "backend/dashboard/lambda_handler.py")
data_access = sys.modules["data_access"]


def event(method, path, params=None):
    return {
        "httpMethod": method,
        "path": path,
        "queryStringParameters": params,
        "headers": {},
        "body": None,
    }


def test_options_preflight_short_circuits_with_cors():
    resp = lh.lambda_handler(event("OPTIONS", "/api/hubs"), None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_unknown_route_bridges_flask_404_and_keeps_cors():
    resp = lh.lambda_handler(event("GET", "/not-a-real-route"), None)
    assert resp["statusCode"] == 404
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_real_route_reached_and_translated(monkeypatch):
    class FakeEmptyTable:
        def query(self, **kwargs):
            return {"Items": []}

        def scan(self, **kwargs):
            return {"Count": 0}

    monkeypatch.setattr(data_access, "table", lambda: FakeEmptyTable())

    resp = lh.lambda_handler(event("GET", "/api/hubs"), None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
    body = json.loads(resp["body"])
    assert "hubs" in body
    assert len(body["hubs"]) == 2
