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
fog/aggregation.py's aggregate() function (window -> {count, min, max, avg,
latest} summary record) is reused, with only its docstring dropped, from the
same author's other individual submissions in this portfolio (projects
12-smart-building-energy, 13-ev-charging-network, 14-smart-parking-management,
17-solar-farm-monitoring, and 23-marine-vessel-monitoring use the identical
function; 21-bridge-structural-health uses a near-identical variant
parameterised over (value, ts) pairs instead of {"ts", "value"} dicts). Every
other file in this project -- sensors/sensor.py, fog/app.py, fog/alerts.py,
fog/publisher.py, backend/processor/*.py, backend/dashboard/app.py -- is an
independent implementation for this domain, not shared with any sibling
project; each was spot-checked against the equivalent sibling files to
confirm this. Beyond that one shared helper, this pipeline was built from
scratch for this CA. It does depend on the following third-party open-source
components, used as standard libraries/tools rather than copied source:
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
Beyond the LocalStack-backed Phase 1 stack above, this project is also
deployed to a real AWS account (AWS Academy Learner Lab, account
733939924597, region us-east-1, Chaitanya's own login -- see CLAUDE.md at the
repository root for the account-ID guardrail and full live-resource list).

Live resources: DynamoDB table fec-agri-readings (partition key sensor_type,
sort key sort_key); SQS queue fec-agri-agg; Lambda fec-agri-processor
(SQS-event-source-triggered ingestion, same handler.py/process.py used
locally); Lambda fec-agri-dashboard-api (backend/dashboard/lambda_handler.py
wraps the existing FastAPI app with Mangum instead of a hand-written router,
so every /api/* route defined in app.py runs unchanged whether reached via
uvicorn locally or via API Gateway in AWS) behind a real API Gateway HTTP API
(fjdi0s1wed); EC2 instance i-04bfb4c32faa2fe8b (tagged fec-agri-fog-host)
running the fog node and all six sensor containers via
infra/docker-compose.aws.yml, fronted by Elastic IP 18.235.14.218 so its
public address stays fixed across stop/start; S3 bucket
fec-agri-frontend-733939924597 serving the dashboard's static assets directly
(public read); S3 staging bucket fec-agri-deploy-733939924597 (used to ship
source to the EC2 instance since this repo is private and can't be
git-clone'd from there without embedding a token).

Live URLs:
  Dashboard: https://fec-agri-frontend-733939924597.s3.us-east-1.amazonaws.com/index.html
  API:       https://fjdi0s1wed.execute-api.us-east-1.amazonaws.com

Configuration-only differences from the LocalStack stack, no code fork: (1)
the EC2 instance runs infra/docker-compose.aws.yml (fog and the six sensors
only -- no LocalStack, no dashboard container, no one-shot processor-deploy
job, since both Lambdas and the DynamoDB table are provisioned straight
against the real account instead) with no AWS_ACCESS_KEY_ID or
AWS_ENDPOINT_URL set at all, so fog/publisher.py's boto3.client(...) call
falls through to the SDK's default credential chain and picks up the EC2
instance profile (LabInstanceProfile) automatically -- this required no fix
here, unlike projects 15/22, because boto3's default provider chain was
already used correctly throughout; (2) the dashboard's static assets are
served directly from S3 rather than through the local FastAPI server, so
index.html loads static/runtime-config.js before dashboard.js, which sets
window.RUNTIME_CONFIG.apiBase to the real API Gateway URL above (deploy-time
generated; left blank for local dev, where the same origin serves both the
API and the static files) -- a distinct mechanism from project 15's <meta
name="api-base"> tag -- and app.py's CORSMiddleware adds the
Access-Control-Allow-Origin header the resulting cross-origin fetches need.

Two gaps were found and fixed before this deployment was attempted (not
discovered by it failing): backend/dashboard/app.py's /api/backend-stats
reported the DynamoDB item count via a single COUNT-select Scan call, which
only counts the ~1MB page DynamoDB returns per call -- fixed with
_count_scan_pages(), a generator that follows LastEvaluatedKey across pages
and sums every page's Count via sum(), genuinely distinct in shape from the
do-while (project 22) and while-true-with-array-push (project 15) fixes for
the same bug class. Separately, fog/publisher.py sent one SQS message per
aggregate in a loop, issuing one outbound API call per aggregate even when
several windows closed in the same flush cycle; publish_batch() was
added, chunked at SendMessageBatch's 10-entry limit, and fog/app.py's
flush_once() now calls it once per window instead of looping the old
single-message publish().

REPORT

documents/Chaitanya_X25171216/Chaitanya_X25171216.docx (and matching .pdf),
6 pages, IEEE conference two-column format. Covers the sensor/fog layer,
the SQS-to-Lambda-to-DynamoDB backend, the Mangum-wrapped dashboard API
behind API Gateway, a critical analysis of five rejected/deferred
architecture alternatives, security considerations, the two real defects
found and fixed during AWS deployment, and live evidence gathered directly
against the deployed system (a 300-message burst load test, two /api/health
polls fifteen seconds apart, and independent AWS CLI verification of every
live resource). Nine references, cited in strict order of first appearance
in the text.
