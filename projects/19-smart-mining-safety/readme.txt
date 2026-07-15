Smart Mining Safety & Environmental Monitoring
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/19-smart-mining-safety/), not the repo root.

OVERVIEW
--------
Two underground mine shafts (site_id "shaft-a" and "shaft-b") each carry
five sensor types: methane_ppm, co_ppm, dust_concentration_mgm3,
ground_vibration_mms and ambient_temp_c. Ten sensor containers POST batched
readings to a fog HTTP node, which windows/aggregates each (sensor_type,
site_id) pair every WINDOW_SECONDS, evaluates real safety thresholds, and
publishes one aggregate message per non-empty group to SQS. A real AWS
Lambda function (running inside LocalStack, wired via a real SQS event
source mapping) consumes the queue and writes to DynamoDB. A dashboard
computes a per-shaft SAFE / CAUTION / DANGER classification from the live
data and serves it alongside the 5 raw readings and a methane trend chart.

This is the 7th Java project in this portfolio (after 02-industrial-
equipment, 04-smart-city, 07-warehouse-robotics-fleet, 08-retail-footfall-
inventory, 09-aquaculture-fish-farm and 16-public-transit-fleet-monitoring)
and, like those, uses plain JDK HttpServer (com.sun.net.httpserver) rather
than a framework such as Spring. See REUSE / THIRD-PARTY below for exactly
how its fog buffering, alert-rule representation, SQS publisher, HTTP
routing and sensor-loop scheduling each differ from all six of those
siblings, by class and method name.

LAYOUT
------
  sensors/            Java sensor simulator (ShaftSensorUnit.java), one
                       container per (sensor_type, site_id) pair
  fog/                 plain-JDK HTTP server (MineFogNode.java): ingest
                       (IngestPayload.java), buffer (HazardBuffer.java),
                       window/aggregate (WindowAggregate.java), threshold
                       evaluation (ThresholdRule.java / HazardRules.java),
                       SQS dispatch (SafetyPublisher.java), payload JSON
                       (PayloadJson.java), HTTP routing (GatewayRouter.java)
  backend/processor/  RecordMapper.java (pure transform: JSON -> DynamoDB
                       item, computes sort_key) + SafetyHandler.java (AWS
                       Lambda entry point, RequestHandler<SQSEvent,...>) +
                       deploy_lambda.sh (bash + AWS CLI packages the built
                       JAR and registers it with an SQS event source
                       mapping -- deployment tooling is intentionally
                       language-neutral, matching the rest of the portfolio)
  backend/dashboard/  plain-JDK HTTP server (MineDashboardApp.java) serving
                       its own REST API plus the static frontend
                       (backend/dashboard/static/): a large SAFE/CAUTION/
                       DANGER status tile per shaft (the primary view,
                       computed by ShaftRepository.classify()), five plain
                       reading rows per shaft with native <meter> bars, and
                       a Chart.js methane trend chart. Deep stone/graphite
                       earth-tone palette with a copper accent; red/amber
                       reserved strictly for active CAUTION/DANGER states.
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)
  Python 3.12 + boto3 (only for infra/verify_pipeline.py and infra/burst.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8098
  LocalStack: http://localhost:4584

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: docker compose down -v can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
msm-localstack-1-lambda-msm-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If down -v reports
"Network msm_default Resource is still in use", check for it and clean up
explicitly:
  docker ps -a --filter "name=msm"
  docker network ls --filter "name=msm"
  docker rm -f <the lambda-executor container name>
  docker network rm msm_default

CONFIGURE SENSOR RATES
-----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml), genuinely different values per container:
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node

For example sensor-vibration-a samples every 1s and dispatches every 7s,
while sensor-temp-a samples every 5s and dispatches every 15s.

RUN THE TESTS
-------------
Each Maven project has its own JUnit 5 test suite:
  cd sensors && mvn test                  (5 tests)
  cd fog && mvn test                      (44 tests)
  cd backend/processor && mvn test        (8 tests)
  cd backend/dashboard && mvn test        (21 tests)

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

All 78 tests pass. Notable coverage: MineFogNodeHttpTest and
GatewayRouterTest exercise /ingest and the router's 404-vs-405 distinction
over a REAL com.sun.net.httpserver.HttpServer bound to an ephemeral port
(not a unit test of validation logic in isolation); ThresholdsProxyTest
covers both the success path and an unreachable-upstream path for the
dashboard's fog-thresholds proxy.

VERIFY END-TO-END
------------------
With the stack running (allow ~30s after startup for the first window
flush), run the automated check:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4584 python3 infra/verify_pipeline.py

