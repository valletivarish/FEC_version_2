Cold Chain / Warehouse Logistics Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/05-cold-chain-logistics/), not the repo root.

OVERVIEW
--------
Ten simulated shipping-container sensors (storage temperature, humidity,
door-open duration, shock/vibration, CO2 level -- each running for two
containers) feed a virtual depot relay ("fog node"). The relay windows and
aggregates each reading type, raises operational exceptions, and dispatches
one aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders a
manifest TABLE as the primary view (one row per container, one column per
reading type, not a card/gauge grid), with a secondary storage-temperature
trend section per container, styled as a warehouse operations board.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so a later
move to real AWS is an endpoint/IAM configuration change rather than a
rewrite.

LAYOUT
------
  sensors/            sensor simulator (one container per reading/container)
  fog/                FastAPI depot relay: ingest, window, aggregate, flag,
                       ship, plus a /thresholds endpoint exposing the real
                       exception rules for any API consumer (the dashboard's
                       own status labels are display copy for the exception
                       keys, not a copy of the numeric thresholds -- the
                       manifest-table UI deliberately has no numeric rules
                       legend, unlike 01/02's dashboards)
  backend/processor/  reshape.py (pure transform) + handler.py (Lambda entry
                       point) + deploy_lambda.py (packages and registers the
                       function with an SQS event source mapping)
  backend/dashboard/  FastAPI + Chart.js. Primary view is a data TABLE
                       (manifest), not a card grid -- one row per container,
                       columns for all 5 readings, a status column, and an
                       age column. Secondary section: one small trend chart
                       per container for the safety-critical storage
                       temperature reading only.
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + endpoint/route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests locally)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8084
  LocalStack: http://localhost:4570

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the depot relay

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

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
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own projects 01-smart-agriculture,
02-industrial-equipment, 03-patient-vitals, and 04-smart-city, built earlier
for this same CA submission (not a prior/external coursework project).
Domain-specific code -- reading profiles, operational thresholds, and the
entire dashboard (warehouse gray/safety-orange theme, table-first manifest
layout) -- is new for this project. Third-party open-source components used
as standard libraries/tools:
  - FastAPI (backend/dashboard, depot relay) - https://fastapi.tiangolo.com
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (temperature trend charts, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
