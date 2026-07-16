EV Charging Network Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/13-ev-charging-network/), not the repo root.

OVERVIEW
--------
Ten simulated sensors (charging current, battery state-of-charge, station
temperature, grid load, session duration -- each running for two charging
hubs) feed a fog node. The fog node buffers, windows and aggregates each
sensor's readings, raises threshold alerts, and dispatches one aggregate
per window to a queue. An AWS Lambda function (running inside LocalStack)
consumes the queue and stores records; a web dashboard renders a
charging-bay grid -- one card per hub, all 5 sensor readings as plain
<meter> rows, with alert badges surfaced per hub.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so
a real AWS/Azure deployment is a deliberately deferred Phase 2 item for
the whole portfolio, not attempted here.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor type/hub)
  fog/                fog node: ingest, buffer, window, aggregate, alert,
                       publish -- see REUSE section below for the exact
                       module-by-module implementation choices
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  REST API + static frontend (charcoal/electric-green
                       EV-tech theme, charging-bay card grid)
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real HTTP-level route tests

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest + flask + boto3 -- flask and
  boto3 are also the only runtime dependencies of the fog node and the
  dashboard backend; the processor and sensors only need boto3 / the
  standard library respectively)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8092
  LocalStack: http://localhost:4578

  Stop:  docker compose -f infra/docker-compose.yml down -v

Bring services up incrementally if you want to watch each stage (also the
order this was verified in during development):
  docker compose -f infra/docker-compose.yml up -d localstack
  docker compose -f infra/docker-compose.yml up -d fog dashboard
  docker compose -f infra/docker-compose.yml up -d processor
  docker compose -f infra/docker-compose.yml up -d

TEARDOWN NOTE: `docker compose down -v` can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
ecn-localstack-1-lambda-ecn-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If `down -v` reports
"Network ecn_default Resource is still in use", check for it and clean up
explicitly:
  docker ps -a --filter "name=ecn"
  docker network ls --filter "name=ecn"
  docker rm -f <the lambda-executor container name>
  docker network rm ecn_default

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every sensor service in docker-compose.yml uses a different combination
(e.g. sensor-current-h1 samples every 2s/dispatches every 8s,
sensor-session-h1 samples every 5s/dispatches every 15s) to demonstrate
the two knobs are genuinely independent, not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4578 \
    python infra/verify_pipeline.py

Example curl commands:
  curl http://localhost:8092/api/health
  curl http://localhost:8092/api/hubs
  curl http://localhost:8092/api/thresholds
  curl http://localhost:8092/api/backend-stats
  curl "http://localhost:8092/api/readings?sensor_type=grid_load_kw&limit=20"
  curl "http://localhost:8092/api/readings?sensor_type=charging_current_a&site_id=hub-2&limit=10"

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
  # -> 400 b'{"error":"sensor_type is required and must be a non-empty string"}'

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12+:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

118 tests currently pass covering: window aggregation math
(test_aggregation.py, 5 tests), evaluate_rules()/thresholds_payload()
against the real threshold list and a generic ad-hoc rule list
(test_alerts.py, 11 tests), the manual-singleton SQS publisher including
that a failed queue-url lookup is retried rather than permanently cached,
plus publish_batch()'s 10-entry SendMessageBatch chunking and its own
retry-then-give-up behaviour (test_publisher.py, 11 tests), POST /ingest
input validation (test_validation.py, 18 tests), a real HTTP-level test
suite driven with http.client against a live werkzeug server on an
ephemeral port for both the fog node (test_fog_http.py, 16 tests,
including the real 400 validation path and a live flush_once()-then-
published-batch assertion covering both the per-group summary contents
and that multiple groups land in one publish_batch() call rather than one
send per group) and the dashboard (test_dashboard_http.py, 12 tests,
including a live 502-on-unreachable-upstream and 200-on-reachable-upstream
round trip through the real /api/thresholds route), the sensor random walk
and ThreadPoolExecutor-backed sample/dispatch tick logic
(test_sensor.py, 21 tests), the Lambda transform/handler with a
hand-written fake DynamoDB table (test_transform.py + test_handler.py, 10
tests combined, no real AWS/LocalStack touched), the dashboard's
DynamoDB/SQS/Lambda data-access functions against hand-written fake boto3
objects, including that items_in_table() sums Scan(Select=COUNT) across
every LastEvaluatedKey page rather than stopping at the first
(test_data_access.py, 12 tests), and the thresholds-proxy
function against both a real local success server and a real closed TCP
port (test_thresholds_proxy.py, 2 tests, genuine unreachable-upstream
failure, not a mocked urlopen).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4578 \
    python infra/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count, so
