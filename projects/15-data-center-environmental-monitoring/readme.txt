Data Center Environmental Monitoring - Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (15-data-center-environmental-monitoring) was completed by
Nithin, Student ID X25125338, as a separate individual submission. It is
NOT part of the primary student's own portfolio of work in the rest of
this repository.

All commands below assume your working directory is this folder
(projects/15-data-center-environmental-monitoring/), not the repo root.

OVERVIEW
--------
A data center facilities team monitors environmental conditions across two
server halls (hall-1, hall-2). Each hall carries five sensors -- temperature,
humidity, airflow, power load, and dust density. A fog node buffers incoming
readings in a fixed-size ring buffer, windows and aggregates them every
WINDOW_SECONDS, evaluates environmental threshold rules against the
aggregate, and dispatches the whole window's aggregated groups to a queue
in a single batched send. A Lambda function consumes the queue and stores
records in DynamoDB. A second, separate Lambda function, fronted by a real
API Gateway REST API, serves the REST API; a plain static/reverse-proxy web
server renders a compact per-hall card dashboard with a native <meter> per
reading, an alert banner, and cross-hall window-average trend charts.

Local development and CI run entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, Lambda, and API Gateway (see RUN THE STACK below). The
same fog/processor/api code also runs unmodified against a real AWS
account -- only endpoint/credential configuration differs between the two
targets (see DEPLOYMENT (AWS) below).

