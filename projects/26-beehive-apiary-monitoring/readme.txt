Beehive & Apiary Monitoring (Precision Apiculture)
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/26-beehive-apiary-monitoring/), not the repo root.

OVERVIEW
--------
A beekeeping operation monitors colony health across two apiaries
(apiary-a, apiary-b). Each apiary carries five sensors -- hive weight,
brood-nest (internal hive) temperature, internal humidity, acoustic buzz
frequency, and entrance traffic count. A fog node buffers incoming readings
in a fixed-size ring buffer, windows and aggregates them every
WINDOW_SECONDS, evaluates apiculture threshold rules against the aggregate,
and dispatches one aggregate message per window to a queue. A Lambda
function (running inside LocalStack) consumes the queue and stores records
in DynamoDB. A web dashboard renders a "colony health summary" narrative:
one plain-English sentence per apiary combining hive-weight trend direction
with brood-temperature stability, followed by the 5 raw readings as
secondary rows with a native <meter> each.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step, zero Express -- plain
http.createServer throughout), the ninth Node.js implementation in this CA
portfolio, after 03-patient-vitals, 06-offshore-wind-farm,
10-wildfire-forest-monitoring, 11-water-treatment-utility,
15-data-center-environmental-monitoring, 18-elevator-escalator-fleet-
monitoring, 22-smart-waste-management, and 25-ski-resort-avalanche-safety
(built concurrently in the same batch as this project). Every architectural
choice on the five axes below was pre-assigned specifically to avoid
collision with all eight of those siblings; see the REUSE section for the
full comparison against each one's real, currently-checked-in source.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/apiary):
                       two-phase setTimeout+queueMicrotask tick loop
                       (sensor.js), random-walk profiles (profiles.js)
  fog/                http.createServer edge gateway: nested plain-object
                       routing table (router.js) -> /ingest validates and
                       writes into a Float64Array-backed ring buffer
                       (ringBuffer.js) -> window flush drains + aggregates
                       (aggregation.js) -> flat-tuple alert evaluation
                       (alerts.js) -> async-generator SQS publish
                       (publisher.js), plus a /thresholds endpoint exposing
                       the real rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express, same
                       nested-object router.js as fog/. REST API covering
                       all 5 sensor types plus a per-apiary grouping
                       endpoint (GET /api/apiaries and
                       GET /api/apiaries/:apiaryId), and a colony-health
                       narrative derivation module (colonyNarrative.js).
                       Static frontend: warm honey-gold/amber-brown apiary
                       theme -- a "colony health summary" narrative card per
                       apiary as the primary view, with the 5 raw readings
                       as secondary rows against a native <meter> each, plus
                       Chart.js window-average trend charts. No custom SVG,
                       no emoji anywhere.
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification
  docs/               dashboard screenshots (desktop + 375px mobile)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for loadtest/burst.py and
  scripts/verify_pipeline.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8105
  LocalStack: http://localhost:4591

  Stop:  docker compose -f infra/docker-compose.yml down -v

  LocalStack's Lambda emulation can leave a sibling docker-in-docker
  executor container/network running after `down -v` (the container that
  actually runs bam-processor's code, separate from the localstack
  container itself). If `docker ps` still shows one after tearing down,
  clean it up manually. Filter on this project's own prefix only, not on
  "localstack" (a shared-host filter on the plain word "localstack" would
  match and remove every OTHER LocalStack-based project's container too):
    docker ps -a --filter "name=bam" -q | xargs -r docker rm -f
    docker network ls --filter "name=bam" -q | xargs -r docker network rm

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds the sensor waits (opportunistically) before the
                     next real send once the outbox has items
These are genuinely independent knobs -- every sensor service in
docker-compose.yml uses a visibly different pair (e.g. acoustic buzz
sensors sample every 1s but dispatch after roughly 6-7s; hive weight
sensors sample every 3s and dispatch after roughly 12-13s, matching the
slower physical drift of a hive's weight versus its acoustic signature).

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8105/api/health
  curl http://localhost:8105/api/apiaries
  curl http://localhost:8105/api/apiaries/apiary-b
  curl "http://localhost:8105/api/readings?sensor_type=hive_weight_kg&site_id=apiary-a&limit=10"
  curl http://localhost:8105/api/thresholds
  curl http://localhost:8105/api/backend-stats

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 122 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 14 in sensors/, 57 in fog/, 12 in backend/processor/,
39 in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: window aggregation math (count/min/max/avg-3dp/
latest, latest = last-in-order not max), threshold evaluation against the
exact hard-alert limits given in the brief, the Float64Array ring buffer's
push/wraparound/ordered-read/reset behaviour (including a full-wraparound
test proving the oldest reading is dropped and the newest 64 survive), the
async-generator publisher's backpressure (a test that stalls the first SQS
send and asserts the second has not been attempted yet, then releases the
first and confirms both eventually complete in order), the nested-object
router's exact-path O(1) dispatch plus its regex fallback for
:apiaryId, sort_key disambiguation (window_end#site_id), the colony-health
narrative's trend/stability classification, and REAL HTTP-level tests
against a real local server on an ephemeral port (not just unit tests of
the validation function) for both fog /ingest (accepts valid payloads with
202, rejects missing fields / malformed JSON / non-numeric values / empty
readings arrays / non-object bodies with 400) and the dashboard's
/api/thresholds proxy function (covering both a real upstream success
response and a real unreachable-upstream connection failure, per
thresholdsProxy.test.js).

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
knobs, the loadtest two-tier assertion pattern, the /api/thresholds proxy
discipline) is adapted from this student's own prior projects earlier in
this same CA submission, principally 11-water-treatment-utility. Every line
of application code, the domain logic (beehive sensor profiles, the four
alert thresholds, the colony-health narrative derivation), and the entire
dashboard (honey-gold/amber-brown theme, narrative-card primary view,
per-reading secondary rows, trend charts) are original to this project.

This is the ninth Node.js implementation in the portfolio. Five
architectural axes were pre-assigned by the lead engineer specifically so
this project's fog/backend code would not share recognisable source-level
structure with any of the eight other Node.js siblings, including
25-ski-resort-avalanche-safety (built concurrently in the same batch). Each
claim below was checked against the real, currently-checked-in source of
every already-built sibling as of this writing.

  - Fog buffering: this project's fog/ringBuffer.js is a fixed-size ring
    buffer backed by a real Float64Array typed array (RING_CAPACITY = 64
    slots), one per (sensor_type, site_id) key, with a manually tracked
    writeIndex that wraps via modulo in ringPush(); a parallel plain
    `timestamps` array of equal length carries the ISO timestamp for each
    slot, since a Float64Array can only hold the numeric value itself. This
    is the only buffering implementation in the whole portfolio backed by a
    real TypedArray. Confirmed against every sibling's actual buffering
    file: 03-patient-vitals' fog/app.js pushes straight into a
    push()-growing app.locals.pending Map (shared array-per-key, reduced at
    flush); 06-offshore-wind-farm's fog/accumulator.js folds each value into
    a live streaming accumulator (openAccumulator/fold/seal) and never
    retains a raw reading list at all; 10-wildfire-forest-monitoring's
    fog/buffer.js buffers into a Map via an EventEmitter "reading" listener;
    11-water-treatment-utility's fog/ledger.js defers ALL grouping to flush
    time over one flat write-ahead-log array (createLedger/appendEntry/
    drainEntries/groupByKey); 15-data-center-environmental-monitoring's
    fog/ringBuffer.js is itself a ring buffer, but backed by a plain
    `new Array(capacity).fill(null)`, not a typed array; 18-elevator-
    escalator-fleet-monitoring's fog/windowBuffer.js writes straight into a
    plain Map<key, array> at ingest (its own novelty is entirely in flush
    scheduling -- see fog/scheduler.js's recursive async Promise chain, not
    storage); 22-smart-waste-management's fog/doubleBuffer.js swaps the live
    Map reference itself at flush (swapAndDrain), handing the previous Map
    to the caller and installing a fresh one. 25-ski-resort-avalanche-safety
    is specified (per the brief given to the lead engineer; its source did
    not yet exist in this repo at the time this readme was written -- see
    note below) to use a plain JS object literal `{}` keyed by
    "sensor_type::site_id", which is also not a typed array.

  - Alert rules: this project's fog/alerts.js RULES is a single flat array
    of plain [field, op, limit, key] tuples -- arrays, not objects, not
    classes -- where `field` folds the sensor type into the tuple itself as
    "sensor_type.aggregateField" (e.g. "internal_hive_temp_c.avg"), so RULES
    has no outer grouping structure by sensor type at all.
    evaluateAlerts(summary) is RULES.flatMap((tuple) =>
    evaluateRule(tuple, summary)), where evaluateRule() is the single shared
    generic comparator every tuple is run through, splitting the compound
    field to decide whether a tuple even applies to the given summary before
    comparing. Confirmed against every sibling: 03-patient-vitals'
    fog/alerts.js VITAL_LIMITS is an object mapping vital -> array of
    [field, op, limit, key] tuples (the tuple shape is similar, but grouped
    per vital and looped per vital in checkVital -- a lookup structure this
    project's RULES deliberately has none of); 06-offshore-wind-farm's
    fog/alerts.js INSPECTORS is a dispatch object of named per-sensor
    functions; 10-wildfire-forest-monitoring's fog/alerts.js RULES is a flat
    array of {sensorType, key, test} rule *objects* evaluated with
    RULES.filter().map(); 11-water-treatment-utility's fog/alerts.js
    ALERT_RULES is a Map<sensorType, Function> built by a makeThreshold()
    closure factory; 15-data-center-environmental-monitoring's fog/alerts.js
    RULES is a plain object literal keyed by sensor_type, walked with
    Object.entries(RULES).filter(); 18-elevator-escalator-fleet-monitoring's
    fog/alertEngine.js AlertEngine is a class instance wrapping a
    Map<sensorType, [{predicateFn, key}]> built via registerRule();
    22-smart-waste-management's fog/alerts.js evaluateAlerts() is a switch
    statement on sensorType with no container at all. 25-ski-resort-
    avalanche-safety is specified to use a `class Rule { check(summary) }`
    array, which is also not a flat array of plain tuples evaluated by one
    shared function.

  - SQS publisher: this project's fog/publisher.js exports
    publishBatches(queueName, payloads, retries, delayMs), an
    `async function*` (async generator) -- confirmed via
    `gateway.publishBatches.constructor.name === "AsyncGeneratorFunction"`
    in publisher.test.js. Callers do
    `for await (const result of publishBatches(...))`; the generator body
    awaits each real SendMessageCommand before yielding that send's result,
    so the loop's own suspended state between yields gives natural
    backpressure with no separate queue or pump (publisher.test.js's
    backpressure test stalls the first send, asserts the second has not
    been attempted, then releases the first and confirms both complete in
    order). Confirmed against every sibling: 03-patient-vitals'
    fog/queueGateway.js QueueGateway is a class (constructor + init() +
    send()); 06-offshore-wind-farm's fog/publisher.js createPublisher() is a
    closure factory returning a fresh { publish, queueUrl } object per call;
    10-wildfire-forest-monitoring's fog/publisher.js publish() is a bare
    exported function taking the SQS client as an explicit parameter every
    call, with a module-level Map cache for queue-url memoization;
    11-water-treatment-utility's fog/publisher.js module.exports IS a single
    Object.freeze()'d object literal; 15-data-center-environmental-
    monitoring's fog/publisher.js decouples flush from send via an
    EventEmitter "window-closed" listener that calls
    SendMessageBatchCommand; 18-elevator-escalator-fleet-monitoring's
    fog/publisher.js wires a real Node stream.Transform/stream.Writable
    pipeline (PassThroughGroup piped into a Writable sink);
    22-smart-waste-management's fog/publishQueue.js runs a self-draining
    async FIFO work queue with an internal _pump() loop. None of those is a
    generator. 25-ski-resort-avalanche-safety is specified to use a
    Proxy-wrapped lazy SQS client, which is also not a generator.

  - HTTP routing: this project's fog/router.js and backend/dashboard/
    router.js both export createRouter(), building a nested plain-object
    dispatch table -- table[method][exactPath] = handler -- so an exact-path
    request is a two-level property lookup (O(1) by construction, no
    scanning, no regex engine invoked). A short separate fallback array of
    [method, regex, handler] tuples, registered via routeParam(), is
    consulted only when the exact-table lookup misses; this project's one
    parameterized route, GET /api/apiaries/:apiaryId, is the only path that
    ever reaches that fallback array. Confirmed against every sibling:
    03-patient-vitals and 06-offshore-wind-farm both use Express (03 inline
    routes in app.js, 06 split into Express Router files);
    10-wildfire-forest-monitoring's fog/app.js and 15-data-center-
    environmental-monitoring's fog/app.js both use a hand-written if/else
    chain with no path-parameter support at all; 11-water-treatment-
    utility's fog/router.js and backend/dashboard/router.js (and 15's own
    backend/api/router.js ROUTES array) use an ordered array of
    [method, regex, handler] tuples matched by RegExp.exec() against every
    route on every request; 18-elevator-escalator-fleet-monitoring's
    fog/router.js is a segment-array linear scan with an Express-style
    middleware next() chain (routes carry an array of handlers, not one);
    22-smart-waste-management's fog/router.js is a genuine prefix tree
    (trie), one node per path segment. None of those is a plain object
    keyed first by HTTP method and then by the exact path string.
    25-ski-resort-avalanche-safety is specified to use a switch(true)
    dispatch on a `${method} ${path}` template-literal key, which is also
    not a nested object table.

  - Sensor loop scheduling: this project's sensors/sensor.js uses a genuine
    two-phase macrotask-then-microtask pattern. startTickLoop() arms the
    real SAMPLE_INTERVAL delay with a plain setTimeout (a macrotask); that
    setTimeout's own callback does nothing but hand the real work --
    sampleAndMaybeDispatch(), which steps the random walk and runs the
    opportunistic dispatch check -- to queueMicrotask, and only once that
    microtask has fully drained does the callback arm the next setTimeout.
    Confirmed against every sibling: 03-patient-vitals and 06-offshore-
    wind-farm both drive sampling and dispatch off one flat setInterval (03
    inline, 06 via a stateful "rig" object polled each tick);
    10-wildfire-forest-monitoring's sensors/sensor.js runs two independent
    self-rescheduling setTimeout loops, one per concern;
    11-water-treatment-utility's sensors/sensor.js pairs a setInterval
    sampler with a recursive setImmediate opportunistic drain loop (no
    setTimeout in the drain path at all); 15-data-center-environmental-
    monitoring's sensors/sensor.js runs two fully independent setInterval
    calls, one per concern; 18-elevator-escalator-fleet-monitoring's
    sensors/driftLoop.js anchors two independent process.hrtime()-drift-
    corrected setTimeout loops; 22-smart-waste-management's sensors/pulse.js
    drives both sampling and dispatch off one shared setInterval "pulse"
    with leaky-bucket millisecond accumulators. A repository-wide
    `grep -rl queueMicrotask projects/*/sensors projects/*/fog
    projects/*/backend` (excluding vendored node_modules) turns up nothing
    in any of the eight siblings' own source -- this is the only sensor
    loop in the portfolio that touches queueMicrotask at all.
    25-ski-resort-avalanche-safety is specified to use
    AbortController-coordinated recursive setTimeout loops, which also never
    touches queueMicrotask.

  Note on 25-ski-resort-avalanche-safety: at the time this readme was
  written, projects/25-ski-resort-avalanche-safety/ did not yet exist in
  this repository (it is being built concurrently in the same batch as this
  project, per the lead engineer's instructions). Every claim above about
  25 is therefore cited against the specification given to the lead
  engineer (plain object literal `{}` keyed by "sensor_type::site_id" for
  buffering; a `class Rule { check(summary) }` array for alerts; a
  Proxy-wrapped lazy SQS client for publishing; a switch(true) dispatch on a
  `${method} ${path}` template-literal key for routing; AbortController-
  coordinated recursive setTimeout loops for the sensor loop), not against
  25's real source, and is explicitly flagged as such rather than presented
  as independently verified.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied unmodified from this same
    student's 11-water-treatment-utility project) - https://www.chartjs.org
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

NOTE ON THE COLONY HEALTH NARRATIVE
-------------------------------------
colonyNarrative.js's trendDirection()/temperatureStability() classify recent
window history using fixed, documented bands (a >=0.5kg net change over the
recent hive-weight history counts as rising/falling; a <=1.5C spread over
recent brood-temperature averages counts as stable), not a statistical
model -- this is a deliberately simple, explainable derivation matching the
"plain descriptive line" the brief asks for, not a claim of predictive
accuracy.
