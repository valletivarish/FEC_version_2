Bridge & Structural Health Monitoring
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (21-bridge-structural-health) is the individual CA submission
of Kasireddy Vadicherla, Student ID X25104047. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

All commands below assume your working directory is this folder
(projects/21-bridge-structural-health/), not the repo root.

OVERVIEW
--------
A civil infrastructure authority monitors structural health on two bridge
spans (span-a, span-b). Five simulated structural sensors per span (strain
gauge, deck vibration, tilt/inclinometer, weigh-in-motion traffic load,
expansion joint movement) feed a virtual fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches
one aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders
a live per-span "structural integrity index" bar, all 5 raw readings, and
a strain trend chart.

This repo's Docker/LocalStack stack (below) is the full local development
and test environment, emulating AWS SQS, DynamoDB, and Lambda. The AWS SDK
(boto3) is used throughout, so a move to a real AWS account is an
endpoint/IAM configuration change rather than a rewrite.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor_type/span
                       pair; two independent OS processes per container --
                       see REUSE below)
  fog/                Bottle fog node: ingest, window, aggregate, alert,
                       publish
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  Bottle + Chart.js live dashboard
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real-HTTP-level route tests

SENSOR TYPES
------------
  strain_microstrain     microstrain, 0-2000, start 300, step 100.0
  deck_vibration_mms      mm/s,        0-30,   start 2,   step 1.5
  tilt_angle_deg          deg,         0-5,    start 0.3, step 0.15
  traffic_load_tonnes     tonnes,      0-200,  start 40,  step 15.0
  expansion_joint_mm      mm,          -50-50, start 5,   step 3.0
                          (can go negative -- thermal contraction)

ALERT THRESHOLDS (evaluated on the window aggregate)
-----------------------------------------------------
  strain_microstrain:   avg > 1200  -> structural_stress_warning
  deck_vibration_mms:   max > 20    -> excessive_vibration_alert
  tilt_angle_deg:       avg > 2.5   -> deformation_risk
  traffic_load_tonnes:  avg > 150   -> overload_risk
  expansion_joint_mm has no alert rule -- informational thermal-movement
  reading only, still one of the 5 required sensors and shown in the
  dashboard's secondary detail section.

STRUCTURAL INTEGRITY INDEX (backend/dashboard/scoring.py)
-----------------------------------------------------------
The dashboard's primary per-span view is a single 0-100% index, combining
that window's strain_microstrain average and deck_vibration_mms peak
against configured safe/critical bounds. Each component scores 100 at or
below its safe bound and 0 at or beyond its critical bound, linearly
in-between; the two component scores are then averaged and rounded to one
decimal place. The critical bounds equal fog/alerts.py's own alert
thresholds (1200 microstrain avg, 20 mm/s vibration max), so the index
reaches 0 exactly where an engineer would already see an active alert.

    strain_score    = 100 - 100 * (strain_avg - 400)      / (1200 - 400)   [clamped 0..100]
    vibration_score  = 100 - 100 * (vibration_max - 8)      / (20 - 8)       [clamped 0..100]
    integrity_index   = round((strain_score + vibration_score) / 2, 1)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests locally)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8100
  LocalStack: http://localhost:4586

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: docker compose down -v can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
bshm-localstack-1-lambda-bshm-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If down -v reports
"Network bshm_default Resource is still in use", check for it and clean
up explicitly:
  docker ps -a --filter "name=bshm"
  docker network ls --filter "name=bshm"
  docker rm -f <the lambda-executor container name>
  docker network rm bshm_default

CONFIGURE SENSOR RATES
----------------------
Each sensor container takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every one of the 10 sensor services (5 sensor types x 2 spans) uses a
distinct SAMPLE_INTERVAL/DISPATCH_INTERVAL pair.

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4586 python infra/verify_pipeline.py

A few manual curl checks against the running stack:
  curl http://localhost:8100/api/health
  curl http://localhost:8100/api/thresholds
  curl http://localhost:8100/api/spans
  curl "http://localhost:8100/api/readings?sensor_type=strain_microstrain&site_id=span-a&limit=10"
  curl http://localhost:8100/api/backend-stats

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
    AWS_ENDPOINT_URL=http://localhost:4586 \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
Reused: the overall pipeline shape (sensors -> fog windowing/aggregation/
alerting -> queue -> FaaS processor -> datastore -> dashboard), a design
pattern shared across this portfolio repository. It belongs to the main
portfolio owner, not this student's own prior work. (See the project
report's architecture section for a comparison against this portfolio's
other Python projects.)

Original to this project: the code itself (fog buffering, alert-rule
representation, SQS publisher, HTTP routing, sensor-loop scheduling), all
domain-specific logic (sensor types, thresholds, the structural integrity
index), and the entire dashboard UI.

Third-party open-source components used as standard libraries/tools:
  - Bottle (fog node, dashboard) - https://bottlepy.org
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (dashboard chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org

REAL AWS DEPLOYMENT
--------------------
ARCHITECTURE: the dashboard API runs as an AWS Lambda function behind an
API Gateway REST API. EC2 runs the fog node and the ten sensor
containers.

LIVE RESOURCES: DynamoDB table bshm-readings, SQS queue bshm-span-agg,
Lambda bshm-processor (SQS-triggered ingestion) and Lambda
bshm-dashboard-api (behind API Gateway REST API pe87xzlj3j), EC2
instance i-0248a49cf83500330 (security group sg-0da0aeef22d0c9dba,
inbound TCP 8000 only), Elastic IP 54.175.26.119, S3 bucket
bshm-frontend-661886400169 (dashboard frontend, public read-only) and S3
staging bucket bshm-deploy-661886400169.

Live URLs: dashboard at
https://bshm-frontend-661886400169.s3.us-east-1.amazonaws.com/index.html,
API at https://pe87xzlj3j.execute-api.us-east-1.amazonaws.com/prod.
