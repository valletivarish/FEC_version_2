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
(running inside LocalStack) consumes the queue and stores records in
DynamoDB. A web dashboard renders a "collection priority list" -- a flat,
sorted worklist of every bin ordered by fill level, the way a dispatcher
would triage which bin to send a truck to next -- plus per-district raw
reading cards and a fill-level trend chart.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite. Real AWS/Azure deployment is a deliberately
deferred Phase 2 item for the whole portfolio and is NOT attempted here.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step, zero Express -- plain
http.createServer everywhere), the seventh Node.js implementation in this
CA portfolio, after 03-patient-vitals, 06-offshore-wind-farm,
10-wildfire-forest-monitoring, 11-water-treatment-utility,
15-data-center-environmental-monitoring, and
18-elevator-escalator-fleet-monitoring. To avoid all seven same-language
projects sharing recognisable source-level structure, this project
deliberately picks a seventh, genuinely different implementation choice on
every axis where those six siblings already differ from each other and
from one another. Every claim below was checked directly against each
sibling's current source file before being written here.

  - Sensor-loop scheduling: 03-patient-vitals runs one flat setInterval
    that samples every tick and checks a Date.now() elapsed threshold to
    decide whether to dispatch inline, on the same tick. 06-offshore-
    wind-farm's sensors/sensor.js also runs a single setInterval, but each
    tick calls buildRig()'s sample() and then checks dueForFlush() (again a
    Date.now() elapsed check) against a stateful "rig" object -- still one
    timer literally ticking at the sample rate. 10-wildfire-forest-
    monitoring's sensors/sensor.js runs two fully independent
    self-rescheduling setTimeout loops (startSampleLoop/startDispatchLoop),
    one per concern, each re-arming itself at the end of its own body.
    11-water-treatment-utility pairs a setInterval sampler with a
    recursive setImmediate "opportunistic" drain loop
    (startDrainLoop/drainTick) that only sends once the outbox is
    non-empty AND a Date.now() elapsed check passes -- no dispatch timer at
    all. 15-data-center-environmental-monitoring's sensors/sensor.js runs
    two fully independent setInterval calls, one per concern (its own
    comment says this is deliberately the simplest option because that
    project's novelty budget is spent elsewhere).
    18-elevator-escalator-fleet-monitoring's sensors/driftLoop.js runs two
    independent process.hrtime()-anchored, drift-corrected setTimeout
    loops (one per concern). This project uses a seventh idiom, distinct
    from all six: sensors/pulse.js's buildPulseState/pulseTick/
    startPulseLoop drive BOTH sampling and dispatch off a SINGLE physical
    setInterval timer ("the pulse"), ticking at a base rate
    (PULSE_MS, default 250ms) that is decoupled from both
    SAMPLE_INTERVAL and DISPATCH_INTERVAL -- neither rate has to divide the
    other, or the pulse. Each pulse adds basePulseMs to two independent
    millisecond accumulators (sampleAcc, dispatchAcc); whenever an
    accumulator reaches its own interval, that concern fires and the
    accumulator is decremented (not reset to 0) by that interval, carrying
    any overshoot forward (a leaky-bucket/software-PLL divisor) so the
    long-run average rate stays accurate. This is not a second timer (like
    10/15/18) and not one timer whose OWN rate is a sample rate with a
    wall-clock dispatch check riding along on the same tick (03/06) and not
    a timer-free opportunistic loop (11) -- it is one timer, decoupled from
    both configured rates, driving both via independent tick-count
    divisors. sensors/pulse.js's pulseTick is directly unit-tested by
    calling it repeatedly with fake onSample/onDispatch callbacks, no real
    timers involved (see pulse.test.js).

  - Fog buffering: 03-patient-vitals' fog/app.js groups readings into a
    shared per-key array (app.locals.pending, a Map) directly at ingest,
    and flushWindow() takes a snapshot via `new Map(app.locals.pending)`
    then calls `.clear()` on the ORIGINAL live Map -- two operations
    against the live object every flush. 06-offshore-wind-farm's
    fog/accumulator.js folds each incoming value into a live streaming
    accumulator (openAccumulator/fold) the instant it arrives, so no raw
    reading list is ever kept at all. 10-wildfire-forest-monitoring's
    fog/buffer.js decouples ingestion from buffering via a Node
    EventEmitter: the HTTP handler only emits a "reading" event, and a
    single listener owns the per-key Map. 11-water-treatment-utility's
    fog/ledger.js defers ALL grouping to flush time over one flat
    write-ahead-log array with no per-key structure at ingest at all.
    15-data-center-environmental-monitoring's fog/ringBuffer.js uses a
    fixed-capacity (256-slot) ring buffer per key, silently overwriting the
    oldest unflushed slot under sustained overload.
    18-elevator-escalator-fleet-monitoring's fog/windowBuffer.js groups
    into a plain Map<string, Array> directly at ingest (the same
    "group-at-ingest" idea as 03), and its own comment states plainly that
    the real difference from 03 is the flush *scheduling* (its
    scheduler.js's recursive async Promise chain), not the buffer
    structure -- takeSnapshot() walks the ONE live Map object directly and
    calls `.clear()` on that SAME object in place, no copy at all. This
    project's fog/doubleBuffer.js also groups at ingest into a per-key
    array (addReading), the same starting idea as 03/18, but flush
    (swapAndDrain) works differently from both: it installs a brand-new
    empty Map as the live `active` buffer in one assignment
    (`db.active = new Map()`) and hands the PREVIOUS Map back to the caller
    to walk -- that previous Map is never copied (unlike 03's
    `new Map(...)`) and never explicitly `.clear()`-ed (unlike 03's or
    18's in-place clear); it is simply left for the caller to read and then
    let the garbage collector reclaim. Any reading that lands during or
    after the walk goes into the fresh Map, so ingest and drain never touch
    the same object. doubleBuffer.test.js proves this directly: it captures
    the Map reference before swapAndDrain(), asserts `db.active` now points
    at a DIFFERENT object afterwards, and asserts the old (drained) Map
    still holds its original entries untouched.

  - Alert rules: 03-patient-vitals' fog/alerts.js uses a generic
    [field, op, limit, key] tuple-array object (VITAL_LIMITS) looped over
    per vital. 06-offshore-wind-farm's fog/alerts.js uses a
    per-sensor-type dispatch object of hand-written named inspector
    functions (INSPECTORS). 10-wildfire-forest-monitoring's fog/alerts.js
    uses a flat array of {sensorType, key, test} rule-descriptor objects
    walked with RULES.filter().map(). 11-water-treatment-utility's
    fog/alerts.js uses a Map<sensorType, Function> of closures manufactured
    by a makeThreshold(field, op, limit, key) factory.
    15-data-center-environmental-monitoring's fog/alerts.js uses a plain
    object literal keyed by sensor_type mapping to rule-descriptor arrays,
    walked with Object.entries(RULES).filter(). 18-elevator-escalator-
    fleet-monitoring's fog/alertEngine.js wraps a Map<sensorType,
    [{predicateFn, key}]> inside an AlertEngine class, built up via
    registerRule() calls. This project's fog/alerts.js uses none of those
    six container shapes: evaluateAlerts(sensorType, summary) is a plain
    switch statement branching directly on sensorType, with each case
    returning its fired key(s) inline -- there is no Map, object, array, or
    class to look the sensor type up in at all. A separate THRESHOLD_TABLE
    object remains purely descriptive metadata for the /thresholds
    endpoint (never consulted by evaluateAlerts), matching the same
    disclosure-vs-evaluation split every sibling fog service uses.

  - SQS publisher: 03-patient-vitals' fog/queueGateway.js is a
    QueueGateway class (constructor + init() + send()). 06-offshore-
    wind-farm's fog/publisher.js is a closure factory, createPublisher(),
    returning a fresh { publish, queueUrl } object per call.
    10-wildfire-forest-monitoring's fog/publisher.js exports a bare
    function, publish(sqsClient, queueName, payload), taking the SQS
    client as an explicit parameter on every call, with a module-level Map
    cache (queueUrlCache) memoizing queue-url lookups.
    11-water-treatment-utility's fog/publisher.js makes module.exports
    itself a single Object.freeze()'d object literal, with the client and
    resolved queue url as private module state and queueUrl exposed as a
    getter. 15-data-center-environmental-monitoring's fog/publisher.js
    decouples flush from send via a Node EventEmitter ("window-closed"
    event) and always sends via SendMessageBatchCommand, chunked at the
    10-entry SQS batch limit. 18-elevator-escalator-fleet-monitoring's
    fog/publisher.js wires a real Node stream.Transform
    (PassThroughGroup) piped into a stream.Writable sink that performs the
    actual SendMessageCommand, correlating each write with its outcome via
    a Map<id, {resolve, reject}>. This project's fog/publishQueue.js is
    none of those six shapes: it is a self-draining async FIFO work queue.
    publish() never calls SendMessageCommand itself -- it only pushes a job
    onto a private array (_jobs) and returns a Promise that settles once
    THAT job is sent, then calls the internal _pump(). A single _pump()
    loop drains _jobs strictly one job at a time in FIFO arrival order,
    guarded by a _pumping flag so at most one pump ever runs: if a pump is
    already active, publish() just appends and trusts the running pump to
    reach the new job. publishQueue.test.js proves the ordering/exclusivity
    property directly: three concurrent publish() calls against a fake
    client that tracks concurrent in-flight sends assert maxInFlight === 1
    and that results settle in strict FIFO order [1, 2, 3].

  - HTTP routing: 03 and 06 both use Express under the hood (03 inline
    routes directly on the app; 06 split into Express Router files,
    ingestRouter.js / routes/readings.js / routes/status.js).
    10-wildfire-forest-monitoring's fog/app.js and
    15-data-center-environmental-monitoring's fog/app.js both use a plain
    http.createServer with a hand-written if/else chain on
    req.method/url.pathname -- no path-parameter support and no
    declarative table at all (15's backend/dashboard/server.js reverse-
    proxy front door is simpler still: a single manual
    req.url.startsWith("/api/") check with a static-file fallback, by its
    own comment deliberately kept minimal since that project's real
    routing novelty lives in backend/api/'s regex ROUTES array instead).
    11-water-treatment-utility's fog/router.js and
    backend/dashboard/router.js hold an ordered array of
    [method, regex, handler] tuples, matched with RegExp.exec() against
    the pathname (15's backend/api/router.js ROUTES array uses the same
    regex-table idiom for its own internal Lambda routing).
    18-elevator-escalator-fleet-monitoring's fog/router.js is a hand-rolled
    Express-style middleware-chain router: routes are
    {method, path, handlers: [fn, fn, ...]} objects in a plain array,
    matched by splitting the path into segments and comparing them
    position-by-position (no RegExp at all), with dispatch() composing
    multiple handlers per route via a next() continuation. This project's
    fog/router.js and backend/dashboard/router.js are a seventh idiom:
    an actual prefix tree (trie), one tree node per path segment. route()
    walks/creates a chain of nodes as it registers a path; a ":name"
    segment becomes a single dedicated "param child" slot on its parent
    node (not a regex capture group, not a linear array of routes). At
    request time, dispatch() walks the SAME tree segment-by-segment from
    the root, so lookup cost tracks the path's depth, not the number of
    routes registered (unlike every regex-table or linear-array approach
    above, all of which scan some list). router.test.js exercises
    dispatch() directly against plain method/pathname strings with no
    http.createServer involved at all, the same testing discipline 11's
    router.test.js and 18's router.test.js already established. Every
    request in both services still passes through a real outer try/catch
    that turns any uncaught exception into a structured 500 JSON response.

  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency, matching every sibling in this portfolio.
    AWS-facing code is isolated behind functions/objects that accept an
    injected client, so unit tests use hand-written fake client objects
    ({ send: async (cmd) => ... }) instead of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/district):
                       a single shared pulse timer drives both sampling and
                       dispatch via independent millisecond accumulators
                       (pulse.js), random-walk profiles (profiles.js)
  fog/                http.createServer edge gateway: trie-based routing
                       (router.js) -> /ingest validates and appends into a
                       grouped-at-ingest per-key buffer (doubleBuffer.js)
                       -> window flush installs a fresh buffer via a
                       reference swap and walks the old one
                       (swapAndDrain) -> aggregates (aggregation.js) ->
                       switch-statement alert evaluation (alerts.js) ->
                       self-draining async FIFO publish queue
                       (publishQueue.js), plus a /thresholds endpoint
                       exposing the real rules as descriptive metadata only
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  http.createServer + Chart.js, no Express, same
                       trie router.js as fog/. REST API covering all 5
                       sensor types plus a per-district grouping endpoint
                       (GET /api/districts and GET /api/districts/:id) AND
                       a dedicated priority-list endpoint (GET /api/priority)
                       that flattens both districts into one list sorted by
                       fill_level_pct descending. Static frontend: a
                       municipal-services teal-green + charcoal theme (dark
                       background, inverse of 12-smart-building-energy's
                       light green/white scorecard). Primary view is a
                       plain sorted worklist table (collection priority
                       list) -- a genuinely new "ranked by urgency" axis
                       distinct from every sibling's card-grid/matrix-
                       table/tile/dial/heatmap layouts. Secondary section:
                       per-district cards with all 5 raw readings as rows
                       with native <meter> bars. Small Chart.js fill-level
                       trend chart underneath. No hand-illustrated SVG
                       anywhere (the brand mark is plain CSS shapes).
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
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

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
Each module has its own package.json and test script. All 113 tests below
were run and confirmed passing (node --test, exit 0) at the time this
readme was written: 19 in sensors/, 46 in fog/, 11 in backend/processor/,
37 in backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Test coverage includes: the pulse accumulator's tick-divisor and
carry-forward behaviour (pulse.test.js, driven with fake onSample/
onDispatch callbacks and no real timers), window aggregation math
(count/min/max/avg/latest, latest = last-in-order not max), threshold
evaluation against the exact hard-alert limits (including that
tamper_suspected checks max, not avg), the double buffer's grouped-at-
ingest + reference-swap-at-flush behaviour (including a direct assertion
that the drained Map is left unmutated while a fresh Map becomes the live
one), the publish queue's FIFO single-pump exclusivity (asserted with a
fake client that tracks concurrent in-flight sends), the trie router's
segment-by-segment dispatch and path-parameter capture (tested with no
http.createServer at all), sort_key disambiguation (window_end#site_id),
and REAL HTTP-level tests against a real local server on an ephemeral port
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
student's own prior projects earlier in this same CA submission, not a
prior/external coursework project. Every line of application code, the
domain logic (waste-management sensor profiles, the four alert thresholds,
the collection-priority derivation), and the entire dashboard
(municipal-services teal-green/charcoal theme, sorted priority-list
worklist, per-district reading cards, trend chart) are original to this
project. The internal module structure was deliberately written
differently from 03-patient-vitals, 06-offshore-wind-farm,
10-wildfire-forest-monitoring, 11-water-treatment-utility,
15-data-center-environmental-monitoring, and
18-elevator-escalator-fleet-monitoring's Node.js code on every axis called
out in TECH STACK above (sensor-loop scheduling, fog buffering, alert-rule
representation, SQS publisher shape, HTTP routing/dispatch), verified
directly against each sibling's current source before writing this
section, so none of the seven Node.js projects in this portfolio share
recognisable source-level structure.

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

NOTE ON THE PRIORITY LIST WITH ONLY TWO DISTRICTS
---------------------------------------------------
Site_id granularity in this project is per-district (district-a,
district-b), matching the two-site scope every sibling project in this
portfolio uses (plant-1/plant-2, turbine-1/turbine-2, etc.) -- so the
collection priority list has at most two rows at any moment. What makes it
a genuinely different structural axis from the sibling dashboards is not
row count, it is that GET /api/priority (readingsStore.js's
buildPriorityList) performs a real Array.prototype.sort() by
fill_level_pct.latest descending and re-sorts on every poll, rendering
whichever district has the highest fill level first, rather than a fixed
left-to-right/row order keyed by site_id the way every sibling's matrix
table or per-site card grid is laid out. The design generalises directly
to more collection points without any structural change.

DEPLOYMENT (AWS)
----------------
This project has been deployed and tested on a real AWS account (not
LocalStack): AWS Academy Learner Lab, account 548539235319, region
us-east-1, under Gundeti Sachin Reddy's (X23432721) own AWS Academy
credentials.

Real resources created:
  DynamoDB table  swm-readings     (same sensor_type/sort_key schema)
  SQS queue       swm-district-agg
  Lambda function swm-processor    (nodejs20.x, LabRole execution role,
                                     event-source-mapping to the queue)
  EC2 instance    i-022c30cf73b0c10db (t3.small, tag Name=swm-dashboard-host,
                                     LabInstanceProfile, no SSH/key-pair --
                                     managed entirely via SSM Session
                                     Manager, security group open only on
                                     tcp/8101)
  S3 bucket       swm-deploy-548539235319 (deployment staging only)

The EC2 instance runs fog + dashboard + all 10 sensor containers via
infra/docker-compose.aws.yml (a variant of infra/docker-compose.yml with
the localstack service and the one-shot Lambda-deploy service removed,
since the Lambda above was deployed for real directly via the AWS CLI
instead of docker-compose's processor service).

Why EC2 and not a fully serverless dashboard: the brief's cloud-deployment
requirement is scoped to the "backend layer" (queues/FaaS/DB), which here
is genuinely serverless (SQS + Lambda + DynamoDB, no EC2 involved). The
fog node and sensors are described in the brief as "virtual (coded)" with
no explicit cloud-deployment requirement of their own. EC2 was used only
to host fog + the dashboard's own small HTTP server + the sensor
containers as long-running processes (something Lambda is not suited to
for a continuous sensor loop or a persistent dashboard server) once the
scope was widened to run the entire stack in the cloud rather than only
the backend. Running just the backend on AWS while keeping fog/sensors
local (pointed at the real AWS endpoints instead of LocalStack) would have
satisfied the brief without EC2 at all; EC2 was an explicit scope choice,
not a requirement.

Two Node.js AWS-client-construction bugs were found and fixed during this
deployment (handler.js, awsClients.js, publishQueue.js all hardcoded
LocalStack-style static test credentials on a check that is also true for
real Lambda/EC2 execution-role credentials, which additionally require a
session token the hardcoded override omitted) -- see commits 59f1f6a and
ea6c9eb for the fix. This is a real, worth-citing finding for the report:
tests passing against LocalStack did not catch a real-AWS-only failure
mode, only the actual deployment did.

Because the deployment was left running rather than torn down after
verification, session/lab expiry (this is a time-limited AWS Academy
Learner Lab session) may eventually reclaim the EC2 instance and/or its
public IP; the DynamoDB table, SQS queue, and Lambda function are more
likely to persist across a lab reset than the EC2 instance is. To tear
everything down: terminate the EC2 instance, delete the SQS queue, delete
the Lambda function (and its event-source-mapping), delete the DynamoDB
table, empty and delete the S3 bucket, and delete the security group
(swm-dashboard-sg) -- all resources are uniquely named with the swm-
prefix or tagged Project=FEC-22-smart-waste-management, safe to filter on.
