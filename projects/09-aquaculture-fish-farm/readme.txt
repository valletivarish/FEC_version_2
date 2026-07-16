Aquaculture Fish Farm Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

ATTRIBUTION
-----------
This project (09-aquaculture-fish-farm) is the individual CA submission of
Anjaneya Reddy Gurram, Student ID 24288853. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

All commands below assume your working directory is this folder
(projects/09-aquaculture-fish-farm/), not the repo root.

OVERVIEW
--------
A fish farm monitors water quality and feeding across two ponds (pond-1,
pond-2). Five sensors per pond -- water temperature, dissolved oxygen, pH,
ammonia concentration, and feed dispensed -- feed a fog gateway. The gateway
windows and aggregates each (sensor_type, site_id) pair's readings, evaluates
fish-health threshold rules, and dispatches one aggregate per window to a
queue. An AWS Lambda function (running inside LocalStack) consumes the queue
and stores records; a web dashboard renders each pond as a plain card
listing its five metrics as rows, each showing a native <meter> bar against
the sensor's configured range, followed by per-metric trend charts.

This is the fifth Java implementation in this CA portfolio, alongside
02-industrial-equipment, 04-smart-city, 07-warehouse-robotics-fleet, and
08-retail-footfall-inventory. It deliberately does not share internal
structure with any of them:
  - fog/ buffering is a single ConcurrentHashMap<PondKey, ReadingAccumulator>
    (PondGateway.buffers) mutated only through its own atomic merge():
    buffers.merge(key, incoming, ReadingAccumulator::combine). There is no
    explicit lock anywhere in this class, no AtomicReference/AtomicInteger/
    AtomicBoolean fencing, and no dedicated worker thread draining a
    mailbox -- correctness rests entirely on ConcurrentHashMap's documented
    per-key atomicity for merge(), combined with ReadingAccumulator being an
    immutable value type (every combine() call returns a new instance,
    never mutates either argument). A flush simply swaps the whole map
    reference out for a fresh ConcurrentHashMap and iterates the retired one
    undisturbed. This differs from 02's FogApp (synchronized(lock) around a
    shared HashMap), 04's CityFogNode (fenced lock-free
    ConcurrentHashMap-of-generations with AtomicReference/AtomicInteger/
    AtomicBoolean), 07's FleetGateway (ConcurrentHashMap of per-key
    BufferBucket objects each guarded by its own ReentrantLock), and 08's
    BufferActor (a single dedicated thread draining a LinkedBlockingQueue
    mailbox, no ConcurrentHashMap at all).
  - Alert rules are built through a small fluent DSL (Rule.java): Rule.on(
    "dissolved_oxygen_mgl").when(Field.AVG).lessThan(4.0).flagAs(
    "hypoxia_risk"). Each stage of the chain (SensorStage -> FieldStage ->
    ComparisonStage) is its own record, so the chain can only be completed
    by calling flagAs() -- there is no way to build a Rule missing a
    comparison or a key. The finished Rule is an immutable record holding a
    BiPredicate<String,WindowAggregate> closed over at build time, plus
    plain field/op/limit/key metadata for the /thresholds endpoint.
    PondAlerts.RULES is a flat List<Rule> assembled once at class-init time
    via these static factory chains. This differs from 02's Alerts (a
    Map<String,List<Rule>> table evaluated via a field-name switch), 04's
    IncidentRules (a declarative RULE_CATALOG map plus a wholly separate
    hardcoded switch-expression assess() method), 07's AlertRule (a sealed
    interface with AboveLimit/BelowLimit record variants and a polymorphic
    firesOn() method), and 08's AlertRule (an enum implementing
    Predicate<WindowAggregate> with per-constant bodies).
  - JSON is built through Jackson's low-level streaming API (JsonFactory +
    JsonGenerator) in StreamingJson.java: gen.writeStartObject();
    gen.writeStringField("sensor_type", ...); gen.writeNumberField("avg",
    ...); gen.writeEndObject() -- every field is written directly to the
    output stream one token at a time, with no intermediate tree or object
    graph held in memory. This differs from 02's raw ObjectNode.put() calls
    inline in FogApp (tree-model tier), 04's private DigestPayload record
    serialized via writeValueAsString (data-binding tier), 07's JsonBuilder
    fluent wrapper around ObjectNode (tree-model tier), and 08's public
    @JsonPropertyOrder-annotated DTOs serialized via writeValueAsString
    (data-binding tier) -- this project is the only one using Jackson's
    streaming tier.
  - HTTP routing goes through PathDispatcher, a single class registered
    once via HttpServer.createContext("/", dispatcher) in both fog/ and
    dashboard/. Every request lands on the same dispatcher and is matched
    at request time against an ordered List<(Predicate<String> pathMatcher,
    HttpHandler handler)>, rather than registering one createContext call
    per route at startup. This differs from 02 (fully inline in main(), no
    reusable class, and no error boundary at all), 04's RouteServer (a
    fluent builder that accumulates routes into a Map first, then wires
    them to createContext inside start()), 07's Router (a fluent builder
    that wires each route to createContext immediately inline), and 08's
    Route enum (iterated once via values() in a wireAll() method, one
    createContext call per constant) -- in this project there is exactly
    one registered context, and routing is a per-request runtime decision.
    Every dispatch in PathDispatcher.handle() is wrapped in a try/catch
    translating any uncaught exception into a structured 500 JSON response.
  - backend/processor/PondHandler processes each SQS batch's records
    concurrently: records.stream().map(r -> CompletableFuture.supplyAsync(
    () -> attemptWrite(r, dynamo, table), executor)).collect(toList()),
    then joins every future and folds the results into an immutable Tally
    via Stream.reduce, using a small bounded ExecutorService (fixed pool,
    shut down after the batch). This differs from 02's Handler (throws on
    the first record failure inside a for-loop, aborting the batch early),
    04's Handler (Collectors.partitioningBy over a sequential stream into
    an immutable Result record), 07's FleetHandler (a mutable BatchTally
    accumulated in a plain for-loop), and 08's StoreHandler (an immutable
    Tally folded via a sequential Stream.reduce) -- this project is the
    only one where the DynamoDB writes for one batch genuinely run in
    parallel, while still keeping attempt-all-then-report-once semantics:
    every record is attempted regardless of any other record's outcome, and
    the Lambda only throws (triggering an SQS retry of the whole batch)
    after every future has been joined.

