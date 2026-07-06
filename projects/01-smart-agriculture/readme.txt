Smart Agriculture Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/01-smart-agriculture/), not the repo root.

OVERVIEW
--------
Five simulated field sensors (soil moisture, temperature, humidity, light
intensity, rainfall) feed a virtual fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches one
aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders a
live chart and alert state per sensor type.

Phase 1 (this repo) runs entirely on Docker with LocalStack emulating AWS SQS,
DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so the phase-2
move to real AWS is an endpoint/IAM configuration change rather than a rewrite.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor type)
  fog/                FastAPI fog node: ingest, window, aggregate, alert, publish
  backend/processor/  process.py (pure transform) + handler.py (Lambda entry
                       point) + deploy_lambda.py (packages and registers the
                       function with an SQS event source mapping in LocalStack)
  backend/dashboard/  FastAPI + Chart.js live dashboard
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification
  tests/              pytest unit + endpoint/route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests locally)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8080
  LocalStack: http://localhost:4566

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python loadtest/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
No code was reused from any previous coursework or personal project; this
pipeline was built from scratch for this CA. It does depend on the following
third-party open-source components, used as standard libraries/tools rather
than copied source:
  - FastAPI (backend/dashboard, fog node) - https://fastapi.tiangolo.com
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (dashboard charts, vendored at backend/dashboard/static/vendor/) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
