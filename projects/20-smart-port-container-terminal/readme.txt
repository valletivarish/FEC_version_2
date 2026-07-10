Smart Port & Container Terminal Monitoring
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/20-smart-port-container-terminal/), not the repo root.

OVERVIEW
--------
Two container-terminal berths (site_id "berth-a" and "berth-b") each carry
five sensor types: crane_load_kg, container_stack_height, wind_speed_knots,
berth_occupancy_pct and reefer_temp_c. Ten sensor containers POST batched
readings to a fog HTTP node, which windows/aggregates each (sensor_type,
site_id) pair every WINDOW_SECONDS, evaluates real operational-safety
thresholds, and publishes one aggregate message per non-empty group to SQS
(batched into a single SendMessageBatch call per flush cycle). A real AWS
Lambda function (running inside LocalStack, wired via a real SQS event
source mapping) consumes the queue and writes to DynamoDB. A dashboard
renders a plain-text operational-status line per berth alongside the 5 raw
readings and a crane-load trend chart.

This is the 8th Java project in this portfolio (after 02-industrial-
equipment, 04-smart-city, 07-warehouse-robotics-fleet, 08-retail-footfall-
inventory, 09-aquaculture-fish-farm, 16-public-transit-fleet-monitoring and
19-smart-mining-safety) and, like those, uses plain JDK HttpServer
(com.sun.net.httpserver) rather than a framework such as Spring. See REUSE /
THIRD-PARTY below for exactly how its fog buffering, alert-rule
representation, SQS publisher, HTTP routing and sensor-loop scheduling each
differ from all seven of those siblings, by class and method name.

LAYOUT
------
  sensors/            Java sensor simulator (BerthSensorUnit.java), one
                       container per (sensor_type, site_id) pair
  fog/                 plain-JDK HTTP server (TerminalGateway.java): ingest
                       validation (IngestValidation.java), buffer
                       (TerminalLedger.java), window/aggregate
                       (WindowAggregate.java), threshold evaluation
                       (ThresholdRule.java / BerthRules.java), SQS dispatch
                       (TerminalPublisher.java / BatchPayloadJson.java), HTTP
                       routing (TerminalRouter.java / RouteFilter.java)
  backend/processor/  ItemMapper.java (pure transform: JSON -> DynamoDB
                       item, computes sort_key) + TerminalHandler.java (AWS
                       Lambda entry point, RequestHandler<SQSEvent,...>) +
                       deploy_lambda.sh (bash + AWS CLI packages the built
                       JAR and registers it with an SQS event source
                       mapping -- deployment tooling is intentionally
                       language-neutral, matching the rest of the portfolio)
  backend/dashboard/  plain-JDK HTTP server (TerminalDashboardApp.java)
                       serving its own REST API plus the static frontend
                       (backend/dashboard/static/): a plain INLINE TEXT
                       operational-status line per berth (the primary view,
                       computed by StatusLine.build() and grouped per berth
                       by BerthRepository.byBerth()), five plain reading
                       rows per berth with native <meter> bars, and a
                       Chart.js crane-load trend chart. Crisp steel-blue
                       palette with a safety-orange accent; the accent
                       colours a flagged word inline, never a tile/card
                       background.
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           Python queue burst generator (scalability evidence)
  scripts/            Python end-to-end pipeline verification
  docs/               dashboard-desktop.png / dashboard-mobile.png (375px)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)
  Python 3.12 + boto3 (only for scripts/verify_pipeline.py and loadtest/burst.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8099
  LocalStack: http://localhost:4585

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: docker compose down -v can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
spc-localstack-1-lambda-spc-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If down -v reports
"Network spc_default Resource is still in use", check for it and clean up
explicitly:
  docker ps -a --filter "name=spc"
  docker network ls --filter "name=spc"
  docker rm -f <the lambda-executor container name>
  docker network rm spc_default

CONFIGURE SENSOR RATES
-----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml), genuinely different values per container:
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node

