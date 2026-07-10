Smart Building Energy Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/12-smart-building-energy/), not the repo root.

OVERVIEW
--------
Ten simulated sensors (energy consumption, CO2, occupancy, HVAC temperature,
water usage -- each running for two office floors) feed a fog node. The fog
node windows and aggregates each sensor's readings, raises threshold alerts,
and dispatches one aggregate per window to a queue. An AWS Lambda function
(running inside LocalStack) consumes the queue and stores records; a web
dashboard renders a per-floor sustainability scorecard, primarily a computed
letter-grade efficiency badge (A-F) per floor, with the 5 raw sensor
readings as secondary detail.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so a real
AWS/Azure deployment is a deliberately deferred Phase 2 item for the whole
portfolio, not attempted here.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor type/floor)
  fog/                fog node: ingest, buffer, window, aggregate, alert,
                       publish -- see REUSE section below for the exact
                       module-by-module implementation choices
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  REST API + static frontend (green/white sustainability
                       scorecard, per-floor cards with a letter-grade badge)
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification
  tests/              pytest unit + real HTTP-level route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest + boto3 -- boto3 is also the
  only runtime dependency of every service in this project: fog, dashboard
  and processor all use plain http.server for HTTP, not a framework, so
  boto3 is the one real third-party dependency across the whole app)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8091
  LocalStack: http://localhost:4577

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
(e.g. sensor-energy-f1 samples every 2s/dispatches every 8s, sensor-water-f1
samples every 5s/dispatches every 15s) to demonstrate the two knobs are
genuinely independent, not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4577 \
    python scripts/verify_pipeline.py

Example curl commands:
  curl http://localhost:8091/api/health
  curl http://localhost:8091/api/floors
  curl http://localhost:8091/api/thresholds
  curl http://localhost:8091/api/backend-stats
  curl "http://localhost:8091/api/readings?sensor_type=energy_consumption_kw&limit=20"
  curl "http://localhost:8091/api/readings?sensor_type=co2_ppm&site_id=floor-2&limit=10"

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

129 tests currently pass covering: window aggregation math, the Rule
dataclass and evaluate() alert logic, the lru_cache-based SQS publisher
(including that a failed queue-url resolution is never cached), the
queue.Queue producer/consumer buffering pipeline, /ingest input validation,
a real HTTP-level test suite against a live ThreadingHTTPServer for both
the fog node and the dashboard (ephemeral port, http.client requests, no
mocked transport), the sensor random walk and threading.Timer tick logic,
the Lambda transform/handler (with a hand-written fake DynamoDB table, no
real AWS/LocalStack touched), the efficiency score/grade formula, the
dashboard's DynamoDB/SQS/Lambda data-access functions (fake boto3 objects),
and the thresholds-proxy function against both a real local success server
and a real closed TCP port (genuine unreachable-upstream failure).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4577 \
    python loadtest/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count, so
a genuinely stalled pipeline still fails the assertion even when a slow
one does not.

EFFICIENCY GRADE FORMULA
-------------------------
backend/dashboard/scoring.py computes a 0-100 efficiency_score per floor
from that floor's most recent energy_consumption_kw and co2_ppm window
averages, then maps the score to a letter grade:
  1. Each reading gets a 0-100 band score, 100 at or below an "efficient"
     reference point and 0 at or above a "poor" reference point, linear
     in between:
       energy_consumption_kw: efficient <= 30 kW, poor >= 70 kW
       co2_ppm:                efficient <= 600 ppm, poor >= 1200 ppm
  2. efficiency_score = round((energy_band + co2_band) / 2, 1)
  3. letter_grade: A >= 90, B >= 75, C >= 60, D >= 40, else F
