Warehouse Robotics Fleet Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

ATTRIBUTION
------------
This project is Goutham Uppu's individual CA submission, Student ID
X25167936, National College of Ireland. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

All commands below assume your working directory is this folder
(projects/07-warehouse-robotics-fleet/), not the repo root.

OVERVIEW
--------
A fleet of autonomous mobile robots (AMRs) works two warehouse zones
(zone-a, zone-b). Five onboard sensors per robot -- battery level, payload
weight, motor temperature, position drift, and task queue depth -- feed a
fog gateway, which windows and aggregates readings per robot/zone,
evaluates fleet-health thresholds, and batches aggregates to a queue. A
Lambda function consumes the queue into DynamoDB; a dashboard renders a
fleet roster (one row per robot/metric with a sparkline and status
indicator) plus a detail panel for the selected or most-critical robot.

A critical comparison of this project's internal design against its
Java siblings in this portfolio is in the project report.

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
  backend/dashboard/  local HTTP server plus its own REST API, serving a
                       dark orange-and-black fleet-ops HUD: a roster table
                       (one row per robot/metric, inline sparkline, LED
                       indicator) as the primary view, and a detail panel
                       below for the selected/most-critical robot showing
                       all 5 metrics in full. A separate Lambda entry point
                       answers the same API behind API Gateway for the
                       real AWS deployment.
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

Test coverage includes: sensor drift and payload shape, window aggregation
math, alert-rule evaluation (including exactly-at-limit boundary
behaviour), fog ingest buffering and multi-zone isolation, DynamoDB
pagination and SQS batching, record mapping, Lambda batch processing with
partial-failure tallying, dashboard roster grouping, and the
health/queue-depth checks, and the Lambda entry point's routing -- 116 tests total.

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
sensor knobs) is adapted from other prior codebases in this shared
portfolio repository, not this student's own earlier work. Domain-specific
code (AMR sensor profiles, fleet-health thresholds) and the entire
dashboard (dark orange-and-black HUD theme, fleet-roster table with
inline sparklines and LED indicators, detail panel) are original to this
project. Its internal design (concurrency, alert-rule representation,
JSON handling, HTTP routing) was deliberately built distinct from this
portfolio's other Java projects -- see the project report for the
comparison.

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

REAL AWS DEPLOYMENT
--------------------
Deployed to a real AWS Academy Learner Lab account (Goutham Uppu's own,
X25167936), provisioned via the portfolio's shared Terraform module
(terraform/) in a single apply. DynamoDB table wrf-readings, SQS queue
wrf-fleet-agg, Lambda wrf-processor and Lambda wrf-dashboard-api (API
Gateway iodllqqk3m), EC2 instance i-00c6537b8a41e9750, Elastic IP
3.211.126.248, S3 buckets wrf-frontend-789399341650 (dashboard) and
wrf-deploy-789399341650 (staging).

Dashboard: https://wrf-frontend-789399341650.s3.us-east-1.amazonaws.com/index.html
API: https://iodllqqk3m.execute-api.us-east-1.amazonaws.com/prod

Verified live: /api/health reports all four fields true, DynamoDB item
count climbing, dashboard rendering real data in a real browser with
zero console errors.
