Ski Resort & Avalanche Safety Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
------------
This project is Ebin Joseph's individual CA submission, Student ID
X25142224, National College of Ireland. It shares this portfolio repository
with several other students' independently attributed projects as a
convenience; it is not part of the main portfolio owner's own submission.

All commands below assume your working directory is this folder
(projects/25-ski-resort-avalanche-safety/), not the repo root.

OVERVIEW
--------
A ski resort monitors avalanche precursors and slope conditions across two
slopes (slope-a, slope-b). Each slope carries five sensors -- snowpack
depth, snow temperature, wind speed, seismic vibration (the avalanche
precursor signal), and lift chair count. A fog node buffers incoming
readings, windows and aggregates them every WINDOW_SECONDS, evaluates
avalanche-safety threshold rules against the aggregate, and dispatches one
aggregate message per window to a queue. A Lambda function (running inside
LocalStack) consumes the queue and stores records in DynamoDB. A web
dashboard renders a horizontal avalanche risk-level gauge per slope
(LOW/MODERATE/HIGH/EXTREME, drawn against a native <meter>) plus a
per-slope sensor-reading detail panel and cross-slope window-average trend
charts.

The stack runs on Docker with LocalStack emulating AWS SQS, DynamoDB, and
Lambda for local development. It has also been deployed to a real AWS
Academy account -- see REAL AWS DEPLOYMENT below for live resource IDs
and URLs.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step, no Express or other
web framework). fog/intake.js buffers readings per (sensorType, siteId)
into plain object literals; fog/alerts.js evaluates four threshold rules
via per-rule class instances; fog/publisher.js's SQS client is an ES6
Proxy that lazily constructs the real client on first use; fog/app.js and
backend/dashboard/server.js dispatch HTTP routes via a
`switch (true)` on a composed `${method} ${path}` key. Testing uses
Node's built-in node:test + node:assert/strict runner (no Jest/Mocha);
AWS-facing code accepts an injected client so unit tests use hand-written
fake client objects instead of hitting LocalStack. A critical comparison
of this design against the portfolio's other Node.js siblings, with
justification for each choice, is in the project report.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/slope):
                       two independent AbortController-coordinated
                       setTimeout loops (sensor.js), random-walk profiles
                       (profiles.js)
  fog/                http.createServer edge gateway: switch(true)
                       method+path dispatch (app.js) -> /ingest validates
                       and appends to a plain object-literal buffer keyed
                       "sensor_type::site_id" (intake.js) -> window flush
                       groups + aggregates (aggregation.js) -> Rule-class
                       array alert evaluation (alerts.js) -> Proxy-wrapped
                       lazy-client SQS publish (publisher.js), plus a
                       /thresholds endpoint exposing the real rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express, the same
                       switch(true) method+path dispatch as fog/. REST API
                       covering all 5 sensor types plus a per-slope
                       grouping endpoint (GET /api/slopes and GET
                       /api/slopes/:slopeId, the latter matched by a
                       regex-tested switch(true) case). Static frontend: a
                       crisp icy-blue/white alpine theme -- a horizontal
                       avalanche risk-level gauge per slope (plain
                       LOW/MODERATE/HIGH/EXTREME text against a native
                       <meter>), a per-slope reading detail panel, and
                       Chart.js trend comparisons. No hand-illustrated SVG
                       art, no emoji, anywhere.
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

  Dashboard:  http://localhost:8104
  LocalStack: http://localhost:4590

  Recommended bring-up order (matches how this project was verified):
    docker compose -f infra/docker-compose.yml up -d localstack
    docker compose -f infra/docker-compose.yml up -d fog dashboard
    docker compose -f infra/docker-compose.yml up -d processor
    docker compose -f infra/docker-compose.yml up -d

  Stop:  docker compose -f infra/docker-compose.yml down -v

  LocalStack's Lambda emulation starts its own executor container
  (public.ecr.aws/lambda/nodejs:20, named something like
  `ska-localstack-1-lambda-ska-processor-<hash>`) outside docker compose's
  own tracking. `down -v` sometimes reclaims it cleanly and sometimes does
  not: verified across repeated teardowns in this project, one `down -v`
  run left both the executor container AND the `ska_default` network
  behind with `Network ska_default Resource is still in use` printed to
  the console (the executor container was still attached when compose
  tried to remove the network), while another run reclaimed both on its
  own. When it is left behind, remove it manually with (also verified
  live -- this exact pair of commands cleared both the stray container and
  the stray network on the run where `down -v` did not):
    docker ps -a --filter "name=ska-localstack.*-lambda-" -q | xargs -r docker rm -f
    docker network ls --filter "name=ska" -q | xargs -r docker network rm

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds the dispatch loop waits before the next real
                     send once the outbox has items
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. wind sensors sample
every 1s but dispatch after 5-6s; snow-temperature sensors sample every 3s
and dispatch after 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4590 python infra/verify_pipeline.py