For example sensor-crane-a samples every 2s and dispatches every 8s, while
sensor-occupancy-a samples every 4s and dispatches every 14s.

RUN THE TESTS
-------------
Each Maven project has its own JUnit 5 test suite:
  cd sensors && mvn test                  (6 tests)
  cd fog && mvn test                      (48 tests)
  cd backend/processor && mvn test        (8 tests)
  cd backend/dashboard && mvn test        (23 tests)

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

All 85 tests pass. Notable coverage: TerminalGatewayHttpTest and
TerminalRouterTest exercise /ingest and the Filter chain-of-responsibility
over a REAL com.sun.net.httpserver.HttpServer bound to an ephemeral port
(not a unit test of validation logic in isolation); ThresholdsGatewayTest
covers both the success path and an unreachable-upstream path for the
dashboard's fog-thresholds proxy.

VERIFY END-TO-END
------------------
With the stack running (allow ~30s after startup for the first window
flush), run the automated check:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4585 python3 scripts/verify_pipeline.py

Or curl the API directly:
  curl http://localhost:8099/api/health
  curl http://localhost:8099/api/thresholds
  curl "http://localhost:8099/api/readings?sensor_type=crane_load_kg&limit=5"
  curl http://localhost:8099/api/berths
  curl http://localhost:8099/api/backend-stats

Expected /api/health once the pipeline has warmed up:
  {"gateway":true,"queue":true,"lambda":true,"pipeline":true,"freshest_age_seconds":<small number>}