a genuinely stalled pipeline still fails the assertion even when a slow
one does not. Verified live during development: 2000 messages sent in
1.18s, immediate post-burst depth waiting=1990/in_flight=10 (assertion 1
passed), and after the 120s timeout the queue had drained to 1665
remaining (assertion 2 passed on the strictly-decreased branch, with the
WARNING path printed rather than a failure).

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own earlier projects 01-smart-agriculture,
05-cold-chain-logistics and 12-smart-building-energy, built for this same
CA submission (not a prior/external coursework project). This is the 4th
Python project in the portfolio, so every implementation-choice axis below
was deliberately made a genuinely distinct combination from all three,
confirmed by reading each project's current source before writing this
one:

  Fog buffering (fog/app.py, module-level _buffer/_units/_lock):
    01's fog/app.py writes straight into a shared defaultdict(list) inside
    an async request handler guarded by an asyncio.Lock -- no queue, no
    threading. 05's fog/app.py pushes onto an asyncio.Queue and folds each
    batch into a WindowAccumulator of RollingStat objects from an asyncio
    background task. 12's fog/ingest_pipeline.py uses the stdlib
    queue.Queue as a thread-safe inbox plus a single dedicated
    consumer thread that is the only writer into a plain _buffers dict.
    This project has none of those intermediary objects at all: _buffer
    and _units are plain module-level dicts in fog/app.py, guarded
    directly by a threading.Lock (_lock) -- every /ingest request thread
    (Flask's dev server runs each request on its own worker thread with
    threaded=True) takes _lock, mutates _buffer in place via
    _buffer.setdefault(key, []).extend(readings), and releases it. There
    is no queue, no accumulator class, no dedicated consumer thread --
    the lock is the only synchronization primitive in the whole ingest
    path.

  Alert rules (fog/alerts.py):
    01's fog/alerts.py keeps THRESHOLDS as a dict-of-lists-of-tuples keyed
    by sensor_type. 05's fog/alerts.py wires one hand-written
    _check_<key> function per exception through a dict-dispatch table
    (_EVALUATORS). 12's fog/alerts.py defines a frozen,
    __post_init__-validated Rule dataclass and stores every rule in one
    flat RULES list. This project's fog/alerts.py has no class, dataclass,
    or dispatch table at all: RULES is a flat list of plain dicts
    ({sensor_type, field, op, limit, key}), and evaluate_rules(rules,
    sensor_type, summary) is a small generic pure function that takes the
    rule list as an explicit parameter rather than reading a module
    global -- test_alerts.py's
    test_evaluate_rules_is_a_generic_pure_function_over_any_rule_list
    exercises it against an ad-hoc rule list that has nothing to do with
    RULES, which none of the three siblings' evaluate()/flag_container()
    functions support (they all read a module-level rule table
    internally).

  SQS publisher (fog/publisher.py):
    01's fog/publisher.py is a class (SqsPublisher) with a retry loop in
    __init__. 05's fog/publisher.py is a contextlib.contextmanager factory
    (open_shipment_link) yielding a dataclass-backed ShipmentLink. 12's
    fog/publisher.py is a pair of functools.lru_cache-memoized functions
    (_client, _queue_url) taking (endpoint_url, region[, queue_name]) as
    arguments. This project's fog/publisher.py is neither a class, a
    contextmanager, nor lru_cache-decorated: a private _client = None
    global plus a get_client() function builds the boto3 client by hand on
    first call and returns the same cached object on every call after
    that (no decorator at all), and get_queue_url() does the identical
    manual-global caching for the resolved queue URL. reset_client() is
    the test-only escape hatch that clears both globals. flush_once() in
    fog/app.py collects every (sensor_type, site_id) group's summary for
    the closed window into one list and hands it to publish_batch() once,
    which chunks at the 10-entry SendMessageBatch limit, rather than
    looping a single-message publish() call once per group.

  HTTP routing/framework (fog/app.py, backend/dashboard/app.py):
    01 and 05 both use FastAPI (05 split into app.py/ingest_routes.py/
    status_routes.py) with Pydantic request models. 12 uses no framework
    at all -- both its fog node and dashboard are plain
    http.server.BaseHTTPRequestHandler served by ThreadingHTTPServer, with
    hand-written if/elif route dispatch. This project uses Flask
    (@app.route decorators, request.get_json(silent=True) for manual
    parsing, no Pydantic anywhere) for both the fog node and the dashboard
    backend -- a 4th distinct framework/idiom combination. POST /ingest has
    real input validation (fog/validation.py) rejecting malformed/
    missing-field payloads with a real 400 jsonify() response, proven by a
    real HTTP-level test (tests/test_fog_http.py) that boots Flask's app
    through werkzeug.serving.make_server on a real ephemeral TCP port and
    drives it with http.client -- Flask's own test_client() never opens a
    socket, so it would not satisfy this brief's "real HTTP-level test"
    requirement the way plain-http.server sockets do for 12 or ASGI
    TestClient sockets do for 01/05. The dashboard backend gets the
    identical real-HTTP-level test treatment (tests/test_dashboard_http.py).

  Sensor loop structure (sensors/sensor.py):
    01's sensors/sensor.py uses a single `while True: ... time.sleep(...)`
    loop, checking elapsed time to decide when to dispatch. 05's
    sensors/sensor.py uses the stdlib `sched` scheduler with two events
    re-entering themselves on one scheduler queue. 12's sensors/sensor.py
    uses two independent self-rearming `threading.Timer` chains. This
    project uses a concurrent.futures.ThreadPoolExecutor(max_workers=2)
    with two recurring jobs (_sample_job, _dispatch_job): each job's
    Future gets a done_callback (via HubSensorAgent._resubmit) that
    resubmits the same job back onto the same executor, so the two
    cadences are self-perpetuating pool tasks rather than raw Timer
    threads or a single cooperative scheduler queue -- there is no
    central loop or scheduler object; the executor plus the callback
    chain is the entire recurrence mechanism.

Domain-specific code (reading profiles, thresholds, and the entire
dashboard: charcoal/electric-green EV-tech theme, charging-bay card grid
with native <meter> rows) is new for this project. No hand-drawn SVG
appears anywhere in the frontend (grep -rn "<svg" backend/dashboard/static
returns no matches) -- alerts render as plain colored text badges and
every reading renders as a native <meter> element, per the brief's
no-custom-SVG rule. Third-party open-source components used as standard
libraries/tools:
  - Flask (HTTP framework for fog and dashboard) - https://flask.palletsprojects.com
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (grid-load trend chart, vendored at
    backend/dashboard/static/vendor/, copied from this student's own
    12-smart-building-energy project) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
