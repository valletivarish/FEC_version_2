Warehouse Robotics Fleet Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/07-warehouse-robotics-fleet/), not the repo root.

OVERVIEW
--------
A fleet of autonomous mobile robots (AMRs) works two warehouse zones
(zone-a, zone-b). Five onboard sensors per robot -- battery level, payload
weight, motor temperature, position drift, and task queue depth -- feed a
fog gateway. The gateway windows and aggregates each (sensor_type, site_id)
pair's readings, evaluates fleet-health threshold rules, and dispatches one
aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders
a compact "fleet roster" -- one row per robot/metric with an inline
sparkline and an LED status indicator -- plus a detail panel for the
selected or most-critical robot.

This is the third Java implementation in this CA portfolio, alongside
02-industrial-equipment and 04-smart-city. It deliberately does not share
internal structure with either:
  - fog/: buffering uses a ConcurrentHashMap of per-key BufferBucket
    objects, each guarded by its own ReentrantLock (RobotKey -> BufferBucket),
    so ingest on one robot never blocks ingest on another and no
    lock-free/generation scheme is involved. This differs from both
    02's FogApp (single synchronized(lock) around one shared HashMap)
    and 04's CityFogNode (fenced lock-free ConcurrentHashMap-of-generations
    scheme).
  - Alert rules are a sealed interface (AlertRule, permitting AboveLimit
    and BelowLimit record variants), each carrying its own field extractor
    and firesOn(WindowAggregate) predicate. This differs from 02's Alerts
    (a Map<String,List<Rule>> table that both declares and evaluates rules
    via a shared field-name switch) and from 04's IncidentRules (a
    declarative RULE_CATALOG plus a wholly separate switch-expression
    assess() method). FleetAlerts here still exposes a
    Map<String,List<AlertRule>> table, but only as descriptive metadata
    for /thresholds -- evaluation walks the sealed rule objects themselves.
  - JSON is built through JsonBuilder, a small fluent wrapper around
    Jackson's ObjectNode (field/stringArray methods returning `this`).
    This differs from 02's raw ObjectNode manipulation in FogApp and from
    04's private DigestPayload record serialized via
    JSON.writeValueAsString.
  - HTTP routing goes through Router, which binds handlers directly onto
    a JDK HttpServer via bind(port, threads).handle(path, handler)...
    listen(), with a shared error boundary baked into handle(). This is
    a fluent builder like 04's RouteServer, but implemented independently
    (no intermediate route map is inspected before registration; handlers
    are wrapped and attached to the server context in the same call).
    02 instead builds the server directly inline in main() with no
    reusable class at all.
  - backend/dashboard/FleetDashboardApp uses instance fields (not static
    singletons like both 02's DashboardApp and 04's CityDashboardApp) for
    its lazily-built AWS clients, each behind its own `synchronized`
    accessor method, with routes registered from a Map<String,HttpHandler>
    built in routes() and looped over in start().
  - sensors/RobotUnit runs a single loop tracking two independent
    "next fire" timestamps (sampling, dispatching) computed from
    System.currentTimeMillis(), rather than 02's blocking
    while(true)+Thread.sleep single-purpose loop or 04's two independent
    ScheduledExecutorService tasks guarding a shared buffer with
    synchronized(buffer).
  - backend/processor/FleetHandler collects a BatchTally (written count +
    error list) across all SQS records in a plain for-loop, then throws
    only after the whole batch has been attempted -- distinct from 02's
    Handler (throws on the first failure via a shared RuntimeException,
    stopping the batch early) and from 04's Handler (Collectors
    .partitioningBy over a stream into a Result record).

