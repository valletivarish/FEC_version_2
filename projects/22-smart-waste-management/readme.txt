Smart Waste Management Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (22-smart-waste-management) is the individual CA submission
of Gundeti Sachin Reddy, Student ID X23432721. It has been deployed to a
real AWS account (AWS Academy Learner Lab, account 548539235319, us-east-1)
under that student's own AWS Academy credentials -- see DEPLOYMENT (AWS)
below for the live resources and their names.

All commands below assume your working directory is this folder
(projects/22-smart-waste-management/), not the repo root.

OVERVIEW
--------
A municipal waste management authority monitors smart collection bins
across two collection districts (district-a, district-b). Each district
carries five sensors -- fill level, internal temperature, gas/odor level,
bin weight, and lid-open activity. A fog node buffers incoming readings,
windows and aggregates them every WINDOW_SECONDS, evaluates
tamper/fire/odor/collection threshold rules against the aggregate, and
dispatches one aggregate message per window to a queue. A Lambda function
consumes the queue and stores records in DynamoDB. A web dashboard renders
a "collection priority list" -- a flat, sorted worklist of every bin
ordered by fill level, the way a dispatcher would triage which bin to send
a truck to next -- plus per-district raw reading cards and a fill-level
trend chart.

Local development and this project's own CI run entirely on Docker with
LocalStack emulating AWS SQS, DynamoDB, and Lambda. The AWS SDK for
JavaScript v3 is used throughout, so the same code runs against LocalStack
locally and against real AWS in production (an endpoint/credential
resolution difference only, not a rewrite). This project has also been
deployed and tested on a real AWS account -- see DEPLOYMENT (AWS) below for
the live architecture, resources, and URLs; see the project report's
evaluation section for the defects found and fixed during that deployment.

TECH STACK
----------
Node.js 20 with plain CommonJS modules and Node's built-in http.createServer
everywhere.

  - Sensor loop: a single physical setInterval ("pulse", PULSE_MS default
    250ms) drives both sampling and dispatch via two independent
    millisecond accumulators, decoupled from SAMPLE_INTERVAL/
    DISPATCH_INTERVAL (sensors/pulse.js). pulseTick is directly unit-tested
    with fake onSample/onDispatch callbacks, no real timers involved.
  - Fog buffering: readings are grouped per-key at ingest into a double
    buffer (fog/doubleBuffer.js); each window flush (swapAndDrain) swaps in
    a fresh empty Map as the live buffer and hands the previous Map to the
    caller to drain, so ingest and drain never touch the same object.
  - Alert rules: fog/alerts.js's evaluateAlerts(sensorType, summary) is a
    plain switch statement on sensor type. A separate THRESHOLD_TABLE
    object is descriptive metadata only, exposed via the /thresholds
    endpoint, and is never consulted by evaluateAlerts.
  - SQS publisher: fog/publishQueue.js is a self-draining async FIFO work
    queue -- publish() enqueues a job and returns a promise that settles
    once that job is sent; a single _pump() loop drains jobs strictly one
    at a time in arrival order.
  - HTTP routing: fog/router.js and backend/dashboard/router.js are a
    hand-rolled trie (prefix tree) router with path-parameter support,
    walked segment-by-segment by dispatch(), so lookup cost tracks path
    depth rather than the number of registered routes.
  - Testing uses Node's built-in node:test + node:assert/strict runner.
    AWS-facing code accepts an injected client, so unit tests use
    hand-written fake client objects instead of hitting LocalStack.

