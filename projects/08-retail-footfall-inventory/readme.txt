Retail Footfall & Inventory Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/08-retail-footfall-inventory/), not the repo root.

OVERVIEW
--------
A retail chain monitors footfall, stock, and environmental conditions
across two stores (store-1, store-2). Five sensors per store -- footfall
count, shelf stock percentage, fridge temperature, checkout queue length,
and energy draw -- feed a fog gateway. The gateway windows and aggregates
each (sensor_type, site_id) pair's readings, evaluates retail-health
threshold rules, and dispatches one aggregate per window to a queue. An AWS
Lambda function (running inside LocalStack) consumes the queue and stores
records; a web dashboard renders a KPI-tile-first view (total footfall,
stores understocked, average queue length, total energy draw, all computed
live from the stored aggregates) followed by a per-store detail section and
trend charts.

This is the fourth Java implementation in this CA portfolio, alongside
02-industrial-equipment, 04-smart-city, and 07-warehouse-robotics-fleet. It
deliberately does not share internal structure with any of them:
  - fog/ buffering uses a single dedicated actor thread (BufferActor)
    draining a LinkedBlockingQueue<IngestEvent> mailbox. HTTP handler
    threads never touch the buffer map (a plain HashMap<SensorKey,
    List<Double>>) directly -- they just call enqueue(), which adds an
    IngestEvent.Ingest to the queue and returns. Only the actor's own
    worker thread (runLoop -> handle) ever mutates the map, so there is no
    shared-map locking, no ConcurrentHashMap, and no atomic/fence anywhere
    in this class -- contention is structurally impossible rather than
    merely well-guarded. A flush is itself just another mailbox message
    (IngestEvent.Drain, carrying a CompletableFuture<BufferSnapshot>), so
    it is serialized against ingests purely by the queue's FIFO order.
    This differs from 02's FogApp (single synchronized(lock) around one
    shared HashMap), 04's CityFogNode (fenced lock-free
    ConcurrentHashMap-of-generations scheme with AtomicReference/
    AtomicInteger/AtomicBoolean), and 07's FleetGateway (ConcurrentHashMap
    of per-key BufferBucket objects, each guarded by its own
    ReentrantLock).
  - Alert rules are an enum implementing a functional interface:
    AlertRule implements Predicate<WindowAggregate>, with each constant
    (RESTOCK_NEEDED, COLD_CHAIN_RISK, CHECKOUT_CONGESTION,
    CAPACITY_WARNING) supplying its own test(WindowAggregate) lambda body
    plus the sensor type/field/op/limit/key metadata it carries. Adding a
    rule means adding a constant, not touching a shared evaluator. This
    differs from 02's Alerts (a Map<String,List<Rule>> table evaluated via
    a field-name switch), 04's IncidentRules (a declarative RULE_CATALOG
    map plus a wholly separate hardcoded switch-expression assess()
    method), and 07's AlertRule (a sealed interface with AboveLimit/
    BelowLimit record variants and a polymorphic firesOn() method).
  - JSON is built through public, @JsonPropertyOrder-annotated DTO classes
    (AggregatePayload, ThresholdDescription) serialized directly via
    objectMapper.writeValueAsString(...) -- there is no ObjectNode
    tree-building anywhere in this module. This differs from 02's raw
    inline ObjectNode.put() calls in FogApp, 04's private DigestPayload
    record serialized the same way (this project's DTOs are public,
    reusable, field-order-pinned classes rather than a private inner
    record used once), and 07's JsonBuilder fluent wrapper around
    ObjectNode.
  - HTTP routing goes through Route, an enum listing every endpoint
    (HEALTH, THRESHOLDS, INGEST) with its handler as a lambda/method
    reference field, iterated once in wireAll() at startup and wired
    straight onto the HttpServer with a shared try/catch error boundary
    (guarded()) translating any uncaught exception into a structured
    500 JSON response. The dashboard's DashboardRoute enum mirrors this
    same shape for its own seven endpoints. This differs from 02 (fully
    inline in main(), no reusable class, and notably NO error boundary at
    all around any handler), 04's RouteServer (a fluent builder that
    accumulates routes into a Map first, only wiring them to createContext
    inside start()), and 07's Router (a fluent builder that wires each
    route to createContext immediately inside handle(), no map at all).
  - backend/processor/StoreHandler collects a Tally (an immutable record
    of written-count + failure-reason list) via records.stream().map(...)
    .reduce(Tally.EMPTY, Tally::combine) -- attempt-all-then-throw-once,
    folded as an immutable value over the batch rather than mutated in a
    loop. This differs from 02's Handler (throws on the first record
    failure inside a for-loop, aborting the batch early), 04's Handler
    (Collectors.partitioningBy over a stream into an immutable Result
    record), and 07's FleetHandler (a mutable BatchTally object
    accumulated in a plain for-loop).

