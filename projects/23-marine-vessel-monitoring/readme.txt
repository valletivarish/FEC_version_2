Marine Vessel / Cruise Ship Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/23-marine-vessel-monitoring/), not the repo root.

OVERVIEW
--------
Two cruise vessels (vessel-a, vessel-b) each carry five simulated sensors
(engine room temperature, fuel consumption, ballast water level, hull
vibration, passenger count) that feed a fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches
one aggregate per window to a queue. An AWS Lambda function (running
inside LocalStack) consumes the queue and stores records; a web dashboard
renders a Bridge Console -- a two-column vessel-a/vessel-b comparison
panel, one row per reading -- plus a chronological Voyage Log of recent
aggregation windows.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so a
real AWS/Azure deployment is a deliberately deferred Phase 2 item for the
whole portfolio, not attempted here.

LAYOUT
------
  sensors/            sensor simulator (one process per sensor type/vessel;
                       see REUSE below for the loop-scheduling mechanism)
  fog/                Tornado fog node: ingest, buffer, window, aggregate,
                       alert, publish -- see REUSE below for the exact
                       module-by-module implementation choices
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  Tornado REST API + static frontend (marine teal/white
                       "bridge display" theme, Bridge Console two-column
                       comparison panel + Voyage Log)
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification
  tests/              pytest unit + real HTTP-level route tests
  docs/               dashboard screenshots (desktop + 375px mobile)

SENSOR TYPES
------------
  engine_room_temp_c        C,       20-90,   start 45,  step 4.0
  fuel_consumption_lph      L/h,     0-500,   start 150, step 30.0
  ballast_water_level_pct   %,       0-100,   start 50,  step 6.0
  hull_vibration_mm         mm/s,    0-20,    start 2,   step 1.5
  passenger_count           people,  0-3000,  start 800, step 150.0
                            (no alert rule -- informational secondary
                            detail only, still one of the 5 required
                            sensors and shown in the Bridge Console)

ALERT THRESHOLDS (evaluated on the window aggregate)
-----------------------------------------------------
  engine_room_temp_c:      avg > 75  -> engine_overheat_risk
  fuel_consumption_lph:    avg > 350 -> fuel_burn_excessive
  ballast_water_level_pct: avg > 90  -> ballast_overfill_risk
  hull_vibration_mm:       max > 15  -> hull_stress_warning

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests or ops scripts locally)
  pip install -r requirements-dev.txt (pytest + tornado + boto3 -- tornado
  and boto3 are also the only runtime dependencies of the fog node and the
  dashboard backend; the processor and sensors only need boto3 / the
  standard library respectively)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8102
  LocalStack: http://localhost:4588

  Stop:  docker compose -f infra/docker-compose.yml down -v

  Bring services up incrementally if you want to watch each stage (also the
  order this was verified in during development):
    docker compose -f infra/docker-compose.yml up -d localstack
    docker compose -f infra/docker-compose.yml up -d fog dashboard
    docker compose -f infra/docker-compose.yml up -d processor
    docker compose -f infra/docker-compose.yml up -d

TEARDOWN NOTE: `docker compose down -v` can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
mvs-localstack-1-lambda-mvs-processor-<hash>) and the network it is
attached to, which blocks the network's removal ("Network mvs_default
Resource is still in use"). This was hit and confirmed live during
development of this project. If it happens, check for it and clean up
explicitly:
  docker ps -a --filter "name=mvs"
  docker network ls --filter "name=mvs"
  docker rm -f <the lambda-executor container name>
  docker network rm mvs_default

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every one of the 10 sensor services (5 sensor types x 2 vessels) uses a
distinct SAMPLE_INTERVAL/DISPATCH_INTERVAL pair, e.g. sensor-engine-a
samples every 2s/dispatches every 8s while sensor-passenger-a samples
every 5s/dispatches every 15s, to demonstrate the two knobs are genuinely
independent, not aliased to one value.

VERIFY END-TO-END
------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 python scripts/verify_pipeline.py

Example curl commands (verified live against a running stack):
  curl http://localhost:8102/api/health
  curl http://localhost:8102/api/vessels
  curl http://localhost:8102/api/thresholds
  curl http://localhost:8102/api/backend-stats
  curl "http://localhost:8102/api/readings?sensor_type=hull_vibration_mm&limit=20"
  curl "http://localhost:8102/api/readings?sensor_type=engine_room_temp_c&site_id=vessel-b&limit=10"
  curl "http://localhost:8102/api/voyage-log?limit=10"

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
  (this exact command was run live against the running stack during
  development; see the checklist evidence in the task report)

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

