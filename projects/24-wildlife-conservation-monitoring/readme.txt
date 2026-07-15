Wildlife Conservation & Habitat Monitoring
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

ATTRIBUTION
-----------
This project is Hrishikesh Sajeev's individual CA submission, Student ID
X25132377, National College of Ireland. It shares this portfolio repository
with several other students' independently attributed projects as a
convenience; it is not part of the main portfolio owner's own submission.

All commands below assume your working directory is this folder
(projects/24-wildlife-conservation-monitoring/), not the repo root.

OVERVIEW
--------
Two wildlife reserves (site_id "reserve-a" and "reserve-b") each carry five
sensor types: motion_detection_count (camera-trap trigger count),
acoustic_poaching_risk_db (an anomalous acoustic signature level, a proxy for
gunshot/chainsaw detection), waterhole_level_cm, ambient_temp_c and
soil_moisture_pct. Ten sensor containers POST batched readings to a fog HTTP
node, which windows/aggregates each (sensor_type, site_id) pair every
WINDOW_SECONDS, evaluates real conservation/safety thresholds, and publishes
one aggregate message per non-empty group to SQS. A real AWS Lambda function
(running inside LocalStack, wired via a real SQS event source mapping)
consumes the queue and writes to DynamoDB. A dashboard renders a
field-station LOG readout per reserve: a chronological ledger of readings
merged across all 5 sensor types, plus a compact native <meter> summary
strip and a waterhole-level trend chart.

This is the 9th Java project in this portfolio (after 02-industrial-
equipment, 04-smart-city, 07-warehouse-robotics-fleet, 08-retail-footfall-
inventory, 09-aquaculture-fish-farm, 16-public-transit-fleet-monitoring,
19-smart-mining-safety and 20-smart-port-container-terminal) and, like
those, uses plain JDK HttpServer (com.sun.net.httpserver) rather than a
framework such as Spring. See REUSE / THIRD-PARTY below for exactly how its
fog buffering, alert-rule representation, SQS publisher, HTTP routing and
sensor-loop scheduling each differ from all eight of those siblings, by
class and method name, verified against each sibling's current real source.

