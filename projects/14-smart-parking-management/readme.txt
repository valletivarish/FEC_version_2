Smart Parking Management Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/14-smart-parking-management/), not the repo root.

OVERVIEW
--------
A city parking operator monitors two multi-level parking lots (lot-a,
lot-b), each with a fixed capacity of 300 spaces. Ten simulated sensors
(occupied spaces, entry rate, exit rate, average dwell time, gate fault
events -- each running for both lots) feed a fog node. The fog node windows
and aggregates each sensor's readings, raises threshold alerts, and
dispatches one aggregate per window to a queue. An AWS Lambda function
(running inside LocalStack) consumes the queue and stores records; a web
dashboard renders a per-lot capacity console, primarily a native <progress>
occupancy gauge per lot, with entry/exit rate, dwell time and gate-fault
detail as secondary rows.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so a real
AWS/Azure deployment is a deliberately deferred Phase 2 item for the whole
portfolio, not attempted here.

LAYOUT
------
  sensors/            sensor simulator (one asyncio process per sensor
                       type/lot pair -- see REUSE section for the loop
                       structure)
  fog/                fog node: ingest, buffer, window, aggregate, alert,
                       publish -- see REUSE section below for the exact
                       module-by-module implementation choices
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  REST API + static frontend (dark asphalt/violet
                       "night city" theme, per-lot cards with a native
                       <progress> capacity gauge)
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real HTTP-level route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest + boto3 -- boto3 is also the
  only runtime dependency of every service in this project: fog, dashboard
  and processor all use plain wsgiref.simple_server for HTTP, not a
  framework, so boto3 is the one real third-party dependency across the
  whole app)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8093
  LocalStack: http://localhost:4579

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
(e.g. sensor-occupied-a samples every 2s/dispatches every 8s,
sensor-gatefault-a samples every 5s/dispatches every 16s) to demonstrate
the two knobs are genuinely independent, not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4579 \
    python infra/verify_pipeline.py

Example curl commands:
  curl http://localhost:8093/api/health
  curl http://localhost:8093/api/lots
  curl http://localhost:8093/api/thresholds
  curl http://localhost:8093/api/backend-stats
  curl "http://localhost:8093/api/readings?sensor_type=occupied_spaces&limit=20"
  curl "http://localhost:8093/api/readings?sensor_type=gate_fault_events&site_id=lot-b&limit=10"

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

120 tests currently pass covering: window aggregation math, the AlertKey
enum/RULES dict-of-dicts evaluate() logic (plus a cross-check that
THRESHOLD_DESCRIPTIONS never drifts from the real predicates), the
closure-based SQS publisher (including retry-until-success and
exhausted-attempts-raises paths), the collections.deque ring buffer
(including that it silently evicts the oldest reading once
MAX_READINGS_PER_KEY is exceeded), /ingest input validation, a real
HTTP-level test suite against a live wsgiref.simple_server for both the fog
node and the dashboard (ephemeral port, http.client requests, no mocked
transport), the sensor random walk plus the asyncio sample/dispatch tick
logic (including a real asyncio.gather concurrency check that both loops
fire within a bounded run), the Lambda transform/handler (with a
hand-written fake DynamoDB table, no real AWS/LocalStack touched), the
occupancy status formula, the dashboard's DynamoDB/SQS/Lambda data-access
functions (fake boto3 objects), and the thresholds-proxy function against
both a real local success server and a real closed TCP port (genuine
unreachable-upstream failure).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4579 \
    python infra/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count, so
a genuinely stalled pipeline still fails the assertion even when a slow one
does not.

OCCUPANCY STATUS FORMULA
-------------------------
backend/dashboard/status.py computes occupancy_pct = round(100 * occupied /
capacity, 1) from each lot's most recent occupied_spaces window average,
then derives a 4-tier status badge:
  - any active alert on that lot (from any of its 5 readings) -> "alert"
  - occupancy_pct >= 90 -> "near_full"
  - occupancy_pct >= 75 -> "busy"
  - otherwise -> "normal"