Expected /api/thresholds (the fog's real, code-defined rules):
  {"crane_load_kg":[{"field":"avg","op":">","limit":32000.0,"key":"crane_overload_risk"}],
   "wind_speed_knots":[{"field":"avg","op":">","limit":34.0,"key":"high_wind_crane_halt"}],
   "berth_occupancy_pct":[{"field":"avg","op":">","limit":90.0,"key":"berth_congestion_warning"}],
   "reefer_temp_c":[{"field":"avg","op":">","limit":-10.0,"key":"reefer_temp_breach"}]}

/api/berths returns, per berth, the latest window for all 5 sensor types
plus a computed "status_line" array -- see "STATUS LINE LOGIC" below.

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4585 python3 loadtest/burst.py --messages 2000 --workers 32

Sends synthetic "loadtest_a".."loadtest_e" messages (never the real 5
sensor types, so burst traffic never lands in the dashboard's live
partitions), then asserts (1) the queue shows the burst immediately after
sending, and (2) polls for a full drain within a timeout -- if it does not
fully drain, asserts the remaining count strictly decreased from the
immediate post-burst count (a soft WARNING print, not a failure, in that
case, since LocalStack's single-container Lambda throughput can genuinely
take longer than the poll window to fully absorb a large burst).

STATUS LINE LOGIC
------------------
Computed per berth in StatusLine.build() (backend/dashboard), a pure
function over that berth's latest window per sensor type -- it never
recomputes threshold logic, it only reads the real alert keys the fog's
BerthRules.assess() already fired:
  Crane:     "Overload Risk" if crane_load_kg's latest window carries
             crane_overload_risk, else "Nominal".
  Wind:      "Crane Halt" if wind_speed_knots's latest window carries
             high_wind_crane_halt, else "Safe".
  Reefer:    "Temp Breach" if reefer_temp_c's latest window carries
             reefer_temp_breach, else "Nominal".
  Occupancy: the real latest berth_occupancy_pct percentage, with
             "(Congested)" appended if that window carries
             berth_congestion_warning.
container_stack_height never contributes to the status line (it carries no
alert rule); it still appears as one of the 5 raw reading rows underneath.
The dashboard renders this as ONE inline text line per berth -- colour is
applied only to an individual segment's VALUE span when that segment is
active, never a tile/card background (contrast with 19-smart-mining-
safety's SAFE/CAUTION/DANGER coloured status TILE, a single classification
rendered as a whole coloured div -- see REUSE axis notes below for exactly
how these differ in kind).

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline SHAPE (sensors -> fog windowing/aggregation/alerting
-> queue -> FaaS processor -> datastore -> dashboard, sort-key
disambiguation for multi-site records, a health/thresholds-proxy pattern on
the dashboard) follows the same design this student established across
projects 01 through 19 of this same CA submission. The CODE ITSELF is an
independent implementation. Domain-specific code (sensor types, thresholds,
the status-line logic, and the entire dashboard UI) is original to this
project. This is the 8th Java project in the portfolio; the five axes below
were deliberately chosen to be a genuinely distinct combination from all
seven existing Java siblings, verified against each sibling's current
source before writing this section:

1. FOG BUFFERING MECHANISM (com.fec.port.fog.TerminalLedger)
   A single ConcurrentSkipListMap<Long, Entry> keyed by a monotonically
   increasing AtomicLong sequence number -- NOT keyed by (sensor_type,
   site_id) at all. ingest() is one `ledger.put(sequence.getAndIncrement(),
   entry)` call per reading -- no lock, no CAS on a whole map/generation
   reference. drainWindow() snapshots `long boundary = sequence.get()`,
   asks the map for the live NavigableMap VIEW of every entry strictly
   before that boundary (`ledger.headMap(boundary, false)`), groups those
   entries by (sensor_type, site_id) into local maps, then calls
   `due.clear()` on the VIEW -- which removes exactly those entries from
   the backing ledger. Readings ingested concurrently during the drain get
   a sequence number >= boundary, so they are excluded from the view and
   simply survive into the next window. Distinct from:
     - 02 FogApp: a single `Object lock` field with `synchronized` blocks
       around a plain HashMap<PendingKey,List<Reading>>; flushWindow() does
       a synchronized copy-then-clear of the whole map.
     - 04 CityFogNode: `AtomicReference<Generation> generationRef` "fencing"
       -- each private static `Generation` holds `AtomicInteger
       inFlightWriters` and `AtomicBoolean fenced`; flushWindow() calls
       `generationRef.getAndSet(new Generation())` and spin-waits for
       in-flight writers via `Generation.close()`.
     - 07 FleetGateway/BufferBucket: `ConcurrentHashMap<RobotKey,
       BufferBucket>` where each `BufferBucket` guards its own
       `List<Double> values` with its OWN `ReentrantLock`.
     - 08 BufferActor: a single dedicated worker `Thread` consuming a
       `BlockingQueue<IngestEvent> inbox` mailbox and mutating a plain
       `Map<SensorKey,List<Double>> buffers` only on that one thread -- no
       lock of any kind; a flush is itself a mailbox message.
     - 09 PondGateway: `ConcurrentHashMap<PondKey,ReadingAccumulator>
       buffers`, mutated via `buffers.merge(key, incoming,
       ReadingAccumulator::combine)` on an immutable value type; flush
       swaps the whole map reference.
     - 16 IntakeQueue: a single flat, UNGROUPED
       `ConcurrentLinkedQueue<ReadingEvent> queue` -- grouping by
       `GroupKey` only happens at flush time inside `drainAndGroup()`,
       which polls the whole queue empty one element at a time.
     - 19 HazardBuffer: `ConcurrentHashMap<ShaftKey,
       ConcurrentLinkedQueue<Reading>>` -- pre-grouped by key at ingest
       time, drained per-key via `computeIfPresent()` returning null.
   TerminalLedger is the only one of the eight that is a SORTED map keyed
   by pure arrival sequence rather than by group -- like 16 it defers
   grouping to drain time, but instead of polling an unbounded queue empty
   it takes a NavigableMap view up to a snapshot boundary and clears that
   view, which is also how it avoids 16's "keep polling until empty" loop
   racing indefinitely against concurrent producers. No lock (unlike 02/07),
   no atomic-field fencing (unlike 04), no dedicated actor thread (unlike
   08), and no per-key structure of any kind at ingest time (unlike 07/09/
   19).

2. ALERT-RULE REPRESENTATION (com.fec.port.fog.ThresholdRule / BerthRules)
   `record ThresholdRule(String sensorType, String field, String op,
   double limit, String key)` -- PURE data, carrying no functional field
   (no Predicate/BiPredicate/ToDoubleFunction/lambda anywhere on it) and no
   enum. `BerthRules.CATALOG` is a flat `List<ThresholdRule>`, and
   `assess()` loops over it filtering by `rule.sensorType().equals(...)` --
   the same flat-list-filtered-by-equality loop SHAPE as 19's
   `HazardRules.assess()` (an unavoidable, generic idiom for "iterate this
   sensor's rules"), but everything AFTER that filter is different: instead
   of a switch or an embedded lambda, `assess()` interprets each rule via
   TWO independent static lookup tables -- `FIELD_EXTRACTORS`
   (`Map<String, ToDoubleFunction<WindowAggregate>>`, turning a rule's
   "field" string into the aggregate value to read) and `COMPARATORS`
   (`Map<String, BiPredicate<Double,Double>>`, turning a rule's "op" string
   into the actual comparison). Adding a new field or operator never
   touches `assess()` itself, only the two maps. Distinct from:
     - 02 Alerts: `record Rule(String field, String op, double limit,
       String key)` -- the same raw-string field/op shape as this project's
       ThresholdRule, but `Alerts.evaluate()` dispatches via a `fieldValue()`
       SWITCH on the field name plus a `rule.op().equals("<") ? ... : ...`
       ternary for the operator, and its `THRESHOLDS` is a
       `Map<String,List<Rule>>` keyed externally by sensor type (not a flat
       list with the sensor type embedded in the rule).
     - 04 IncidentRules: `RuleDescription` is PURELY declarative -- exposed
       via /thresholds but `assess()` ignores it entirely, hardcoding a
       separate `switch (metric) { case "vehicle_count" -> digest.avg() >
       180 ? ... }` expression with no rule objects driving evaluation at
       all.
     - 07 AlertRule: a `sealed interface` with `AboveLimit`/`BelowLimit`
       record variants, each embedding its OWN `ToDoubleFunction<
       WindowAggregate> extractor` field; dispatch is polymorphic via
       `rule.firesOn(window)`.
     - 08 AlertRule: an `enum AlertRule implements
       Predicate<WindowAggregate>` where each enum CONSTANT overrides its
       own `test(WindowAggregate)` body.
     - 09 Rule: built through a fluent DSL --
       `Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0)
       .flagAs("hypoxia_risk")` -- the finished record embeds a
       `BiPredicate<String,WindowAggregate> test` field.
     - 16 Rule: `record Rule(..., Predicate<WindowAggregate> test)` built
       via static factories `avgAbove`/`avgBelow`/`maxAbove`, each closing
       over a `Predicate`; dispatch is a `.stream().filter().filter()
       .map().toList()` pipeline.
     - 19 ThresholdRule: `record ThresholdRule(String sensorType,
       AggregateField field, double limit, String alertKey)` where
       `AggregateField` is a typed 2-value `enum {AVG, MAX}` -- no `op`
       field at all, because every one of that project's real rules is a
       hardcoded `> limit`; dispatch is `switch (field) { case AVG ->
       window.avg(); case MAX -> window.max(); }` followed by one fixed
       `>` comparison.
   ThresholdRule/BerthRules is the only one of the eight whose rule objects
   are pure data (like 02's, unlike 07/08/09/16's embedded-lambda or
   per-constant designs) AND whose dispatch is two independent generic
   lookup tables rather than a switch (02, 19), an if-chain-free but still
   hardcoded per-metric switch (04), or polymorphism/an embedded predicate
   (07/08/09/16) -- and unlike 19, it genuinely supports more than one
   operator (both `>` and `<`, table-driven) rather than a single hardcoded
   comparison.

3. SQS PUBLISHER SHAPE (com.fec.port.fog.TerminalPublisher / BatchPayloadJson)
   Wraps the plain synchronous `SqsClient` (like every sibling except 19),
   but calls `client.sendMessageBatch(...)` ONCE PER FLUSH CYCLE across
   every non-empty group (chunked defensively at 10 entries, the real SQS
   batch limit -- this project's 2 berths x 5 sensor types never exceeds
   10 anyway) instead of calling the single-message send API once per
   group. Queue-URL resolution (`resolveQueueUrl()`) is lazy (first called
   from `publishBatch()`, not the constructor) with a LINEAR backoff --
   500ms initial delay, +500ms per attempt, capped at 4000ms, 20 attempts
   -- a numeric shape that matches none of the seven siblings. The message
   body itself is built by `BatchPayloadJson.build()` via plain
   `StringBuilder` string concatenation with manual quote/backslash
   escaping -- no Jackson class is touched anywhere in the outgoing-message
   path. Distinct from:
     - 02 QueueRelay: `sendMessage()` once per group; queue URL resolved
       EAGERLY inside the constructor via a blocking `for` loop
       (`Thread.sleep(2000)`, 30 attempts); JSON is a from-scratch
       `ObjectNode` built with individual `.put()` calls directly in
       FogApp.
     - 04 RelayClient: `sendMessage()` once per group; queue URL cached in
       a lazy `queueUrl()` check-then-resolve, but the retry itself is a
       blocking, synchronous EXPONENTIAL backoff (`retryWithBackoff()`:
       250ms initial, doubling, capped at 4000ms, 60s total budget); JSON
       is a POJO (`DigestPayload`) serialized straight to a string via
       `JSON.writeValueAsString()`.
     - 07 RelayPublisher + JsonBuilder: `sendMessage()` once per group;
       queue URL resolved EAGERLY in the constructor (`awaitQueue()`,
       fixed 30x2s); JSON via a separate fluent `JsonBuilder` class
       wrapping `ObjectNode`.
     - 08 QueuePublisher + AggregatePayload: `sendMessage()` once per
       group; queue URL resolved via a fixed 30x2s retry not cached beyond
       the constructor; JSON via pure POJO databinding
       (`AggregatePayload`, `@JsonPropertyOrder`) through
       `JSON.writeValueAsString()` -- alerts are embedded IN the POJO
       itself.
     - 09 QueuePublisher + StreamingJson: `sendMessage()` once per group;
       queue URL resolved lazily but with a fixed 30x2s retry (not linear,
       not exponential); JSON via Jackson's LOW-LEVEL streaming API
       (`JsonFactory`/`JsonGenerator`, token-by-token) -- no tree, no POJO
       ever built.
     - 16 TransitPublisher: `sendMessage()` once per group (also
       `implements AutoCloseable`); queue URL resolved EAGERLY in the
       constructor (fixed 30x2s `awaitQueue()`); JSON built directly via
       `ObjectNode`/`ArrayNode` inside `TransitGateway.toPayload()`.
     - 19 SafetyPublisher: the ASYNC `SqsAsyncClient`, still `sendMessage()`
       once per group (batching is not this project's differentiator over
       19 -- SEND SHAPE is); queue URL resolution is a non-blocking
       `CompletableFuture.exceptionallyComposeAsync()` retry chain, never
       parking the calling thread; JSON via `ObjectMapper.valueToTree()`
       of an annotated record, then mutated to append alerts.
   TerminalPublisher is the only one of the eight that batches multiple
   groups into a single SQS API call per flush cycle, and BatchPayloadJson
   is the only payload builder in the whole fog layer (across all eight
   projects) that touches no Jackson class at all -- from-scratch tree
   (02/16), POJO-to-string (04/08), streaming (09), a fluent tree wrapper
   (07), and POJO-to-tree (19) are all Jackson-based; this one is plain
   string concatenation, the same general technique 02's own Sensor.java
   already uses for the UNRELATED sensor-to-fog /ingest payload, but never
   before used by any fog sibling for the fog-to-SQS message.

4. HTTP ROUTING/DISPATCH STYLE (com.fec.port.fog.TerminalRouter / RouteFilter)
   A single root context ("/") whose ONLY handler is a plain 404 -- all
   real routing happens in that one context's own `com.sun.net.
   httpserver.Filter` chain (`HttpContext.getFilters().add(route)`), the
   JDK's built-in chain-of-responsibility mechanism. Each `RouteFilter`
   independently checks whether its own (method, path) matches the
   request: if so, it handles the exchange directly and never calls
   `chain.doFilter(exchange)`; if not, it calls `chain.doFilter(exchange)`
   to pass the exchange on to the next filter untouched, eventually
   reaching the terminal 404 handler if nothing matched. No other Java fog
   sibling in this portfolio touches `com.sun.net.httpserver.Filter` at
   all -- every one of them ultimately registers routing through one or
   more `server.createContext()` calls that the JDK matches by path.
   Distinct from:
     - 02 FogApp: THREE separate `server.createContext(path, exchange ->
       {...})` lambdas registered directly in `main()`; /ingest does its
       own inline `if (!"POST".equals(...))` method check.
     - 04 RouteServer: a fluent builder that accumulates routes into an
       internal `Map<String,HttpHandler> routes = new LinkedHashMap<>()`,
       but `start()` still calls `server.createContext(path,
       guarded(handler))` once PER PATH under the hood.
     - 07 Router: a `.handle(path, handler)` fluent wrapper whose own
       Javadoc says it deliberately avoids an intermediate map -- it also
       still calls `server.createContext(path, exchange -> {...})` once
       per path with a shared try/catch guard.
     - 08 Route: an ENUM where each constant IS a route (`HEALTH("/health",
       handler)` etc.); `wireAll()` iterates `values()` calling
       `server.createContext(route.path, ...)` once per constant.
     - 09 PathDispatcher: a single `createContext("/", dispatcher)`
       registration, but internally a LINEAR SCAN over a `List<Route>` of
       `(Predicate<String> pathMatcher, HttpHandler)` pairs, evaluated at
       request time.
     - 16 TransitGateway.route(): a single `createContext("/",
       gateway::route)` registration whose `route()` method is a literal
       `if (path.equals("/health")) {...} else if (...)` string-equality
       chain.
     - 19 GatewayRouter: a single `createContext("/")` registration backed
       by a genuine `Map<String,HttpHandler> routes` keyed by "METHOD
       path" (e.g. "GET /health"), an O(1) table lookup that also
       distinguishes a real 404 from a 405.
   RouteFilter/TerminalRouter deliberately does NOT reproduce 19's
   404-vs-405 split (an unmatched method on a known path falls through to
   the same plain 404 as an unknown path here) -- the point of difference
   is the MECHANISM itself (a real chain of independent Filter objects,
   each free to intercept or pass a request on, proven directly by
   TerminalRouterTest), not a lookup table's Big-O.

5. SENSOR-LOOP SCHEDULING MECHANISM (com.fec.port.sensor.BerthSensorUnit)
   Two SELF-RESCHEDULING ONE-SHOT task objects -- `SampleTask` and
   `DispatchTask`, each implementing `Runnable` -- submitted to the SAME
   `Executors.newSingleThreadScheduledExecutor()`. Neither uses
   `scheduleAtFixedRate`: each task's own `run()` method calls
   `scheduler.schedule(this, delayMillis, TimeUnit.MILLISECONDS)` as its
   LAST line, re-arming itself for its own next fire. Because that
   executor only ever runs one task at a time, the two chains can never
   execute concurrently with each other, so the shared `List<Reading>
   buffer` needs no lock, no `synchronized` block, and no concurrent
   collection anywhere in this class -- a real, different consequence from
   every sibling below, each of which needs explicit synchronization (or a
   queue-based hand-off) because their two chains genuinely CAN run at the
   same time. Distinct from:
     - 02 Sensor: a single `while (true)` loop with one
       `Thread.sleep((long)(sampleInterval*1000))` per iteration; the
       dispatch decision is inline, comparing elapsed `System.nanoTime()`
       against `dispatchInterval` before that same sleep -- one loop, one
       fixed granularity, no separate task object and no scheduler at all.
     - 04 MetricSensor: TWO tasks on a SHARED
       `Executors.newScheduledThreadPool(2)`, both via
       `scheduler.scheduleAtFixedRate(...)` (genuinely periodic, not
       self-rescheduling); the two tasks hand data off through a shared
       `Deque<TimedValue> buffer` guarded by `synchronized (buffer)`
       blocks; `main()` blocks on `new CountDownLatch(1).await()`.
     - 07 RobotUnit / 08 StoreSensorUnit / 09 PondSensorUnit: all three use
       the SAME pattern -- a single `while (true)` loop tracking two "next
       fire" timestamps with one ADAPTIVE short sleep (`Thread.sleep(
       Math.max(1, Math.min(50, untilNextEvent)))`) -- one thread, one
       loop, busy-polling at up to 50ms granularity, no task objects and
       no executor at all.
     - 16 TransitSensorUnit: TWO independent `java.util.Timer` instances
       (`sampleTimer`, `dispatchTimer`), each running its own `TimerTask`
       via `scheduleAtFixedRate` (again genuinely periodic, not
       self-rescheduling); the shared `buffer` List is guarded by plain
       `synchronized (buffer)` blocks; `main()` blocks on
       `new CountDownLatch(1).await()`.
     - 19 ShaftSensorUnit: TWO raw `java.lang.Thread` objects (a daemon
       sample thread, a non-daemon dispatch thread), each with its OWN
       plain `Thread.sleep(intervalMillis)` loop, coordinated purely
       through a `LinkedBlockingQueue<Reading>` producer/consumer
       hand-off (`queue.offer()` / `queue.drainTo()`); `main()` blocks by
       joining the live dispatch thread.
   BerthSensorUnit is the only one of the eight where the two chains are
   genuinely serialized onto ONE worker thread by construction (a
   single-thread `ScheduledExecutorService`, not a 2-thread pool like 04,
   not 2 `Timer`s like 16, not 2 raw `Thread`s like 19, and not a single
   flat loop like 02/07/08/09) AND where each chain is a self-rearming task
   object rather than a periodic `scheduleAtFixedRate`/`Timer` registration
   or an inline loop iteration. The trade-off, documented directly in the
   class's own Javadoc, is that a slow dispatch HTTP call delays the next
   scheduled sample tick, since both chains queue up behind the same
   worker thread.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson (used for /ingest parsing,
    /thresholds rendering and DynamoDB item transforms -- deliberately NOT
    used for the fog-to-SQS payload itself, see axis 3 above)
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard crane-load trend chart, vendored at
    backend/dashboard/static/vendor/chart.umd.min.js, copied unchanged
    from project 19's frontend, never fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud

Domain modelling (sensor types/ranges, the 4 real operational thresholds,
the status-line logic and its Nominal/Safe wording) and the entire
dashboard UI (steel-blue/safety-orange palette, inline status-line layout,
reading rows) are original to this project.

PHASE 2 (NOT IN SCOPE)
-----------------------
Real AWS/Azure deployment is a deliberately deferred Phase 2 item for the
whole portfolio -- this project runs entirely on Docker + LocalStack.