LAYOUT
------
  sensors/            Java sensor simulator (ReserveSensorUnit.java), one
                       container per (sensor_type, site_id) pair
  fog/                 plain-JDK HTTP server (HabitatGateway.java): ingest
                       validation (IngestRequest.java), buffer
                       (HabitatBuffer.java), window/aggregate
                       (WindowAggregate.java), threshold evaluation
                       (HabitatAlerts.java / CompiledRule.java), SQS dispatch
                       (ReservePublisher.java / AggregateSerializer.java),
                       HTTP routing (AnnotatedRouter.java / Route.java)
  backend/processor/  RecordMapper.java (pure transform: JSON -> DynamoDB
                       item, computes sort_key) + WildlifeHandler.java (AWS
                       Lambda entry point, RequestHandler<SQSEvent,...>) +
                       deploy_lambda.sh (bash + AWS CLI packages the built
                       JAR and registers it with an SQS event source
                       mapping -- deployment tooling is intentionally
                       language-neutral, matching the rest of the portfolio)
  backend/dashboard/  plain-JDK HTTP server (WildlifeDashboardApp.java)
                       serving its own REST API plus the static frontend
                       (backend/dashboard/static/): a FIELD-STATION LOG
                       readout per reserve (the primary view, computed by
                       ReserveRepository.byReserve() and rendered by
                       dashboard.js's renderLog()), a compact native <meter>
                       summary strip above each log, and a Chart.js
                       waterhole-level trend chart. Earthy forest-green /
                       khaki palette with a rust-orange alert accent; the
                       accent colours only the flagged log row/word, never a
                       tile or badge background. WildlifeDashboardLambda.java
                       is the real API Gateway REST API entry point used in
                       the AWS deployment below: a switch expression on
                       "METHOD path" calling straight into
                       ReserveRepository/PipelineChecks/ThresholdsGateway,
                       the same classes the HttpExchange-based routes above
                       use locally -- a 5th distinct dashboard-Lambda
                       dispatch shape in this portfolio, after projects 15's
                       ordered regex-list scan, 22's trie-walk router, 01's
                       Mangum-wrapped-FastAPI-native-routes reuse, and 23's
                       flat dict[(method,path)] lookup.
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

  Dashboard:  http://localhost:8103
  LocalStack: http://localhost:4589

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: docker compose down -v can leave behind a LocalStack-spawned
Lambda-executor sibling container (named like
wcm-localstack-1-lambda-wcm-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If down -v reports
"Network wcm_default Resource is still in use", check for it and clean up
explicitly:
  docker ps -a --filter "name=wcm"
  docker network ls --filter "name=wcm"
  docker rm -f <the lambda-executor container name>
  docker network rm wcm_default

CONFIGURE SENSOR RATES
-----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml), genuinely different values per container:
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node

For example sensor-motion-a samples every 2s and dispatches every 8s, while
sensor-temp-a samples every 4s and dispatches every 14s.

RUN THE TESTS
-------------
Each Maven project has its own JUnit 5 test suite:
  cd sensors && mvn test                  (7 tests)
  cd fog && mvn test                      (44 tests)
  cd backend/processor && mvn test        (5 tests)
  cd backend/dashboard && mvn test        (26 tests)

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

All 82 tests pass. Notable coverage: HabitatGatewayHttpTest and
AnnotatedRouterTest exercise /ingest and the reflection-driven route
dispatch over a REAL com.sun.net.httpserver.HttpServer bound to an
ephemeral port (not a unit test of validation logic in isolation);
ThresholdsGatewayTest covers both the success path and an
unreachable-upstream path for the dashboard's fog-thresholds proxy;
HabitatBufferTest includes a 16-thread concurrent-ingest test proving the
CAS retry loop never drops a reading under real contention;
PipelineChecksTest and WildlifeDashboardLambdaTest each include a four-page
(400/400/400/87 -> 1287) DynamoDB pagination test proving items_in_table
follows LastEvaluatedKey across pages instead of counting only the first;
ReservePublisherTest asserts a 23-message window batches into SendMessageBatch
calls of size 10/10/3, not 23 individual sendMessage() calls.

VERIFY END-TO-END
------------------
With the stack running (allow ~30s after startup for the first window
flush), run the automated check:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4589 python3 infra/verify_pipeline.py

Or curl the API directly:
  curl http://localhost:8103/api/health
  curl http://localhost:8103/api/thresholds
  curl "http://localhost:8103/api/readings?sensor_type=waterhole_level_cm&limit=5"
  curl http://localhost:8103/api/reserves
  curl http://localhost:8103/api/backend-stats

Expected /api/health once the pipeline has warmed up:
  {"gateway":true,"queue":true,"lambda":true,"pipeline":true,"freshest_age_seconds":<small number>}

Expected /api/thresholds (the fog's real, DSL-compiled rules):
  {"acoustic_poaching_risk_db":[{"field":"avg","op":">","limit":75.0,"key":"poaching_risk_detected"}],
   "waterhole_level_cm":[{"field":"avg","op":"<","limit":20.0,"key":"drought_stress_risk"}],
   "motion_detection_count":[{"field":"max","op":">","limit":30.0,"key":"unusual_activity_surge"}],
   "soil_moisture_pct":[{"field":"avg","op":"<","limit":10.0,"key":"habitat_dryness_risk"}]}

/api/reserves returns, per reserve, the latest window for all 5 sensor types
under "metrics" plus a "log" array -- see "FIELD LOG SHAPE" below.

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4589 python3 infra/burst.py --messages 2000 --workers 32

Sends synthetic "loadtest_a".."loadtest_e" messages (never the real 5
sensor types, so burst traffic never lands in the dashboard's live
partitions), then asserts (1) the queue shows the burst immediately after
sending, and (2) polls for a full drain within a timeout -- if it does not
fully drain, asserts the remaining count strictly decreased from the
immediate post-burst count (a soft WARNING print, not a failure, in that
case, since LocalStack's single-container Lambda throughput can genuinely
take longer than the poll window to fully absorb a large burst).

FIELD LOG SHAPE
---------------
ReserveRepository.byReserve() (backend/dashboard) returns, per reserve:
  "metrics": the latest window per sensor type -- the same per-site summary
             shape every other Java sibling's grouping view uses (07's
             fleet roster, 08's byStore, 09's byPond, 16's byDepot, 19's
             byShaft, 20's byBerth).
  "log":     every fetched window across ALL 5 sensor types for that
             reserve, flattened into one list and sorted by window_end
             descending (most recent first), each entry tagged with which
             sensor produced it. This is the reserve's PRIMARY structural
             view -- a chronological ledger, not a per-metric card grid, a
             coloured tile, a dial, a status line, a priority list, a
             matrix table, or a scorecard badge (the eight structural
             primary views already used elsewhere in this 22-project
             portfolio). dashboard.js renders it as a monospace log panel
             (time / sensor / reading / flag columns) styled like a
             ranger-station field notebook; a compact native <meter>
             summary strip sits above it per reserve for the current value
             of all 5 sensor types at a glance.

VERIFICATION EVIDENCE (this pass)
----------------------------------
  - mvn test: sensors 7/7, fog 44/44, processor 5/5, dashboard 26/26 --
    all green, exit 0, run individually with `mvn -B test`.
  - docker compose build: all 13 images (localstack, fog, processor,
    dashboard, 10 sensor containers) built clean.
  - Full stack bring-up in order (localstack -> fog+dashboard -> processor
    -> sensors), RestartCount 0 confirmed for every container via
    `docker inspect`.
  - backend-stats items_in_table polled until > 5.
  - /api/reserves curled, confirming distinct, plausible live data for both
    reserve-a and reserve-b (independently random-walking values).
  - /api/health: gateway/queue/lambda/pipeline all true.
  - /api/thresholds: exact byte-for-byte match against the 4 real rules.
  - Container logs checked for repeating errors (none beyond the expected
    "queue ... never became available" retry lines during the LocalStack
    bootstrap race, which self-resolve).
  - Playwright screenshots captured at desktop and 375px width; only a
    harmless favicon 404 in the console.
  - infra/burst.py run live against the running stack; both hard
    assertions passed.
  - Clean teardown (`docker compose down -v`) with a LocalStack Lambda-
    executor sibling-container/network check (see TEARDOWN NOTE above).

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline SHAPE (sensors -> fog windowing/aggregation/alerting ->
queue -> FaaS processor -> datastore -> dashboard, sort-key disambiguation
for multi-site records, a health/thresholds-proxy pattern on the dashboard)
follows the same design established across sibling projects 02, 04, 07, 08,
09, 16, 19 and 20 in this shared portfolio repository -- those belong to
the main portfolio owner, not to this student; this project is Hrishikesh
Sajeev's individually-attributed submission (see ATTRIBUTION above), and
the shared pipeline shape is adapted from those siblings' codebases, not
carried over from any earlier project of his own. The CODE ITSELF is an
independent implementation. Domain-specific code (sensor types, thresholds,
the field-log logic, and the entire dashboard UI) is original to this
project.
This is the 9th Java project in the portfolio; the five axes below were
deliberately chosen to be a genuinely distinct combination from all eight
existing Java siblings, verified against each sibling's current real source
before writing this section.

1. FOG BUFFERING MECHANISM (com.fec.wildlife.fog.HabitatBuffer)
   A single `AtomicReference<Map<FieldKey,List<Reading>>> state`, mutated
   exclusively through `state.updateAndGet(...)` -- a lock-free,
   WHOLE-STRUCTURE copy-on-write retry loop. Every `ingest()` call builds a
   brand new immutable snapshot map (a shallow copy of the current one,
   plus this call's readings appended under its own key) and hands the
   whole new map to `updateAndGet()`, which automatically retries the
   supplied function if another thread's compare-and-swap won the race in
   between. There is no explicit lock, no per-key structure, and no atomic
   bookkeeping field anywhere in this class. `drainAll()` is a single
   `state.getAndSet(Map.of())` -- one atomic swap that both hands the whole
   retiring snapshot to the caller and resets the live reference to empty.
   Distinct from:
     - 02 FogApp: a single `Object lock` field with `synchronized` blocks
       guarding a plain `HashMap<PendingKey,List<Reading>>`.
     - 04 CityFogNode: `AtomicReference<Generation>` "fencing" -- a private
       `Generation` class carries its own `AtomicInteger inFlightWriters`
       and `AtomicBoolean fenced`, and `flushWindow()` spin-waits on those
       counters before retiring a generation.
     - 07 FleetGateway/BufferBucket: `ConcurrentHashMap<RobotKey,
       BufferBucket>` where each `BufferBucket` guards its own `List` with
       its OWN `ReentrantLock`.
     - 08 BufferActor: a single dedicated worker `Thread` draining a
       `BlockingQueue<IngestEvent>` mailbox -- no lock of any kind, but a
       real extra thread exists purely to own the buffer.
     - 09 PondGateway: `ConcurrentHashMap<PondKey,ReadingAccumulator>`
       mutated via `buffers.merge(key, incoming, ReadingAccumulator::
       combine)`, whose atomicity comes from ConcurrentHashMap's own
       per-bin locking, not from any CAS retry visible to application code.
     - 16 IntakeQueue: a single flat, UNGROUPED `ConcurrentLinkedQueue` --
       grouping only happens at flush time inside `drainAndGroup()`.
     - 19 HazardBuffer: `ConcurrentHashMap<ShaftKey,ConcurrentLinkedQueue<
       Reading>>`, pre-grouped at ingest time, drained per-key via
       `computeIfPresent()` returning null.
     - 20 TerminalLedger: a single `ConcurrentSkipListMap<Long,Entry>` keyed
       by a monotonically increasing sequence number, drained via a
       `headMap(boundary, false)` view followed by `clear()` on that view.
   HabitatBuffer is the only one of the nine where EVERY ingest -- not just
   the flush -- is a CAS retry over the WHOLE buffer structure (a
   persistent-map-style copy-on-write), rather than a per-key lock, queue,
   actor, or merge call, or a per-flush generation/sequence swap. The
   trade-off, acceptable at this CA's demo scale (five sensor types across
   two reserves -- at most ten live keys), is that `ingest()` copies the
   whole snapshot map on every call; HabitatBufferTest includes a 16-thread
   concurrent-ingest test proving no reading is ever lost to a missed CAS
   retry.

2. ALERT-RULE REPRESENTATION (com.fec.wildlife.fog.HabitatAlerts / CompiledRule)
   The real reserve thresholds are authored as short human-readable DSL
   strings -- e.g. "acoustic_poaching_risk_db avg>75 -> poaching_risk_
   detected" -- and compiled ONCE, at class-init time, by
   `HabitatAlerts.compile()` via a regex (`SPEC_PATTERN`) into `CompiledRule`
   records whose `extractor` (a `ToDoubleFunction<WindowAggregate>`) and
   `test` (a `DoublePredicate`) fields are already-bound closures.
   `CompiledRule.firesOn()` and `HabitatAlerts.evaluate()` never branch on a
   field name or operator string again -- that happens exactly once per
   rule, during parsing. No other Java fog sibling in this portfolio parses
   a text rule specification. Distinct from:
     - 02 Alerts: `record Rule(String field, String op, double limit,
       String key)` kept in a `Map<String,List<Rule>>` keyed externally by
       sensor type, interpreted via a `fieldValue()` SWITCH plus a
       `rule.op().equals("<") ? ... : ...` ternary evaluated fresh every
       call.
     - 04 IncidentRules: `RuleDescription` is purely declarative metadata
       that `assess()` ignores entirely, hardcoding a separate `switch
       (metric) { case "vehicle_count" -> digest.avg() > 180 ? ... }`
       expression with no rule objects driving evaluation at all.
     - 07 AlertRule: a `sealed interface` with `AboveLimit`/`BelowLimit`
       record variants, each embedding its OWN `ToDoubleFunction<
       WindowAggregate> extractor` field; dispatch is polymorphic via
       `rule.firesOn(window)`.
     - 08 AlertRule: an `enum AlertRule implements Predicate<
       WindowAggregate>` where each enum CONSTANT overrides its own
       `test(WindowAggregate)` body.
     - 09 Rule: built through a multi-stage fluent DSL --
       `Rule.on("dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0)
       .flagAs("hypoxia_risk")` -- the finished record embeds a
       `BiPredicate<String,WindowAggregate> test` field, assembled via
       method chaining in Java code, never parsed from a string.
     - 16 Rule: `record Rule(..., Predicate<WindowAggregate> test)` built
       via static factories `avgAbove`/`avgBelow`/`maxAbove`; dispatch is a
       `.stream().filter().filter().map().toList()` pipeline.
     - 19 ThresholdRule: `record ThresholdRule(String sensorType,
       AggregateField field, double limit, String alertKey)` -- no `op`
       field at all (every rule is a hardcoded `>`), interpreted via
       `switch (field) { case AVG -> window.avg(); case MAX -> window.
       max(); }` on every `assess()` call.
     - 20 ThresholdRule/BerthRules: pure data (`sensorType, field, op,
       limit, key`, no lambda field) interpreted via TWO static lookup
       tables (`FIELD_EXTRACTORS`, `COMPARATORS`) consulted fresh on every
       `assess()` call.
   HabitatAlerts/CompiledRule is the only one of the nine whose rule
   objects are DERIVED FROM PARSED TEXT rather than assembled directly in
   Java code (a record literal, an enum constant, a fluent builder chain,
   or a declarative map), and the only one where the field/operator
   resolution happens exactly once (at compile-time, inside `compile()`)
   rather than being re-interpreted on every `evaluate()`/`assess()` call.

3. SQS PUBLISHER SHAPE (com.fec.wildlife.fog.ReservePublisher / AggregateSerializer)
   Wraps the plain synchronous `SqsClient` (like most siblings), resolving
   the queue URL LAZILY on the first `publish()` call (like 09/20, not
   eagerly in the constructor like 02/07/08/16), with a JITTERED
   EXPONENTIAL backoff: 300ms base delay, doubling each attempt, capped at
   5000ms, every computed delay perturbed by a random +/-20% via
   `ThreadLocalRandom` (see `ReservePublisher.jittered()`), for up to 12
   attempts. The outgoing message body is built by calling
   `objectMapper.writeValueAsString(payload)` on a dedicated `ObjectMapper`
   that has a hand-written `AggregateSerializer` (`extends StdSerializer<
   AggregatePayload>`) registered on it via a `SimpleModule` --
   `AggregateSerializer.newMapper()` -- so Jackson's own class-specific
   serializer-registration mechanism decides how to write the payload, not
   a tree built inline, a POJO passed straight to `writeValueAsString()`
   with no custom serializer, or a hand-rolled `StringBuilder`. Distinct
   from:
     - 02 QueueRelay: `sendMessage()` once per group; queue URL resolved
       EAGERLY in the constructor via a blocking fixed 30x2s retry loop;
       JSON is a from-scratch `ObjectNode` built with individual `.put()`
       calls directly in FogApp.
     - 04 RelayClient: queue URL lazily cached but resolved via a blocking,
       synchronous, NON-jittered EXPONENTIAL backoff (`retryWithBackoff()`:
       250ms initial, doubling, capped at 4000ms, 60s total budget); JSON
       is a POJO (`DigestPayload`) serialized straight to a string via
       `JSON.writeValueAsString()` with no custom serializer.
     - 07 RelayPublisher + JsonBuilder: queue URL resolved EAGERLY
       (fixed 30x2s); JSON via a separate fluent `JsonBuilder` class
       wrapping `ObjectNode`.
     - 08 QueuePublisher + AggregatePayload: queue URL resolved via a fixed
       30x2s retry, not cached beyond the constructor; JSON via pure POJO
       databinding (`@JsonPropertyOrder`) through `JSON.writeValueAsString()`
       -- no custom serializer, alerts embedded directly in the POJO.
     - 09 QueuePublisher + StreamingJson: queue URL resolved lazily with a
       fixed 30x2s retry (not jittered, not exponential); JSON via
       Jackson's LOW-LEVEL streaming API (`JsonFactory`/`JsonGenerator`
       called directly by application code) -- no `ObjectMapper`, no
       module, no custom serializer class.
     - 16 TransitPublisher: `implements AutoCloseable`; queue URL resolved
       EAGERLY (fixed 30x2s); JSON built directly via `ObjectNode`/
       `ArrayNode` inside `TransitGateway.toPayload()`.
     - 19 SafetyPublisher: the ASYNC `SqsAsyncClient` with a non-blocking
       `CompletableFuture.exceptionallyComposeAsync()` retry chain (never
       parks the calling thread); JSON via `ObjectMapper.valueToTree()` of
       an annotated record, then the resulting tree is mutated to append
       alerts.
     - 20 TerminalPublisher + BatchPayloadJson: batches every group into
       ONE `sendMessageBatch()` call per flush cycle; queue URL resolved
       lazily with a plain (non-jittered) LINEAR backoff (500ms, +500ms
       per attempt, capped at 4000ms); JSON via plain `StringBuilder`
       string concatenation with manual quote/backslash escaping -- no
       Jackson class touched at all for the outgoing message.
   ReservePublisher is the only one of the nine whose retry delay is
   RANDOMISED (jitter), and AggregateSerializer is the only payload builder
   in the whole fog layer (across all nine projects) that uses Jackson's
   serializer-MODULE extension point (`SimpleModule` + `StdSerializer`)
   rather than a hand-built tree, a plain POJO-to-string call, low-level
   streaming, or string concatenation.

4. HTTP ROUTING/DISPATCH STYLE (com.fec.wildlife.fog.AnnotatedRouter / Route)
   HTTP routes are discovered via REFLECTION: every method on the gateway
   object annotated `@Route(method=..., path=...)` is registered
   automatically by `AnnotatedRouter.bind()`, which scans
   `target.getClass().getDeclaredMethods()` once at startup, groups the
   annotated methods by path, and registers one `createContext()` per
   distinct path whose handler resolves the matching HTTP method via
   `Method.invoke()`, falling back to a plain 404 for an unknown path (the
   JDK's own HttpServer default when no context matches) and 405 for a
   known path with no matching method. There is no hand-written route list,
   table, or enum anywhere -- adding an endpoint means adding an annotated
   method to `HabitatGateway`. No other Java fog sibling in this portfolio
   touches annotations or reflection for routing at all. Distinct from:
     - 02 FogApp: three `server.createContext()` lambdas registered
       directly in `main()`, no shared error boundary.
     - 04 RouteServer / 07 Router: fluent builders that still call
       `server.createContext()` once per path under the hood (accumulate-
       then-wire, or wire-immediately).
     - 08 Route: an ENUM where each constant IS a route, iterated via
       `wireAll()`.
     - 09 PathDispatcher: a single `createContext("/", dispatcher)`
       registration, internally a LINEAR SCAN over a `List<(Predicate<
       String>,HttpHandler)>` matched at request time.
     - 16 TransitGateway.route(): a single `createContext("/", ...)`
       registration whose handler is a literal `if (path.equals(...)) {...}
       else if (...)` string-equality chain.
     - 19 GatewayRouter: a single `createContext("/")` backed by a flat
       `Map<String,HttpHandler>` keyed by "METHOD path" for an O(1) lookup,
       with an explicit 404-vs-405 split.
     - 20 TerminalRouter/RouteFilter: each route is an independent
       `com.sun.net.httpserver.Filter` registered on one root context's
       filter chain (a JDK chain-of-responsibility).
   AnnotatedRouter is the only one of the nine where the routing table
   itself is never written out by hand at all -- it is discovered from
   method metadata (annotations) via reflection when `bind()` runs. The
   same class (independently duplicated, not shared via a library module)
   also drives the dashboard's own HTTP server
   (com.fec.wildlife.dashboard.AnnotatedRouter), proven directly by
   AnnotatedRouterTest in both the fog and dashboard test suites.

5. SENSOR-LOOP SCHEDULING MECHANISM (com.fec.wildlife.sensor.ReserveSensorUnit)
   Sampling and dispatching are each an INFINITE CHAIN of
   `CompletableFuture.runAsync(...)` calls, scheduled purely via
   `CompletableFuture.delayedExecutor(intervalMillis, MILLISECONDS)` -- no
   `Thread`, `Timer`, or `ExecutorService` is ever constructed by this
   class. Each chain reschedules itself from inside `whenComplete()`,
   forever, regardless of whether the previous run threw. Both chains
   append to / drain from the SAME `ConcurrentLinkedDeque<Reading>` -- a
   genuinely lock-free structure (no `synchronized` block, no explicit
   `Lock`, no `BlockingQueue` hand-off) because `ConcurrentLinkedDeque`
   itself guarantees safe concurrent `offerLast()`/`pollFirst()` without
   external coordination. Distinct from:
     - 02 Sensor / 07 RobotUnit / 08 StoreSensorUnit / 09 PondSensorUnit:
       a single `while (true)` loop (02: one `Thread.sleep()` per iteration
       with an inline dispatch-deadline check; 07/08/09: two "next fire"
       timestamps polled with one ADAPTIVE short sleep,
       `Thread.sleep(Math.max(1, Math.min(50, untilNextEvent)))`) -- one
       thread, one loop, no task objects and no executor at all.
     - 04 MetricSensor: TWO tasks on a SHARED
       `Executors.newScheduledThreadPool(2)`, both via
       `scheduler.scheduleAtFixedRate(...)` (genuinely periodic, not
       self-rescheduling); the two tasks hand data off through a shared
       `Deque<TimedValue>` guarded by `synchronized(buffer)` blocks.
     - 16 TransitSensorUnit: TWO independent `java.util.Timer` instances,
       each running its own `TimerTask` via `scheduleAtFixedRate`; the
       shared buffer `List` is guarded by plain `synchronized(buffer)`
       blocks.
     - 19 ShaftSensorUnit: TWO raw `java.lang.Thread` objects (a daemon
       sample thread, a non-daemon dispatch thread), coordinated purely
       through a `LinkedBlockingQueue<Reading>` producer/consumer hand-off
       (`queue.offer()` / `queue.drainTo()`).
     - 20 BerthSensorUnit: two SELF-RESCHEDULING one-shot `Runnable` task
       objects (`SampleTask`, `DispatchTask`), both submitted to the SAME
       `Executors.newSingleThreadScheduledExecutor()` via
       `scheduler.schedule(this, delay, ...)` called from inside their own
       `run()` -- serialized onto one worker thread, so the shared
       `List<Reading> buffer` needs no lock at all.
   ReserveSensorUnit is the only one of the nine that constructs NO
   scheduling primitive whatsoever (no Thread, Timer, or ExecutorService) --
   `CompletableFuture.delayedExecutor()` is a static factory backed by the
   JDK's own common infrastructure, not an object this class owns or
   manages. It shares 20's "no synchronization needed" property, but
   arrives at it a different way: 20 achieves lock-freedom by serializing
   both chains onto one worker thread; here the two chains genuinely CAN
   run concurrently with each other (each governed independently by its own
   delayed-executor callback), and lock-freedom instead comes from the
   buffer itself being a `ConcurrentLinkedDeque` -- a structure none of the
   other eight siblings use for their sensor-side buffer at all (04/16 use
   a plain `synchronized` `Deque`/`List`; 19 uses a `LinkedBlockingQueue`;
   02/07/08/09/20 use a plain `List` under either a single-thread loop or a
   single-thread executor).

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson (used for /ingest parsing,
    /thresholds rendering, DynamoDB item transforms, and the fog-to-SQS
    payload via a custom StdSerializer, see axis 3 above)
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard waterhole-level trend chart, vendored at
    backend/dashboard/static/vendor/chart.umd.min.js, copied unchanged from
    project 20's frontend, never fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud

Domain modelling (sensor types/ranges, the 4 real conservation/safety
thresholds, the field-log logic and its column layout) and the entire
dashboard UI (forest-green/khaki palette, log-panel layout, summary strip)
are original to this project.

DEPLOYMENT (AWS)
-----------------
This project is deployed to a real AWS account (an AWS Academy Learner Lab
under Hrishikesh Sajeev's own student login, account 670139527491, region
us-east-1) rather than running only against the LocalStack emulator above.

Live resources: DynamoDB table wcm-readings, SQS queue wcm-reserve-agg,
Lambda wcm-processor (SQS-triggered ingestion, java17 runtime) and Lambda
wcm-dashboard-api (WildlifeDashboardLambda, behind API Gateway REST API
oz61bjskyj, stage prod), EC2 instance (tag wcm-fog-host, security group
allowing only inbound TCP 8000, no SSH/key pair -- administered exclusively
through AWS Systems Manager Session Manager) behind Elastic IP
44.216.37.203, S3 bucket wcm-frontend-670139527491 (static dashboard
frontend, public read, static website hosting) and S3 staging bucket
wcm-deploy-670139527491 (used to ship source to the EC2 instance since this
repo is private and can't be git cloned from there without embedding a
token).

Live URLs: dashboard at
https://wcm-frontend-670139527491.s3.us-east-1.amazonaws.com/index.html,
its API at https://oz61bjskyj.execute-api.us-east-1.amazonaws.com/prod. The
dashboard and its API are fully serverless (S3 + Lambda + API Gateway) and
do not depend on the EC2 instance being up; only /api/health's "gateway"
field and fresh sensor data depend on the fog node running on EC2.

The dashboard-facing Lambda's FOG_HEALTH_URL/FOG_THRESHOLDS_URL env vars
point at the Elastic IP above; if it is ever released and reallocated,
they need updating. The frontend's static/api-config.json is generated at
deploy time with the real API Gateway URL (see WildlifeDashboardLambda
description above) -- the committed version in this repo is a placeholder
with an empty apiBase, used only for local development.

End-to-end pipeline independently verified live: /api/health reports
{"gateway":true,"queue":true,"lambda":true,"pipeline":true} with
freshest_age_seconds under 6 seconds, and the S3-hosted dashboard was
loaded in a real browser (not just curled) -- confirmed zero 404s on any
static asset, zero console errors, full styling, live alert banners
(poaching risk, drought stress, activity surge, habitat dryness all firing
correctly against real threshold rules), and backend-stats' items_in_table
climbing across reloads.
