Public Transit Fleet Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/16-public-transit-fleet-monitoring/), not the repo root.

OVERVIEW
--------
A city transit authority monitors a bus fleet split across two depots
(depot-a, depot-b). Five sensors per depot -- engine temperature, brake pad
wear, passenger count, fuel level, and GPS speed -- feed a fog gateway. The
gateway windows and aggregates each (sensor_type, site_id) pair's readings,
evaluates real fleet threshold rules, and dispatches one aggregate per
window to a queue. An AWS Lambda function (running inside LocalStack)
consumes the queue and stores records; a web dashboard renders each depot as
a roster of plain cards, one card per vehicle/sensor type, summarizing that
depot's whole fleet for that metric against a native <meter> bar.

This is the sixth Java implementation in this CA portfolio, alongside
02-industrial-equipment, 04-smart-city, 07-warehouse-robotics-fleet,
08-retail-footfall-inventory, and 09-aquaculture-fish-farm. It deliberately
does not share internal structure with any of them on the five axes the
lead engineer flagged as needing genuine differentiation:

  - fog/ buffering (IntakeQueue.java) is a flat ConcurrentLinkedQueue<
    ReadingEvent> -- ingest() does exactly one lock-free queue.offer() per
    reading and returns. There is no per-(sensor_type, site_id) map, no
    per-key lock, and no dedicated worker thread at ingest time at all.
    Readings are only ever grouped by key during the flush cycle, when
    IntakeQueue.drainAndGroup() polls the whole queue empty and folds
    events into buckets in one single-threaded pass. This differs from
    02's FogApp (a shared HashMap guarded by one synchronized(lock)
    block), 04's CityFogNode (a ConcurrentHashMap-of-generations fenced
    with AtomicReference/AtomicInteger/AtomicBoolean so a flush can retire
    a generation without losing an in-flight write), 07's FleetGateway (a
    ConcurrentHashMap sharded into per-key ReentrantLock-guarded
    BufferBucket objects), 08's BufferActor (a single dedicated thread
    draining a LinkedBlockingQueue mailbox), and 09's PondGateway
    (ConcurrentHashMap.merge() with an immutable ReadingAccumulator) --
    none of those keep a per-key structure this class deliberately avoids
    until a flush actually happens.
  - Alert rules (Rule.java, TransitAlerts.java) are a flat List<Rule> of
    plain records, each carrying its own Predicate<WindowAggregate> built
    once via a static factory (Rule.avgAbove/avgBelow/maxAbove), evaluated
    with a stream pipeline: RULES.stream().filter(sensorType
    match).filter(predicate).map(Rule::key).toList(). This differs from
    02's Alerts and 04's IncidentRules (both a declarative Map/List of
    rule metadata evaluated through a separate switch -- 04's switch cases
    are hand-duplicated from the table rather than data-driven), 07's
    AlertRule (a sealed interface with AboveLimit/BelowLimit record
    variants evaluated polymorphically via firesOn()), 08's AlertRule (an
    enum implementing Predicate<WindowAggregate> with a per-constant
    overridden body), and 09's Rule (a multi-stage fluent builder DSL --
    SensorStage -> FieldStage -> ComparisonStage -- evaluated with a plain
    for-loop). Here a single flat record type carries the predicate field
    directly, and TransitAlerts.evaluate() reads as one stream pipeline.
  - SQS dispatch (TransitPublisher.java) implements AutoCloseable, with a
    real close() that shuts the underlying SqsClient down. This differs
    from every other fog publisher in the portfolio -- 02's QueueRelay,
    04's RelayClient, 07's RelayPublisher, 08's QueuePublisher, and 09's
    QueuePublisher are all plain instance classes that build an SqsClient
    in their constructor and never release it. main() in this project
    keeps one TransitPublisher open for the container's entire lifetime
    deliberately (the process only ever exits by being killed), but this
    is the shape a try-with-resources caller would actually use it in.
  - HTTP routing (TransitGateway.java) is a single
    HttpServer.createContext("/", gateway::route) registration whose
    route() method resolves the request with a literal if/else if chain
    over exchange.getRequestURI().getPath() -- no route table, no
    predicate list, and no per-path createContext call beyond the root
    one. This differs from 02 (each route wired with its own createContext
    call directly in main(), no shared error boundary), 04's RouteServer
    and 07's Router (both fluent builders that still register one
    createContext per route -- accumulate-then-wire, or wire-immediately),
    08's Route enum (iterates values() once at startup to register one
    createContext per constant), and 09's PathDispatcher (matches an
    ordered List<(Predicate<String>, HttpHandler)> at request time). Here
    there is exactly one registered context, and the routing decision
    inside it is nothing more than a sequence of if/else if string
    comparisons.
  - sensors/ scheduling (TransitSensorUnit.java) uses two independent
    java.util.Timer instances (one per TimerTask), each with its own
    dedicated background thread driven by scheduleAtFixedRate -- so a slow
    dispatch POST can never delay the next sample tick, and vice versa.
    This differs from 02's Sensor and 07/08/09's *Unit classes (all drive
    sampling and dispatch from a single Thread.sleep loop -- 02 sleeps once
    per sample and checks the dispatch deadline inline; 07/08/09 poll two
    "next fire" deadlines and sleep in small increments) and 04's
    MetricSensor (a 2-thread ScheduledExecutorService). Here there is no
    manual deadline bookkeeping and no thread pool -- java.util.Timer
    itself owns each schedule.

