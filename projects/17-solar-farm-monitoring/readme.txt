Solar Farm Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/17-solar-farm-monitoring/), not the repo root.

OVERVIEW
--------
Ten simulated sensors (irradiance, panel temperature, inverter output, DC
voltage, soiling index -- each running for two panel arrays) feed a fog
node. The fog node buffers, windows and aggregates each sensor's readings,
raises threshold alerts, and dispatches one aggregate per window to a
queue. An AWS Lambda function (running inside LocalStack) consumes the
queue and stores records; a web dashboard renders a live per-array
"efficiency index" heatmap grid, with the 5 raw sensor readings as
secondary detail.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so a real
AWS/Azure deployment is a deliberately deferred Phase 2 item for the whole
portfolio, not attempted here.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor type/array)
  fog/                fog node: ingest, buffer, window, aggregate, alert,
                       publish -- see REUSE section below for the exact
                       module-by-module implementation choices
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  REST API + static frontend (amber/gold + sky-blue
                       theme, efficiency-index heatmap grid + per-array
                       reading cards)
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real HTTP-level route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest, aiohttp, boto3)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8096
  LocalStack: http://localhost:4582

  Stop:  docker compose -f infra/docker-compose.yml down -v

  Bring services up incrementally if you want to watch each stage:
    docker compose -f infra/docker-compose.yml up -d localstack
    docker compose -f infra/docker-compose.yml up -d fog dashboard
    docker compose -f infra/docker-compose.yml up -d processor
    docker compose -f infra/docker-compose.yml up -d

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every sensor service in docker-compose.yml uses a different combination
(e.g. sensor-irradiance-a1 samples every 2s/dispatches every 8s,
sensor-soiling-a1 samples every 5s/dispatches every 15s) to demonstrate the
two knobs are genuinely independent, not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4582 \
    python infra/verify_pipeline.py

Example curl commands:
  curl http://localhost:8096/api/health
  curl http://localhost:8096/api/arrays
  curl http://localhost:8096/api/thresholds
  curl http://localhost:8096/api/backend-stats
  curl "http://localhost:8096/api/readings?sensor_type=inverter_output_kw&limit=20"
  curl "http://localhost:8096/api/readings?sensor_type=panel_temp_c&site_id=array-2&limit=10"