This is deliberately independent of fog's alert thresholds (fog/alerts.py)
-- a lot can visibly trend toward "near_full" well before its
occupied_spaces window average ever crosses 270 and trips
near_full_capacity, the same "earlier, graded signal" idea as
12-smart-building-energy's letter-grade efficiency badge, applied here as a
4-tier occupancy status instead of a 5-tier A-F grade.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own projects 01-smart-agriculture,
05-cold-chain-logistics and 12-smart-building-energy, built earlier for
this same CA submission (not a prior/external coursework project). This is
the 4th Python project in the portfolio, so every implementation-choice
axis below was deliberately made a genuinely distinct combination from all
three (confirmed by reading each project's current source before writing
this one) -- these exact choices were pre-assigned by the CA brief to
guarantee no collision with the other concurrently-built projects in this
batch (13, 15-18) either.

  Fog buffering (fog/buffering.py):
    01's fog/app.py writes straight into a shared defaultdict(list) from
    inside the async request handler -- unbounded, no queue at all. 05's
    fog/app.py pushes onto an asyncio.Queue and folds each batch into a
    WindowAccumulator of RollingStat objects from an asyncio background
    task (streaming fold, also unbounded). 12's fog/ingest_pipeline.py
    decouples ingest from buffering with a stdlib queue.Queue INBOX feeding
    a single consumer thread that writes into a plain (unbounded) dict of
    lists. This project's buffer is a real collections.deque(maxlen=500)
    per (sensor_type, site_id) key -- a genuinely bounded ring buffer:
    add_readings() extends the deque directly (guarded by a plain
    threading.Lock, since the WSGI server handles requests on real OS
    threads, not an event loop or a separate consumer thread), and once a
    key's deque hits MAX_READINGS_PER_KEY the oldest unflushed readings for
    that key are silently evicted in favour of the newest ones, so a
    key that is never flushed cannot grow memory without limit the way all
    three siblings' structures can.

  Alert rules (fog/alerts.py):
    01 keeps THRESHOLDS as a dict-of-lists-of-tuples keyed by sensor_type,
    looped over with an if/elif on the operator string. 05 keeps one
    hand-written _check_<key> function per exception, wired through a
    dict-dispatch table (_EVALUATORS). 12 defines every rule as a frozen,
    __post_init__-validated Rule dataclass instance in one flat RULES list
    (not keyed by sensor_type at all) and filters that flat list. This
    project defines an enum.Enum class (AlertKey) for the four alert keys,
    then RULES: dict[str, dict[AlertKey, Callable[[dict], bool]]] keyed
    first by sensor_type and then by AlertKey straight to a lambda
    predicate. evaluate() is a single filtering comprehension over the
    inner dict's .items():
      [key.value for key, predicate in predicates.items() if predicate(agg)]
    THRESHOLD_DESCRIPTIONS is a separate, explicit field/op/limit/key mirror
    for the purely-descriptive /thresholds endpoint (lambdas aren't
    introspectable for their own field/op/limit), and
    tests/test_alerts.py::TestThresholdsPayload::
    test_descriptions_agree_with_the_real_evaluate_predicates cross-checks
    every description against evaluate() itself so the two can never
    silently drift apart.

  SQS publisher (fog/publisher.py):
    01's fog/publisher.py is a class (SqsPublisher) with a bounded
    sleep-based retry loop in __init__. 05's fog/publisher.py is a
    contextlib.contextmanager factory (open_shipment_link) yielding a
    ShipmentLink dataclass-backed object with its own jittered-backoff
    retry generator. 12's fog/publisher.py is a pair of
    functools.lru_cache-memoized module-level functions wrapping a bare
    boto3.client. This project's fog/publisher.py is make_publisher(...), a
    closure factory: it builds one boto3 client and resolves the queue URL
    once (retrying with a fixed delay while LocalStack finishes
    provisioning it), then returns a small inner publish(message) function
    that closes over both the client and the resolved queue_url. There is
    no class, no contextmanager, and no lru_cache/global-variable cache --
    the closure itself is the only place any state lives.

  HTTP routing/framework (fog/app.py, backend/dashboard/app.py):
    01 and 05 both use FastAPI (05 split into
    app.py/ingest_routes.py/status_routes.py; the dashboard similarly split
    into app.py/routes.py/health.py). 12 uses no framework anywhere: both
    the fog node and the dashboard are plain
    http.server.BaseHTTPRequestHandler served by ThreadingHTTPServer, with
    hand-written if/elif route dispatch in do_GET/do_POST. This project
    also uses no framework, but a different stdlib HTTP model again:
    wsgiref.simple_server. `app(environ, start_response)` is the actual WSGI
    application callable -- there is no request/response object at all,
    only the raw WSGI contract. Routing is a manual if/elif chain on
    environ['REQUEST_METHOD']/environ['PATH_INFO'], and POST bodies are
    read by hand off environ['wsgi.input'] using CONTENT_LENGTH. WSGIServer
    is mixed with socketserver.ThreadingMixIn (ThreadingWSGIServer) so
    concurrent sensor POSTs from both lots don't serialize behind one slow
    request. POST /ingest has real input validation (fog/validation.py)
    rejecting malformed/missing-field payloads with 400, proven by a real
    HTTP-level test (tests/test_fog_http.py) that boots an actual
    wsgiref.simple_server on an ephemeral port and drives it with
    http.client -- mirroring the plain-JDK-HttpServer / plain-http.
    createServer / http.server discipline already used by this portfolio's
    Java, Node, and 12's Python siblings, applied here via wsgiref instead.
    The dashboard backend gets the identical real-HTTP-level test treatment
    (tests/test_dashboard_http.py).

  Sensor loop structure (sensors/sensor.py):
    01 uses a single `while True: ... time.sleep(sample_interval)` loop,
    checking elapsed time to decide when to dispatch. 05 uses the stdlib
    `sched` scheduler with two events re-entering themselves on one
    scheduler queue, still driven by a single thread calling `clock.run()`.
    12 uses two independently self-rearming `threading.Timer` chains, each
    tick a genuine separate OS thread. This project uses real `asyncio`:
    `asyncio.run(main())` drives two independent coroutines --
    `sample_loop()` and `dispatch_loop()` -- concurrently via
    `asyncio.gather`, each with its own `while True: await
    asyncio.sleep(interval)` cadence on a single event loop thread. There is
    no OS-thread concurrency and no central scheduler object; the two loops
    interleave cooperatively, coordinated only by an asyncio.Lock around
    the shared reading buffer.
    tests/test_sensor.py::TestConcurrentLoops exercises the real
    sample_loop/dispatch_loop coroutines together via asyncio.gather for a
    short bounded run and asserts both cadences actually fired.

Domain-specific code (reading profiles, thresholds, the occupancy-status
formula, and the entire dashboard: dark asphalt/violet "night city" theme,
per-lot-card + native <progress> capacity gauge layout) is new for this
project. The dashboard's structural choice -- a native <progress> element
for the primary per-lot capacity gauge, with all secondary metrics
(entry/exit rate, dwell time, gate faults) rendered as plain text rows, no
gauge widget at all for those -- is deliberately distinct from every
sibling dashboard in this batch that uses <meter> (02, 09, 11, 12).
No hand-drawn SVG art appears anywhere in this dashboard (grep -r "<svg"
backend/dashboard/static returns nothing outside the vendored,
unmodified Chart.js bundle); the only graphics are the native <progress>
gauge, plain CSS-coloured status badges/alert tags, and one Chart.js line
chart. Third-party open-source components used as standard
libraries/tools:
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (occupied-spaces trend chart, vendored at
    backend/dashboard/static/vendor/, byte-identical copy of the file
    already vendored in 01-smart-agriculture) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
No framework (FastAPI/Flask/uvicorn/ASGI) is used anywhere in this
project's application code -- every HTTP service is built on the Python
standard library's wsgiref.simple_server module.