LAYOUT
------
  sensors/            PondSensorUnit.java (sensor simulator), one container
                       per sensor type/pond, using a RandomWalk helper for
                       the bounded drift
  fog/                PondGateway.java (plain JDK HTTP server): ingest via
                       ConcurrentHashMap.merge() (ReadingAccumulator), window,
                       aggregate (WindowAggregate), alert (Rule/PondAlerts),
                       publish to SQS (QueuePublisher), plus a /thresholds
                       endpoint (StreamingJson) and request-time routing
                       (PathDispatcher)
  backend/processor/  RecordMapper.java (pure transform building the
                       sort_key) + Tally.java (immutable batch outcome) +
                       PondHandler.java (Lambda entry point, concurrent
                       per-record writes via CompletableFuture) +
                       deploy_lambda.sh (packages the shaded JAR and
                       registers an SQS event source mapping)
  backend/dashboard/  PondDashboardApp.java + PondRepository.java (DynamoDB
                       queries, per-pond grouping) + PipelineChecks.java
                       (health/queue-depth checks) + ThresholdsGateway.java
                       (testable thresholds proxy) + PathDispatcher.java
                       (shared request-time routing), serving a deliberately
                       plain aqua/teal theme: each pond is an ordinary card
                       listing its 5 metrics as rows, each against a native
                       <meter> bar (no custom-drawn graphics), plus per-metric
                       trend charts underneath
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)
  Python 3.12+ with boto3 installed (only for infra/burst.py and
                 infra/verify_pipeline.py, kept as language-neutral ops
                 tooling): pip install boto3

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8088
  LocalStack: http://localhost:4574

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
-----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog gateway

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Or probe the dashboard's own REST API directly:
  curl http://localhost:8088/api/health
  curl http://localhost:8088/api/backend-stats
  curl http://localhost:8088/api/ponds
  curl "http://localhost:8088/api/readings?sensor_type=dissolved_oxygen_mgl&limit=10"
  curl http://localhost:8088/api/thresholds

RUN THE TESTS
-------------
Each Maven module has its own test suite (JUnit 5, hand-written fakes
implementing the real AWS SDK v2 client interfaces, no Mockito, no calls
to real AWS/LocalStack):
  cd sensors && mvn test
  cd fog && mvn test
  cd backend/processor && mvn test
  cd backend/dashboard && mvn test

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

