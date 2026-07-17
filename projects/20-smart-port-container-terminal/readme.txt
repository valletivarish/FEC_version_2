Smart Port & Container Terminal Monitoring
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
------------
This project is Uday Kiran Reddy Dodda's individual CA submission, Student
ID X25166484, National College of Ireland. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

All commands below assume your working directory is this folder
(projects/20-smart-port-container-terminal/), not the repo root.

OVERVIEW
--------
Two container-terminal berths (berth-a and berth-b) each carry five sensor
types: crane load, container stack height, wind speed, berth occupancy,
and reefer temperature. Ten sensor containers post batched readings to a
fog HTTP node, which windows and aggregates each sensor-and-berth pair on
a fixed interval, evaluates real operational-safety thresholds, and
publishes one batched aggregate message per flush cycle to Amazon SQS. An
AWS Lambda function consumes the queue and writes to DynamoDB. A dashboard
renders a plain-text operational-status line per berth alongside the five
raw readings and a crane-load trend chart.

The stack runs on Docker with LocalStack emulating AWS SQS, DynamoDB, and
Lambda for local development.

TECH STACK
----------
Java 17 throughout, built on the JDK's own HTTP server (no Spring or other
web framework). The fog buffer is a sorted, sequence-keyed concurrent map
that defers grouping to drain time; alert rules are pure data records
evaluated through two small lookup tables; the SQS publisher batches an
entire flush cycle's messages into a single send; HTTP dispatch uses the
JDK's Filter chain-of-responsibility mechanism; each sensor runs two
self-rescheduling tasks on a single-thread scheduler so no lock is needed
for its buffer. Testing uses JUnit 5 with hand-written fake AWS clients
(no LocalStack, no mocking library) plus real-socket HTTP tests against
the production server classes. A full comparison of this design against
this portfolio's other Java submissions is in the project report.

LAYOUT
------
  sensors/            Java sensor simulator, one container per
                       sensor-type/berth pair
  fog/                 plain-JDK HTTP server: ingest validation, buffering,
                       windowed aggregation, threshold evaluation, batched
                       SQS dispatch, HTTP routing
  backend/processor/  Lambda entry point consuming the SQS event source
                       mapping and writing to DynamoDB, plus deployment
                       tooling
  backend/dashboard/  plain-JDK HTTP server serving its own REST API and
                       the static frontend: an inline operational-status
                       line per berth, five raw reading rows with native
                       meter bars, and a Chart.js crane-load trend chart
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, and load test

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)
  Python 3.12 + boto3 (only for infra/verify_pipeline.py and infra/burst.py)

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
  cd backend/dashboard && mvn test        (33 tests)

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

All 95 tests pass. Notable coverage: real-socket HTTP tests exercise the
fog ingest endpoint and its routing filter chain over an actual bound
port (not a unit test of validation logic in isolation); the dashboard
suite covers both the LocalStack-profile HTTP server and the API Gateway
Lambda dispatch path, including CORS headers on every response.

VERIFY END-TO-END
------------------
With the stack running (allow ~30s after startup for the first window
flush), run the automated check:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4585 python3 infra/verify_pipeline.py

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
plus a computed status line - see STATUS LINE LOGIC below.

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4585 python3 infra/burst.py --messages 2000 --workers 32

Sends synthetic loadtest sensor-type messages (never the real 5 sensor
types, so burst traffic never lands in the dashboard's live partitions),
then asserts (1) the queue shows the burst immediately after sending, and
(2) polls for a full drain within a timeout - if it does not fully drain,
asserts the remaining count strictly decreased from the immediate
post-burst count (a soft warning, not a failure, since LocalStack's
single-container Lambda throughput can genuinely take longer than the
poll window to fully absorb a large burst).

STATUS LINE LOGIC
------------------
Computed per berth as a pure function over that berth's latest window per
sensor type - it never recomputes threshold logic, it only reads the real
alert keys the fog's rule evaluation already fired:
  Crane:     "Overload Risk" if crane load's latest window carries the
             crane-overload alert, else "Nominal".
  Wind:      "Crane Halt" if wind speed's latest window carries the
             high-wind alert, else "Safe".
  Reefer:    "Temp Breach" if reefer temperature's latest window carries
             the temperature-breach alert, else "Nominal".
  Occupancy: the real latest berth-occupancy percentage, with
             "(Congested)" appended if that window carries the congestion
             alert.
Container stack height never contributes to the status line (it carries
no alert rule); it still appears as one of the five raw reading rows
underneath. The dashboard renders this as one inline text line per berth;
colour is applied only to an individual segment's value when that segment
is active, never a tile or card background.

REUSE / THIRD-PARTY COMPONENTS
--------------------------------
The overall pipeline shape (sensors feeding a fog layer that windows,
aggregates, and alerts before dispatching to a queue, a FaaS processor, a
datastore, and a dashboard) follows standard designs used elsewhere in
this shared portfolio, adapted from the main portfolio owner's earlier
work and, for project 01 specifically, from Kondragunta Lakshmi
Chaitanya's (X25171216) individually-attributed project. The code itself
is an independent implementation, and the domain modelling (sensor types
and ranges, the four real operational thresholds, the status-line logic)
and the entire dashboard UI are original to this project.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard crane-load trend chart, vendored locally, never
    fetched from a CDN) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