106 tests currently pass covering: window aggregation math
(test_aggregation.py), the operator.gt/operator.lt-callable RULES list and
evaluate()/thresholds_payload() (test_alerts.py, including that hull
vibration is keyed on "max" not "avg" and that passenger_count never
fires), the lock-free plain-dict buffering module (test_buffering.py), the
fire-and-forget single-worker-executor SQS publisher (test_publisher.py,
including a slow-fake-client test proving publish() returns before the
network call completes, and a serialisation-order test), /ingest input
validation (test_validation.py), a real HTTP-level test suite driven via
tornado.testing.AsyncHTTPTestCase against a live Tornado HTTPServer bound
to a real ephemeral socket for both the fog node (test_fog_http.py,
including the real 400 validation path and a live flush()-then-published-
message assertion polling for the fire-and-forget publish to land) and the
dashboard (test_dashboard_http.py, including a live 502-on-unreachable-
upstream and 200-on-reachable-upstream round trip through the real
/api/thresholds route), the sensor random walk plus the call_later self-
rearming tick logic (test_sensor.py, including a real-event-loop test that
runs loop.run_forever() for a short bounded window and asserts the sample
tick actually fired multiple times), the Lambda transform/handler with a
hand-written fake DynamoDB table (test_transform.py + test_handler.py, no
real AWS/LocalStack touched), the dashboard's DynamoDB/SQS/Lambda
data-access functions including vessel_report()'s per-vessel grouping and
recent_log_entries()'s newest-first merge (test_data_access.py, fake boto3
objects), and the thresholds-proxy function against both a real local
success server and a real closed TCP port (test_thresholds_proxy.py,
genuine unreachable-upstream failure, not a mocked urlopen).

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 \
    python loadtest/burst.py --messages 2000 --workers 32

Asserts (1) the queue shows the burst immediately after sending, and (2)
either the queue fully drains within the timeout, or -- if LocalStack's
single-container Lambda emulation hasn't finished by then -- that the
remaining count strictly decreased from the immediate post-burst count, so
a genuinely stalled pipeline still fails the assertion even when a slow
one does not. Verified live during development: 2000 messages sent in
about 1.1s, immediate post-burst depth waiting=1978/in_flight=10 (assertion
1 passed), and after the 120s timeout the queue had drained to 1665
remaining (assertion 2 passed on the strictly-decreased branch, with the
WARNING path printed rather than a failure, matching the documented
LocalStack single-container Lambda throughput ceiling).