fog itself is not published to the host (only reachable at http://fog:8000
inside the compose network, matching the brief's fog/backend split); to
exercise it directly -- e.g. to see a real 400 from a malformed /ingest
payload -- run from inside the dashboard container, which already has
Python and network access to fog:
  docker compose -f infra/docker-compose.yml exec dashboard python3 -c "
  import json, urllib.error, urllib.request
  req = urllib.request.Request('http://fog:8000/ingest',
      data=json.dumps({'bad': 'payload'}).encode(),
      headers={'Content-Type': 'application/json'})
  try:
      urllib.request.urlopen(req)
  except urllib.error.HTTPError as exc:
      print(exc.code, exc.read())
  "
  # -> 400 b'{"error": "sensor_type is required and must be a non-empty string"}'

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

110 tests currently pass covering: window aggregation math, the
ThresholdRule Strategy hierarchy (abstract-base instantiation is rejected,
each concrete rule's evaluate() logic, cross-sensor-type isolation, the
descriptive /thresholds payload), the DoubleBuffer active/flushing swap
(including that swap() re-points object references rather than copying,
and a concurrent-writer stress test), the SimpleQueue-backed publisher
(batch-entry construction, queue-url retry, and a real background thread
draining multiple ready messages into one send_message_batch call against a
hand-written fake SQS client), /ingest input validation, a real HTTP-level
test suite against a genuine aiohttp server on an ephemeral port (via
aiohttp.test_utils.TestServer/TestClient, a real socket, not an in-process
transport shim) for the fog node, a matching real HTTP-level suite against
a live ThreadingHTTPServer for the dashboard, the sensor random walk and
the two independent threading.Event-driven sample/dispatch loops (including
that a failed dispatch requeues its batch without losing readings sampled
in the meantime), the Lambda transform/handler (with a hand-written fake
DynamoDB table, no real AWS/LocalStack touched), the efficiency-index
formula and its band classification, and the dashboard's DynamoDB/SQS/
Lambda data-access functions (fake boto3 objects) including the
site-history pairing and per-site filtering logic, and the thresholds-proxy
function against both a real local success server and a real closed TCP
port (genuine unreachable-upstream failure).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4582 \
    python infra/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count, so
a genuinely stalled pipeline still fails the assertion even when a slow
one does not.

EFFICIENCY INDEX FORMULA
-------------------------
backend/dashboard/scoring.py computes a 0-100 efficiency_index per array
from that array's most recent inverter_output_kw and panel_temp_c window
averages, then classifies it into a coarse band used for the heatmap
cell's colour:
  1. output_component: a "rising" band -- 0 at or below 20 kW, 100 at or
     above 110 kW, linear in between. Higher inverter output is better.
  2. thermal_component: a "falling" band -- 100 at or below 45C, 0 at or
     above 72C, linear in between. Lower panel temperature (down to the
     optimal band) is better -- crystalline-silicon panels lose conversion
     efficiency as they run hotter.
  3. efficiency_index = round((output_component + thermal_component) / 2, 1)
  4. index_band: excellent >= 80, good >= 60, fair >= 40, poor >= 20, else
     critical.
These reference points are fixed constants independent of the fog node's
alert thresholds (fog/alerts.py), so the heatmap gives an earlier, graded
signal well before an array trips thermal_derate_risk or
inverter_underperformance. backend/dashboard/data_access.paired_history()
builds one heatmap row per array by pairing that array's recent
inverter_output_kw and panel_temp_c windows position-by-position (both
queried oldest-first) and running each pair through efficiency_index --
the dashboard's structural axis is that heatmap grid (backend/dashboard/
static/style.css's .heatmap-grid/.heatmap-cell rules), not a single
letter-grade badge or a radial dial.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own earlier projects in this same CA
submission (01-smart-agriculture, 05-cold-chain-logistics,
12-smart-building-energy), not a prior/external coursework project. This
is a later Python project in the portfolio, so every implementation-choice
axis below was deliberately made a genuinely distinct combination from all
three (confirmed by reading each project's current source before writing
this one):

  Fog buffering (fog/buffering.py):
    01's fog/app.py writes straight into a shared defaultdict(list) from
    inside the async request handler, guarded by a single asyncio.Lock
    held around both the /ingest write and the flush's read+clear (no
    queue, no thread/task handoff -- the lock is the only concurrency
    control). 05's fog/app.py
    pushes onto an asyncio.Queue and folds each batch into a
    WindowAccumulator of RollingStat objects from an asyncio background
    task. 12's fog/ingest_pipeline.py decouples ingest from buffering with
    a stdlib queue.Queue plus one dedicated consumer thread that owns the
    buffer dict exclusively. This project's fog/buffering.py.DoubleBuffer
    instead keeps exactly two dicts, `active` and `flushing`, as instance
    attributes. record() appends into `active` under a threading.Lock;
    swap() holds that same lock just long enough to do
    `self.active, self.flushing = self.flushing, self.active` -- an O(1)
    reference swap, not a copy -- then returns the non-empty groups from
    the now-`flushing` dict (and clears it for reuse) with the lock already
    released, so window-aggregation work never blocks concurrent ingests
    and vice versa. tests/test_buffering.py's
    test_swap_is_a_reference_swap_not_a_copy proves the swap re-points
    object identities rather than allocating fresh dicts.

  Alert rules (fog/alerts.py):
    01's fog/alerts.py keeps THRESHOLDS as a dict-of-lists-of-tuples keyed
    by sensor_type, looped over in evaluate(). 05's fog/alerts.py keeps one
    hand-written _check_<key> function per exception wired through a
    dict-dispatch table. 12's fog/alerts.py keeps a flat list of frozen
    dataclass Rule instances filtered by a generator expression at call
    time. This project instead builds a real class-based Strategy pattern
    on abc.ABC: ThresholdRule is an abstract base declaring
    evaluate(self, summary) -> str | None as an @abstractmethod (attempting
    ThresholdRule(...) directly raises TypeError -- see
    tests/test_alerts.py's TestThresholdRuleIsAbstract), and two concrete
    subclasses, AboveLimitRule and BelowLimitRule, each implement their own
    evaluate() that checks the summary's sensor_type before comparing a
    field against a limit. RULES is a plain list of instances of those
    subclasses; evaluate(sensor_type, summary) is genuine polymorphic
    dispatch -- `for rule in RULES: rule.evaluate(summary)` -- not a lookup
    table or a comprehension over dataclass fields.

  SQS publisher (fog/publisher.py):
    01's fog/publisher.py is a class with a bounded sleep-retry loop
    around one send_message call per group. 05's fog/publisher.py is a
    contextmanager factory yielding an object with its own jittered-backoff
    retry generator (again one send_message per group). 12's
    fog/publisher.py is a pair of lru_cache-memoized functions wrapping a
    bare boto3.client (still one send_message per group). This project's
    fog/publisher.py instead separates "queue a message" from "talk to
    SQS" entirely: enqueue() drops a ready window-summary onto OUTBOX (a
    plain queue.SimpleQueue) and returns immediately; a single dedicated
    background thread (run_flusher, started via start_flusher_thread)
    blocks on that queue, greedily drains whatever else is already waiting
    up to SQS's 10-message send_message_batch cap (drain_one_batch/
    drain_ready), and ships every drained message in ONE
    send_message_batch call (build_batch_entries/flush_batch) instead of
    one send_message call per group -- a window with 5 sensor types x 2
    arrays publishing in the same tick costs one SQS round trip, not up to
    10. tests/test_publisher.py exercises this with a hand-written fake
    SQS client and a real background thread.

  HTTP routing/framework (fog/app.py):
    01 and 05 both use FastAPI; 12 uses no framework at all (plain
    http.server.ThreadingHTTPServer, hand-written if/elif route dispatch).
    This project uses aiohttp.web -- a real async framework distinct from
    both -- with genuinely async handlers (health/thresholds/ingest) and
    background work modelled as an asyncio task (flush_loop, registered via
    aiohttp's own on_startup/on_cleanup signals rather than a lifespan
    contextmanager). POST /ingest has real input validation
    (fog/validation.py) rejecting malformed/missing-field payloads with
    400, proven by a real HTTP-level test (tests/test_fog_http.py) that
    boots an actual aiohttp server via aiohttp.test_utils.TestServer/
    TestClient -- a genuine asyncio.start_server on an ephemeral port, not
    an in-process ASGI transport shim -- and drives it with real HTTP
    requests over that socket. The dashboard backend (which carries no
    assigned framework axis of its own) stays on plain http.server to avoid
    a second framework dependency purely for serving a REST API and static
    files, and gets the identical real-HTTP-level test treatment
    (tests/test_dashboard_http.py).

  Sensor loop structure (sensors/sensor.py):
    01's sensors/sensor.py uses a single `while True: ... time.sleep(...)`
    loop. 05's sensors/sensor.py uses the stdlib `sched` scheduler with two
    events re-entering themselves on one scheduler queue. 12's
    sensors/sensor.py uses two independently self-rearming
    `threading.Timer` chains (a new Timer object created every tick). This
    project instead runs two genuinely separate, long-lived
    `threading.Thread`s (_sample_loop/_dispatch_loop), each driven by
    `threading.Event().wait(timeout)` instead of time.sleep or a Timer:
    the same stop_event doubles as both the tick delay and the shutdown
    signal, so a single event.set() call would cleanly stop both loops
    (no separate shutdown mechanism needed), and no new Timer object is
    allocated on every tick.

Domain-specific code (reading profiles, thresholds, the efficiency-index
formula, and the entire dashboard: amber/gold + sky-blue theme, heatmap
grid layout) is new for this project. Third-party open-source components
used as standard libraries/tools:
  - aiohttp (async HTTP framework, fog node only) - https://docs.aiohttp.org
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (inverter output trend chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
No framework is used in the dashboard or the Lambda processor -- only the
fog node depends on aiohttp; every other HTTP surface in this project is
built on the Python standard library's http.server module.
