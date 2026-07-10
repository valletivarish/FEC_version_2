Water Treatment Utility Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/11-water-treatment-utility/), not the repo root.

OVERVIEW
--------
A water utility monitors treatment quality and flow across two treatment
plants (plant-1, plant-2). Each plant carries five sensors -- turbidity, pH,
chlorine residual, flow rate, and line pressure. A fog node buffers incoming
readings, windows and aggregates them every WINDOW_SECONDS, evaluates
water-quality/hydraulic threshold rules against the aggregate, and
dispatches one aggregate message per window to a queue. A Lambda function
(running inside LocalStack) consumes the queue and stores records in
DynamoDB. A web dashboard renders a compact reading-by-plant matrix table
(rows = the 5 readings, columns = plant-1/plant-2) with a native <meter> per
cell against that reading's configured range, a per-plant compliance strip,
and cross-plant window-average trend charts.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step), the fourth Node.js
implementation in this CA portfolio, after 03-patient-vitals,
06-offshore-wind-farm, and 10-wildfire-forest-monitoring. To avoid all four
same-language projects sharing recognisable source-level structure, this
project deliberately picks a fourth, genuinely different implementation
choice on every axis where 03, 06 and 10 already differ from each other:

  - Fog buffering: 03 collects raw readings into a shared array-per-key
    object and reduces it at flush time. 06 folds each reading into a live
    streaming accumulator (fog/accumulator.js: openAccumulator/fold/seal),
    never retaining the raw list. 10 decouples ingestion from buffering with
    an EventEmitter (fog/buffer.js): the HTTP handler emits a "reading"
    event and a single listener owns the per-key Map. This project instead
    uses a genuine two-phase write-ahead-log design: fog/ledger.js's
    createLedger()/appendEntry()/drainEntries() is a single flat array with
    NO per-key structure at all -- /ingest (in fog/app.js's handleIngest())
    does nothing but validate the request and push one raw entry per
    reading onto that flat array, a plain synchronous Array.push(). There is
    no Map, no per-(sensor_type, site_id) grouping, and no aggregation math
    at ingest time whatsoever. Grouping only happens once, at flush time,
    when ledger.js's groupByKey() runs over the whole drained entry list in
    one pass, immediately before aggregation.js's summarizeWindow(). Fast
    synchronous append now, aggregation entirely deferred to later -- a
    real two-phase design, distinct from all three siblings' at-ingest
    grouping (whether via a directly-called shared object, a directly-
    called streaming accumulator, or an event-emitted per-key Map).

  - Alert rules: 03 uses a generic [field, op, limit, key] lookup table
    looped over per vital (fog/alerts.js's VITAL_LIMITS). 06 uses an
    INSPECTORS dispatch object with one named function per sensor type. 10
    uses a flat array of {sensorType, key, test} rule-descriptor objects
    evaluated via RULES.filter().map(). This project instead represents
    rules as fog/alerts.js's ALERT_RULES: a real Map<sensorType, Function>
    built once at module load, where each value is a small closure produced
    by the makeThreshold(field, op, limit, key) factory, capturing its own
    field/operator/limit/key. evaluateAlerts(sensorType, summary) is a
    single ALERT_RULES.get(sensorType) lookup followed by invoking that
    closure -- no shared lookup table looped per vital, no per-type dispatch
    object of hand-written named functions, and no filter/map over a flat
    array. A separate THRESHOLD_TABLE remains purely descriptive metadata
    for the /thresholds endpoint (never read by evaluateAlerts), matching
    the same disclosure pattern the siblings use.

  - SQS publisher: 03's fog/queueGateway.js is a QueueGateway class
    (constructor + init() + send()). 06's fog/publisher.js is a closure
    factory createPublisher({...}) returning a fresh { publish, queueUrl }
    object. 10's fog/publisher.js is a stateless exported async function
    publish(sqsClient, queueName, payload) taking the SQS client as a
    parameter on every call, with queue-url memoization in an external
    module-level Map cache. This project's fog/publisher.js is none of
    those: module.exports IS a single Object.freeze()'d object literal (not
    a class you instantiate, not a factory you call for a fresh instance) --
    the client and the resolved queue url are private variables closed over
    by the module, and callers do gateway.configure(endpoint, region) once,
    then gateway.publish(queueName, payload) repeatedly with no client
    parameter at all. The frozen object exposes a `queueUrl` property as a
    getter rather than a stored value, because Object.freeze() only locks a
    property's descriptor, not what a getter computes -- so reads always
    reflect the current private cache even though the object itself cannot
    be reassigned or extended at runtime.

  - HTTP routing: 03 and 06 both use Express (03 inline routes in app.js;
    06 split into Express Router files). 10 uses zero Express -- plain
    http.createServer with a hand-written if/else chain dispatching on
    method and pathname, no path-parameter support. This project also uses
    zero Express (fog/app.js and backend/dashboard/server.js are both
    plain http.createServer), but dispatch itself is a declarative routing
    table: fog/router.js's and backend/dashboard/router.js's createRouter()
    holds an ordered array of [method, regex, handler] tuples, matched with
    RegExp.exec() against the request pathname at request time. Capture
    groups become simple path parameters -- backend/dashboard/server.js's
    GET /api/plants/:plantId route is /^\/api\/plants\/([a-z0-9-]+)$/, with
    match[1] passed straight through to the handler as the plant id. Both
    router.js files are exercised by their own router.test.js entirely
    independently of http.createServer (dispatch() is called directly
    against plain method/pathname strings, no server, no socket). Every
    request in both services still passes through a real try/catch that
    turns any uncaught exception into a structured 500 JSON response.

  - Sensor loop: 03's sensors/sensor.js runs one flat setInterval that
    samples every tick and dispatches inline once a dispatch-interval check
    passes. 06's sensors/sensor.js builds a stateful "rig" object
    (buildRig -> sample/dueForFlush/flush) polled by a single setInterval.
    10's sensors/sensor.js runs two independent self-rescheduling
    setTimeout loops, one per concern. This project's sensors/sensor.js
    uses a fourth idiom: sampling is a single plain setInterval (simple,
    fixed-rate, startSampleLoop()), but dispatch is NOT driven by any timer
    at all. startDrainLoop() recursively reschedules drainTick() via
    setImmediate forever; drainTick() only performs a real send when BOTH
    the outbox has items AND Date.now() - lastDispatch >= dispatchIntervalMs
    (a plain timestamp comparison, not a countdown), draining the outbox in
    strict arrival order with Array.prototype.shift(). When neither
    condition holds, the loop just reschedules itself for the next turn of
    the event loop and does nothing -- dispatch is opportunistic/event-loop-
    driven rather than timer-driven, a genuinely different scheduling idiom
    from all three siblings' timer-based approaches (whether one shared
    timer, one timer polling a stateful object, or two independent timers).

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching 01/03/06/10. AWS-facing code is
    isolated behind functions/objects that accept an injected client, so
    unit tests use hand-written fake client objects ({ send: async (cmd) =>
    ... }) instead of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/plant):
                       setInterval sampling + opportunistic setImmediate
                       drain-loop dispatch (sensor.js), random-walk profiles
                       (profiles.js)
  fog/                http.createServer edge gateway: declarative routing
                       table (router.js) -> /ingest validates and appends to
                       a flat write-ahead-log ledger (ledger.js, no per-key
                       grouping at ingest time) -> window flush groups by
                       key + aggregates (aggregation.js) -> Map<sensorType,
                       Function> closure-based alert evaluation (alerts.js)
                       -> frozen-object-literal SQS publish (publisher.js),
                       plus a /thresholds endpoint exposing the real rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express, same
                       declarative router.js as fog/. REST API covering all
                       5 sensor types plus a per-plant grouping endpoint
                       (GET /api/plants and GET /api/plants/:plantId, the
                       latter exercising the router's regex capture group).
                       Static frontend: a light engineering/blueprint theme
                       -- a compact matrix table (rows = readings, columns =
                       plant-1/plant-2) with a native <meter> per cell
                       against that reading's configured range, a plain
                       per-plant compliance strip, and Chart.js trend
                       comparisons. No hand-illustrated SVG art anywhere.
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for loadtest/burst.py and
  scripts/verify_pipeline.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8090
  LocalStack: http://localhost:4576

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds the opportunistic drain loop waits before the
                     next real send once the outbox has items
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. flow-rate sensors
sample every 1s but dispatch after roughly 5-6s; pH sensors sample every 3s
and dispatch after roughly 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8090/api/health
  curl http://localhost:8090/api/plants
  curl http://localhost:8090/api/plants/plant-2
  curl "http://localhost:8090/api/readings?sensor_type=chlorine_ppm&site_id=plant-1&limit=10"
  curl http://localhost:8090/api/thresholds
  curl http://localhost:8090/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 101 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 11 in sensors/, 46 in fog/, 10 in backend/processor/,
34 in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: window aggregation math (count/min/max/avg/latest,
latest = last-in-order not max), threshold evaluation against the exact
hard-alert limits (including that low_pressure_fault checks min, not avg),
the write-ahead-log ledger's append/drain/group-at-flush behaviour, the
frozen publisher object's queue-url memoization and retry-then-succeed
behaviour, the declarative router's method/pathname/capture-group matching
(tested with no http.createServer at all), sort_key disambiguation
(window_end#site_id), and REAL HTTP-level tests against a real local server
on an ephemeral port (not just unit tests of the validation function) for
both fog /ingest (accepts valid payloads with 202, rejects missing fields /
malformed JSON / non-numeric values / empty readings arrays with 400) and
the dashboard's /api/thresholds proxy function (covering both a real
upstream success response and a real unreachable-upstream connection
failure, per thresholdsProxy.test.js).

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

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL sensor
knobs, the loadtest two-tier assertion pattern) is adapted from this
student's own prior projects earlier in this same CA submission
(01-smart-agriculture, 03-patient-vitals, 06-offshore-wind-farm,
07-warehouse-robotics-fleet, 08-retail-footfall-inventory,
09-aquaculture-fish-farm, 10-wildfire-forest-monitoring), not a prior/
external coursework project. Every line of application code, the domain
logic (water-treatment sensor profiles, the four alert thresholds, the
plant-compliance derivation), and the entire dashboard (light engineering/
blueprint theme, reading-by-plant matrix table, per-plant compliance strip,
trend charts) are original to this project. The internal module structure
was deliberately written differently from 03-patient-vitals,
06-offshore-wind-farm, and 10-wildfire-forest-monitoring's Node.js code on
every axis called out in TECH STACK above, so none of the four Node.js
projects in this portfolio share recognisable source-level structure.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http module (fog and dashboard HTTP servers) -- no
    Express or other web framework dependency anywhere in this project
  - boto3 (Python AWS SDK, used only by the ops tooling in loadtest/ and
    scripts/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway via
thresholdsProxy.js's fetchThresholds(url), covered by its own test for both
the success and unreachable-upstream paths. The current frontend
(dashboard.js) does not call it directly -- alert names are rendered from a
small local display-text map (ALERT_LABELS) instead. The endpoint is kept
for API completeness and possible future use, and is not claimed as a
frontend feature.