Or curl the API directly:
  curl http://localhost:8098/api/health
  curl http://localhost:8098/api/thresholds
  curl "http://localhost:8098/api/readings?sensor_type=methane_ppm&limit=5"
  curl http://localhost:8098/api/shafts
  curl http://localhost:8098/api/backend-stats

Expected /api/health once the pipeline has warmed up:
  {"gateway":true,"queue":true,"lambda":true,"pipeline":true,"freshest_age_seconds":<small number>}

Expected /api/thresholds (the fog's real, code-defined rules):
  {"methane_ppm":[{"field":"avg","op":">","limit":1000.0,"key":"methane_buildup_risk"}],
   "co_ppm":[{"field":"avg","op":">","limit":50.0,"key":"co_exposure_risk"}],
   "dust_concentration_mgm3":[{"field":"avg","op":">","limit":10.0,"key":"silica_dust_hazard"}],
   "ground_vibration_mms":[{"field":"max","op":">","limit":25.0,"key":"blast_vibration_exceedance"}]}

/api/shafts returns, per shaft, the latest window for all 5 sensor types
plus a computed "status" field -- see "SAFE/CAUTION/DANGER LOGIC" below.

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4584 python3 infra/burst.py --messages 2000 --workers 32

Sends synthetic "loadtest_a".."loadtest_e" messages (never the real 5
sensor types, so burst traffic never lands in the dashboard's live
partitions), then asserts (1) the queue shows the burst immediately after
sending, and (2) polls for a full drain within a timeout -- if it does not
fully drain, asserts the remaining count strictly decreased from the
immediate post-burst count (a soft WARNING print, not a failure, in that
case, since LocalStack's single-container Lambda throughput can genuinely
take longer than the poll window to fully absorb a large burst).

SAFE/CAUTION/DANGER LOGIC
--------------------------
Computed per shaft in ShaftRepository.classify() (backend/dashboard):
  DANGER  if any of the 4 alert-bearing readings (methane_ppm, co_ppm,
          dust_concentration_mgm3, ground_vibration_mms) has a non-empty
          "alerts" list in its latest window -- i.e. a real HazardRules
          threshold is currently firing for that shaft.
  CAUTION else if any of those same 4 readings' latest window AVERAGE is
          at or above 75% of its alert threshold (SafetyLimits.LIMITS,
          local dashboard-side mirror of HazardRules.CATALOG's limits) --
          checked against avg uniformly, even for ground_vibration_mms
          whose actual alert rule fires on max, per the brief.
  SAFE    otherwise. ambient_temp_c never contributes to this decision (it
          carries no alert rule).

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline SHAPE (sensors -> fog windowing/aggregation/alerting
-> queue -> FaaS processor -> datastore -> dashboard, sort-key
disambiguation for multi-site records, a health/thresholds-proxy pattern on
the dashboard) follows the same design this student established across
projects 01 through 18 of this same CA submission. The CODE ITSELF is an
independent implementation. Domain-specific code (sensor types, thresholds,
the SAFE/CAUTION/DANGER classification, and the entire dashboard UI) is
original to this project. This is the 7th Java project in the portfolio;
the five axes below were deliberately chosen to be a genuinely distinct
combination from all six existing Java siblings, verified against each
sibling's current source before writing this section:

1. FOG BUFFERING MECHANISM (com.fec.mining.fog.HazardBuffer)
   ConcurrentHashMap<ShaftKey, ConcurrentLinkedQueue<Reading>> with NO
   explicit lock anywhere: ingest() creates a per-key queue via
   computeIfAbsent() and appends to it; drain(key) atomically detaches and
   removes one key's queue via computeIfPresent() returning null (whose
   remapping function ConcurrentHashMap guarantees runs atomically per
   key). Distinct from:
     - 02 FogApp: a single `Object lock` field with `synchronized` blocks
       around a plain HashMap<PendingKey,List<Reading>>; flushWindow()
       does a synchronized copy-then-clear of the whole map.
     - 04 CityFogNode: a custom "generation fencing" scheme --
       `AtomicReference<Generation> generationRef`, where each private
       static `Generation` holds its own `AtomicInteger inFlightWriters`
       and `AtomicBoolean fenced`; flushWindow() calls
       `generationRef.getAndSet(new Generation())` and spin-waits for
       in-flight writers via `Generation.close()`.
     - 07 FleetGateway/BufferBucket: `ConcurrentHashMap<RobotKey,
       BufferBucket>` where each `BufferBucket` guards its own
       `List<Double> values` with its OWN `ReentrantLock`; `drain()` does
       a list reference swap (`values = new ArrayList<>()`) under that
       lock.
     - 08 BufferActor: a single dedicated worker `Thread` (field `worker`)
       consuming a `BlockingQueue<IngestEvent> inbox` mailbox and mutating
       a plain `Map<SensorKey,List<Double>> buffers` only on that one
       thread -- no lock of any kind; a flush is itself a mailbox message.
     - 09 PondGateway: `volatile ConcurrentHashMap<PondKey,
       ReadingAccumulator> buffers`, mutated via
       `buffers.merge(key, incoming, ReadingAccumulator::combine)` where
       `ReadingAccumulator` is an immutable value type; flush swaps the
       whole map reference (`retiring = buffers; buffers = new
       ConcurrentHashMap<>();`).
     - 16 IntakeQueue: a single flat, UNGROUPED
       `ConcurrentLinkedQueue<ReadingEvent> queue` -- ingest() is one
       `queue.offer(event)`; grouping by `GroupKey` only happens at flush
       time inside `drainAndGroup()`, which polls the whole queue empty.
   HazardBuffer differs from all six: it pre-groups by key (like 02/04/07/
   09, unlike 16's flat-then-group-at-flush), but uses neither a lock
   (02/07), nor atomic-field fencing (04), nor a dedicated actor thread
   (08), nor an immutable-merge whole-map swap (09) -- it is the only one
   of the seven that relies purely on a lock-free per-key
   ConcurrentLinkedQueue plus ConcurrentHashMap's per-key compute
   atomicity, with no lock, no AtomicReference swap and no worker thread
   anywhere in the class.

2. ALERT-RULE REPRESENTATION (com.fec.mining.fog.ThresholdRule / HazardRules)
   `record ThresholdRule(String sensorType, AggregateField field, double
   limit, String alertKey)` where `AggregateField` is a plain 2-value enum
   {AVG, MAX} -- the record holds NO functional field (no Predicate/
   BiPredicate/ToDoubleFunction/lambda anywhere on it). `HazardRules.CATALOG`
   is a flat `List<ThresholdRule>` that IS what `HazardRules.assess()`
   actually iterates, reading `field`/`limit` off each rule and comparing
   via a plain `switch (field) { case AVG -> window.avg(); case MAX ->
   window.max(); }` followed by `> limit`. Distinct from:
     - 02 Alerts: `record Rule(String field, String op, double limit,
       String key)` -- field/op are raw STRINGS, not a typed enum;
       `Alerts.evaluate()` calls a `fieldValue()` switch on the string
       plus a `rule.op().equals("<") ? ... : ...` ternary to support both
       directions.
     - 04 IncidentRules: `record RuleDescription` is PURELY declarative --
       `RULE_CATALOG` is surfaced via /thresholds but `assess()` ignores
       it entirely, instead hardcoding a per-metric `switch (metric) {
       case "vehicle_count" -> digest.avg() > 180 ? ... }` expression with
       no rule objects driving evaluation at all.
     - 07 AlertRule: a `sealed interface AlertRule permits AboveLimit,
       BelowLimit`, where each record variant holds a
       `ToDoubleFunction<WindowAggregate> extractor` field;
       `FleetAlerts.evaluate()` calls `rule.firesOn(window)`.
     - 08 AlertRule: an `enum AlertRule implements
       Predicate<WindowAggregate>` where each enum CONSTANT overrides its
       own `test(WindowAggregate)` body.
     - 09 Rule: built through a fluent DSL --
       `Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0)
       .flagAs("hypoxia_risk")` -- whose finished form is
       `record Rule(..., BiPredicate<String,WindowAggregate> test)`; a
       separate `enum Field implements ToDoubleFunction<WindowAggregate>`
       is the aggregate-selector used inside the chain.
     - 16 Rule: `record Rule(..., Predicate<WindowAggregate> test)` built
       via static factories `avgAbove`/`avgBelow`/`maxAbove`, each of
       which closes over a `Predicate`.
   ThresholdRule is the only one of the seven whose rule objects carry a
   typed enum selector AND drive real evaluation AND embed no functional
   interface at all -- 02 is string-typed instead of enum-typed and needs
   an extra "op" field/ternary that ThresholdRule has no use for (every
   real rule in this domain is a strict greater-than); 04's declarative
   rules don't drive evaluation; 07/08/09/16 all embed a lambda-typed
   field directly on the rule.

3. SQS PUBLISHER SHAPE (com.fec.mining.fog.SafetyPublisher / PayloadJson)
   SafetyPublisher wraps `SqsAsyncClient` (the ASYNC AWS SDK v2 client),
   not the synchronous `SqsClient` every other sibling uses. Queue-URL
   resolution (`attemptResolve()`) is a non-blocking retry chain built
   from `CompletableFuture.exceptionallyComposeAsync()` chained with
   `CompletableFuture.delayedExecutor(2, TimeUnit.SECONDS)` -- each retry
   schedules the next attempt and returns immediately, the calling thread
   is never parked in a `Thread.sleep`. PayloadJson.toJson() builds the
   message body via `ObjectMapper.valueToTree()` of an annotated record
   (`SafetyAggregatePayload`, POJO-to-TREE, not POJO-to-string) and then
   appends the alerts array onto that already-built tree afterwards with
   `putArray()`/`add()` -- the payload record deliberately omits alerts so
   this mutation step is real, not vestigial. Distinct from:
     - 02 QueueRelay: synchronous `SqsClient`; `locateQueue()` is a
       blocking `for` loop with `Thread.sleep(2000)` up to 30 attempts;
       JSON is a from-scratch `ObjectNode` built with individual `.put()`
       calls directly in FogApp (nothing is ever a POJO or a tree
       "hybrid").
     - 04 RelayClient: synchronous `SqsClient` behind an
       `AtomicReference<SqsClient>`; `retryWithBackoff()` is still a
       blocking, synchronous EXPONENTIAL backoff (`INITIAL_DELAY_MS=250`
       doubling up to a cap, `Thread.sleep` internally); JSON is a POJO
       (`DigestPayload`) serialized straight to a string via
       `JSON.writeValueAsString()`.
     - 07 RelayPublisher + JsonBuilder: synchronous `SqsClient`;
       `awaitQueue()` blocking 30x2s retry; JSON via a separate fluent
       `JsonBuilder` class (`JsonBuilder.start().field(...).stringArray(...)`)
       wrapping `ObjectNode`.
     - 08 QueuePublisher + AggregatePayload: synchronous `SqsClient`;
       blocking 30x2s `awaitQueue()`; JSON via pure POJO databinding
       (`AggregatePayload`, `@JsonPropertyOrder`) through
       `JSON.writeValueAsString()` -- alerts are included IN the POJO
       itself, no tree is ever touched.
     - 09 QueuePublisher + StreamingJson: synchronous `SqsClient`; lazy
       blocking 30x2s retry; JSON via Jackson's LOW-LEVEL streaming API
       (`JsonFactory`/`JsonGenerator`, token-by-token) -- no tree, no
       POJO, "no intermediate tree or object graph held in memory at
       all" per that class's own comment.
     - 16 TransitPublisher: synchronous `SqsClient` (also
       `implements AutoCloseable`); blocking 30x2s `awaitQueue()`; JSON
       built directly via `ObjectNode`/`ArrayNode` inside
       `TransitGateway.toPayload()` -- the publisher itself only ever
       takes a pre-built string.
   SafetyPublisher is the only one of the seven built on the async client
   with non-blocking retry composition, and PayloadJson is the only one of
   the seven that goes POJO -> tree -> tree-mutation, as opposed to
   from-scratch tree (02/16), POJO-to-string (04/08), streaming (09), or a
   bespoke fluent builder (07).

4. HTTP ROUTING/DISPATCH STYLE (com.fec.mining.fog.GatewayRouter)
   A single `HttpHandler` registered at "/" holding a flat
   `Map<String, HttpHandler> routes` keyed by "METHOD path" (e.g.
   "GET /health", "POST /ingest") -- an O(1) table lookup in `handle()`.
   Also the only one of the seven that keys by HTTP method as well as
   path, letting it distinguish a real 404 (`pathKnown(path)` is false)
   from a 405 (path registered under a different method) -- `handleIngest`
   itself therefore no longer needs a manual method check at all. Distinct
   from:
     - 02 FogApp: one `server.createContext(path, exchange -> {...})`
       lambda registered per path directly in `main()`; the /ingest
       handler does its own inline `if (!"POST".equals(...))` check (no
       404-vs-405 distinction exists for any other path).
     - 04 RouteServer: a fluent builder
       (`RouteServer.on(8000).route(path,handler)...threads(n).start()`)
       that internally accumulates into a `Map<String,HttpHandler> routes
       = new LinkedHashMap<>()`, but `start()` still calls
       `server.createContext(path, guarded(handler))` once per path under
       the hood -- registration is centralized, but dispatch is still the
       JDK's own per-path routing, and there's no method-based check.
     - 07 Router: a thin `.handle(path, handler)` fluent wrapper that also
       calls `server.createContext(path, exchange -> {...})` per path with
       a shared try/catch guard -- no route table of its own, no method
       check.
     - 08 Route: an ENUM where each constant IS a route (`HEALTH("/health",
       handlerLambda)` etc.); `wireAll()` iterates `values()` calling
       `server.createContext(route.path, guarded(route.handler))` once per
       constant.
     - 09 PathDispatcher: a single `createContext("/", dispatcher)`
       registration, but internally a LINEAR SCAN over
       `List<Route>` of `record Route(Predicate<String> pathMatcher,
       HttpHandler handler)` pairs.
     - 16 TransitGateway.route(): a single `createContext("/",
       gateway::route)` registration whose `route()` method is a literal
       `if (path.equals("/health")) {...} else if (path.equals(
       "/thresholds")) {...} else if ...` string-equality chain -- no
       route table, predicate list, or enum of any kind.
   GatewayRouter is the only one of the seven backed by an actual
   `Map<String,HttpHandler>` route table with O(1) lookup keyed by
   method+path, rather than per-path createContext calls (02/04-under-the-
   hood/07), an enum of routes (08), a linear predicate scan (09), or a
   string-equality if/else chain (16).

5. SENSOR-LOOP SCHEDULING MECHANISM (com.fec.mining.sensor.ShaftSensorUnit)
   Two independent raw `java.lang.Thread` objects -- `sampleThread`
   (daemon) and `dispatchThread` (non-daemon) -- each with its OWN plain
   `Thread.sleep(intervalMillis)` loop at its own fixed interval,
   coordinated purely through a `LinkedBlockingQueue<Reading>`: the sample
   thread is the sole producer (`queue.offer(...)`), the dispatch thread is
   the sole consumer (`queue.drainTo(batch)`). `main()` blocks by calling
   `dispatchThread.join()` (which blocks forever, since that thread's loop
   never terminates) rather than parking on any kind of latch. Distinct
   from:
     - 02 Sensor: a single `while (true)` loop with one
       `Thread.sleep((long)(sampleInterval*1000))` per iteration; the
       dispatch decision is made inline by comparing elapsed
       `System.nanoTime()` since `lastDispatch` against `dispatchInterval`
       BEFORE that same sleep -- one loop, one fixed granularity, no
       separate thread and no blocking queue.
     - 04 MetricSensor: TWO tasks on a shared
       `Executors.newScheduledThreadPool(2)`, both via
       `scheduler.scheduleAtFixedRate(...)`; the two tasks hand data off
       through a shared `Deque<TimedValue> buffer` guarded by
       `synchronized (buffer)` blocks; `main()` blocks on
       `new CountDownLatch(1).await()`.
     - 07 RobotUnit / 08 StoreSensorUnit / 09 PondSensorUnit: all three use
       the SAME pattern -- a single `while (true)` loop tracking two "next
       fire" timestamps (`nextSample`/`nextDispatch`) with one ADAPTIVE
       short sleep (`Thread.sleep(Math.max(1, Math.min(50,
       untilNextEvent)))`) -- one thread, one loop, busy-polling at up to
       50ms granularity, no dedicated hand-off structure at all.
     - 16 TransitSensorUnit: TWO independent `java.util.Timer` instances
       (`sampleTimer`, `dispatchTimer`), each running its own `TimerTask`
       via `scheduleAtFixedRate`; the shared `buffer` List is guarded by
       plain `synchronized (buffer)` blocks; `main()` also blocks on
       `new CountDownLatch(1).await()`.
   ShaftSensorUnit is the only one of the seven that uses two independent
   raw `Thread` objects (not a shared `ScheduledExecutorService` pool
   like 04, not `java.util.Timer` like 16, and not a single loop with
   adaptive sleep like 02/07/08/09) AND the only one that hands data off
   through a `LinkedBlockingQueue` producer/consumer pair instead of a
   `synchronized` block around a shared `Deque`/`List` (04, 16) or a
   single-threaded in-loop buffer (02/07/08/09). It is also the only one
   that blocks `main()` by joining a live worker thread rather than a
   `CountDownLatch`.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, netty-nio-client,
    dynamodb, lambda) - https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard methane trend chart, vendored at
    backend/dashboard/static/vendor/chart.umd.min.js, copied unchanged
    from project 16's frontend, never fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud

Domain modelling (sensor types/ranges, the 4 real safety thresholds, the
SAFE/CAUTION/DANGER classification and its 75%-of-limit CAUTION rule) and
the entire dashboard UI (stone/graphite/copper palette, status-tile layout,
reading rows) are original to this project.

PHASE 2 (NOT IN SCOPE)
-----------------------
Real AWS/Azure deployment is a deliberately deferred Phase 2 item for the
whole portfolio -- this project runs entirely on Docker + LocalStack.