LAYOUT
------
  sensors/            TransitSensorUnit.java (sensor simulator), one
                       container per sensor type/depot, using a RandomWalk
                       helper for the bounded drift and two java.util.Timer
                       instances for independent sample/dispatch scheduling
  fog/                TransitGateway.java (plain JDK HTTP server, if/else
                       routing): ingest via IntakeQueue (ConcurrentLinkedQueue
                       of ReadingEvent), window, aggregate (WindowAggregate),
                       alert (Rule/TransitAlerts, stream-evaluated), publish
                       to SQS (TransitPublisher, AutoCloseable), plus a
                       /thresholds endpoint
  backend/processor/  RecordMapper.java (pure transform building the
                       sort_key) + TransitHandler.java (Lambda entry point)
                       + deploy_lambda.sh (packages the shaded JAR and
                       registers an SQS event source mapping)
  backend/dashboard/  TransitDashboardApp.java + DepotRepository.java
                       (DynamoDB queries, per-depot grouping) +
                       PipelineChecks.java (health/queue-depth checks) +
                       ThresholdsGateway.java (testable thresholds proxy),
                       serving a deep transit-authority navy theme with a
                       safety-orange accent: each depot is a section of
                       plain cards, one card per vehicle/sensor type,
                       summarizing that depot's fleet for that metric
                       against a native <meter> bar (no custom-drawn
                       graphics), plus per-metric trend charts underneath
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

  Dashboard:  http://localhost:8095
  LocalStack: http://localhost:4581

  Stop:  docker compose -f infra/docker-compose.yml down -v

TEARDOWN NOTE: `docker compose down -v` can leave behind a LocalStack-
spawned Lambda-executor sibling container (named like
ptf-localstack-1-lambda-ptf-processor-<hash>) and the network it is
attached to, which blocks the network's removal. If `down -v` reports
"Network ptf_default Resource is still in use", check for it and clean
up explicitly:
  docker ps -a --filter "name=ptf"
  docker network ls --filter "name=ptf"
  docker rm -f <the lambda-executor container name>
  docker network rm ptf_default

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
  curl http://localhost:8095/api/health
  curl http://localhost:8095/api/backend-stats
  curl http://localhost:8095/api/depots
  curl "http://localhost:8095/api/readings?sensor_type=engine_temp_c&limit=10"
  curl http://localhost:8095/api/thresholds

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

