Marine Vessel / Cruise Ship Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (23-marine-vessel-monitoring) is the individual CA submission
of Gopi Krishnan, Student ID X25112627. It is NOT part of the primary
student's own portfolio of work in the rest of this repository.

All commands below assume your working directory is this folder
(projects/23-marine-vessel-monitoring/), not the repo root.

OVERVIEW
--------
Two cruise vessels (vessel-a, vessel-b) each carry five simulated sensors
(engine room temperature, fuel consumption, ballast water level, hull
vibration, passenger count) that feed a fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches
one aggregate per window to a queue. An AWS Lambda function consumes the
queue and stores records; a web dashboard renders a Bridge Console (a
two-column vessel-a/vessel-b comparison panel, one row per reading) plus a
chronological Voyage Log of recent aggregation windows.

Local development and CI run entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so
the same code deploys unchanged to a real AWS account -- see DEPLOYMENT
(AWS) below.

LAYOUT
------
  sensors/            sensor simulator (one process per sensor type/vessel)
  fog/                Tornado fog node: ingest, buffer, window, aggregate,
                       alert, publish
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  Tornado REST API + static frontend (marine teal/white
                       "bridge display" theme, Bridge Console two-column
                       comparison panel + Voyage Log)
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real HTTP-level route tests

SENSOR TYPES
------------
  engine_room_temp_c        C,       20-90,   start 45,  step 4.0
  fuel_consumption_lph      L/h,     0-500,   start 150, step 30.0
  ballast_water_level_pct   %,       0-100,   start 50,  step 6.0
  hull_vibration_mm         mm/s,    0-20,    start 2,   step 1.5
  passenger_count           people,  0-3000,  start 800, step 150.0
                            (no alert rule -- informational secondary
                            detail only, still one of the 5 required
                            sensors and shown in the Bridge Console)

ALERT THRESHOLDS (evaluated on the window aggregate)
-----------------------------------------------------
  engine_room_temp_c:      avg > 75  -> engine_overheat_risk
  fuel_consumption_lph:    avg > 350 -> fuel_burn_excessive
  ballast_water_level_pct: avg > 90  -> ballast_overfill_risk
  hull_vibration_mm:       max > 15  -> hull_stress_warning