LAYOUT
------
  sensors/            RobotUnit.java (sensor simulator), one container per
                       sensor type/zone, using a RandomWalk helper for the
                       bounded drift
  fog/                FleetGateway.java (plain JDK HTTP server): ingest,
                       window, aggregate (WindowAggregate), alert
                       (AlertRule/FleetAlerts), publish to SQS
                       (RelayPublisher), plus a /thresholds endpoint
  backend/processor/  RecordMapper.java (pure transform building the
                       sort_key) + FleetHandler.java (Lambda entry point)
                       + deploy_lambda.sh (packages the shaded JAR and
                       registers an SQS event source mapping)
  backend/dashboard/  FleetDashboardApp.java + FleetRepository.java
                       (DynamoDB queries, fleet-roster grouping) +
                       PipelineChecks.java (health/queue-depth checks),
                       serving a dark orange-and-black fleet-ops HUD:
                       a roster table (one row per robot/metric, inline
                       sparkline, LED indicator) as the primary view, and
                       a detail panel below for the selected/most-critical
                       robot showing all 5 metrics in full
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

  Dashboard:  http://localhost:8086
  LocalStack: http://localhost:4572

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog gateway

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Or probe the dashboard's own REST API directly:
  curl http://localhost:8086/api/health
  curl http://localhost:8086/api/backend-stats
  curl http://localhost:8086/api/fleet
  curl "http://localhost:8086/api/readings?sensor_type=motor_temp_c&limit=10"
  curl http://localhost:8086/api/thresholds

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
  - RandomWalkTest / RobotUnitTest: bounded drift, JSON payload shape
  - WindowAggregateTest: count/min/max/avg/latest aggregation math
  - AlertRuleTest / FleetAlertsTest: sealed alert-rule evaluation,
    boundary behaviour (e.g. exactly-at-limit does not fire)
  - FleetGatewayTest: per-key ingest buffering, window flush/clear,
    multi-zone isolation, alert-inclusive JSON payload building
  - RecordMapperTest: sort_key construction (window_end#site_id) and its
    disambiguation of two sites in the same flush cycle
  - FleetHandlerTest: batch processing, partial-failure tallying without
    aborting the batch early
  - FleetRepositoryTest: chronological ordering, per-site roster grouping,
    sparkline trail construction
  - PipelineChecksTest: queue/lambda reachability, queue depth parsing,
    item count
  - FleetDashboardAppTest: query-string parsing, content-type resolution
  - ThresholdsGatewayTest: the dashboard's /api/thresholds proxy fetch
    against a real local HttpServer, covering both a successful upstream
    response (body passed through) and an unreachable upstream (throws,
    which FleetDashboardApp.handleThresholds converts into a 502)

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL
sensor knobs) is adapted from this student's own prior projects earlier in
this same CA submission (01 through 06), not a prior/external coursework
project. The implementation is an independent Java program, not a port of
any of them: no source files, classes, or business logic were copied
across projects, and (see TECH STACK notes above) it also does not mirror
either of the other two Java projects' (02, 04) internal structure --
concurrency, alert-rule representation, JSON handling, and HTTP routing
were all deliberately built as distinct designs. Domain-specific code
(AMR sensor profiles, fleet-health thresholds) and the entire dashboard
(dark orange-and-black HUD theme, fleet-roster table with inline
sparklines and LED indicators, detail panel) are original to this project.
Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://github.com/aws/aws-sdk-java-v2
  - AWS Lambda Java Core/Events (com.amazonaws: aws-lambda-java-core,
    aws-lambda-java-events) - https://github.com/aws/aws-lambda-java-libs
  - Jackson Databind (JSON parsing/serialization) -
    https://github.com/FasterXML/jackson
  - Chart.js (dashboard sparklines, vendored at
    backend/dashboard/static/vendor/, copied unmodified from an earlier
    project in this portfolio) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - JUnit 5 (test suite) - https://junit.org/junit5
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway
(FleetDashboardApp.handleThresholds), but the frontend (dashboard.js) does
not call it -- alert display names are rendered from a local display-text
map (ALERT_LABELS) instead. The endpoint is kept for API completeness and
possible future use, but is not claimed as a frontend feature. The proxy
fetch itself (ThresholdsGateway.fetch) is unit tested (see RUN THE TESTS)
against a real local HttpServer covering both the success and
unreachable-upstream paths.
