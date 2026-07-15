Smart City Traffic & Environmental Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/04-smart-city/), not the repo root.

OVERVIEW
--------
Ten simulated street-level sensors (traffic flow, air quality PM2.5, noise
level, parking occupancy, ambient light -- each running for two city zones)
feed a virtual edge relay ("fog node"). The relay windows and aggregates
each metric's readings, raises operational alerts, and dispatches one
aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders
a per-zone operations board (not per-metric) plus a secondary citywide
trends section comparing zones metric-by-metric, styled as a night-time
city-ops control room.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK for Java v2 is used throughout, so a
later move to real AWS is an endpoint/IAM configuration change rather than a
rewrite.

TECH STACK
----------
This project is implemented in Java 17 (plain JDK HTTP server, no Spring/
Javalin), distinct from the Python baseline used in projects
01-smart-agriculture and 05-cold-chain-logistics and the Node.js stack used
in project 03-patient-vitals. This is the second of the five CA projects
using Java (alongside 02-industrial-equipment), but the two are independent
reimplementations, not copies of each other: class names, method names,
and internal structure differ throughout (e.g. this project's fog node is
`CityFogNode`/`WindowSummary`/`IncidentRules`/`RelayClient`, buffering
readings under a `ZoneKey` record, vs 02's `FogApp`/`Aggregation`/`Alerts`/
`QueueRelay` under a `PendingKey` record) -- only the domain-agnostic
architecture (plain `com.sun.net.httpserver.HttpServer`, AWS SDK v2,
Maven multi-stage Docker builds, lazily-initialized static clients for
testability) is intentionally shared, and that reuse is disclosed below.
  - sensors/, fog/, backend/processor/, backend/dashboard/: each is its own
    Maven module (own pom.xml), mirroring the existing per-directory Docker
    build layout.
  - backend/processor/: `Handler` implements Lambda's `RequestHandler`
    interface directly; a bash + AWS CLI script (deploy_lambda.sh) packages
    and registers the shaded JAR as a real java17 Lambda function -- the
    deploy tooling is intentionally language-neutral rather than a bespoke
    Java program, matching the pattern used in project 02.
  - backend/dashboard/: `CityDashboardApp` serves the same REST contract
    (`/api/readings`, `/api/zones`, `/api/thresholds`, `/api/health`,
    `/api/backend-stats`) the existing dashboard frontend already expects;
    the static/ frontend (HTML/CSS/Chart.js) is unchanged from this
    project's original design, since it only talks to the backend over
    HTTP and does not care what language serves it.
  - Testable logic (DynamoDB/SQS/Lambda-facing code) is extracted into
    small classes with dependency-injected clients (`ZoneRepository`,
    `PipelineHealth`), tested with hand-written fake AWS SDK v2 client
    doubles (`FakeDynamoDbClient`/`FakeSqsClient`/`FakeLambdaClient`
    implementing the real interfaces) -- JUnit 5, no network calls in
    unit tests.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/zone)
  fog/                edge relay: ingest, window, aggregate, alert,
                       publish, plus a /thresholds endpoint exposing the
                       real alert rules for any API consumer
  backend/processor/  Normalizer (pure transform) + Handler (Lambda entry
                       point) + deploy_lambda.sh (packages the shaded JAR
                       and registers an SQS event source mapping)
  backend/dashboard/  plain HttpServer + Chart.js, grouped by ZONE not by
                       metric -- each zone card shows all 5 metrics, plus a
                       secondary "citywide trends" section comparing zones
                       per metric
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Java 17+ and Maven (only if running the unit tests locally)
  Python 3.12+ (only for infra/burst.py and infra/verify_pipeline.py,
                 which remain Python as ops tooling -- see TECH STACK above)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8083
  LocalStack: http://localhost:4569

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the edge relay

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

RUN THE TESTS
-------------
Each module has its own pom.xml:
  cd sensors && mvn test
  cd fog && mvn test
  cd backend/processor && mvn test
  cd backend/dashboard && mvn test

Or without a local Java/Maven install:
  docker run --rm -v "$PWD":/app -w /app/fog maven:3.9-eclipse-temurin-17 \
    mvn -B test

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own projects 01-smart-agriculture,
02-industrial-equipment, and 03-patient-vitals, built earlier for this same
CA submission (not a prior/external coursework project). The implementation
language and every line of application code are new: this project was
rewritten from its original Python/FastAPI form into Java specifically to
keep the 5 CA projects from sharing recognisable source-level structure.
Domain-specific code -- metric profiles, operational thresholds, and the
entire dashboard (night-city theme, zone-grouped layout, citywide trends
section) -- is original to this project.
Third-party open-source components used as standard libraries/tools:
  - AWS SDK for Java v2 (software.amazon.awssdk: sqs, dynamodb, lambda) -
    https://github.com/aws/aws-sdk-java-v2
  - AWS Lambda Java Core/Events (com.amazonaws: aws-lambda-java-core,
    aws-lambda-java-events) - https://github.com/aws/aws-lambda-java-libs
  - Jackson Databind (JSON parsing/serialization) -
    https://github.com/FasterXML/jackson
  - Chart.js (dashboard trend charts, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - JUnit 5 (test suite) - https://junit.org/junit5
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com