DEPLOYMENT (AWS)
-----------------
ARCHITECTURE: EC2 runs the fog node and the ten sensor containers. The
dashboard API runs as an AWS Lambda function behind API Gateway,
answering /api/* and reusing data_access.py directly.

  DynamoDB:      mvs-readings (PAY_PER_REQUEST, partition key sensor_type,
                 sort key sort_key)
  SQS queue:     mvs-vessel-agg
  Lambda:        mvs-processor (SQS-triggered ingestion via event source
                 mapping)
  Lambda:        mvs-dashboard-api, behind API Gateway REST API 3crovrzml6
  EC2 instance:  i-00cee8327e251f43d (tagged mvs-fog-host, runs the fog
                 node + 10 sensor containers), security group
                 sg-0237d7ef5cf8bf8c9 (inbound TCP 8000 only, no SSH,
                 administered via SSM only)
  Elastic IP:    3.93.139.149 (allocation eipalloc-080d56c695197faf4,
                 associated with the instance so its public IP stays
                 fixed across stop/start)
  S3 buckets:    mvs-frontend-573065484152 (static dashboard frontend,
                 public read-only, static website hosting enabled),
                 mvs-deploy-573065484152 (staging bucket used to ship
                 source to the EC2 instance)

Live URLs:
  Dashboard: http://mvs-frontend-573065484152.s3-website-us-east-1.amazonaws.com/
  API:       https://3crovrzml6.execute-api.us-east-1.amazonaws.com/prod

index.html requests its assets at /static/style.css, /static/dashboard.js,
and /static/vendor/chart.umd.min.js (matching how the local Tornado server
mounts StaticFileHandler), so any re-upload to S3 MUST preserve that path
shape -- index.html goes to the bucket root, everything else goes under a
static/ prefix:
  aws s3 cp backend/dashboard/static/index.html s3://<bucket>/index.html
  aws s3 cp backend/dashboard/static/style.css s3://<bucket>/static/style.css
  aws s3 cp backend/dashboard/static/dashboard.js s3://<bucket>/static/dashboard.js
  aws s3 cp backend/dashboard/static/vendor/chart.umd.min.js s3://<bucket>/static/vendor/chart.umd.min.js
A flat `aws s3 sync backend/dashboard/static/ s3://<bucket>/` uploads
everything to the bucket root instead, breaking every asset reference
with a 404.

Health check: curl https://3crovrzml6.execute-api.us-east-1.amazonaws.com/prod/api/health
should return {"gateway":true,"queue":true,"lambda":true,"pipeline":true}.

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest + tornado + boto3 -- tornado
  and boto3 are also the only runtime dependencies of the fog node and the
  dashboard backend; the processor and sensors only need boto3 / the
  standard library respectively)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8102
  LocalStack: http://localhost:4588

  Stop:  docker compose -f infra/docker-compose.yml down -v

  Bring services up incrementally if you want to watch each stage:
    docker compose -f infra/docker-compose.yml up -d localstack
    docker compose -f infra/docker-compose.yml up -d fog dashboard
    docker compose -f infra/docker-compose.yml up -d processor
    docker compose -f infra/docker-compose.yml up -d

TEARDOWN NOTE: `docker compose down -v` can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
mvs-localstack-1-lambda-mvs-processor-<hash>) and the network it is
attached to, which blocks the network's removal ("Network mvs_default
Resource is still in use"). If it happens, check for it and clean up
explicitly:
  docker ps -a --filter "name=mvs"
  docker network ls --filter "name=mvs"
  docker rm -f <the lambda-executor container name>
  docker network rm mvs_default

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every one of the 10 sensor services (5 sensor types x 2 vessels) uses a
distinct SAMPLE_INTERVAL/DISPATCH_INTERVAL pair, e.g. sensor-engine-a
samples every 2s/dispatches every 8s while sensor-passenger-a samples
every 5s/dispatches every 15s, so the two knobs are genuinely independent,
not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 python infra/verify_pipeline.py

Example curl commands:
  curl http://localhost:8102/api/health
  curl http://localhost:8102/api/vessels
  curl http://localhost:8102/api/thresholds
  curl http://localhost:8102/api/backend-stats
  curl "http://localhost:8102/api/readings?sensor_type=hull_vibration_mm&limit=20"
  curl "http://localhost:8102/api/readings?sensor_type=engine_room_temp_c&site_id=vessel-b&limit=10"
  curl "http://localhost:8102/api/voyage-log?limit=10"

fog itself is not published to the host (only reachable at http://fog:8000
inside the compose network); to exercise it directly -- e.g. to see a real
400 from a malformed /ingest payload -- run from inside the dashboard
container, which already has Python and network access to fog:
  docker compose -f infra/docker-compose.yml exec dashboard python3 -c "
  import json, urllib.error, urllib.request
  req = urllib.request.Request('http://fog:8000/ingest',
      data=json.dumps({'bad': 'payload'}).encode(),
      headers={'Content-Type': 'application/json'})
  try:
      urllib.request.urlopen(req)
  except urllib.error.HTTPError as exc:
      print(exc.code, exc.read())
  "
  # -> 400 b'{"error": "sensor_type is required and must be a non-empty string"}'

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

120 tests currently pass, covering:
  - test_aggregation.py       window aggregation math
  - test_alerts.py            RULES evaluation and thresholds_payload(),
                               including that hull vibration keys on "max"
                               not "avg" and passenger_count never fires
  - test_buffering.py         the lock-free plain-dict buffering module
  - test_publisher.py         the fire-and-forget SQS publisher, including
                               a slow-fake-client test proving publish()
                               returns before the network call completes
  - test_validation.py        /ingest input validation
  - test_fog_http.py          real HTTP-level tests against a live Tornado
                               HTTPServer on a real socket (fog node),
                               including the 400 validation path and a
                               flush()-then-published-message assertion
  - test_dashboard_http.py    same real-HTTP-level treatment for the
                               dashboard, including a live 502-on-
                               unreachable-upstream / 200-on-reachable-
                               upstream round trip through /api/thresholds
  - test_sensor.py            the sensor random walk and call_later
                               self-rearming tick logic, including a
                               real-event-loop test asserting the sample
                               tick fires multiple times
  - test_transform.py /
    test_handler.py           Lambda transform/handler against a
                               hand-written fake DynamoDB table (no real
                               AWS/LocalStack touched)
  - test_data_access.py       dashboard DynamoDB/SQS/Lambda data-access
                               functions, including per-vessel grouping
                               and newest-first log merge (fake boto3)
  - test_thresholds_proxy.py  thresholds-proxy function against both a
                               real local success server and a real closed
                               TCP port
  - test_dashboard_lambda_handler.py
                               API Gateway REST API dispatch table,
                               including 404-on-unknown-route, query-param
                               validation, and degrade-to-zero-on-Scan-
                               failure health path (mocked data-access)

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 \
    python infra/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count.
See the project report's evaluation section for the full recorded run and
its interpretation.

BRIDGE CONSOLE / VOYAGE LOG (dashboard structure)
---------------------------------------------------
The dashboard's primary view is a two-column vessel-a/vessel-b comparison
table (backend/dashboard/static/style.css's .console-table rules): one row
per reading, one column per vessel, each cell showing the latest value, a
native <meter> gauge, and an inline alert badge when that reading's rule
has fired. The secondary section is a Voyage Log
(backend/dashboard/data_access.py's recent_log_entries(), .voyage-log
rules): a chronological list of individual aggregation-window entries
across both vessels, newest first. Theme: marine teal/white
(--teal: #0e6e6a, --teal-soft: #dbeeec), standard system font stack only,
no custom SVG, no emoji, native <meter> for every bounded reading. Verified
responsive at 375px (infra/dashboard-mobile.png): the console table scrolls
internally (overflow-x: auto) but the page body itself never scrolls
horizontally.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
Portfolio-wide architecture reused (not this student's own prior work,
disclosed here for transparency): the overall pipeline shape (SQS -> Lambda
-> DynamoDB via LocalStack, the sort_key disambiguation scheme, the
dashboard health-check pattern), adapted from seven earlier Python projects
in this repository: 05-cold-chain-logistics, 12-smart-building-energy,
13-ev-charging-network, 14-smart-parking-management,
17-solar-farm-monitoring, 21-bridge-structural-health, and
01-smart-agriculture (a separate individual CA submission by a different
student, Kondragunta Lakshmi Chaitanya, X25171216).

Written independently for this project: fog buffering, alert-rule
representation, the SQS publisher, the HTTP framework choice (Tornado),
sensor loop scheduling, all domain-specific code (reading profiles, alert
thresholds), and the entire dashboard (teal/white "bridge display" theme,
Bridge Console two-column comparison table + Voyage Log layout). See the
project report's cloud-architecture-justification section for the
comparative analysis against sibling projects.

Third-party open-source components used as standard libraries/tools:
  - Tornado (HTTP framework for fog and dashboard) - https://www.tornadoweb.org
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (engine room temperature trend chart, vendored at
    backend/dashboard/static/vendor/, byte-identical copy of the file
    already vendored in 21-bridge-structural-health, confirmed with `diff`)
    - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
No FastAPI or Flask is used anywhere in this project's application code;
the only third-party runtime dependencies across the whole app are tornado
and boto3.