These reference points are fixed constants independent of the fog node's
alert thresholds (fog/alerts.py), so the badge degrades gracefully well
before an alert would ever fire -- a floor can show grade C long before it
trips peak_load_warning or poor_air_quality.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own projects 01-smart-agriculture and
05-cold-chain-logistics, built earlier for this same CA submission (not a
prior/external coursework project). This is the 3rd Python project in the
portfolio, so every implementation-choice axis below was deliberately made
a genuinely distinct combination from both 01 and 05 (confirmed by reading
both projects' current source before writing this one):

  Fog buffering (fog/ingest_pipeline.py):
    01's fog/app.py writes straight into a shared defaultdict(list) from
    inside the async request handler -- no queue, buffer-then-reduce,
    single asyncio event loop. 05's fog/app.py pushes onto an asyncio.Queue
    and folds each batch into a WindowAccumulator of RollingStat objects
    from an asyncio background task (streaming fold). This project uses
    plain http.server.ThreadingHTTPServer (a real OS thread per request,
    no event loop), so asyncio.Queue would be the wrong tool -- it isn't
    thread-safe across threads without call_soon_threadsafe. Instead,
    fog/ingest_pipeline.py uses the stdlib queue.Queue (genuinely
    thread-safe) as INBOX: enqueue_batch() (called from a request-handling
    thread) only ever puts a (sensor_type, site_id, unit, readings) tuple
    onto it; a single dedicated consumer thread (consume_forever(), started
    once in app.py's main()) blocks on inbox.get() and is the only thing
    that ever writes into the shared _buffers dict. This is a 3rd
    concurrency primitive distinct from both siblings: real OS threads
    coordinated by a thread-safe queue, rather than a single-threaded event
    loop (05) or no decoupling at all (01). (Note: the CA brief's own
    example for this axis was asyncio.Queue, but reading 05's actual
    current fog/app.py shows it already implements exactly that pattern --
    see WindowAccumulator/inbox_consumer -- so genuine distinctness plus
    the plain-http.server constraint both point to queue.Queue+threads
    instead.)

  Alert rules (fog/alerts.py):
    01's fog/alerts.py keeps THRESHOLDS as a dict-of-lists-of-tuples keyed
    by sensor_type, looped over in evaluate(). 05's fog/alerts.py keeps one
    hand-written _check_<key> function per exception, wired through a
    dict-dispatch table (_EVALUATORS). This project instead defines a
    frozen, __post_init__-validated Rule dataclass (validates field/op on
    construction) and stores every rule as one flat list, RULES -- not
    keyed by sensor_type at all. evaluate(sensor_type, summary) is a single
    filtering list comprehension over that flat list:
      [rule.key for rule in RULES if rule.sensor_type == sensor_type and rule.fires(summary)]
    thresholds_payload() groups RULES by sensor_type only for the
    descriptive /thresholds endpoint, built fresh from RULES so it can
    never drift from what evaluate() actually enforces.

  SQS publisher (fog/publisher.py):
    01's fog/publisher.py is a class (SqsPublisher) with a bounded
    sleep-based retry loop in __init__. 05's fog/publisher.py is a
    contextlib.contextmanager factory (open_shipment_link) yielding a
    ShipmentLink dataclass-backed object with its own jittered-backoff
    retry generator. This project's fog/publisher.py is a pair of plain
    functools.lru_cache-memoized functions (_client, _queue_url) wrapping
    a bare boto3.client -- no class, no contextmanager. lru_cache only
    memoizes calls that return normally, so a failed _queue_url lookup (the
    queue not provisioned yet) is simply retried on the next publish() call
    with no explicit retry loop, then stays resolved for the rest of the
    process once it succeeds.

  HTTP routing/framework (fog/app.py, backend/dashboard/app.py):
    01 and 05 both use FastAPI (05 split into app.py/ingest_routes.py/
    status_routes.py; the dashboard similarly split into app.py/routes.py/
    health.py). This project uses no framework anywhere: both the fog node
    and the dashboard are plain http.server.BaseHTTPRequestHandler served
    by ThreadingHTTPServer, with hand-written if/elif route dispatch in
    do_GET/do_POST, manual json.loads/dumps (no Pydantic models), and a
    real try/except boundary in every handler translating uncaught
    exceptions to a 500 JSON response. POST /ingest has real input
    validation (fog/validation.py) rejecting malformed/missing-field
    payloads with 400, proven by a real HTTP-level test
    (tests/test_fog_http.py) that boots an actual ThreadingHTTPServer on
    an ephemeral port and drives it with http.client -- mirroring the
    plain-JDK-HttpServer / plain-http.createServer discipline already used
    by this portfolio's Java and Node projects, applied here in Python.
    The dashboard backend gets the identical real-HTTP-level test treatment
    (tests/test_dashboard_http.py).

  Sensor loop structure (sensors/sensor.py):
    01's sensors/sensor.py uses a single `while True: ... time.sleep(...)`
    loop, checking elapsed time to decide when to dispatch. 05's
    sensors/sensor.py uses the stdlib `sched` scheduler with two events
    re-entering themselves on one scheduler queue, still driven by a single
    thread calling `clock.run()`. This project uses two independently
    self-rearming `threading.Timer` chains: _sample_tick() does one
    sampling tick's work then arms the next Timer for sample_interval
    seconds later; _dispatch_tick() does the same for dispatch_interval.
    There is no central loop or scheduler object -- each tick is a genuine
    separate OS thread, coordinated only by a lock around the shared
    reading buffer. (Note: the CA brief's own example for this axis was
    `sched`, but reading 05's actual current sensors/sensor.py shows it
    already uses exactly that module, so threading.Timer was chosen for
    genuine distinctness instead.)

Domain-specific code (reading profiles, thresholds, the efficiency-score
formula, and the entire dashboard: green/white theme, per-floor-card+
letter-grade-badge layout) is new for this project. Third-party open-source
components used as standard libraries/tools:
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (energy trend chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
No framework (FastAPI/Flask/uvicorn/ASGI) is used anywhere in this
project's application code -- every HTTP service is built on the Python
standard library's http.server module.