Test coverage highlights (130 tests total: sensors 57, fog 46, processor 10,
dashboard 17 -- run yourself with the commands above for exact counts):
  - RandomWalkTest / TransitSensorUnitTest: bounded drift, JSON payload
    shape, all 5 sensor profiles registered with a unit and an in-range
    start value
  - WindowAggregateTest: count/min/max/avg/latest aggregation math,
    latest-is-last-in-order (not max), avg rounded to 3 decimals
  - RuleTest: avgAbove/avgBelow/maxAbove boundary behaviour (exactly-at-
    limit does not fire), maxAbove reads the window max not the average
  - TransitAlertsTest: all four real threshold rules (engine_overheat_risk,
    brake_service_required, low_fuel_warning, overcrowding_alert) fire at
    the exact documented boundaries; gps_speed_kmh never fires and is
    absent from forSensorType()
  - IntakeQueueTest: grouping by (sensor_type, site_id), distinct depots
    and distinct sensor types stay isolated, drain empties the queue, a
    group preserves arrival order, and a 32-thread/200-reading-per-thread
    concurrent stress test proving no reading is lost to a race on offer()
  - IngestPayloadTest: input validation rejecting a non-object body, a
    missing/blank sensor_type, a non-array readings field, a missing
    readings field, and a reading missing a numeric value
  - TransitGatewayTest: ingest/flush per (sensor_type, site_id) group,
    distinct depots stay isolated, empty intake produces no aggregates,
    /thresholds JSON exposes the real rules grouped by sensor type and
    omits gps_speed_kmh, toPayload() includes every required field
  - TransitGatewayHttpTest: the real if/else routing chain and /ingest
    exercised over a real HttpServer on an ephemeral port -- proves /health,
    /thresholds, 404 on an unknown path, 405 on the wrong method, and the
    400 response for a non-JSON body, a missing sensor_type, a non-array
    readings field, and a reading missing a numeric value are real HTTP
    status codes, not just IngestPayload.parse throwing in isolation; also
    proves a valid payload gets a real 202
  - RecordMapperTest: sort_key construction (window_end#site_id) and its
    disambiguation of two depots in the same flush cycle, missing site_id
    defaults to depot-a, missing alerts produces an empty list
  - TransitHandlerTest: batch writes succeed and are tallied, an empty
    batch touches DynamoDB not at all, a write failure and a malformed
    message both throw (so the SQS event source mapping retries the whole
    batch)
  - DepotRepositoryTest: chronological ordering, per-depot grouping with
    distinct per-depot values, sensor types with no data omitted
  - PipelineChecksTest: queue/lambda reachability, queue depth parsing,
    item count
  - TransitDashboardAppTest: query-string parsing, content-type resolution
  - ThresholdsGatewayTest: the dashboard's /api/thresholds proxy fetch
    against a real local HttpServer, covering both a successful upstream
    response (body passed through) and an unreachable upstream (throws,
    which TransitDashboardApp.handleThresholds converts into a 502)

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
projects earlier in this same CA submission (01 through 09), not a prior
or external coursework project. The implementation is an independent Java
program: no source files, classes, or business logic were copied across
projects, and (see LAYOUT/overview notes above) it also does not mirror
any of the other five Java projects' (02, 04, 07, 08, 09) internal
structure on the five differentiated axes -- buffering, alert-rule
representation, SQS publisher shape, HTTP routing, and sensor-loop
scheduling were all deliberately built as distinct designs, cited
class-by-class above and verified by reading each named sibling's current
source before writing this section. RecordMapper.java's sort_key formula
and TransitHandler.java's per-record for-loop batch handling follow the
same simple shape as 02's Handler/Reshape (not one of the five mandated
differentiation axes for this project); this is a deliberate simplicity
choice, not an oversight. Domain-specific code (bus telemetry sensor
profiles, transit fleet thresholds) and the entire dashboard (navy/
safety-orange theme, per-depot card-per-vehicle-type layout) are original
to this project. Third-party open-source components used as standard
libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://github.com/aws/aws-sdk-java-v2
  - AWS Lambda Java Core/Events (com.amazonaws: aws-lambda-java-core,
    aws-lambda-java-events) - https://github.com/aws/aws-lambda-java-libs
  - Jackson (databind ObjectMapper/JsonNode/ObjectNode throughout) -
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
(TransitDashboardApp.handleThresholds), but the frontend (dashboard.js)
does not call it -- alert display names are rendered from a local
display-text map (ALERT_LABELS) instead. The endpoint is kept for API
completeness and possible future use, but is not claimed as a frontend
feature. The proxy fetch itself (ThresholdsGateway.fetch) is unit tested
(see RUN THE TESTS) against a real local HttpServer covering both the
success and unreachable-upstream paths.

PHASE 2 NOTE
------------
This project targets LocalStack only. Deployment to real AWS/Azure is a
deliberately deferred phase-2 item for the whole portfolio and is not
attempted or claimed here.