LAYOUT
------
  sensors/            StoreSensorUnit.java (sensor simulator), one
                       container per sensor type/store, using a
                       RandomWalk helper for the bounded drift
  fog/                StoreGateway.java (plain JDK HTTP server): ingest via
                       BufferActor, window, aggregate (WindowAggregate),
                       alert (AlertRule), publish to SQS (QueuePublisher),
                       plus a /thresholds endpoint (ThresholdDescription)
  backend/processor/  RecordMapper.java (pure transform building the
                       sort_key) + Tally.java (Stream.reduce accumulator)
                       + StoreHandler.java (Lambda entry point) +
                       deploy_lambda.sh (packages the shaded JAR and
                       registers an SQS event source mapping)
  backend/dashboard/  StoreDashboardApp.java + StoreRepository.java
                       (DynamoDB queries, per-store grouping) +
                       PipelineChecks.java (health/queue-depth checks) +
                       ThresholdsGateway.java (testable thresholds proxy),
                       serving a bright commercial retail-analytics theme
                       (white background, lime-green + burnt-orange
                       accents): a row of live-computed KPI tiles (total
                       footfall, stores understocked, avg queue length,
                       total energy draw) as the primary view, a per-store
                       detail card section below, and per-metric trend
                       charts underneath
  infra/              docker-compose stack + LocalStack bootstrap
  loadtest/           queue burst generator (scalability evidence)
  scripts/            end-to-end pipeline verification

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)
  Python 3.12+ with boto3 installed (only for loadtest/burst.py and
                 scripts/verify_pipeline.py, kept as language-neutral ops
                 tooling): pip install boto3

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8087
  LocalStack: http://localhost:4573

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
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

Or probe the dashboard's own REST API directly:
  curl http://localhost:8087/api/health
  curl http://localhost:8087/api/backend-stats
  curl http://localhost:8087/api/stores
  curl "http://localhost:8087/api/readings?sensor_type=queue_length&limit=10"
  curl http://localhost:8087/api/thresholds

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
  - RandomWalkTest / StoreSensorUnitTest: bounded drift, JSON payload shape,
    all 5 sensor profiles registered
  - WindowAggregateTest: count/min/max/avg/latest aggregation math
  - AlertRuleTest / AlertRuleEvaluateTest: per-constant predicate firing,
    boundary behaviour (exactly-at-limit does not fire), per-sensor-type
    rule lookup
  - AggregatePayloadTest: DTO JSON serialization including empty/non-empty
    alert lists
  - BufferActorTest: actor-thread ingest/drain correctness, per-key
    isolation, and that a drain only ever includes ingests enqueued
    strictly before it
  - StoreGatewayTest: /thresholds JSON exposes the real rules grouped by
    sensor type
  - RecordMapperTest: sort_key construction (window_end#site_id) and its
    disambiguation of two stores in the same flush cycle
  - TallyTest / StoreHandlerTest: Stream.reduce fold correctness, batch
    processing, partial-failure tallying without aborting the batch early
  - StoreRepositoryTest: chronological ordering, per-store grouping with
    distinct per-store values, sensor types with no data omitted
  - PipelineChecksTest: queue/lambda reachability, queue depth parsing,
    item count
  - StoreDashboardAppTest: query-string parsing, content-type resolution
  - ThresholdsGatewayTest: the dashboard's /api/thresholds proxy fetch
    against a real local HttpServer, covering both a successful upstream
    response (body passed through) and an unreachable upstream (throws,
    which StoreDashboardApp.handleThresholds converts into a 502)

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python loadtest/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via
LocalStack, the sort_key disambiguation scheme window_end#site_id, the
dashboard health-check pattern, the dual-rate SAMPLE_INTERVAL/
DISPATCH_INTERVAL sensor knobs) is adapted from this student's own prior
projects earlier in this same CA submission (01 through 07), not a prior
or external coursework project. The implementation is an independent Java
program: no source files, classes, or business logic were copied across
projects, and (see LAYOUT notes above) it also does not mirror any of the
other three Java projects' (02, 04, 07) internal structure -- concurrency,
alert-rule representation, JSON handling, HTTP routing, and processor
batch-handling were all deliberately built as distinct designs, cited
class-by-class above. Domain-specific code (retail sensor profiles,
footfall/inventory thresholds) and the entire dashboard (bright
commercial theme, KPI-tile-first primary view, per-store detail cards,
trend charts) are original to this project. Third-party open-source
components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://github.com/aws/aws-sdk-java-v2
  - AWS Lambda Java Core/Events (com.amazonaws: aws-lambda-java-core,
    aws-lambda-java-events) - https://github.com/aws/aws-lambda-java-libs
  - Jackson Databind (JSON parsing/serialization) -
    https://github.com/FasterXML/jackson
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/, copied unmodified from an earlier
    project in this portfolio) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - JUnit 5 (test suite) - https://junit.org/junit5
  - boto3 (Python AWS SDK, used only by the ops tooling in loadtest/ and
    scripts/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway
(StoreDashboardApp.handleThresholds), but the frontend (dashboard.js) does
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
