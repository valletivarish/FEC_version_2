"""Lambda entry point for the dashboard API.

Wraps the existing FastAPI app with Mangum instead of maintaining a parallel
routing table: API Gateway events are translated into ASGI calls, so every
route in app.py (readings, summary, health, backend-stats) runs unchanged
whether it is reached via `uvicorn` locally or via API Gateway in AWS. The
static file mount and index route are left in place but unused in this
deployment mode, since the dashboard's HTML/JS/CSS are served straight from
S3 instead of through this function.
"""

from mangum import Mangum

from app import app

handler = Mangum(app)
