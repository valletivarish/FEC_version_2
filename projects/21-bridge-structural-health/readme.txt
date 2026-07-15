Bridge & Structural Health Monitoring
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/21-bridge-structural-health/), not the repo root.

OVERVIEW
--------
A civil infrastructure authority monitors structural health on two bridge
spans (span-a, span-b). Five simulated structural sensors per span (strain
gauge, deck vibration, tilt/inclinometer, weigh-in-motion traffic load,
expansion joint movement) feed a virtual fog node. The fog node windows and
aggregates each sensor's readings, raises threshold alerts, and dispatches
one aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders
a live per-span "structural integrity index" bar, all 5 raw readings, and
a strain trend chart.

Phase 1 (this repo) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK (boto3) is used throughout, so the
phase-2 move to real AWS is an endpoint/IAM configuration change rather
than a rewrite. Real AWS deployment is deliberately deferred for the whole
portfolio, not a defect of this project.

LAYOUT
------
  sensors/            sensor simulator (one container per sensor_type/span
                       pair; two independent OS processes per container --
                       see REUSE below)
  fog/                Bottle fog node: ingest, window, aggregate, alert,
                       publish
  backend/processor/  transform.py (pure transform) + handler.py (Lambda
                       entry point) + deploy_lambda.py (packages and
                       registers the function with an SQS event source
                       mapping in LocalStack)
  backend/dashboard/  Bottle + Chart.js live dashboard
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots
  tests/              pytest unit + real-HTTP-level route tests

SENSOR TYPES
------------
  strain_microstrain     microstrain, 0-2000, start 300, step 100.0
  deck_vibration_mms      mm/s,        0-30,   start 2,   step 1.5
  tilt_angle_deg          deg,         0-5,    start 0.3, step 0.15
  traffic_load_tonnes     tonnes,      0-200,  start 40,  step 15.0
  expansion_joint_mm      mm,          -50-50, start 5,   step 3.0
                          (can go negative -- thermal contraction)

ALERT THRESHOLDS (evaluated on the window aggregate)
-----------------------------------------------------
  strain_microstrain:   avg > 1200  -> structural_stress_warning
  deck_vibration_mms:   max > 20    -> excessive_vibration_alert
  tilt_angle_deg:       avg > 2.5   -> deformation_risk
  traffic_load_tonnes:  avg > 150   -> overload_risk
  expansion_joint_mm has no alert rule -- informational thermal-movement
  reading only, still one of the 5 required sensors and shown in the
  dashboard's secondary detail section.

STRUCTURAL INTEGRITY INDEX (backend/dashboard/scoring.py)
-----------------------------------------------------------
The dashboard's primary per-span view is a single 0-100% index, combining
that window's strain_microstrain average and deck_vibration_mms peak
against configured safe/critical bounds. Each component scores 100 at or
below its safe bound and 0 at or beyond its critical bound, linearly
in-between; the two component scores are then averaged and rounded to one
decimal place. The critical bounds equal fog/alerts.py's own alert
thresholds (1200 microstrain avg, 20 mm/s vibration max), so the index
reaches 0 exactly where an engineer would already see an active alert.

    strain_score    = 100 - 100 * (strain_avg - 400)      / (1200 - 400)   [clamped 0..100]
    vibration_score  = 100 - 100 * (vibration_max - 8)      / (20 - 8)       [clamped 0..100]
    integrity_index   = round((strain_score + vibration_score) / 2, 1)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Python 3.12+ (only if running the unit tests locally)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8100
  LocalStack: http://localhost:4586

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: docker compose down -v can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
bshm-localstack-1-lambda-bshm-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If down -v reports
"Network bshm_default Resource is still in use", check for it and clean
up explicitly:
  docker ps -a --filter "name=bshm"
  docker network ls --filter "name=bshm"
  docker rm -f <the lambda-executor container name>
  docker network rm bshm_default

CONFIGURE SENSOR RATES
----------------------
Each sensor container takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node
Every one of the 10 sensor services (5 sensor types x 2 spans) uses a
distinct SAMPLE_INTERVAL/DISPATCH_INTERVAL pair.

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4586 python infra/verify_pipeline.py

A few manual curl checks against the running stack:
  curl http://localhost:8100/api/health
  curl http://localhost:8100/api/thresholds
  curl http://localhost:8100/api/spans
  curl "http://localhost:8100/api/readings?sensor_type=strain_microstrain&site_id=span-a&limit=10"
  curl http://localhost:8100/api/backend-stats