A field-by-field comparison of these implementation choices against this
portfolio's other Node.js projects (03, 06, 10, 11, 15, 18) is in the
project report's architecture section, not here.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/district):
                       pulse.js drives sampling+dispatch off one shared
                       timer, profiles.js holds the random-walk profiles
  fog/                http.createServer edge gateway: trie-based routing
                       (router.js) -> /ingest validates and buffers per-key
                       (doubleBuffer.js) -> window flush (swapAndDrain) ->
                       aggregation.js -> alerts.js -> publishQueue.js,
                       plus a /thresholds endpoint exposing the rules as
                       descriptive metadata only
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, the same trie-based
                       router.js as fog/. REST API: GET /api/districts,
                       GET /api/districts/:id, GET /api/priority (both
                       districts flattened into one collection-priority
                       list sorted by fill_level_pct descending),
                       GET /api/readings, GET /api/thresholds,
                       GET /api/backend-stats, GET /api/health. Static
                       frontend: a sorted priority-list worklist table,
                       per-district cards with all 5 raw readings as rows
                       with native <meter> bars, and a small Chart.js
                       fill-level trend chart
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for infra/burst.py and
  infra/verify_pipeline.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8101
  LocalStack: http://localhost:4587

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatch pulses that actually POST an
                     accumulated batch to the fog gateway
  PULSE_MS           (optional, default 250ms) the base physical timer
                     rate that drives both accumulators -- does not need to
                     divide either SAMPLE_INTERVAL or DISPATCH_INTERVAL
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. lid-open sensors
sample every 1s but dispatch after roughly 5-6s; internal-temperature
sensors sample every 3s and dispatch after roughly 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8101/api/health
  curl http://localhost:8101/api/priority
  curl http://localhost:8101/api/districts
  curl http://localhost:8101/api/districts/district-b
  curl "http://localhost:8101/api/readings?sensor_type=gas_level_ppm&site_id=district-a&limit=10"
  curl http://localhost:8101/api/thresholds
  curl http://localhost:8101/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 115 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 19 in sensors/, 46 in fog/, 11 in backend/processor/,
