Plant Floor Predictive Maintenance Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project
Implementation language: Java 17

All commands below assume your working directory is this folder
(projects/02-industrial-equipment/), not the repo root.

OVERVIEW
--------
Five simulated production-line sensors (vibration, motor temperature,
bearing acoustic emission, rotation speed, power draw) feed a virtual fog
node. The fog node windows and aggregates each sensor's readings, raises
threshold alarms, and dispatches one aggregate per window to a queue. An AWS
Lambda function (running inside LocalStack) consumes the queue and stores
records; a web dashboard renders a live gauge, sparkline trend, and alarm
state per sensor type, styled as a plant-floor control panel.

This project is implemented in Java (JDK 17), deliberately different from
project 01 (Python) to avoid application-code similarity across the
portfolio. It uses plain JDK HttpServer (com.sun.net.httpserver) rather than
a framework such as Spring, to keep builds fast and dependencies minimal --
the only direct dependencies are the AWS SDK for Java v2 and Jackson for
JSON. Sensors, fog, the Lambda handler, and the dashboard server are each
independent Maven projects, mirroring the per-directory Docker build
structure already used by the other projects in this portfolio.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK for Java v2 is used throughout, so a
later move to real AWS is an endpoint/credentials configuration change
rather than a rewrite.

LAYOUT
------
  sensors/            Java sensor simulator (Sensor.java), one container per
                       sensor type/site
  fog/                 plain-JDK HTTP server (FogApp.java): ingest, window,
                       aggregate, alarm (Aggregation.java/Alerts.java),
                       publish to SQS (QueueRelay.java), plus a /thresholds
                       endpoint exposing the real alarm rules so the
                       dashboard never hardcodes a copy
  backend/processor/  Reshape.java (pure transform) + Handler.java (AWS
                       Lambda entry point, RequestHandler<SQSEvent,...>) +
                       deploy_lambda.sh (bash + AWS CLI packages the built
                       JAR and registers it with an SQS event source
                       mapping -- deployment tooling is intentionally
                       language-neutral, not Java, matching how real
                       polyglot systems usually keep ops scripts separate
                       from application code)
  backend/dashboard/  plain-JDK HTTP server (DashboardApp.java) serving the
                       SAME REST API and the SAME static dashboard files as
                       before (backend/dashboard/static/ is completely
                       unchanged from the original Python version -- the
                       frontend is language-agnostic, it only talks to REST
                       endpoints)
  infra/              docker-compose stack + LocalStack bootstrap (unchanged
                       structure -- only the Dockerfiles differ, service
                       names/env vars/ports are identical to before)
  loadtest/           Python queue burst generator (scalability evidence) --
                       kept as ops tooling, not application code
  scripts/            Python end-to-end pipeline verification -- same reason
  tests/              JUnit 5 unit + logic tests, one test module per Maven
                       project (sensors/fog/processor/dashboard)

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  JDK 17+ and Maven (only if building/testing locally outside Docker)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8081
  LocalStack: http://localhost:4567

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog node

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python scripts/verify_pipeline.py

RUN THE TESTS
-------------
Each Maven project has its own test suite (JUnit 5):
  cd sensors && mvn test
  cd fog && mvn test
  cd backend/processor && mvn test
  cd backend/dashboard && mvn test

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python loadtest/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline SHAPE (sensors -> fog windowing/aggregation/alerting ->
queue -> FaaS processor -> datastore -> dashboard, with a sort-key
disambiguation scheme for multi-site records and a health-check/thresholds-
proxy pattern on the dashboard) follows the same design this student
established in project 01-smart-agriculture, built earlier for this same CA
submission (not a prior/external coursework project) -- but the CODE ITSELF
is an independent Java implementation, not a translation or port of the
Python source; no source files, classes, or business logic were copied
across languages. Domain-specific code (sensor types, alarm thresholds) and
the entire dashboard UI are original to this project. Third-party
open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://aws.amazon.com/sdk-for-java/
  - Jackson (com.fasterxml.jackson.core: jackson-databind) for JSON -
    https://github.com/FasterXML/jackson
  - aws-lambda-java-core / aws-lambda-java-events (Lambda handler
    interfaces) - https://github.com/aws/aws-lambda-java-libs
  - JUnit 5 (test suite) - https://junit.org/junit5/
  - Chart.js (dashboard sparklines, vendored at
    backend/dashboard/static/vendor/, unchanged from project 01/02's
    original frontend) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