Test coverage highlights:
  - RandomWalkTest / PondSensorUnitTest: bounded drift, JSON payload shape,
    all 5 sensor profiles registered
  - WindowAggregateTest: count/min/max/avg/latest aggregation math
  - PondAlertsTest / RuleTest: the fluent Rule DSL builds correct metadata
    and predicates, boundary behaviour (exactly-at-limit does not fire),
    per-sensor-type rule lookup, both ph_level rules coexisting
  - ReadingAccumulatorTest: immutable combine() correctness, plus a
    concurrent stress test hammering ConcurrentHashMap.merge() from 64
    threads to prove no readings are lost to a race
  - IngestPayloadTest: input validation rejecting missing/malformed fields
  - StreamingJsonTest: streamed JSON output for aggregates, thresholds,
    status/accepted/error helpers
  - PondGatewayTest: ingest/flush per (sensor_type, site_id) bucket,
    distinct ponds stay isolated, empty buckets are skipped, /thresholds
    JSON exposes the real rules
  - PondGatewayHttpTest: /ingest exercised over a real HttpServer on an
    ephemeral port -- proves the 400 response for a non-JSON body, a
    missing sensor_type, a non-array readings field, and a reading missing
    a numeric value is a real HTTP status code, not just IngestPayload.parse
    throwing in isolation; also proves a valid payload gets a real 202
  - PathDispatcherTest (fog and dashboard): request-time path matching,
    404 on no match, and the try/catch error boundary translating an
    uncaught handler exception into a 500 JSON response
  - RecordMapperTest: sort_key construction (window_end#site_id) and its
    disambiguation of two ponds in the same flush cycle
  - TallyTest / PondHandlerTest: immutable Tally combine() correctness,
    concurrent CompletableFuture batch processing, partial-failure
    tallying without aborting the batch early or losing any record
  - PondRepositoryTest: chronological ordering, per-pond grouping with
    distinct per-pond values, sensor types with no data omitted
  - PipelineChecksTest: queue/lambda reachability, queue depth parsing,
    item count
  - PondDashboardAppTest: query-string parsing, content-type resolution
  - ThresholdsGatewayTest: the dashboard's /api/thresholds proxy fetch
    against a real local HttpServer, covering both a successful upstream
    response (body passed through) and an unreachable upstream (throws,
    which PondDashboardApp.handleThresholds converts into a 502)

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via
LocalStack, the sort_key disambiguation scheme window_end#site_id, the
dashboard health-check pattern, the dual-rate SAMPLE_INTERVAL/
DISPATCH_INTERVAL sensor knobs) is a design pattern shared across this
portfolio repository (projects 01 through 08), not built entirely from
scratch for this project. It belongs to the main portfolio owner and, in
three cases, other individually attributed students -- project 01:
Kondragunta Lakshmi Chaitanya, X25171216; project 06: Vishvaksen Machana,
X25173421; project 07: Goutham Uppu, X25167936 -- not this student's own
prior work. The implementation is an independent Java program: no source
files, classes, or business logic were copied across projects, and (see
LAYOUT/overview notes above) it also does not mirror any of the other Java
projects' internal structure -- concurrency, alert-rule representation,
JSON handling, HTTP routing, and processor batch-handling were all
deliberately built as distinct designs, cited class-by-class above.
Domain-specific code (pond sensor profiles, water-quality/feed thresholds)
and the entire dashboard (aqua/teal theme, pond-map primary view,
per-metric trend charts) are original to this project. Third-party open-source components used as standard
libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://github.com/aws/aws-sdk-java-v2
  - AWS Lambda Java Core/Events (com.amazonaws: aws-lambda-java-core,
    aws-lambda-java-events) - https://github.com/aws/aws-lambda-java-libs
  - Jackson (streaming JsonFactory/JsonGenerator in fog/, databind
    ObjectMapper/JsonNode elsewhere) -
    https://github.com/FasterXML/jackson
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied unmodified from an earlier
    project in this portfolio) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - JUnit 5 (test suite) - https://junit.org/junit5
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway
(PondDashboardApp.handleThresholds), but the frontend (dashboard.js) does
not call it -- alert display names are rendered from a local display-text
map (ALERT_LABELS) instead. The endpoint is kept for API completeness and
possible future use, but is not claimed as a frontend feature. The proxy
fetch itself (ThresholdsGateway.fetch) is unit tested (see RUN THE TESTS)
against a real local HttpServer covering both the success and
unreachable-upstream paths.

PHASE 2 NOTE
------------
This project targets LocalStack only. Deployment to real AWS/Azure is a
deliberately deferred phase-2 item for the whole portfolio and is not
attempted or claimed here.