TECH STACK
----------
Node.js 20 with plain CommonJS modules and Node's built-in HTTP server
(no framework, no build step). The fog gateway buffers readings in a
fixed-size ring per sensor/hall, evaluates alert rules against each
closed window, and batches aggregates to SQS via an event-driven
publisher. The dashboard backend reverse-proxies its API to a separate
Lambda-backed API Gateway REST API. Testing uses Node's built-in test
runner; AWS-facing code accepts an injected client so unit tests run
against hand-written fakes instead of LocalStack. A critical comparison
of this design against the portfolio's other Node.js siblings is in the
project report.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/hall):
                       two independent setInterval calls (sample + dispatch)
                       in sensor.js, random-walk profiles in profiles.js
  fog/                node:http edge gateway. /ingest validates and writes
                       into a fixed-size ring buffer keyed by
                       (sensor_type, site_id) (ringBuffer.js) -> window
                       flush snapshots+resets every ring and aggregates
                       (aggregation.js) -> alert evaluation (alerts.js) ->
                       EventEmitter "window-closed" event -> a single
                       listener performs the batched SQS
                       send_message_batch call (publisher.js). /thresholds
                       exposes the real RULES.
  backend/processor/   transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point, dce-processor) +
                       deploy_lambda.sh (packages and registers the
                       function with an SQS event source mapping)
  backend/api/         separate backend Lambda (dce-api, handler.js) doing
                       its own internal routing (router.js) for
                       GET /api/readings, GET /api/halls[/:hallId]
                       (per-hall grouping), GET /api/health,
                       GET /api/backend-stats, and GET /api/thresholds
                       (proxied via thresholdsProxy.js). deploy_api.sh
                       deploys dce-api and provisions a real API Gateway
                       REST API ({proxy+} + ANY + AWS_PROXY) in front of it.
  backend/dashboard/   a minimal node:http static file server + reverse
                       proxy (server.js): serves static/, forwards every
                       /api/* request to the API Gateway invoke URL
                       resolved once at startup (apiGatewayProxy.js).
                       Static frontend: per-hall cards listing all 5
                       readings as rows with a native <meter> per row, a
                       nominal/alert-count badge per hall, and Chart.js
                       trend comparisons.
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots.
                       LAMBDA_DOCKER_NETWORK is set so Lambda executor
                       containers (dce-processor, dce-api) can resolve
                       "fog" and "localstack" by hostname on the dce_net
                       network -- required for dce-api's fog health/
                       thresholds proxy calls.

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for infra/burst.py and
  infra/verify_pipeline.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8094
  LocalStack: http://localhost:4580

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: because this project deploys TWO Lambda functions
(dce-processor for ingestion and dce-api behind API Gateway), `docker
compose down -v` can leave behind more than one LocalStack-spawned
Lambda-executor sibling container (named like
dce-localstack-1-lambda-dce-processor-<hash> and
dce-localstack-1-lambda-dce-api-<hash>) and the network they are
attached to, which blocks the network's removal. If `down -v` reports
"Network dce_net Resource is still in use", check for it and clean up
explicitly:
  docker ps -a --filter "name=dce"
  docker network ls --filter "name=dce"
  docker rm -f <each lambda-executor container name>
  docker network rm dce_net

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatch attempts
Every sensor service in docker-compose.yml uses a different pair (e.g.
power-load sensors sample every 1s but dispatch every 5-6s; humidity
sensors sample every 3s and dispatch every 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Example curl commands against the live REST API (reverse-proxied by the
dashboard to API Gateway -> dce-api):
  curl http://localhost:8094/api/health
  curl http://localhost:8094/api/halls
  curl http://localhost:8094/api/halls/hall-2
  curl "http://localhost:8094/api/readings?sensor_type=power_load_kw&site_id=hall-1&limit=10"
  curl http://localhost:8094/api/thresholds
  curl http://localhost:8094/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. 114 tests total: 12
in sensors/, 46 in fog/, 9 in backend/processor/, 37 in backend/api/
(including two covering countTableItems()'s DynamoDB Scan pagination), 10
in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/api && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: the ring buffer's wraparound/write-index/reset
behaviour (ringBuffer.test.js, including a case where writes exceed
capacity mid-window and only the last RING_CAPACITY readings survive),
window aggregation math (count/min/max/avg/latest, latest = last-in-order
not max), threshold evaluation against the exact 6 hard-alert rules across
5 sensor types, the EventEmitter publisher's send_message_batch call
carrying multiple Entries when more than one group closes in a single
flush cycle (publisher.test.js), sort_key disambiguation
(window_end#site_id), the dce-api Lambda's internal router dispatching by
method+path+regex-capture-group with fake AWS clients (router.test.js,
no Lambda runtime or API Gateway involved), real HTTP-level tests against
a real local server on an ephemeral port for fog's /ingest validation
(accepts valid payloads with 202, rejects missing fields / malformed JSON
/ non-numeric values / empty readings arrays / non-object bodies with
400), and both the dce-api thresholds proxy function (success AND
unreachable-upstream paths, thresholdsProxy.test.js) and the dashboard's
reverse-proxy behaviour (server.test.js: serves static files, returns 503
before the invoke URL is resolved, forwards /api/* requests verbatim once
it is, and holds no AWS SDK imports of its own).

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

DEPLOYMENT (AWS)
-----------------
ARCHITECTURE: EC2 runs the fog node and the ten sensor containers. The
dashboard API runs as a separate AWS Lambda function (dce-api) behind
API Gateway.

Live resources: DynamoDB table dce-readings; SQS queue dce-hall-agg;
Lambda dce-processor (SQS event-source-triggered ingestion); Lambda dce-api
(separate backend Lambda) behind API Gateway REST API nke958yhid; EC2
instance i-038b378b1b66821b1 (tagged dce-fog-host) running the fog node
and all ten sensor containers via infra/docker-compose.aws.yml, fronted by
Elastic IP 3.228.239.253; S3 bucket dce-frontend-373241496019 serving the
dashboard's static assets (public read, static website hosting enabled);
S3 staging bucket dce-deploy-373241496019.

Live URLs:
  Dashboard: https://dce-frontend-373241496019.s3.us-east-1.amazonaws.com/index.html
  API:       https://nke958yhid.execute-api.us-east-1.amazonaws.com/prod


REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme window_end#site_id, the dashboard
health-check response shape, the dual-rate SAMPLE_INTERVAL/
DISPATCH_INTERVAL sensor knobs, the load-test two-tier assertion pattern,
and the general fog ingest-validate-window-aggregate-alert-publish shape)
follows the same conventions as the portfolio's other Node.js projects
(03-patient-vitals, 06-offshore-wind-farm, 10-wildfire-forest-monitoring,
11-water-treatment-utility). All application code, domain logic
(data-center sensor profiles, the 6 alert thresholds, per-hall
nominal/alert derivation), and the dashboard UI are original to this
project.

Third-party open-source components used:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda, client-api-gateway) -
    https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/chart.umd.min.js, copied byte-for-byte
    from 11-water-treatment-utility's copy, never fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda/API Gateway) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http module (fog and dashboard HTTP servers) -- no
    Express or other web framework dependency anywhere in this project
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) -
    https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
GET /api/thresholds is served by the dce-api Lambda's thresholdsProxy.js
(fetchThresholds(url)), covered by its own test for both the success and
unreachable-upstream paths, and reverse-proxied verbatim by the dashboard
server. The current frontend (dashboard.js) does not call it directly --
alert names are rendered from a small local display-text map
(ALERT_LABELS) instead. The endpoint is kept for API completeness and
possible future use, and is not claimed as a frontend feature.

NOTE ON DASHBOARD LATENCY
--------------------------
Because every /api/* request round-trips through a real Lambda invocation
(dce-api, behind API Gateway) rather than a directly-running backend
process calling DynamoDB/SQS, and because LAMBDA_KEEPALIVE_MS=0 is set,
each request pays a real LocalStack Lambda cold-start cost (observed here
at roughly 2.5-4s per invocation). dashboard.js's tick() fires its 3
summary requests (/api/halls, /api/health, /api/backend-stats) via
Promise.all, then its 5 trend-chart requests (one per sensor type) also
via Promise.all rather than sequentially, to avoid chaining cold-start
latencies end to end. Even so, first paint of the 5 trend charts can take
on the order of 10-30 seconds against a cold LocalStack Lambda (verified
with Playwright: 0 console errors throughout, charts populate correctly
once the requests resolve -- this is added latency, not a functional
defect). The hall cards and health strip populate first since summary data
resolves before the 5-way trend fan-out completes.