BRIDGE CONSOLE / VOYAGE LOG (dashboard structure)
---------------------------------------------------
The dashboard's primary view is a two-column vessel-a/vessel-b comparison
table (backend/dashboard/static/style.css's .console-table rules): one row
per reading, one column per vessel, each cell showing the latest value, a
native <meter> gauge, and an inline alert badge when that reading's rule
has fired. This is a "bridge instrument console" / vessel-comparison
layout, not a card grid, tile set, badge, heatmap, radial dial, status
line, priority list, or a manifest-style table (one row per site, as
05-cold-chain-logistics uses) -- the axis is genuinely new among this
portfolio's 22 existing dashboards. The secondary section is a Voyage Log
(backend/dashboard/data_access.py's recent_log_entries(), .voyage-log
rules): a chronological, journal-style list of individual aggregation-
window entries across both vessels, newest first, distinct from any
sibling's trend chart, manifest row, or detail table. The theme is a
lighter marine teal/white palette (--teal: #0e6e6a, --teal-soft: #dbeeec)
deliberately distinct from 06-offshore-wind-farm's deep navy maritime
turbine-grid, per the brief's own guidance to avoid navy given both
projects are "sea"-adjacent. Standard system font stack only
(-apple-system/Segoe UI/Roboto/Helvetica/Arial), zero custom SVG (grep -rn
"<svg" backend/dashboard/static returns no matches outside the vendored,
unmodified Chart.js bundle), zero emoji, native <meter> for every bounded
reading. Verified responsive at 375px (docs/dashboard-mobile.png): the
console table's own .console-table-wrap scrolls internally if needed
(overflow-x: auto) but the page body itself never scrolls horizontally at
375px (confirmed live: document.documentElement.scrollWidth ==
window.innerWidth == 375 with the final mobile CSS tuning).

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (SQS -> Lambda -> DynamoDB via LocalStack, the
sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own earlier projects in this same CA
submission (01-smart-agriculture, 05-cold-chain-logistics,
12-smart-building-energy, 13-ev-charging-network,
14-smart-parking-management, 17-solar-farm-monitoring,
21-bridge-structural-health), not a prior/external coursework project.
This is the 8th Python project in the portfolio, so every implementation-
choice axis below was deliberately made a genuinely distinct combination
from all 7 prior Python siblings, confirmed by reading each sibling's
current real source before writing this one:

1. Fog buffering (fog/buffering.py)
   This project: _buffers and _units are plain module-level dicts with NO
   lock, queue, or double-buffer swap object at all. Correctness rests on
   Tornado's IOLoop being single-threaded and non-preemptive between
   await points: IngestHandler.post() (fog/app.py) never awaits mid-
   mutation, and the PeriodicCallback-driven flush() never awaits mid-
   snapshot-and-clear either, so the two can never interleave partway
   through a mutation.
     01 fog/app.py:      app.state.buffers = defaultdict(list) keyed by
                          (sensor_type, site_id), guarded by
                          app.state.lock = asyncio.Lock().
     05 fog/app.py:      WindowAccumulator._stats, a dict[(sensor_type,
                          site_id)] -> RollingStat (fog/aggregation.py),
                          fed by an asyncio.Queue (app.state.inbox) drained
                          by the inbox_consumer() background task.
     12 fog/ingest_pipeline.py: _buffers = {} dict guarded by
                          _lock = threading.Lock(), fed via a queue.Queue
                          INBOX and one dedicated consumer thread
                          (consume_forever / start_consumer_thread).
     13 fog/app.py:      _buffer = {} dict guarded directly by
                          _lock = threading.Lock(), grouped at ingest time
                          inline in the /ingest route handler.
     14 fog/buffering.py: _buffers = defaultdict(lambda:
                          deque(maxlen=500)) -- a bounded ring buffer per
                          key, guarded by threading.Lock.
     17 fog/buffering.py: DoubleBuffer.active / DoubleBuffer.flushing, two
                          dicts swapped under threading.Lock.
     21 fog/buffering.py: RAW, a flat unstructured list of raw
                          (sensor_type, site_id, value, ts) tuples appended
                          under threading.Lock, grouped only at flush time
                          via group_by_key().
   None of those 7 relies purely on a single-threaded event loop's
   cooperative-scheduling guarantee to justify having no synchronization
   primitive at all -- this project's fog/buffering.py is the first to do
   so, which is only correct because Tornado's IOLoop (unlike aiohttp's
   asyncio loop shared with real background tasks in 17, or the real-OS-
   thread servers in 12/13/14/17's dashboard/21) never runs the ingest
   handler and the periodic flush callback concurrently mid-mutation.

2. Alert rule representation (fog/alerts.py)
   This project: RULES is a flat list of plain dicts
   ({sensor_type, field, op, limit, key}) whose "op" value is a real
   function object imported from the stdlib operator module (operator.gt),
   not a string. evaluate() calls rule["op"](summary[rule["field"]],
   rule["limit"]) directly -- no string comparison, no lambda, no dispatch
   table, no class method anywhere in the evaluation path.
     01 fog/alerts.py:   THRESHOLDS, a dict-of-lists-of-tuples keyed by
                          sensor_type, evaluated with an if/elif on the
                          "<"/">" string.
     05 fog/alerts.py:   _EVALUATORS, a dict mapping sensor_type to one
                          hand-written _check_<key> function per exception.
     12 fog/alerts.py:   Rule, a frozen (@dataclass(frozen=True)) class
                          with __post_init__ validation, in a flat RULES
                          list filtered by a generator expression, with
                          field/op(string)/limit compared via .fires().
     13 fog/alerts.py:   RULES, a flat list of plain dicts, but consumed by
                          a generic evaluate_rules(rules, sensor_type,
                          summary) that still dispatches on the "op"
                          string with if/elif.
     14 fog/alerts.py:   AlertKey(Enum) keys a
                          dict[str, dict[AlertKey, Callable]] of lambdas.
     17 fog/alerts.py:   ThresholdRule(abc.ABC) with AboveLimitRule /
                          BelowLimitRule subclasses implementing
                          evaluate(self, summary) -- polymorphic Strategy.
     21 fog/alerts.py:   Rule(typing.NamedTuple) dispatched via
                          `match rule.op: case "avg_gt": ... case
                          "max_gt": ...` (PEP 634 structural pattern
                          matching on a string tag).
   None of those 7 stores the comparison itself as a first-class callable
   -- every one re-derives ">"/"<" behaviour from a string tag at
   evaluation time (if/elif, match/case, dict-dispatch, or a lambda
   hand-written to match the intended comparison). This project's
   fog/alerts.py is the first to store operator.gt itself as data.
   thresholds_payload() maps each function object back to its display
   symbol via _OP_SYMBOLS = {operator.gt: ">", operator.lt: "<"} only for
   the purely-descriptive /thresholds endpoint, since evaluate() never
   consults that map.

3. SQS publisher shape (fog/publisher.py)
   This project: publish(client, queue_url, message, executor=None)
   submits client.send_message(...) as a one-off task directly onto a
   dedicated concurrent.futures.ThreadPoolExecutor(max_workers=1) and
   returns the Future immediately without waiting on it -- fire-and-
   forget, one executor task per message, no outbox queue object, no
   batching.
     01 fog/publisher.py: SqsPublisher class -- __init__ resolves the
                          queue URL via a sleep-based retry loop and
                          caches the client/URL as instance state; a
                          blocking .publish() method.
     05 fog/publisher.py: open_shipment_link(), a @contextmanager factory
                          yielding a dataclass-backed ShipmentLink with a
                          jittered-backoff retry generator (retry_ticks);
                          .ship() blocks the caller.
     12 fog/publisher.py: a pair of functools.lru_cache-memoized functions,
                          _client()/_queue_url(), wrapping a bare
                          boto3.client; publish() blocks the caller.
     13 fog/publisher.py: a manual module-level singleton (_client /
                          _queue_url globals plus get_client()/
                          get_queue_url()); publish() blocks the caller.
     14 fog/publisher.py: make_publisher(...), a closure factory returning
                          an inner publish(message) that blocks the
                          caller.
     17 fog/publisher.py: OUTBOX, a queue.SimpleQueue, drained by one
                          dedicated background flusher thread
                          (run_flusher/start_flusher_thread) that batches
                          up to 10 messages per send_message_batch call --
                          the caller (enqueue()) does not block, but
                          publishing is queue-and-batch-drain, not a
                          direct per-message executor submission.
     21 fog/publisher.py: publish(client, queue_url, payload) -- a single
                          stateless function with no memoization at all,
                          but still a direct, blocking send_message call
                          on the caller's own thread.
   This project is the first whose publish() itself is asynchronous
   (returns a Future without the caller waiting) via a dedicated
   single-worker executor, rather than blocking synchronously (01/05/12/
   13/14/21) or routing through an explicit outbox queue drained by a
   separate long-lived thread (17). tests/test_publisher.py's
   test_publish_returns_a_future_immediately_fire_and_forget proves this
   with a deliberately slowed fake client and an elapsed-time assertion.

4. HTTP routing/framework (fog/app.py, backend/dashboard/app.py)
   This project: Tornado (tornado.web.Application, class-based
   RequestHandler subclasses overriding get()/post()) for both the fog
   node and the dashboard backend -- no FastAPI, no Flask, per the brief's
   explicit instruction to avoid reusing either from prior siblings.
     01/05 fog/app.py:   FastAPI (async def handlers, Pydantic models).
     12 fog/app.py:      stdlib http.server.ThreadingHTTPServer,
                          hand-dispatched if/elif routes in
                          FogHandler.do_GET/do_POST.
     13 fog/app.py:      Flask (@app.route decorators, request.get_json()).
     14 fog/app.py:      stdlib wsgiref.simple_server directly --
                          app(environ, start_response) is the WSGI
                          callable itself, no request/response objects.
     17 fog/app.py:      aiohttp.web (async def handlers registered via
                          app.router.add_get/add_post).
     21 fog/app.py:      Bottle (@app.route decorators,
                          bottle.request.json, bottle.HTTPResponse).
   Tornado is the 8th genuinely distinct HTTP framework/idiom in this
   portfolio's Python projects: routing is neither decorator-based
   (Flask/Bottle) nor a hand-dispatched if/elif chain over a raw request
   object (http.server/wsgiref) nor async-def free functions registered
   with a router (FastAPI/aiohttp) -- it is a list of (pattern,
   HandlerClass) tuples handed to tornado.web.Application, and every route
   is a class overriding get()/post(). POST /ingest has real input
   validation (fog/validation.py) rejecting malformed/missing-field
   payloads with a real 400 response, proven by a real HTTP-level test
   (tests/test_fog_http.py) using tornado.testing.AsyncHTTPTestCase, which
   binds an actual tornado.httpserver.HTTPServer to a real ephemeral port
   (via tornado.testing.bind_unused_port()) and drives it with Tornado's
   own AsyncHTTPClient over a genuine TCP socket -- Tornado's own
   idiomatic real-socket test tooling, mirroring the real-socket discipline
   applied by every sibling's own framework-appropriate test harness
   (FastAPI's ASGI TestClient sockets, aiohttp's TestServer/TestClient,
   Flask through werkzeug's make_server, Bottle/12/14/21 through
   wsgiref/http.server). The dashboard backend gets the identical
   real-HTTP-level test treatment (tests/test_dashboard_http.py), using
   unittest.mock.patch.object in place of pytest's monkeypatch fixture
   since AsyncHTTPTestCase is a unittest.TestCase subclass whose test
   methods do not receive pytest fixtures as parameters.

5. Sensor loop scheduling (sensors/sensor.py)
   This project: two independent asyncio.AbstractEventLoop.call_later(...)
   chains on a single event loop -- _sample_tick()/_dispatch_tick() are
   plain synchronous functions (no `async def`, no coroutine) that each
   re-arm themselves by calling loop.call_later(interval, self_again) at
   the end of their own work; loop.run_forever() is the only thing keeping
   the process alive. The dispatch tick's actual blocking network POST is
   handed to a dedicated one-worker ThreadPoolExecutor so it never stalls
   the loop that is also driving the sample cadence, and the executor's
   result is folded back via loop.call_soon_threadsafe -- the only place
   any cross-thread coordination exists. Because both ticks otherwise run
   exclusively on the single event-loop thread, the shared reading buffer
   needs no lock, queue, or swap structure at all.
     01 sensors/sensor.py: a single `while True: ... time.sleep(...)` loop;
                          dispatch is an elapsed-time comparison inside
                          that same loop.
     05 sensors/sensor.py: stdlib sched.scheduler (self.clock), two
                          self-re-entering events, one thread via
                          clock.run().
     12 sensors/sensor.py: two independently self-rearming threading.Timer
                          chains (a new Timer object created every tick),
                          coordinated by threading.Lock.
     13 sensors/sensor.py: concurrent.futures.ThreadPoolExecutor(
                          max_workers=2) with self-resubmitting tasks via
                          Future.add_done_callback.
     14 sensors/sensor.py: real asyncio -- asyncio.gather(sample_loop(),
                          dispatch_loop()), two coroutines each doing
                          `while True: await asyncio.sleep(interval)` on
                          one event loop, asyncio.Lock for the buffer.
     17 sensors/sensor.py: two threading.Thread loops (_sample_loop/
                          _dispatch_loop), each driven by
                          threading.Event().wait(timeout).
     21 sensors/sensor.py: two genuinely separate OS processes via
                          multiprocessing.Process, joined only by a
                          multiprocessing.Queue and a
                          multiprocessing.Event stop flag.
   None of those 7 schedules recurring work by calling an asyncio event
   loop's own timer wheel directly with plain synchronous callbacks (as
   opposed to 14's coroutine-based `await asyncio.sleep()` loops, which
   use asyncio for cooperative *waiting* inside a coroutine, not
   `call_later` self-rearming callbacks with no coroutine at all). This
   project's sensors/sensor.py is the first to do so.
   tests/test_sensor.py::TestRealEventLoopScheduling exercises a real
   asyncio event loop (not a fake) for a short bounded run and asserts the
   sample tick actually fired multiple times.

Domain-specific code (reading profiles, alert thresholds, and the entire
dashboard: teal/white "bridge display" theme, Bridge Console two-column
comparison table + Voyage Log layout) is new for this project. No
hand-drawn SVG appears anywhere in the frontend (grep -rn "<svg"
backend/dashboard/static returns no matches outside the vendored Chart.js
bundle) -- alerts render as plain colour-coded text badges and every
bounded reading renders as a native <meter> element, per the brief's
no-custom-SVG rule; standard system font stack only, no emoji anywhere.
Third-party open-source components used as standard libraries/tools:
  - Tornado (HTTP framework for fog and dashboard) - https://www.tornadoweb.org
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (engine room temperature trend chart, vendored at
    backend/dashboard/static/vendor/, byte-identical copy of the file
    already vendored in 21-bridge-structural-health, confirmed with `diff`)
    - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org
No FastAPI or Flask is used anywhere in this project's application code,
per the brief's explicit instruction; the only third-party runtime
dependencies across the whole app are tornado and boto3.