RUN THE TESTS
-------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4586 \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
No application code was reused from any previous coursework or personal
project; this pipeline was built from scratch for this CA. It depends on
the following third-party open-source components, used as standard
libraries/tools rather than copied source:
  - Bottle (fog node, dashboard) - https://bottlepy.org
  - boto3 (AWS SDK for Python) - https://boto3.amazonaws.com
  - Chart.js (dashboard chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - pytest (test suite) - https://pytest.org

This is the 7th Python project in the portfolio (after 01-smart-agriculture,
05-cold-chain-logistics, 12-smart-building-energy, 13-ev-charging-network,
14-smart-parking-management, 17-solar-farm-monitoring). Five architectural
choices were deliberately made distinct from all 6 prior Python siblings,
confirmed against each sibling's real current source:

1. Fog buffering (fog/buffering.py)
   This project: RAW is a flat, unstructured Python list of raw
   (sensor_type, site_id, value, ts) tuples, appended under a single
   threading.Lock in record() on every /ingest call. Grouping into
   per-(sensor_type, site_id) buckets happens only at flush time, via the
   pure function group_by_key(raw_readings), called once per window by
   fog/app.py's build_messages(). No mapping of any kind exists at ingest
   time.
     01 fog/app.py:      app.state.buffers = defaultdict(list) keyed by
                          (sensor_type, site_id), guarded by
                          app.state.lock = asyncio.Lock() -- grouped at
                          ingest time, inside the /ingest handler.
     05 fog/app.py:      WindowAccumulator._stats, a dict[(sensor_type,
                          site_id)] -> RollingStat (fog/aggregation.py),
                          fed by an asyncio.Queue (app.state.inbox) drained
                          by the inbox_consumer() background task -- no
                          explicit lock (single event loop).
     12 fog/ingest_pipeline.py: _buffers = {} dict keyed by (sensor_type,
                          site_id), guarded by _lock = threading.Lock(),
                          fed via a queue.Queue INBOX and one dedicated
                          consumer thread (consume_forever /
                          start_consumer_thread) that owns _buffers
                          exclusively.
     13 fog/app.py:      _buffer = {} dict keyed by (sensor_type, site_id),
                          guarded directly by _lock = threading.Lock(),
                          grouped at ingest time inline in the /ingest
                          route handler (no separate buffering.py file).
     14 fog/buffering.py: _buffers = defaultdict(lambda:
                          deque(maxlen=500)) -- a bounded ring buffer per
                          (sensor_type, site_id) key, guarded by
                          threading.Lock.
     17 fog/buffering.py: DoubleBuffer.active / DoubleBuffer.flushing, two
                          dicts swapped via self.active, self.flushing =
                          self.flushing, self.active under threading.Lock
                          (double-buffering).

2. Alert rule representation (fog/alerts.py)
   This project: a flat list RULES of plain typing.NamedTuple records
   (Rule(field, op, limit, key, sensor_type)), evaluated in evaluate() via
   `match rule.op: case "avg_gt": ... case "max_gt": ...` -- PEP 634
   structural pattern matching dispatches on the operator, not a dict
   lookup, generic comparison function, or class hierarchy.
     01 fog/alerts.py:   THRESHOLDS, a dict-of-lists-of-tuples keyed by
                          sensor_type ([(field, op, limit, label), ...]),
                          evaluated with an if/elif on the "<"/">" string.
     05 fog/alerts.py:   _EVALUATORS, a dict mapping sensor_type to one
                          hand-written _check_<key> function per exception
                          (dict-dispatch table).
     12 fog/alerts.py:   Rule, a frozen (@dataclass(frozen=True)) class
                          with __post_init__ validation, stored in a flat
                          RULES list and filtered by a generator expression
                          in evaluate().
     13 fog/alerts.py:   RULES, a flat list of plain dicts, consumed by a
                          generic evaluate_rules(rules, sensor_type,
                          summary) function.
     14 fog/alerts.py:   AlertKey(Enum) keys a
                          dict[str, dict[AlertKey, Callable]] mapping
                          sensor_type -> {AlertKey: lambda}.
     17 fog/alerts.py:   ThresholdRule(abc.ABC) with AboveLimitRule /
                          BelowLimitRule subclasses implementing
                          evaluate(self, summary) -- a real polymorphic
                          Strategy pattern over a flat RULES list.

3. SQS publisher shape (fog/publisher.py)
   This project: publish(client, queue_url, payload) is the entire module
   -- one plain function, no class, no module-level singleton, no
   memoization/caching of any kind. fog/app.py's build_sqs_client() and
   resolve_queue_url() construct the boto3 client and resolve the queue
   URL once at startup (in main()) and pass both explicitly to publish()
   (and to flush_once(client, queue_url)) on every call -- the leanest of
   all 7 shapes in the portfolio.
     01 fog/publisher.py: SqsPublisher class -- __init__ resolves the
                          queue URL via a sleep-based retry loop
                          (_resolve_queue) and caches both the boto3
                          client and the URL as instance state; .publish()
                          method.
     05 fog/publisher.py: open_shipment_link(), a @contextmanager factory
                          yielding a dataclass-backed ShipmentLink that
                          caches its client/URL as instance state, with a
                          jittered-backoff retry generator (retry_ticks).
     12 fog/publisher.py: a pair of functools.lru_cache-memoized functions,
                          _client(endpoint_url, region) and
                          _queue_url(endpoint_url, region, queue_name),
                          wrapping a bare boto3.client.
     13 fog/publisher.py: a manual module-level singleton -- _client /
                          _queue_url globals plus a get_client() /
                          get_queue_url() function pair, hand-rolling the
                          same kind of cache.
     14 fog/publisher.py: make_publisher(endpoint_url, region,
                          queue_name), a closure factory that builds a
                          client and resolves the queue URL once, both
                          captured as closure variables around a returned
                          publish(message) function.
     17 fog/publisher.py: OUTBOX, a queue.SimpleQueue, drained by one
                          dedicated background flusher thread
                          (start_flusher_thread / run_flusher) that ships
                          up to 10 messages per call via
                          client.send_message_batch.

4. HTTP routing/framework
   This project: Bottle (bottle.Bottle, @app.get/@app.post decorators,
   bottle.request.json, bottle.HTTPResponse for 400s), served in
   production and in tests via the same stdlib
   wsgiref.simple_server.make_server wrapped in a socketserver.
   ThreadingMixIn (fog/app.py::make_threaded_server /
   backend/dashboard/app.py::ThreadingWSGIServer). The /ingest validation
   test (tests/test_fog_http.py) drives this exact server class through a
   real TCP socket on an ephemeral port, not Bottle's in-process test
   client.
     01 fog/app.py:      FastAPI
     05 fog/app.py:      FastAPI
     12 fog/app.py:      stdlib http.server.ThreadingHTTPServer, hand-
                          dispatched routes in FogHandler.do_GET/do_POST
     13 fog/app.py:      Flask (@app.route decorators, jsonify)
     14 fog/app.py:      stdlib wsgiref directly
     17 fog/app.py:      aiohttp.web

5. Sensor loop scheduling (sensors/sensor.py)
   This project: two independent real OS processes started via
   multiprocessing.Process -- sample_process() generates readings on
   SAMPLE_INTERVAL and mp.Queue.put()s them onto a shared outbox;
   dispatch_process() independently drains that multiprocessing.Queue on
   DISPATCH_INTERVAL and POSTs whatever accumulated. The two processes
   share no Python-level memory; a multiprocessing.Event stop flag (set
   from a SIGTERM handler registered in run()) is the only cross-process
   coordination. mp.set_start_method("fork") is set explicitly at the
   __main__ entrypoint (Linux containers already default to fork, but
   this keeps behaviour from silently changing if the base image or
   Python version ever switches the platform default).
     01 sensors/sensor.py: a single while True: ... time.sleep(...) loop;
                          dispatch is an elapsed-time comparison
                          (time.monotonic() - last_dispatch >=
                          dispatch_interval) inside that same loop.
     05 sensors/sensor.py: stdlib sched.scheduler (self.clock), two self-
                          re-entering events (_sample/_dispatch each call
                          clock.enter(...) on themselves), one thread via
                          clock.run().
     12 sensors/sensor.py: two independently self-rearming threading.Timer
                          chains (_sample_tick/_dispatch_tick, each
                          re-arming its own threading.Timer at the end),
                          coordinated by a threading.Lock around the
                          shared buffer.
     13 sensors/sensor.py: concurrent.futures.ThreadPoolExecutor(
                          max_workers=2) with self-resubmitting tasks via
                          Future.add_done_callback (_resubmit)
                          re-submitting _sample_job/_dispatch_job.
     14 sensors/sensor.py: real asyncio -- asyncio.run(main()) driving
                          asyncio.gather(self.sample_loop(),
                          self.dispatch_loop()), two coroutines on one
                          event loop, asyncio.Lock for the shared buffer.
     17 sensors/sensor.py: two threading.Thread loops (_sample_loop/
                          _dispatch_loop), each driven by
                          threading.Event().wait(timeout) doubling as the
                          tick delay and the shutdown signal.