39 in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: the pulse accumulator's tick-divisor and
carry-forward behaviour (pulse.test.js, driven with fake callbacks and no
real timers), window aggregation math (count/min/max/avg/latest), threshold
evaluation against the exact alert limits (including that tamper_suspected
checks max, not avg), the double buffer's grouped-at-ingest +
reference-swap-at-flush behaviour, the publish queue's FIFO single-pump
exclusivity, the trie router's segment-by-segment dispatch and
path-parameter capture, sort_key disambiguation (window_end#site_id), and
real HTTP-level tests (not just unit tests of the validation function) for
fog /ingest (valid payloads accepted with 202, malformed/missing/invalid
payloads rejected with 400) and the dashboard's /api/thresholds proxy
(covering both a real upstream success response and an unreachable-upstream
failure, per thresholdsProxy.test.js).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

This asserts (1) the queue shows the burst immediately after sending, and
(2) either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished draining 2000 messages in
time -- that the remaining count strictly decreased from the immediate
post-burst count, proving the Lambda consumer is making real progress
rather than being stalled or broken.

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
Adapted from other codebases in this portfolio (not this student's own
earlier work):
  - the SQS -> Lambda -> DynamoDB pipeline architecture (via LocalStack)
  - the sort_key disambiguation scheme (window_end#site_id)
  - the dashboard health-check pattern
  - the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL sensor knobs
  - the load-test two-tier assertion pattern

Original to this project: all application code, the domain logic
(waste-management sensor profiles, the four alert thresholds, the
collection-priority derivation), the entire dashboard (theme, priority-list
worklist, per-district cards, trend chart), and the internal module
structure (sensor scheduling, fog buffering, alert-rule representation, SQS
publisher, HTTP routing/dispatch) -- see the project report's architecture
section for the comparison against this portfolio's other Node.js projects
(03, 06, 10, 11, 15, 18).

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend chart, vendored at
    backend/dashboard/static/vendor/, copied from an existing sibling
    project rather than fetched from a CDN) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http module (fog and dashboard HTTP servers) -- no
    Express or other web framework dependency anywhere in this project
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway via
thresholdsProxy.js's fetchThresholds(url), covered by its own test for both
the success and unreachable-upstream paths. The current frontend
(dashboard.js) does not call it directly -- alert names are rendered from a
small local display-text map (ALERT_LABELS) instead. The endpoint is kept
for API completeness and possible future use, and is not claimed as a
frontend feature.

NOTE ON THE PRIORITY LIST WITH ONLY TWO DISTRICTS
---------------------------------------------------
Site_id granularity in this project is per-district (district-a,
district-b), so the collection priority list has at most two rows at any
moment. GET /api/priority (readingsStore.js's buildPriorityList) performs a
real sort by fill_level_pct.latest descending and re-sorts on every poll,
so whichever district has the highest fill level is always listed first
rather than a fixed left-to-right/row order. The design generalises
directly to more collection points without any structural change.

DEPLOYMENT (AWS)
----------------
Deployed to a real AWS account: AWS Academy Learner Lab, account
548539235319, region us-east-1, under Gundeti Sachin Reddy's (X23432721)
own AWS Academy credentials.

Live resources:
  DynamoDB table  swm-readings
  SQS queue       swm-district-agg
  Lambda function swm-processor       (nodejs20.x, LabRole, SQS event
                                       source mapping -- the fog-dispatch
                                       consumer)
  Lambda function swm-dashboard-api   (nodejs20.x, LabRole, behind API
                                       Gateway; reuses server.js's existing
                                       router/handlers via
                                       lambdaHandler.js's fake-
                                       ServerResponse shim)
  API Gateway     f721o30kd5          (HTTP API, AWS_PROXY integration to
                                       swm-dashboard-api, public, HTTPS/443)
  S3 bucket       swm-frontend-548539235319 (static frontend: index.html,
                                       static/style.css, static/dashboard.js,
                                       static/vendor/chart.umd.min.js --
                                       public s3:GetObject only)
  S3 bucket       swm-deploy-548539235319   (deployment staging only)
  EC2 instance    i-022c30cf73b0c10db (t3.small, tag Name=swm-dashboard-host,
                                       LabInstanceProfile, no SSH/key-pair --
                                       managed via SSM Session Manager;
                                       runs fog + the 10 sensor containers
                                       via infra/docker-compose.aws.yml;
                                       security group open on tcp/8100 so
                                       the dashboard Lambda can reach fog's
                                       health/thresholds endpoint)
  Elastic IP      54.204.136.193 (allocation eipalloc-0d769166f544d0320,
                                       associated with the EC2 instance
                                       above so its public IP stays fixed
                                       across a stop/start; the dashboard
                                       Lambda's FOG_HEALTH_URL/
                                       FOG_THRESHOLDS_URL env vars point at
                                       this IP and need updating only if it
                                       is ever released and reallocated)

Live URLs:
  Dashboard (open this):  https://swm-frontend-548539235319.s3.us-east-1.amazonaws.com/index.html
  Dashboard API:          https://f721o30kd5.execute-api.us-east-1.amazonaws.com

Historical note: the dashboard was originally a 4th container on the EC2
instance itself (port 8101); it was migrated to the S3 + Lambda + API
Gateway layout above because CloudFront and public/unauthenticated Lambda
Function URLs are both blocked in this Learner Lab account (API Gateway is
not). See the project report's evaluation section for the defects found
during deployment and this migration.

Because this is a time-limited AWS Academy Learner Lab session, session/lab
expiry may eventually reclaim the EC2 instance and/or its public IP;
DynamoDB/SQS/both Lambda functions/API Gateway/both S3 buckets are more
likely to persist across a lab reset than the EC2 instance is, and none of
them depend on the EC2 instance being up (the dashboard and its API stay
live even while fog/sensors are paused between lab sessions -- only
"gateway: false" in /api/health and stale sensor data would result, not a
dead dashboard). To tear everything down: terminate the EC2 instance,
delete the SQS queue, delete both Lambda functions (and the processor's
event-source-mapping), delete the API Gateway API, delete the DynamoDB
table, empty and delete both S3 buckets, and delete the security groups
(swm-dashboard-sg) -- all resources are uniquely named with the swm-
prefix or tagged Project=FEC-22-smart-waste-management, safe to filter on.

WAKING FOG/SENSORS BACK UP AFTER A LAB SESSION ENDS
-----------------------------------------------------
.github/workflows/wake-22-smart-waste-management.yml is a manually
triggered (workflow_dispatch, no schedule -- it only ever runs when a
student explicitly clicks Run workflow) GitHub Actions workflow for
exactly this situation: an AWS Academy Learner Lab session ended, its EC2
instance got stopped by the platform, and a fresh session (with new
temporary credentials) has since been started. Since the dashboard and
its API are fully serverless now, this workflow only needs to bring
fog/sensors back -- the dashboard itself does not go down between lab
sessions.

Before triggering a run, update three repository secrets with the fresh
session's values (repo Settings -> Secrets and variables -> Actions ->
New repository secret): AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
AWS_SESSION_TOKEN. Repository secrets are encrypted at rest and are never
shown in workflow logs or run metadata, unlike workflow_dispatch inputs.
Then trigger the workflow from the Actions tab (no inputs to fill in).

It verifies the credentials resolve to the expected account
(548539235319), confirms the DynamoDB table/SQS queue/processor Lambda
still exist (if the lab did a full account reset rather than just
stopping the instance, it fails fast here with a message saying a full
redeploy is needed instead), starts the EC2 instance if stopped, waits
for SSM, runs docker-compose up (idempotent -- a no-op if containers are
already running), and smoke-tests the dashboard API (which does not
itself depend on the EC2 instance, so this step verifies fog reachability
specifically, not just "is anything up").