Example curl commands against the live REST API (all exercised live while
building this project):
  curl http://localhost:8104/api/health
  curl http://localhost:8104/api/slopes
  curl http://localhost:8104/api/slopes/slope-a
  curl "http://localhost:8104/api/readings?sensor_type=seismic_vibration_mg&site_id=slope-a&limit=10"
  curl http://localhost:8104/api/thresholds
  curl http://localhost:8104/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 121 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 13 in sensors/, 47 in fog/, 10 in backend/processor/,
51 in backend/dashboard/ (38 covering the local dashboard server plus 13 for
lambdaHandler.js, the API Gateway REST API entry point described below).
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: window aggregation math (count/min/max/avg,
latest = last-in-order not max), threshold evaluation against the exact
hard-alert limits (seismic_vibration_mg avg>25, wind_speed_kmh avg>80,
snow_temp_c avg>2, snowpack_depth_cm avg<30), the object-literal intake
buffer's group-at-ingest/snapshot-and-reset behaviour, the Proxy
publisher's lazy-construction/queue-url memoization/retry-then-succeed
behaviour, the AbortController-coordinated sensor loops (both loops stop
rescheduling once the shared signal fires, and a pre-aborted signal never
fires a single tick), sort_key disambiguation (window_end#site_id), and
REAL HTTP-level tests against a real local server on an ephemeral port
(not just unit tests of the validation function) for both fog /ingest
(accepts valid payloads with 202, rejects missing fields / malformed JSON /
non-numeric values / empty readings arrays with 400) and the dashboard's
/api/thresholds proxy function (covering both a real upstream success
response and a real unreachable-upstream connection failure, per
thresholdsProxy.test.js).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4590 \
    python infra/burst.py --messages 2000 --workers 32

This asserts (1) the queue shows the burst immediately after sending, and
(2) either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished draining 2000 messages in
time -- that the remaining count strictly decreased from the immediate
post-burst count, proving the Lambda consumer is making real progress
rather than being stalled or broken. Both were confirmed live: a 2000-
message burst landed as waiting=2000/in_flight=10 immediately after
sending, and after the drain timeout the remaining count had strictly
decreased (consistent with LocalStack's single-container Lambda throughput
ceiling, not a broken pipeline); the script exited 0.

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL sensor
knobs, the loadtest two-tier assertion pattern) is adapted from other prior
codebases in this shared portfolio repository (03-patient-vitals,
06-offshore-wind-farm, 10-wildfire-forest-monitoring,
11-water-treatment-utility, 15-data-center-environmental-monitoring,
18-elevator-escalator-fleet-monitoring, 22-smart-waste-management), not this
student's own earlier work -- several of those belong to the portfolio's
other individually-attributed students (15 to Nithin, X25125338; 22 to
Gundeti Sachin Reddy, X23432721), the rest to the main portfolio owner.
Every line of application code, the domain logic (ski-resort sensor
profiles, the four alert thresholds, the avalanche risk-level
derivation), and the entire dashboard (icy-blue/white alpine theme,
risk-level gauge, per-slope reading panels, trend charts) are original to
this project.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied unmodified from the
    portfolio's 11-water-treatment-utility project, not this student's
    own earlier work) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http module (fog and dashboard HTTP servers) -- no
    Express or other web framework dependency anywhere in this project
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com

REAL AWS DEPLOYMENT
--------------------
The account was redeployed once, 2026-07-15, when a new Learner Lab
session issued a different sandbox account instead of refreshing the
original one; both deployments are listed below since the original
account's resources are orphaned rather than deleted.

CURRENT: DynamoDB table ska-readings,
SQS queue ska-slope-agg, Lambda ska-processor and Lambda
ska-dashboard-api (API Gateway REST API fl6fe76mlf), EC2 instance
i-02485962a872245d9 (security group sg-043d59fbae6bca08f, inbound TCP
8000 only), Elastic IP 52.86.31.136, S3 buckets
ska-frontend-475393590440 (dashboard) and ska-deploy-475393590440
(staging). Dashboard: https://ska-frontend-475393590440.s3.us-east-1.amazonaws.com/index.html
API: https://fl6fe76mlf.execute-api.us-east-1.amazonaws.com/prod

ORIGINAL, now orphaned (first deployed 2026-07-15): DynamoDB table
ska-readings, SQS queue ska-slope-agg, Lambda
ska-processor and Lambda ska-dashboard-api (API Gateway REST API
se2853uk5d), EC2 instance i-0fddea02b8aafbc11, Elastic IP 54.81.144.80,
S3 buckets ska-frontend-596691181085 and ska-deploy-596691181085.
Dashboard: https://ska-frontend-596691181085.s3.us-east-1.amazonaws.com/index.html
API: https://se2853uk5d.execute-api.us-east-1.amazonaws.com/prod
