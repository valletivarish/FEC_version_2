Data Center Environmental Monitoring - Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (15-data-center-environmental-monitoring) was completed by
Nithin, Student ID X25125338, as a separate individual submission. It is
NOT part of the primary student's own portfolio of work in the rest of
this repository -- it is deliberately architected to differ from every
other project in this repository (see TECH STACK and REUSE / THIRD-PARTY
COMPONENTS below for the exact, source-verified differences), per the
individual rubric Nithin was assessed against.

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
in a single batched send. A Lambda function (running inside LocalStack)
consumes the queue and stores records in DynamoDB. A second, separate
Lambda function, fronted by a real API Gateway REST API, serves the REST
API; a plain static/reverse-proxy web server renders a compact per-hall
card dashboard with a native <meter> per reading, an alert banner, and
cross-hall window-average trend charts.

Local development and CI still run entirely on Docker with LocalStack
emulating AWS SQS, DynamoDB, Lambda, and API Gateway (see RUN THE STACK
below). The AWS SDK for JavaScript v3 is used throughout, which is what
made the move to a real deployment an endpoint/IAM configuration change
rather than a rewrite: the same fog, processor, and dce-api code now also
runs against a real AWS account with no code fork between the two targets
(see DEPLOYMENT (AWS) below for the live resources and how the two
environments differ in configuration only).

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step). This student's
individually-required architecture must differ from the rest of the
portfolio's Node.js projects (03-patient-vitals, 06-offshore-wind-farm,
10-wildfire-forest-monitoring, 11-water-treatment-utility). Every
differentiation claim below was checked by directly reading those four
projects' current source before writing this section.

  - Fog buffering: a genuine fixed-size ring buffer (fog/ringBuffer.js).
    Each (sensor_type, site_id) key gets a plain JS array of length
    RING_CAPACITY (256) with a manually tracked writeIndex that advances
    via `(writeIndex + 1) % capacity` (ringPush()). This is a different
    accumulation strategy from all four siblings: 03-patient-vitals's
    fog/app.js pushes onto a growing array-per-key Map with no capacity
    bound; 06-offshore-wind-farm's fog/accumulator.js folds each value
    into a live streaming running-sum accumulator and never retains a raw
    list at all; 10-wildfire-forest-monitoring's fog/buffer.js buffers
    into a Map via an EventEmitter "reading" event (still an unbounded
    array per key, just event-dispatched); 11-water-treatment-utility's
    fog/ledger.js defers ALL grouping to flush time over one single flat
    write-ahead-log array with no per-key structure at ingest at all. None
    of the four use a capacity-bounded array with a manually wrapped
    write-index. ringBuffer.js's ringToOrderedArray() reconstructs
    oldest-first order from the physical slot layout (tail-then-head split
    around writeIndex) so aggregation's "latest" stays correct even after
    a wraparound, and snapshotAndClear() resets every ring's slots/
    writeIndex/count back to empty on every window-timer tick.

  - Alert rules: fog/alerts.js's RULES is a plain object literal keyed by
    sensor_type, mapping to an array of plain {field, op, limit, key} rule
    objects -- evaluated with Object.entries(RULES).filter(([type]) =>
    type === sensorType) to find the matching entry, then a
    rules.filter(fires).forEach() over that sensor's own rule array
    (evaluateAlerts), plus a second helper (hasActiveAlert) built with
    Object.entries(RULES).some(...) for a "does this sensor have any
    firing rule" check. This is a fifth representation, distinct from: 03's
    fog/alerts.js VITAL_LIMITS, a generic [field, op, limit, key] tuple
    table looped over per vital; 06's fog/alerts.js INSPECTORS, a
    per-sensor-type dispatch object of hand-written named functions; 10's
    fog/alerts.js RULES, a flat array of {sensorType, key, test}
    rule-descriptor objects filtered/mapped across the WHOLE list
    regardless of sensor type; 11's fog/alerts.js ALERT_RULES, a real
    Map<sensorType, Function> of closures built by a makeThreshold()
    factory. Here there is no Map, no per-type dispatch function, and no
    closure manufacturing -- just plain data grouped under a plain object
    key, walked with Object.entries().filter()/.some().

  - SQS publisher: fog/publisher.js uses Node's built-in EventEmitter
    (require("node:events")) to decouple window-close from the SQS send.
    fog/app.js's flushOnce() only calls
    `emitter.emit("window-closed", messages)` once per window tick and
    never touches the SQS client; attachPublisher() registers the sole
    listener that owns the SQS client and performs the real send. This is
    a sixth publisher shape, and the first pub/sub one in the Node
    portfolio: 03's fog/queueGateway.js is a QueueGateway class
    (constructor + init() + send()); 06's fog/publisher.js is a closure
    factory createPublisher({...}) handing back a fresh
    {publish, queueUrl} object; 10's fog/publisher.js is a stateless
    exported function publish(sqsClient, queueName, payload) taking the
    client as a parameter every call, with an external module-level Map
    cache for the queue-url lookup; 11's fog/publisher.js is a single
    Object.freeze()'d object literal (a module-scope singleton). None of
    the four dispatch the actual send from an event listener decoupled
    from the flush call site. On top of the EventEmitter shape, this
    project's publisher also satisfies Nithin's explicit batching
    requirement: sendBatch() always issues a real SendMessageBatchCommand
    (chunked at the 10-Entries SQS ceiling), even for a single group, so
    every group closed in one flush cycle goes out together whenever more
    than one is ready -- proven in publisher.test.js by asserting
    exactly one SendMessageBatchCommand call carrying multiple Entries
    when 3 groups close in the same tick (none of 03/06/10/11 use
    send_message_batch at all; all four call SendMessageCommand once per
    message).

  - HTTP routing/framework: fog/app.js is plain node:http with a manual
    if/else dispatch on method/pathname (same "no Express anywhere"
    discipline as 10 and 11, kept deliberately simple because this
    project's real architectural novelty budget is spent on the backend --
    see below). backend/dashboard/server.js is also plain node:http, and
    is intentionally as simple as possible: `if (req.url.startsWith
    ("/api/"))` reverse-proxies to the API Gateway invoke URL, otherwise it
    serves a static file. It holds NO /api/* route table, NO AWS SDK
    imports, and NO business logic at all (server.test.js's "the dashboard
    server holds no /api/* handling logic of its own" test greps server.js
    for DynamoDB/SQS/Lambda/API-Gateway SDK imports and asserts none are
    present). That is a genuinely different shape from every sibling
    dashboard's server.js (03/06's Express Router-based REST API, 10/11's
    node:http + declarative regex router REST API) -- this dashboard
    implements no REST API at all.

  - Sensor loop scheduling: sensors/sensor.js uses two independent, plain
    setInterval calls -- one samples (sampleTick), one dispatches
    (dispatchTick) -- kept deliberately simple for the same reason as the
    dashboard's HTTP routing. This combination does not literally
    duplicate any sibling: 03's sensors/sensor.js runs ONE setInterval that
    samples every tick and dispatches inline; 06's sensors/sensor.js builds
    a stateful "rig" object (buildRig -> sample/dueForFlush/flush) polled
    by ONE setInterval; 10's sensors/sensor.js runs TWO independent
    self-rescheduling setTimeout loops (not setInterval); 11's
    sensors/sensor.js pairs ONE setInterval sampler with an opportunistic
    setImmediate drain loop (not a timer at all for dispatch). Two
    independent plain setInterval calls is a genuinely different fifth
    scheduling idiom.

  - The project's real architectural novelty is the backend, per Nithin's
    individual rubric requirement: instead of a dashboard server directly
    calling DynamoDB/SQS/Lambda (what all four Node siblings' backend/
    dashboard/server.js do), this project deploys a SEPARATE Lambda
    function ("dce-api", backend/api/handler.js) that does its OWN
    internal path/method routing (backend/api/router.js's route(), an
    ordered [method, regex, handler] table matched against the API Gateway
    proxy event's path -- directly unit-testable with fake AWS clients and
    no Lambda runtime at all, see router.test.js), fronted by a REAL AWS
    API Gateway REST API deployed to LocalStack (backend/api/deploy_api.sh:
    apigateway create-rest-api, a single {proxy+} resource under root with
    an ANY method AWS_PROXY integration pointing at dce-api, deployed to
    stage "local"). backend/dashboard/server.js never implements /api/*
    logic itself -- it resolves the API Gateway's invoke URL exactly ONCE
    at startup via GetRestApisCommand (apiGatewayProxy.js's
    resolveInvokeUrl(), the SDK equivalent of `aws apigateway
    get-rest-apis`), caches it, and reverse-proxies every subsequent
    /api/* request to it (apiGatewayProxy.js's proxyRequest()). No other
    project in this portfolio has a second, API-Gateway-fronted Lambda at
    all -- this is a structurally different backend, not just a
    differently-shaped module inside the same architecture.

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching every Node sibling. AWS-facing code
    is isolated behind functions/clients that accept an injected client or
    doc/sqs/lambda object, so every unit test in this project uses
    hand-written fake client objects ({ send: async (cmd) => ... }) instead
    of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/hall):
                       two independent setInterval calls (sample + dispatch)
                       in sensor.js, random-walk profiles in profiles.js
  fog/                node:http edge gateway. /ingest validates and writes
                       into a fixed-size ring buffer keyed by
                       (sensor_type, site_id) (ringBuffer.js) -> window
                       flush snapshots+resets every ring and aggregates
                       (aggregation.js) -> plain-object-literal alert
                       evaluation (alerts.js) -> EventEmitter
                       "window-closed" event -> a single listener performs
                       the real, batched SQS send_message_batch call
                       (publisher.js). /thresholds exposes the real RULES.
  backend/processor/   transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point, dce-processor) +
                       deploy_lambda.sh (packages and registers the
                       function with an SQS event source mapping)
  backend/api/         Nithin's individually-required backend: a SEPARATE
                       Lambda (dce-api, handler.js) doing its own internal
                       routing (router.js) for GET /api/readings,
                       GET /api/halls[/:hallId] (per-hall grouping),
                       GET /api/health, GET /api/backend-stats, and
                       GET /api/thresholds (proxied via thresholdsProxy.js,
                       its own directly-unit-testable function, tested for
                       both success and unreachable-upstream). deploy_api.sh
                       deploys dce-api and provisions a real API Gateway
                       REST API ({proxy+} + ANY + AWS_PROXY) in front of it.
  backend/dashboard/   a deliberately minimal node:http static file server
                       + reverse proxy (server.js): serves static/, and
                       forwards every /api/* request to the API Gateway
                       invoke URL resolved once at startup
                       (apiGatewayProxy.js). Implements NO REST API logic
                       of its own. Static frontend: a cool cyan/slate
                       "server room" theme -- per-hall cards, each listing
                       all 5 readings as rows with a native <meter> per
                       row, a plain nominal/alert-count badge per hall, and
                       Chart.js trend comparisons. No hand-illustrated SVG
                       art anywhere (grep "<svg" this project's source: no
                       hits outside vendor/chart.umd.min.js's own internals).
  infra/               docker-compose stack + LocalStack bootstrap.
                       LAMBDA_DOCKER_NETWORK is set so Lambda executor
                       containers (dce-processor, dce-api) can resolve
                       "fog" and "localstack" by hostname on the dce_net
                       network -- required for dce-api's fog health/
                       thresholds proxy calls.
  loadtest/            queue burst generator (scalability evidence)
  scripts/             end-to-end pipeline verification

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for loadtest/burst.py and
  scripts/verify_pipeline.py)

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
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. power-load sensors
sample every 1s but dispatch every 5-6s; humidity sensors sample every 3s
and dispatch every 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

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
Each module has its own package.json and test script. All 114 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 12 in sensors/, 46 in fog/, 9 in backend/processor/,
37 in backend/api/ (including two added to cover countTableItems()'s
DynamoDB Scan pagination, a real bug found and fixed during the AWS
deployment described below), 10 in backend/dashboard/.
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
no Lambda runtime or API Gateway involved), REAL HTTP-level tests against
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
    python loadtest/burst.py --messages 2000 --workers 32

This asserts (1) the queue shows the burst immediately after sending, and
(2) either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished draining 2000 messages in
time -- that the remaining count strictly decreased from the immediate
post-burst count, proving the Lambda consumer is making real progress
rather than being stalled or broken.

DEPLOYMENT (AWS)
-----------------
Beyond the LocalStack-backed Phase 1 stack above, this project is also
deployed to a real AWS account (AWS Academy Learner Lab, account
373241496019, region us-east-1, Nithin's own login -- see CLAUDE.md at the
repository root for the account-ID guardrail and full live-resource list).

Live resources: DynamoDB table dce-readings; SQS queue dce-hall-agg;
Lambda dce-processor (SQS event-source-triggered ingestion); Lambda
dce-api (Nithin's individually-required separate backend Lambda) behind a
real API Gateway REST API; EC2 instance i-038b378b1b66821b1 (tagged
dce-fog-host) running the fog node and all ten sensor containers via
infra/docker-compose.aws.yml, fronted by Elastic IP 3.228.239.253 so its
public address stays fixed across stop/start; S3 bucket
dce-frontend-373241496019 serving the dashboard's static assets directly
(public read, static website hosting enabled).

Live URLs:
  Dashboard: https://dce-frontend-373241496019.s3.us-east-1.amazonaws.com/index.html
  API:       https://nke958yhid.execute-api.us-east-1.amazonaws.com/prod

Two configuration-only differences from the LocalStack stack, no code
fork: (1) the EC2 instance runs infra/docker-compose.aws.yml (fog and the
ten sensors only -- no LocalStack, no dashboard container, no one-shot
processor/api-deploy jobs, since those two Lambdas and the DynamoDB table
are provisioned straight against the real account instead) with no
AWS_ACCESS_KEY_ID or AWS_ENDPOINT_URL set at all, so fog/publisher.js's
buildClient() falls through to the SDK's default credential chain and
picks up the EC2 instance profile (LabInstanceProfile) automatically; (2)
the dashboard's static assets are served directly from S3 rather than
through the local reverse-proxy server, so index.html's <meta
name="api-base"> is set to the real API Gateway invoke URL above and
dashboard.js's fetch calls read it from there instead of using relative
/api/* paths, with the dce-api Lambda's jsonResponse() adding an
Access-Control-Allow-Origin header for that cross-origin case.

Two credential-handling bugs were found and fixed before this deployment
was attempted (not discovered by it failing): backend/api/awsClients.js,
backend/processor/handler.js, and fog/publisher.js all built their AWS SDK
client credentials from a check that happened to be true in both the
local and the real-AWS case (checking whether AWS_ACCESS_KEY_ID was
merely present, or in fog/publisher.js's case, hardcoding a dummy
key pair unconditionally). Real Lambda and EC2 execution environments
always populate genuine, temporary, session-token-bearing credentials
through that same channel, so this logic would have silently discarded
them in favour of a dummy or incomplete static pair on every real
deployment, exactly the class of bug that broke project 22's first real
deployment. The fix in each file gates the local-only override on
AWS_ENDPOINT_URL instead, the one variable actually unique to the local
emulator. A related bug was also found and fixed in
backend/api/pipelineStatus.js: countTableItems() only read the first page
of a COUNT-select DynamoDB Scan, silently undercounting any table larger
than roughly 1MB; it now follows LastEvaluatedKey across pages and sums
every page's Count, with two new tests (pipelineStatus.test.js) covering
the multi-page and scan-failure cases.

The full pipeline was independently verified live after deployment:
/api/health reports gateway, queue, lambda, and pipeline all true with a
sub-second freshest_age_seconds; /api/halls and /api/backend-stats return
real, continuously updating sensor data for both halls; the S3-hosted
dashboard renders all five per-hall readings and all five trend charts
with zero browser console errors.

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
Per the ATTRIBUTION section above, this project was completed by Nithin
(Student ID X25125338) as an individual submission, architecturally
required to differ from the rest of this repository's portfolio. The
overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme window_end#site_id, the dashboard
health-check response shape, the dual-rate SAMPLE_INTERVAL/
DISPATCH_INTERVAL sensor knobs, the loadtest two-tier assertion pattern,
and the general fog ingest-validate-window-aggregate-alert-publish shape)
follows the same established conventions as the rest of the Node.js
projects in this portfolio (03-patient-vitals, 06-offshore-wind-farm,
10-wildfire-forest-monitoring, 11-water-treatment-utility), which Nithin
was instructed to build against as the reference pattern. Every line of
application code, the domain logic (data-center sensor profiles, the 6
alert thresholds, the per-hall nominal/alert derivation), and the entire
dashboard (cyan/slate "server room" theme, per-hall reading cards, trend
charts) are original to this project.

The internal module structure was deliberately written differently from
03-patient-vitals, 06-offshore-wind-farm, 10-wildfire-forest-monitoring,
and 11-water-treatment-utility's Node.js code on every axis called out in
TECH STACK above (ring-buffer buffering, plain-object-literal alert rules,
EventEmitter-driven SQS publishing, minimal reverse-proxy dashboard HTTP
handling, two-setInterval sensor scheduling) -- verified by directly
reading those four projects' current source before writing this section,
not assumed from memory.

Nithin's individually-required backend architecture -- a SEPARATE Lambda
function ("dce-api") doing its own internal request routing, fronted by a
REAL AWS API Gateway REST API deployed to LocalStack (a single {proxy+}
resource, ANY method, AWS_PROXY integration, deployed to stage "local"),
with the dashboard server reduced to a pure static-file host and reverse
proxy that resolves the API Gateway's invoke URL exactly once at startup
-- is portfolio-unique. No other project in this repository (Node.js,
Python, or Java) provisions a real API Gateway REST API or runs two
separate Lambda functions behind one pipeline; every other project's
dashboard talks to DynamoDB/SQS/Lambda directly via the AWS SDK from a
single always-running backend process. This satisfies Nithin's rubric
requirement for a genuinely different backend architecture from every
other project in this portfolio, and is documented here explicitly per
that requirement.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda, client-api-gateway) -
    https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied byte-for-byte from
    11-water-treatment-utility/backend/dashboard/static/vendor/
    chart.umd.min.js, never fetched from a CDN) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda/API Gateway) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http module (fog and dashboard HTTP servers) -- no
    Express or other web framework dependency anywhere in this project
  - boto3 (Python AWS SDK, used only by the ops tooling in loadtest/ and
    scripts/) - https://boto3.amazonaws.com

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
Because every single /api/* request genuinely round-trips through a real
Lambda invocation (dce-api, behind API Gateway) rather than a directly-
running backend process calling DynamoDB/SQS over the AWS SDK (the
approach every sibling project's dashboard uses), and because
LAMBDA_KEEPALIVE_MS=0 is set portfolio-wide, each request pays a real
LocalStack Lambda cold-start cost (observed here at roughly 2.5-4s per
invocation). dashboard.js's tick() fires its 3 summary requests
(/api/halls, /api/health, /api/backend-stats) via Promise.all, then its 5
trend-chart requests (one per sensor type) also via Promise.all rather
than sequentially, to avoid chaining cold-start latencies end to end. Even
so, first paint of the 5 trend charts can take on the order of 10-30
seconds against a cold LocalStack Lambda (verified with Playwright: 0
console errors throughout, charts populate correctly once the requests
resolve -- this is added latency, not a functional defect). The hall cards
and health strip populate first since summary data resolves before the
5-way trend fan-out completes. This is a genuine, inherent trade-off of
Nithin's individually-required all-Lambda backend architecture and is not
present in the rest of the portfolio.
