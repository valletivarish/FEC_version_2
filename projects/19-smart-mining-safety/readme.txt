Smart Mining Safety & Environmental Monitoring
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

ATTRIBUTION
------------
This project is Jaipal Kasireddy's individual CA submission, Student ID
X25156381, National College of Ireland. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

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

Implemented in plain JDK HttpServer (com.sun.net.httpserver), no framework
(e.g. Spring).

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
                       DANGER status tile per shaft (the primary view),
                       five plain reading rows per shaft with native
                       <meter> bars, and
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
  cd fog && mvn test                      (47 tests)
  cd backend/processor && mvn test        (8 tests)
  cd backend/dashboard && mvn test        (30 tests)

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

All 90 tests pass. Notable coverage: MineFogNodeHttpTest and
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
Computed per shaft by the dashboard backend:
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
Reused: the overall pipeline shape (sensors -> fog windowing/aggregation/
alerting -> queue -> FaaS processor -> datastore -> dashboard), a design
pattern shared across this portfolio repository (projects 01-18). It
belongs to the main portfolio owner and, in two cases, other individually-
attributed students -- project 01: Kondragunta Lakshmi Chaitanya,
X25171216; project 15: Nithin, X25125338 -- not this student's own prior
work. (See the project report's architecture section for a comparison
against this portfolio's other Java projects.)

Original to this project: the code itself (fog buffering, alert-rule
representation, SQS publisher, HTTP routing, sensor-loop scheduling), all
domain-specific logic (sensor types, thresholds, the SAFE/CAUTION/DANGER
classification), and the entire dashboard UI.

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

REAL AWS DEPLOYMENT
--------------------
Account 639210843493, us-east-1.

ARCHITECTURE: the dashboard API runs as an AWS Lambda function behind an
API Gateway REST API. EC2 runs the fog gateway and the ten sensor
containers (no LocalStack).

LIVE RESOURCES (account 639210843493, us-east-1): DynamoDB table
msm-readings, SQS queue msm-shaft-agg, Lambda msm-processor
(SQS-triggered ingestion) and Lambda msm-dashboard-api (behind API
Gateway REST API abkr6m4y99), EC2 instance i-0375e6d48f131629c (tagged
msm-fog-host, runs the fog node + ten sensor containers, security group
sg-0ca1a43089cff9bd7 allows only inbound TCP 8000, no SSH -- administered
via SSM only), Elastic IP 3.212.203.181 (allocation
eipalloc-03210b0f17e97b25f, associated with that instance), S3 bucket
msm-frontend-639210843493 (static dashboard frontend, public read-only,
static website hosting enabled) and S3 staging bucket
msm-deploy-639210843493. All are prefixed msm-. The dashboard Lambda's
FOG_HEALTH_URL/FOG_THRESHOLDS_URL env vars point at this Elastic IP; if
it is ever released and reallocated, they need updating.

Live URLs: dashboard at
https://msm-frontend-639210843493.s3.us-east-1.amazonaws.com/index.html,
its API at https://abkr6m4y99.execute-api.us-east-1.amazonaws.com/prod.
The dashboard and its API are fully serverless (S3 + Lambda + API
Gateway) and do not depend on the EC2 instance being up; only
/api/health's gateway field and fresh sensor data depend on the fog node
and sensors running on EC2.
