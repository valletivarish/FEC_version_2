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
one aggregate message per non-empty group to SQS. An AWS Lambda function
consumes the queue and writes to DynamoDB. A dashboard renders a
field-station LOG readout per reserve: a chronological ledger of readings
merged across all 5 sensor types, plus a compact native <meter> summary
strip and a waterhole-level trend chart.

Uses plain JDK HttpServer (com.sun.net.httpserver) rather than a framework
such as Spring. See REUSE / THIRD-PARTY below for what is shared with other
projects in this portfolio versus original to this one.

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
                       mapping; this script targets LocalStack only -- see
                       DEPLOYMENT (AWS) below for the real deployment)
  backend/dashboard/  plain-JDK HTTP server (WildlifeDashboardApp.java)
                       serving its own REST API plus the static frontend
                       (backend/dashboard/static/): a FIELD-STATION LOG
                       readout per reserve (the primary view), a compact
                       native <meter> summary strip above each log, and a
                       Chart.js
                       waterhole-level trend chart. Earthy forest-green /
                       khaki palette with a rust-orange alert accent; the
                       accent colours only the flagged log row/word, never a
                       tile or badge background. WildlifeDashboardLambda.java
                       is the real API Gateway REST API entry point used in
                       the AWS deployment below: a switch expression on
                       "METHOD path" calling straight into
                       ReserveRepository/PipelineChecks/ThresholdsGateway,
                       the same classes the HttpExchange-based routes above
                       use locally.
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
AnnotatedRouterTest exercise /ingest and the route dispatch over a real
com.sun.net.httpserver.HttpServer bound to an ephemeral port (not a unit
test of validation logic in isolation); ThresholdsGatewayTest covers both
the success path and an unreachable-upstream path for the dashboard's
fog-thresholds proxy; HabitatBufferTest includes a 16-thread
concurrent-ingest test proving the buffer never drops a reading under real
contention; PipelineChecksTest and WildlifeDashboardLambdaTest each include
a four-page (400/400/400/87 -> 1287) DynamoDB pagination test proving
items_in_table follows LastEvaluatedKey across pages instead of counting
only the first; ReservePublisherTest asserts a 23-message window batches
into SendMessageBatch calls of size 10/10/3, not 23 individual
sendMessage() calls.

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
under "metrics" plus a "log" array -- see FIELD LOG SHAPE below.

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
The dashboard's per-reserve endpoint (backend/dashboard) returns, per reserve:
  "metrics": the latest window per sensor type -- a per-site summary.
  "log":     every fetched window across ALL 5 sensor types for that
             reserve, flattened into one list and sorted by window_end
             descending (most recent first), each entry tagged with which
             sensor produced it. This is the reserve's primary structural
             view -- a chronological ledger, not a card grid or status
             line. dashboard.js renders it as a monospace log panel
             (time / sensor / reading / flag columns) styled like a
             ranger-station field notebook; a compact native <meter>
             summary strip sits above it per reserve for the current value
             of all 5 sensor types at a glance.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
Reused/adapted (not original to this student -- belongs to the main
portfolio owner, sibling projects 02, 04, 07, 08, 09, 16, 19 and 20 in this
shared repository):
  - Overall pipeline shape: sensors -> fog windowing/aggregation/alerting ->
    queue -> FaaS processor -> datastore -> dashboard
  - Sort-key disambiguation scheme for multi-site records
  - The health/thresholds-proxy pattern on the dashboard

The actual code (fog buffering, alert-rule representation, SQS publisher,
HTTP routing, sensor-loop scheduling) is an independent implementation --
see the project report's architecture section for the detailed comparison
against the siblings. Domain-specific code (sensor types, thresholds, the
field-log logic, and the entire dashboard UI) is original to this project.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson (used for /ingest parsing,
    /thresholds rendering, DynamoDB item transforms, and the fog-to-SQS
    payload via a custom StdSerializer)
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard waterhole-level trend chart, vendored at
    backend/dashboard/static/vendor/chart.umd.min.js, copied unchanged from
    project 20's frontend, never fetched from a CDN) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud

DEPLOYMENT (AWS)
-----------------
Deployed to a real AWS account: AWS Academy Learner Lab under Hrishikesh
Sajeev's own student login, account 670139527491, region us-east-1.

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
deploy time with the real API Gateway URL -- the committed version in this
repo is a placeholder with an empty apiBase, used only for local
development.

End-to-end pipeline independently verified live (/api/health all fields
true, dashboard loaded in a real browser with zero console errors and all
four alert rules firing correctly) -- see the project report's evaluation
section for full verification detail.
