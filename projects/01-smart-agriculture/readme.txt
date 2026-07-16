Smart Agriculture Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (01-smart-agriculture) is the individual CA submission of
Kondragunta Lakshmi Chaitanya, Student ID X25171216. It has been deployed
to a real AWS account (AWS Academy Learner Lab, account 733939924597,
us-east-1) under that student's own AWS Academy credentials -- see
DEPLOYMENT (AWS) below for the live resources and their names.

All commands below assume your working directory is this folder
(projects/01-smart-agriculture/), not the repo root.

OVERVIEW
--------
Five simulated field sensors (soil moisture, temperature, humidity, light
intensity, rainfall) feed a virtual fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches one
aggregate per window to a queue. An AWS Lambda function consumes the queue and
stores records; a web dashboard renders a live chart and alert state per
sensor type.

This repo's Docker/LocalStack stack (below) is the full local development and
test environment, emulating AWS SQS, DynamoDB, and Lambda. The AWS SDK
(boto3) is used throughout, and the same code is also deployed to a real AWS
account as an endpoint/IAM configuration change rather than a rewrite -- see
DEPLOYMENT (AWS) below.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor type)
  fog/                FastAPI fog node: ingest, window, aggregate, alert, publish
  backend/processor/  process.py (pure transform) + handler.py (Lambda entry
                       point) + deploy_lambda.py (packages and registers the
                       function with an SQS event source mapping in LocalStack)
  backend/dashboard/  FastAPI + Chart.js live dashboard
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
Reused from the shared portfolio codebase (not this student's own earlier
work):
  - fog/aggregation.py's aggregate() function (window -> {count, min, max,
    avg, latest} summary record), docstring dropped. The identical function
    also appears in projects 12-smart-building-energy, 13-ev-charging-network,
    14-smart-parking-management, and 17-solar-farm-monitoring (main portfolio
    owner) and 23-marine-vessel-monitoring (Gopi Krishnan, X25112627); a
    near-identical variant appears in 21-bridge-structural-health.

Third-party open-source components, used as libraries/tools, not copied
source:
  - FastAPI (backend/dashboard, fog node) - https://fastapi.tiangolo.com
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (dashboard charts, vendored at backend/dashboard/static/vendor/) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
  - Mangum (ASGI-to-Lambda adapter for backend/dashboard/lambda_handler.py) -
    https://mangum.io

DEPLOYMENT (AWS)
-----------------
Account:  733939924597 (AWS Academy Learner Lab, region us-east-1).

ARCHITECTURE: EC2 runs infra/docker-compose.aws.yml (fog + six sensors
only, no LocalStack). The dashboard API runs as an AWS Lambda function
(Mangum-wrapped FastAPI app) behind API Gateway.

Live resources:
  DynamoDB table  fec-agri-readings (partition key sensor_type, sort key sort_key)
  SQS queue       fec-agri-agg
  Lambda          fec-agri-processor (SQS-event-source-triggered ingestion)
  Lambda          fec-agri-dashboard-api (Mangum-wrapped FastAPI app, behind
                  API Gateway HTTP API fjdi0s1wed)
  EC2 instance    i-04bfb4c32faa2fe8b (tag fec-agri-fog-host; runs the fog
                  node + all six sensor containers via
                  infra/docker-compose.aws.yml)
  Elastic IP      18.235.14.218 (associated with the EC2 instance above so
                  its public address stays fixed across stop/start)
  S3 bucket       fec-agri-frontend-733939924597 (static dashboard frontend,
                  public read)
  S3 bucket       fec-agri-deploy-733939924597 (staging bucket used to ship
                  source to the EC2 instance)

Live URLs:
  Dashboard: https://fec-agri-frontend-733939924597.s3.us-east-1.amazonaws.com/index.html
  API:       https://fjdi0s1wed.execute-api.us-east-1.amazonaws.com

REPORT
------
documents/Chaitanya_X25171216/Chaitanya_X25171216.docx (and matching .pdf) --
6-page IEEE conference two-column format report covering the sensor/fog
layer, the SQS-to-Lambda-to-DynamoDB backend, the dashboard API behind API
Gateway, a critical analysis of architecture alternatives considered, and
live evidence gathered against the deployed system. Nine references, cited
in strict order of first appearance.
