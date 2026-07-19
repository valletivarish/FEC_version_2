import json

import lambda_handler
import views


def test_options_returns_cors():
    resp = lambda_handler.lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_unknown_path_is_404():
    resp = lambda_handler.lambda_handler({"httpMethod": "GET", "path": "/api/nope"}, None)
    assert resp["statusCode"] == 404
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_dispatches_to_view(monkeypatch):
    monkeypatch.setitem(views.ROUTES, "/api/reaches", lambda params: (200, {"ok": True}))
    resp = lambda_handler.lambda_handler({"httpMethod": "GET", "path": "/api/reaches"}, None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["ok"] is True


def test_trailing_slash_normalised(monkeypatch):
    monkeypatch.setitem(views.ROUTES, "/api/health", lambda params: (200, {"h": 1}))
    resp = lambda_handler.lambda_handler({"httpMethod": "GET", "path": "/api/health/"}, None)
    assert resp["statusCode"] == 200
