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

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step), the eighth Node.js
implementation in this CA portfolio, after 03-patient-vitals,
06-offshore-wind-farm, 10-wildfire-forest-monitoring,
11-water-treatment-utility, 15-data-center-environmental-monitoring,
18-elevator-escalator-fleet-monitoring, and 22-smart-waste-management. To
avoid all eight same-language projects sharing recognisable source-level
structure, this project picks a distinct implementation choice on every axis
where the seven priors already differ from each other. Every claim below
about a sibling's code was re-verified by reading that sibling's actual
current source before writing this section.

  - Fog buffering: 03-patient-vitals groups at ingest into a real Map
    (fog/app.js's `app.locals.pending = new Map()`, keyed by
    `vital + " " + patientId`). 06-offshore-wind-farm never keeps a raw
    reading list at all -- fog/accumulator.js's openAccumulator()/fold()
    fold each value into a live running total, held in
    fog/ingestRouter.js's createStation(), which returns
    `{ buckets: new Map(), units: new Map() }`.
    10-wildfire-forest-monitoring buffers into a Map
    (fog/buffer.js's `pending = new Map()`) only via an EventEmitter
    "reading" listener, decoupling the HTTP handler from the buffer object.
    11-water-treatment-utility defers ALL grouping to flush time over one
    flat write-ahead-log array (fog/ledger.js's
    `{ entries: [] }`/appendEntry()/groupByKey()).
    15-data-center-environmental-monitoring uses a fixed-capacity ring
    buffer array per key (fog/ringBuffer.js's `RING_CAPACITY = 256`,
    `station.rings = new Map()`, ringPush()/ringToOrderedArray()).
    18-elevator-escalator-fleet-monitoring groups at ingest into a Map
    cleared in place (fog/windowBuffer.js's `createBuffer()` returning
    `new Map()`, takeSnapshot() calling `buffer.clear()` on that same
    object). 22-smart-waste-management also groups at ingest into a Map,
    but swaps the whole Map reference at flush instead of clearing it in
    place (fog/doubleBuffer.js's `createDoubleBuffer()` ->
    `{ active: new Map(), units: new Map() }`, swapAndDrain() installing a
    brand-new `new Map()` onto `db.active`). This project's fog/intake.js
    is the only one of the eight using a genuine plain JS object literal --
    `{}`, not a Map, not an array -- as the top-level container:
    createStation() returns `{ groups: {}, units: {} }`, addReading()
    writes straight into `station.groups[key]` (key =
    `` `${sensorType}::${siteId}` ``) the moment a reading arrives, and
    snapshotAndClear() walks it with Object.keys() before resetting
    `station.groups` to a fresh `{}`.

  - Alert rules: 03-patient-vitals uses a generic [field, op, limit, key]
    tuple-array object (fog/alerts.js's VITAL_LIMITS, looped per vital by
    checkVital()). 06-offshore-wind-farm uses a per-sensor-type dispatch
    object of hand-written named functions (fog/alerts.js's INSPECTORS,
    looked up by inspect()). 10-wildfire-forest-monitoring uses a flat
    array of plain {sensorType, key, test} rule-descriptor objects with no
    class at all (fog/alerts.js's RULES, evaluated via
    `RULES.filter(rule => rule.sensorType === sensorType && rule.test(summary)).map(...)`).
    11-water-treatment-utility uses a Map<sensorType, Function> of closures
    built by a factory (fog/alerts.js's ALERT_RULES, built by
    makeThreshold(), looked up via `ALERT_RULES.get(sensorType)`).
    15-data-center-environmental-monitoring uses a plain object literal
    keyed by sensor_type (fog/alerts.js's RULES object, walked with
    `Object.entries(RULES).filter(...)`). 18-elevator-escalator-fleet-
    monitoring wraps a Map inside a class (fog/alertEngine.js's AlertEngine,
    `registerRule()`/`evaluate()` around a private `this._rules` Map) --
    the class owns a lookup structure, but the rules themselves are not
    class instances. 22-smart-waste-management uses a bare switch
    statement with no container at all (fog/alerts.js's evaluateAlerts(),
    one `case "fill_level_pct":` etc. per sensor type). This project's
    fog/alerts.js is the only one using per-rule class instances with their
    own check() method, stored in a plain array: `class Rule { constructor
    (field, op, limit, key, sensorType) {...} check(summary) {...} }`,
    four `new Rule(...)` instances pushed into the plain array `RULES`, and
    evaluateAlerts() is exactly `RULES.filter(r => r.check(summary)).map(r
    => r.key)` -- no Map lookup, no dispatch object, no switch, and no
    class wrapping a separate lookup structure.

  - SQS publisher: 03-patient-vitals' fog/queueGateway.js is a QueueGateway
    class (constructor + init() + send()). 06-offshore-wind-farm's
    fog/publisher.js is a closure factory, createPublisher(), returning a
    fresh { publish, queueUrl } object on every call.
    10-wildfire-forest-monitoring's fog/publisher.js exports a stateless
    function, publish(sqsClient, queueName, payload, ...), taking the SQS
    client as an explicit parameter every call, with an external
    `queueUrlCache = new Map()` for memoization.
    11-water-treatment-utility's fog/publisher.js module.exports IS a
    single `Object.freeze()`'d object literal (the `gateway` const).
    15-data-center-environmental-monitoring's fog/publisher.js decouples
    flush from send via an EventEmitter: attachPublisher() listens for a
    "window-closed" event and calls sendBatch()/SendMessageBatchCommand.
    18-elevator-escalator-fleet-monitoring's fog/publisher.js wires a real
    Node stream pipeline -- a PassThroughGroup (stream.Transform) piped
    into a Writable sink built by buildSqsSink(). 22-smart-waste-
    management's fog/publishQueue.js is a self-draining async FIFO job
    queue (`_jobs` array drained one at a time by `_pump()`). None of the
    seven uses an ES6 Proxy. This project's fog/publisher.js exports
    `new Proxy({ client: null }, { get(target, prop) {...} })`: the target
    starts as a genuinely empty holder, and the very first property read
    that is not one of the control methods (configure/useClient/reset/
    publish/queueUrl) triggers `ensureClient()`, which lazily builds the
    real SQSClient and caches it onto `target.client` -- so
    `publisher.send(...)` (or any other property access) transparently
    triggers lazy construction on first use, exactly as a bare SQSClient
    would behave if you had constructed it yourself.

  - HTTP routing: 03-patient-vitals and 06-offshore-wind-farm both dispatch
    through Express (03 inline routes in fog/app.js; 06 via
    fog/ingestRouter.js's `express.Router()`). 10-wildfire-forest-
    monitoring's fog/app.js uses a hand-written if/else chain with no path
    parameters. 11-water-treatment-utility's fog/router.js and
    backend/dashboard/router.js hold a declarative array of
    [method, regex, handler] tuples matched with `RegExp.exec()`.
    15-data-center-environmental-monitoring's fog/app.js uses the same
    sequential if-chain idiom as 10 (simple prefix checks, no table).
    18-elevator-escalator-fleet-monitoring's fog/router.js is a segment-
    array middleware chain -- `routes.push({ method, path, handlers,
    segments })`, walked by matchSegments() with an Express-style next()
    continuation. 22-smart-waste-management's fog/router.js is a real
    prefix trie -- `createNode()` holding `children: new Map()` plus a
    `paramChild` slot, walked segment-by-segment by dispatch(). None of the
    seven composes a single method+path string and switches on it. This
    project's fog/app.js and backend/dashboard/server.js both build
    `` const key = `${req.method} ${url.pathname}` `` and dispatch inside a
    `switch (true)` block: fixed routes match with `case key === "GET
    /health":`, and the dashboard's one path-parameterised route matches
    with a regex-test case, `case SLOPE_ID_PATTERN.test(key):` where
    `SLOPE_ID_PATTERN = /^GET \/api\/slopes\/[a-z0-9-]+$/`.

  - Sensor loop scheduling: 03-patient-vitals and 06-offshore-wind-farm each
    use one flat/stateful setInterval (03 samples and dispatches inline in
    a single tick; 06's sensors/sensor.js polls a stateful buildRig()
    object). 10-wildfire-forest-monitoring's sensors/sensor.js runs two
    independent recursive setTimeout loops (startSampleLoop()/
    startDispatchLoop()) -- confirmed by reading its actual source: each
    loop tracks its own timer directly on `state.sampleTimer`/
    `state.dispatchTimer` with plain `setTimeout(tick, intervalMs)`
    rescheduling, and there is no AbortController, no AbortSignal, and no
    process.on("SIGTERM", ...) anywhere in that file or in buffer.js/
    publisher.js/app.js -- shutdown is not coordinated at all.
    11-water-treatment-utility pairs a setInterval sampler with a recursive
    setImmediate opportunistic drain loop (startDrainLoop()).
    15-data-center-environmental-monitoring's sensors/sensor.js uses two
    plain independent setInterval calls. 18-elevator-escalator-fleet-
    monitoring's sensors/driftLoop.js anchors two process.hrtime()-based
    drift-corrected setTimeout loops (startDriftCorrectedLoop(), called
    once per concern). 22-smart-waste-management's sensors/pulse.js drives
    both concerns off one single shared setInterval "pulse"
    (startPulseLoop()/pulseTick()) feeding two independent millisecond
    accumulators. None of the seven uses Node's AbortController for
    shutdown coordination. This project's sensors/sensor.js runs two
    independent recursive setTimeout loops (startSampleLoop()/
    startDispatchLoop()), each checking `signal.aborted` immediately before
    doing work and again immediately before scheduling its own next
    `setTimeout` call; `start()` creates one `new AbortController()`, and
    `process.on("SIGTERM", () => controller.abort())` is the only place
    `controller.abort()` is ever called, cleanly stopping both loops
    together without leaking a dangling timer.

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching every sibling above. AWS-facing code
    is isolated behind functions/objects that accept an injected client, so
    unit tests use hand-written fake client objects ({ send: async (cmd) =>
    ... }) instead of hitting LocalStack.

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
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification
  docs/               dashboard-desktop.png / dashboard-mobile.png (real
                       Playwright screenshots of the live stack)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for loadtest/burst.py and
  scripts/verify_pipeline.py)

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
    AWS_ENDPOINT_URL=http://localhost:4590 python scripts/verify_pipeline.py

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
    python loadtest/burst.py --messages 2000 --workers 32

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
Every line of application code, the
domain logic (ski-resort sensor profiles, the four alert thresholds, the
avalanche risk-level derivation), and the entire dashboard (icy-blue/white
alpine theme, risk-level gauge, per-slope reading panels, trend charts) are
original to this project. The internal module structure was deliberately
written differently from all seven Node.js siblings above on every axis
called out in TECH STACK above (verified against each sibling's real
current source before writing that section), so none of the eight Node.js
projects in this portfolio share recognisable source-level structure.

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
  - boto3 (Python AWS SDK, used only by the ops tooling in loadtest/ and
    scripts/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway via
thresholdsProxy.js's fetchThresholds(url), covered by its own test for both
the success and unreachable-upstream paths. The current frontend
(dashboard.js) does not call it directly -- alert names are rendered from a
small local display-text map (ALERT_LABELS) and the risk-level gauge is
driven by readingsStore.js's server-computed `risk_level` field instead.
The endpoint is kept for API completeness and possible future use, and is
not claimed as a frontend feature.

NOTE ON THE RISK-LEVEL GAUGE
-----------------------------
readingsStore.js's deriveRiskLevel(alertKeys) maps whichever alert keys are
currently active on a slope's latest windows onto one of LOW/MODERATE/HIGH/
EXTREME: avalanche_risk_detected (the seismic precursor) is EXTREME;
lift_wind_halt and snowpack_instability_risk are both HIGH;
insufficient_snow_coverage is MODERATE; no active alerts is LOW. When more
than one alert is active at once, the worst level wins. This is computed
server-side and returned as part of GET /api/slopes and GET
/api/slopes/:slopeId; the frontend only maps that string onto a 0-3 index
for the <meter value> and a CSS colour class for the text label -- it does
not re-derive risk from raw thresholds itself.

REAL AWS DEPLOYMENT
--------------------
This project has also been deployed to a real AWS Academy Learner Lab
account (Ebin Joseph's own, X25142224, account 596691181085), not just run
against LocalStack. Five real defects were found and fixed as part of that
deployment, none of which the LocalStack-backed test suite above had
caught:

1. DynamoDB Scan-pagination undercount. pipelineStatus.js's
   countTableItems() issued a single Select: "COUNT" Scan call. Scan only
   counts the page it actually reads -- roughly 1MB of scanned data -- and
   signals there is more via LastEvaluatedKey; a caller that never follows
   it under-reports once the table outgrows one page, with nothing to flag
   the shortfall. Fixed with scanCountPages(), a recursive async generator
   that yield*-delegates into itself for each LastEvaluatedKey page, summed
   by countTableItems() via a for-await loop -- no while or do-while loop
   anywhere in the file. Covered by a new test asserting a four-page fake
   scan (400, 400, 400, 87 items) sums to exactly 1287, not just the first
   page's 400.

2. Missing SQS batching. fog/app.js's flushOnce() sent one
   SendMessageCommand per closed (sensor_type, site_id) group in a loop --
   correct but wasteful whenever more than one group closes in the same
   flush window, the normal case across two slopes and five sensor types.
   Fixed with publisher.publishBatch(), which chunks a whole window's
   messages at SendMessageBatch's ten-entry limit; flushOnce() now calls it
   once per window instead of looping publish(). Covered by a new test
   asserting a 23-message window batches into calls of size ten, ten, and
   three, not twenty-three individual sends.

3. Credential-handling risk in deploy_lambda.sh. This LocalStack-only
   deploy script unconditionally hardcoded `AWS_ACCESS_KEY_ID=test` /
   `AWS_SECRET_ACCESS_KEY=test`, regardless of which endpoint it was
   pointed at, which would have clobbered real credentials if ever run
   against a live account by mistake. Not exercised in the real deployment
   (both Lambdas were created directly via the AWS CLI, bypassing this
   script entirely) but documented in the script with a comment so a
   future reader does not assume it is safe to run against a live account.

4. Wrong credential-gating variable, found live during deployment
   verification itself, not by static reading. awsClients.js,
   backend/processor/handler.js, and fog/publisher.js all conditionally
   built explicit `credentials: {accessKeyId, secretAccessKey}` whenever
   `AWS_ACCESS_KEY_ID` was present in the environment -- correct for
   LocalStack, but AWS Lambda always injects that exact variable itself to
   carry its own execution role's temporary credentials. The real
   ska-processor and ska-dashboard-api Lambdas were therefore always
   hitting this branch, rebuilding an *incomplete* credential object
   missing `sessionToken`, and every DynamoDB/SQS/Lambda call failed with
   `UnrecognizedClientException: The security token included in the
   request is invalid.` -- confirmed directly in CloudWatch logs, and in
   `/api/health` reporting queue/lambda both false. Fixed by gating on
   `AWS_ENDPOINT_URL` instead (true only for the LocalStack profile, never
   set by Lambda or on EC2); left unset, the SDK's default provider chain
   correctly resolves either Lambda's full injected credential triple or
   EC2's instance-metadata role. Confirmed fixed by redeploying both
   Lambdas and rechecking `/api/health`: all four fields true within
   seconds, and the ~160-message SQS backlog that had built up during the
   outage drained completely once reprocessed.

5. Missing CORS header, also found live, not by static reading.
   lambdaHandler.js's responses carried no `Access-Control-Allow-Origin`
   header, so the S3-hosted frontend's cross-origin fetch() calls were
   silently blocked by the browser -- the page loaded with zero console
   errors and zero failed network requests logged, because dashboard.js's
   tick() swallows fetch failures into a bare retry with no logging, and a
   CORS-blocked response does not surface as a network-tab failure either.
   Caught only by loading the deployed page in an actual browser and
   seeing every panel stay empty despite curl confirming the API itself
   returned real data. Fixed by adding `Access-Control-Allow-Origin: *` to
   every response lambdaHandler.js returns (this API serves aggregated,
   non-personal sensor data with no auth layer by design, so a public
   origin is consistent with Section II-F's security posture). Covered by
   a new assertion in the existing 200-response test.

The dashboard's local com.sun.net.httpserver-equivalent (server.js, a plain
Node http server) is not reachable behind API Gateway, so
backend/dashboard/lambdaHandler.js answers the real deployment's API
Gateway REST API instead. Its dispatch is a template-segment matcher array
(ROUTES, each entry a plain "/api/..." string with ":name" placeholder
segments), walked by matchTemplate() and findRoute() -- the 6th distinct
dashboard-Lambda dispatch shape in this portfolio, after Nithin's ordered
regex-list scan, Sachin's trie-walk router, Chaitanya's Mangum-wrapped
FastAPI native routes, Gopi's flat dict[(method,path)] lookup, and
Hrishikesh's Java switch expression. It reuses the same readingsStore.js /
pipelineStatus.js / thresholdsProxy.js logic server.js calls, wrapped in its
own route functions that return a plain {status, body} instead of writing
to a Node http.ServerResponse. Covered by 13 new tests
(lambdaHandler.test.js): template matching, route lookup, and end-to-end
handler behaviour with injected fake AWS clients.

The static frontend's deploy-time API base uses a 5th distinct mechanism
across this portfolio's reassigned projects: an inline JSON data island,
`<script id="api-config" type="application/json">{"apiBase": ""}</script>`
in index.html, sed-replaced at S3 upload time with the real API Gateway
invoke URL and read once by dashboard.js via
`JSON.parse(document.getElementById("api-config").textContent).apiBase` --
not a <meta> tag (Nithin), a separate runtime-config.js file (Chaitanya), a
%%API_BASE%% token substituted inside the JS source itself (Gopi), or a
runtime fetch() of a separate static/api-config.json resource
(Hrishikesh).

infra/docker-compose.aws.yml runs only the fog gateway and the ten sensor
containers against the real account (port 8000 published, no localstack
service, no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY set); both Lambda
functions are created directly via the AWS CLI, bypassing
backend/processor/deploy_lambda.sh entirely (that script is documented as
LocalStack-only tooling and was never exercised against the real account).

LIVE RESOURCES (account 596691181085, us-east-1): DynamoDB table
ska-readings, SQS queue ska-slope-agg, Lambda ska-processor (SQS-triggered
ingestion) and Lambda ska-dashboard-api (behind API Gateway REST API
se2853uk5d), EC2 instance i-0fddea02b8aafbc11 (tagged ska-fog-host, runs the
fog node + ten sensor containers, security group sg-04856f639d9810d0d
allows only inbound TCP 8000, no SSH -- administered via SSM only), Elastic
IP 54.81.144.80 (allocation eipalloc-0dcc72698336c0dfc, associated with
that instance), S3 bucket ska-frontend-596691181085 (static dashboard
frontend, public read-only, static website hosting enabled) and S3 staging
bucket ska-deploy-596691181085. All are prefixed ska-. The dashboard
Lambda's FOG_HEALTH_URL/FOG_THRESHOLDS_URL env vars point at this Elastic
IP; if it's ever released and reallocated, they need updating.

LIVE URLS: dashboard at
https://ska-frontend-596691181085.s3.us-east-1.amazonaws.com/index.html,
its API at https://se2853uk5d.execute-api.us-east-1.amazonaws.com/prod.
Independently verified end-to-end in a real browser after the credential
and CORS fixes above: /api/health reports all four fields true with
freshest_age_seconds under 1 second, DynamoDB item count climbed past 500
within minutes of the stack coming up, and the dashboard renders live,
changing sensor data, a correctly firing lift_wind_halt alert banner, and
both slope risk gauges, with zero console errors and zero failed static
asset requests.
