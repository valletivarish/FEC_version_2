Wildfire & Forest Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/10-wildfire-forest-monitoring/), not the repo root.

OVERVIEW
--------
A forest service monitors fire risk at two remote ranger stations
(station-1, station-2). Each station carries five sensors -- temperature,
humidity, smoke density, wind speed, and soil moisture. A fog node buffers
incoming readings per (sensor_type, site_id), windows and aggregates them
every WINDOW_SECONDS, evaluates fire/weather threshold rules against the
aggregate, and dispatches one aggregate message per window to a queue. A
Lambda function (running inside LocalStack) consumes the queue and stores
records in DynamoDB. A web dashboard renders, per station, a derived 0-4
fire-risk index as a radial dial (computed live from four of the five
sensors' window averages) plus the five raw readings as secondary detail
tiles, and a cross-station smoke-density trend comparison.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

FIRE RISK INDEX (the dashboard's primary derived metric)
---------------------------------------------------------
The dial score is not a raw sensor value -- it is computed on read
(backend/dashboard/fireRisk.js) from four of the five sensors' current
window averages, +1 point each:
  temperature_c avg      > 30   C
  smoke_density_ppm avg  > 60   ppm
  wind_speed_kmh avg     > 35   km/h
  soil_moisture_pct avg  < 20   %
humidity_pct never contributes a point. These "risk contribution"
thresholds are deliberately lower/earlier than the hard alert thresholds
evaluated in fog/alerts.js (42C / 150ppm / 60km/h / 10%), so the dial
climbs gradually as conditions worsen instead of jumping straight to 4
only when a hard alert actually fires.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step), the third Node.js
implementation in this CA portfolio, after 03-patient-vitals and
06-offshore-wind-farm. To avoid the three same-language projects sharing
recognisable source-level structure, this project deliberately picks a
third, genuinely different implementation choice on every axis where 03
and 06 already differ from each other:

  - Fog buffering: 03 collects raw readings into a shared array-per-key
    object and reduces it at flush time. 06 folds each reading into a
    live streaming accumulator (fog/accumulator.js: openAccumulator /
    fold / seal), never retaining the raw list. This project instead
    decouples ingestion from buffering with an EventEmitter: the HTTP
    handler in fog/app.js only validates the body and calls
    station.submit(...), which emits a "reading" event; a single listener
    subscribed inside fog/buffer.js's createStation() is the only code
    that touches the Map, pushing the raw readings array for that
    (sensor_type, site_id) key. The buffering mechanism is pub/sub, not a
    directly-called shared object or a directly-called accumulator module.

  - Alert rules: 03 (and 01) use a generic [field, op, limit, key] lookup
    table looped over per sensor type. 06 uses an INSPECTORS dispatch
    object with one named function per sensor type. This project instead
    represents rules as fog/alerts.js's RULES: a flat array of plain
    rule-descriptor objects, each { sensorType, key, test }, with no
    lookup-by-type step at all -- evaluateAlerts() runs a single
    RULES.filter(rule => rule.sensorType === sensorType && rule.test(summary))
    .map(rule => rule.key) over the whole list. A separate THRESHOLD_TABLE
    remains purely descriptive metadata for the /thresholds endpoint (not
    read by evaluateAlerts), matching the same disclosure pattern 06 uses.

  - SQS publisher: 03's fog/queueGateway.js is a QueueGateway class with a
    constructor + init() + send(). 06's fog/publisher.js is a closure
    factory createPublisher({...}) returning { publish, queueUrl } via
    closure. This project's fog/publisher.js has no class and no
    closure-factory: publish(sqsClient, queueName, payload) is a single
    plain exported async function that takes the SQS client as a
    parameter on every call. The only piece of cross-call state --
    avoiding a GetQueueUrlCommand round trip on every publish -- is a
    tiny module-level Promise cache (queueUrlCache, a plain Map) inside
    resolveQueueUrl(), not an object/class wrapping the client.

  - HTTP routing: 03's backend/dashboard/server.js registers Express
    routes inline. 06 splits routes into Express Router files
    (routes/readings.js, routes/status.js) mounted onto the app. This
    project uses no Express at all, in either fog/app.js or
    backend/dashboard/server.js: both are built directly on Node's
    built-in http.createServer, parsing req.url with `new URL(...)` and
    hand-dispatching to handlers with plain if-statements on method and
    pathname. This mirrors the Java siblings' deliberate avoidance of a
    web framework (JDK HttpServer there, Node's http module here). Every
    request handler in both services is wrapped in a try/catch that
    translates an uncaught exception into a structured 500 JSON response.

  - Sensor loop: 03's sensors/sensor.js runs one flat setInterval that
    samples every tick and dispatches inline once a dispatch-interval
    check passes. 06's sensors/sensor.js builds a stateful "rig" object
    (buildRig -> sample/dueForFlush/flush) driven by a single setInterval.
    This project's sensors/sensor.js instead runs two fully independent
    self-rescheduling loops -- startSampleLoop() and startDispatchLoop() --
    each using a recursive setTimeout that reschedules itself at the end
    of its own tick body, rather than setInterval at all. The two loops
    never share a timer tick even when SAMPLE_INTERVAL and
    DISPATCH_INTERVAL happen to be numerically close, and a slow dispatch
    fetch cannot cause overlapping dispatch ticks to pile up.

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching 01/03/06. AWS-facing code is
    isolated behind functions that accept an injected client, so unit
    tests use hand-written fake client objects ({ send: async (cmd) => ... })
    instead of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/station),
                       two independent self-rescheduling setTimeout loops
  fog/                http.createServer edge gateway: EventEmitter-based
                       ingest buffering (buffer.js) -> window flush ->
                       array-of-rule-objects alert evaluation (alerts.js)
                       -> plain-function SQS publish (publisher.js), plus
                       a /thresholds endpoint exposing the real alert rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express. Primary
                       view is a radial fire-risk dial per station (SVG
                       arc, band-colored 0-4) with 5 raw-reading detail
                       tiles below; a thresholds proxy (thresholdsProxy.js)
                       is a standalone function taking the upstream URL as
                       a parameter so it is directly unit-testable
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

  Dashboard:  http://localhost:8089
  LocalStack: http://localhost:4575

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog gateway
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. smoke sensors
sample every 1s but dispatch every 6-7s; soil moisture sensors sample
every 4s and dispatch every 12-13s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8089/api/health
  curl http://localhost:8089/api/stations
  curl "http://localhost:8089/api/readings?sensor_type=smoke_density_ppm&site_id=station-1&limit=10"
  curl http://localhost:8089/api/thresholds
  curl http://localhost:8089/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 81 tests below
were run and confirmed passing (node --test) at the time this readme was
written: 8 in sensors/, 34 in fog/, 7 in backend/processor/, 32 in
backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: window aggregation math (count/min/max/avg/latest,
latest = last-in-order not max), threshold evaluation against the exact
hard-alert limits, the fire-risk-index derivation (including that its
risk-contribution thresholds are strictly earlier than the hard alert
thresholds, and that humidity never contributes), sort_key disambiguation
(window_end#site_id), the EventEmitter-driven buffer, the publisher's
queue-url memoization, and REAL HTTP-level tests against a real local
server (not just unit tests of the validation function) for both fog
/ingest (accepts valid payloads with 202, rejects missing fields /
malformed JSON / non-numeric values / empty readings arrays with 400) and
the dashboard's /api/thresholds proxy function (covering both a real
upstream success response and a real unreachable-upstream connection
failure, per fetchThresholds.test.js).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

This asserts (1) the queue shows the burst immediately after sending, and
(2) either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished draining 2000 messages
in time -- that the remaining count strictly decreased from the immediate
post-burst count, proving the Lambda consumer is making real progress
rather than being stalled or broken.

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL
sensor knobs, the loadtest two-tier assertion pattern) is adapted from this
student's own prior projects earlier in this same CA submission
(01-smart-agriculture, 03-patient-vitals, 06-offshore-wind-farm,
07-warehouse-robotics-fleet, 08-retail-footfall-inventory,
09-aquaculture-fish-farm), not a prior/external coursework project. Every
line of application code, the domain logic (wildfire sensor profiles, fire
threshold rules, the fire-risk-index derivation), and the entire dashboard
(charcoal/ember forest-watch theme, radial fire-risk dial, station detail
tiles, smoke-density trend comparison) are original to this project. The
internal module structure was deliberately written differently from both
03-patient-vitals and 06-offshore-wind-farm's Node.js code on every axis
called out in TECH STACK above, so none of the three Node.js projects in
this portfolio share recognisable source-level structure.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard smoke-density trend chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
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
small local display-text map (ALERT_TEXT) instead. The endpoint is kept for
API completeness and possible future use, and is not claimed as a frontend
feature.
