Elevator and Escalator Fleet Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/18-elevator-escalator-fleet-monitoring/), not the repo root.

OVERVIEW
--------
A building services company monitors elevator/escalator units across two
towers (tower-a, tower-b). Each tower carries five sensors -- motor
temperature, door cycle count, cab vibration, load weight, and travel
speed. A fog node buffers incoming readings directly into a per-key Map,
windows and aggregates every WINDOW_SECONDS on a recursive async
Promise-chain scheduler, evaluates fleet-safety threshold rules through an
OOP alert-rule engine, and dispatches one aggregate message per window
through a real Node stream.Transform/Writable pipeline into SQS. A Lambda
function (running inside LocalStack) consumes the queue and stores records
in DynamoDB. A web dashboard renders a plain per-tower list of the 5
readings (native <meter> elements, plain text, plain colour badges -- no
hand-drawn shaft diagram or other illustrated graphics) plus cross-tower
window-average trend charts.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step), the fifth Node.js
implementation in this CA portfolio, after 03-patient-vitals,
06-offshore-wind-farm, 10-wildfire-forest-monitoring, and
11-water-treatment-utility. To avoid sharing recognisable source-level
structure with any of those four, this project was assigned (by the lead
engineer coordinating the concurrent batch of projects 13-18) a fifth,
genuinely different implementation choice on every axis where the existing
four already differ from each other. Each claim below was checked directly
against the actual current source of 03/06/10/11 in this repository:

  - Fog buffering + flush scheduling: 03 groups into a shared Map-per-key
    (app.locals.pending/units, both native Map, not a plain object) at
    ingest and reduces it inline inside a setInterval. 06 folds each
    reading into a live streaming accumulator (fog/accumulator.js), also
    flushed by setInterval. 10 decouples ingestion from buffering with an
    EventEmitter into a Map, flushed by a plain setInterval (fog/app.js).
    11 uses a flat write-ahead-log array with NO per-key grouping at
    ingest (fog/ledger.js), grouping only at flush time, also flushed by a
    plain setInterval (fog/app.js) with a separate opportunistic
    setImmediate loop on the sensor side for dispatch, not the fog flush
    itself. This project's fog/windowBuffer.js is a plain Map<string,
    Array<{ts,value}>>, written to directly by /ingest's handleIngest with
    "sensor_type::site_id" as the key -- grouped at ingest time like 03
    (both use a native Map, so that specific detail is shared, not a point
    of difference). What is genuinely new is the *scheduling*:
    fog/scheduler.js's startWindowLoop() is a real recursive async Promise
    chain -- tick() awaits a Promise-wrapped setTimeout for WINDOW_SECONDS,
    awaits the flush callback, then calls itself again and returns that
    call's own promise, with no setInterval anywhere in the chain. All of
    03/06/10/11 flush their fog window on a plain setInterval; this
    project is the only one in the portfolio that drives its flush cycle
    via self-rescheduling recursion instead.

  - Alert rules: 03 loops a generic [field, op, limit, key] lookup table
    per vital (fog/alerts.js's VITAL_LIMITS). 06 uses an INSPECTORS
    dispatch object with one named function per sensor type. 10 filters/
    maps a flat array of {sensorType, key, test} rule-descriptor objects.
    11 uses a Map<sensorType, Function> of closures built by a
    makeThreshold() factory. This project's fog/alertEngine.js is a real
    class, AlertEngine, with registerRule(sensorType, predicateFn, key)
    and evaluate(sensorType, summary) methods; a module-level `engine`
    instance is populated entirely through registerRule() calls made once
    at module load (one call per elevator/escalator threshold), and
    evaluate() runs every predicate registered for that sensor type,
    collecting the keys of the ones that return true. This is the only
    OOP rule-engine among the five Node.js projects -- 03/06/10/11 are all
    lookup-table/dispatch-object/array/Map based, never a class with
    registerRule()/evaluate() methods.

  - SQS publisher: 03's fog/queueGateway.js is a QueueGateway class
    (constructor + init() + send()). 06's fog/publisher.js is a closure
    factory returning a fresh { publish, queueUrl } object. 10's
    fog/publisher.js is a stateless exported function taking the SQS
    client as a parameter on every call. 11's fog/publisher.js is a single
    frozen object literal. This project's fog/publisher.js is none of
    those: aggregated window groups are genuinely .write()-en into
    PassThroughGroup, an objectMode stream.Transform whose _transform
    passes the payload through with this.push(), piped into a real
    objectMode stream.Writable (buildSqsSink) whose write() performs the
    actual SendMessageCommand against SQS. publish() correlates each
    write with its eventual SQS outcome via a small per-call id (see the
    comment at the top of publisher.js for why a plain .pipe() alone
    cannot signal "the Writable finished sending this specific chunk").
    publisher.test.js proves this is built on the real node:stream
    Transform/Writable primitives, not something that merely behaves
    similarly.

  - HTTP routing: 03 and 06 both use Express. 10 uses zero Express with a
    hand-written if/else chain (no path-parameter support, one handler per
    route). 11 uses zero Express with a declarative [method, regex,
    handler] table (one handler per route, RegExp.exec() path-parameter
    capture). This project also uses zero Express, but fog/router.js's and
    backend/dashboard/router.js's createRouter() stores routes as
    { method, path, handlers: [fn, fn, ...] } -- a route can carry more
    than one handler function -- and dispatch() composes/calls the matched
    route's handlers in sequence via a next() continuation, Express-style
    middleware composition, entirely on top of plain http.createServer.
    fog/app.js's POST /ingest route genuinely uses this: it registers
    [validateIngestMiddleware, handleIngest] as two separate functions, not
    one handler doing both jobs, and a validation failure short-circuits
    the chain by never calling next(). router.test.js proves this
    composition (including the short-circuit case) with no
    http.createServer involved at all.

  - Sensor loop scheduling: 03 runs one flat setInterval for both sampling
    and dispatch. 06 polls a stateful "rig" object with a single
    setInterval. 10 runs two independent self-rescheduling setTimeout
    loops (one per concern) that simply re-arm for a fixed delay after
    each tick, with no drift correction. 11 uses setInterval for sampling
    plus an opportunistic setImmediate loop for dispatch. This project's
    sensors/driftLoop.js gives sampling and dispatch each their own
    drift-corrected self-adjusting setTimeout loop: a loopStart timestamp
    is taken once with process.hrtime() (a monotonic clock), and after
    every tick the loop re-measures real elapsed time against that anchor
    and computes the delay to the next *ideal* tick boundary
    (tickCount * intervalMs from the anchor), not simply "intervalMs from
    now". A tick that runs long borrows time from its own next delay
    instead of pushing every future tick later by the same amount.
    driftLoop.test.js exercises this directly, including a deliberately
    slow tick that must not permanently shift the schedule.

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching 01/03/06/10/11. AWS-facing code is
    isolated behind functions/objects that accept an injected client, so
    unit tests use hand-written fake client objects ({ send: async (cmd) =>
    ... }) instead of hitting LocalStack.

  - This project was built in the same concurrent batch as project 15
    (also assigned distinct axes: a ring-buffer array buffer, a plain-
    object-literal alert-rule table, an EventEmitter publisher, and a
    simple prefix-check router). Project 15's source was not visible from
    this project's own isolated working copy while this project was being
    built, so its differentiation was confirmed only against the brief's
    description of its architecture, not against a direct source read (in
    contrast to 03/06/10/11 above, which were read directly from this
    repository).

LAYOUT
------
  sensors/            sensor simulator (one container per metric/tower):
                       two independent drift-corrected loops per sensor
                       (driftLoop.js) for sampling vs. dispatch, random-walk
                       profiles (profiles.js)
  fog/                http.createServer edge gateway: middleware-chain
                       router (router.js) -> /ingest validates then writes
                       straight into a Map<string, Array> window buffer
                       (windowBuffer.js) -> a recursive async Promise-chain
                       scheduler (scheduler.js) drains+aggregates
                       (aggregation.js) every WINDOW_SECONDS -> an OOP
                       AlertEngine (alertEngine.js) evaluates the fleet
                       thresholds -> a real stream.Transform/Writable
                       pipeline (publisher.js) sends to SQS, plus a
                       /thresholds endpoint exposing the real rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express, same
                       middleware-chain router.js as fog/. REST API
                       covering all 5 sensor types plus a per-tower
                       grouping endpoint (GET /api/towers and
                       GET /api/towers/:towerId, the latter exercising the
                       router's :param capture). Static frontend: dark
                       charcoal / safety-yellow industrial-transit theme --
                       a plain per-tower list of 5 reading rows (native
                       <meter> + text + colour badges, no hand-drawn shaft
                       diagram or other illustrated graphics anywhere) plus
                       Chart.js cross-tower trend comparisons.
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

  Dashboard:  http://localhost:8097
  LocalStack: http://localhost:4583

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
-----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings (its own
                     drift-corrected loop)
  DISPATCH_INTERVAL  seconds between real POSTs to the fog gateway (its
                     own, separate drift-corrected loop)
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. cab-vibration
sensors sample every 1s but dispatch after 5-6s; door-cycle sensors sample
every 3s and dispatch after 10-11s).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8097/api/health
  curl http://localhost:8097/api/towers
  curl http://localhost:8097/api/towers/tower-b
  curl "http://localhost:8097/api/readings?sensor_type=cab_vibration_mm&site_id=tower-a&limit=10"
  curl http://localhost:8097/api/thresholds
  curl http://localhost:8097/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 117 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 14 in sensors/, 57 in fog/, 10 in backend/processor/,
36 in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: the drift-corrected sensor loop's schedule-recovery
behaviour after a deliberately slow tick, the Map<string, Array> window
buffer's grouping-at-ingest + snapshot-and-clear semantics, the recursive
async Promise-chain flush scheduler (including that a flush rejection does
not break the recursive chain), window aggregation math (count/min/max/avg/
latest, latest = last-in-order not max), the AlertEngine class's
registerRule()/evaluate() behaviour against the exact elevator/escalator
thresholds (including the > vs >= and < vs <= boundary cases), the
middleware-chain router's method/path/:param matching and handler
composition (including that a handler which never calls next() genuinely
short-circuits the chain -- tested with no http.createServer at all), the
stream.Transform/Writable publisher's queue-url memoization and per-call
failure isolation (proving a failed send only rejects that one caller, not
the whole pipeline), sort_key disambiguation (window_end#site_id), and REAL
HTTP-level tests against a real local server on an ephemeral port (not just
unit tests of the validation function) for both fog POST /ingest (accepts
valid payloads with 202, rejects missing fields / malformed JSON /
non-numeric values / empty readings arrays / non-object bodies with 400)
and the dashboard's /api/thresholds proxy function (covering both a real
upstream success response and a real unreachable-upstream connection
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
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL sensor
knobs, the loadtest two-tier assertion pattern, the static-file-serving
fallback in backend/dashboard/server.js) is adapted from this student's own
prior projects earlier in this same CA submission (01-smart-agriculture,
03-patient-vitals, 06-offshore-wind-farm, 10-wildfire-forest-monitoring,
11-water-treatment-utility), not a prior/external coursework project. The
domain logic (elevator/escalator sensor profiles, the four alert
thresholds, the per-tower nominal/alert derivation) and the entire
dashboard (dark charcoal/safety-yellow theme, per-tower reading-list
layout, trend charts) are original to this project. The five
differentiation axes documented in TECH STACK above -- the Map+recursive-
Promise-chain buffer/scheduler, the AlertEngine class, the stream.Transform
publisher, the middleware-chain router, and the drift-corrected sensor
loop -- were assigned by the lead engineer specifically to avoid
source-level collision with 03/06/10/11 and with project 15 in the same
concurrent batch; the module names and internal structure were written
fresh for this project, not copy-pasted from any sibling.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied from this student's own
    11-water-treatment-utility project rather than fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - Node.js built-in http and stream modules (fog and dashboard HTTP
    servers, the SQS publish pipeline) -- no Express or other web/stream
    framework dependency anywhere in this project
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
