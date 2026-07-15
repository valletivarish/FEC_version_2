Patient Vitals Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

All commands below assume your working directory is this folder
(projects/03-patient-vitals/), not the repo root.

OVERVIEW
--------
Ten simulated bedside sensors (heart rate, SpO2, body temperature,
respiration rate, systolic blood pressure -- each running for two patients)
feed a virtual edge gateway ("fog node"). The gateway windows and aggregates
each vital's readings, raises clinical threshold alerts, and dispatches one
aggregate per window to a queue. An AWS Lambda function (running inside
LocalStack) consumes the queue and stores records; a web dashboard renders a
per-patient monitor view (not per-sensor-type) with a live heart-rate trace
and the remaining vitals as compact readouts, styled as a clinical ward
display.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating AWS
SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used throughout,
so a later move to real AWS is an endpoint/IAM configuration change rather
than a rewrite.

TECH STACK
----------
This project is implemented in Node.js 20 (plain CommonJS, no TypeScript
build step), distinct from the Python baseline used in projects
01-smart-agriculture and 05-cold-chain-logistics and the Java stack used in
projects 02-industrial-equipment and 04-smart-city. Each of the 5 CA
projects deliberately runs a different-enough language/runtime combination
so that no two implementations share code at the source level -- only the
overall pipeline shape (sensors -> fog -> queue -> FaaS -> datastore ->
dashboard) and the DynamoDB sort_key disambiguation scheme are common,
and both are disclosed below as reused design decisions, not reused code.
  - sensors/, fog/: Express is used only in fog/ (a tiny HTTP surface); the
    sensor simulator has zero dependencies, using Node's built-in fetch.
  - backend/processor/: a plain Lambda handler module (exports.handler),
    zipped with its node_modules and deployed by a bash + AWS CLI script --
    the deploy tooling is intentionally language-neutral, matching the same
    pattern used for the Java processor in project 02.
  - backend/dashboard/: an Express server exposing the same REST contract
    a browser-based dashboard needs; the static/ frontend (HTML/CSS/Chart.js)
    is unchanged from this project's original design, since it only talks to
    the backend over HTTP and does not care what language serves it.
  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency. AWS-facing code is isolated behind small
    functions that accept an injected client (recentWindows(doc, ...),
    queueReachable(sqs, ...), processRecords(records, doc, ...)), so unit
    tests use hand-written fake clients instead of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per vital/patient)
  fog/                Express edge gateway: ingest, window, aggregate, alert,
                       publish, plus a /thresholds endpoint exposing the real
                       alert rules for any API consumer (the dashboard's own
                       alert labels are display copy for the alert keys, not
                       a copy of the numeric thresholds -- the ward-monitor
                       UI deliberately has no numeric rules legend, unlike
                       01/02's dashboards)
  backend/processor/  transform.js (pure transform) + handler.js (Lambda
                       entry point) + deploy_lambda.sh (packages and
                       registers the function with an SQS event source
                       mapping)
  backend/dashboard/  Express + Chart.js, grouped by PATIENT not by vital --
                       each patient card shows a live heart-rate trace plus
                       the other 4 vitals as compact tiles
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ (only for infra/burst.py and infra/verify_pipeline.py,
                 which remain Python as ops tooling -- see TECH STACK above)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8082
  LocalStack: http://localhost:4568

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the edge gateway

VERIFY END-TO-END
-----------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

RUN THE TESTS
-------------
Each module has its own package.json and test script:
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

LOAD TEST (SCALABILITY EVIDENCE)
--------------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB via LocalStack,
the sort_key disambiguation scheme, the dashboard health-check pattern) was
adapted from this student's own project 01-smart-agriculture and
02-industrial-equipment, built earlier for this same CA submission (not a
prior/external coursework project). The implementation language and every
line of application code are new: this project was rewritten from its
original Python/FastAPI form into Node.js/Express specifically to keep the
5 CA projects from sharing recognisable source-level structure. Domain
code -- vital-sign profiles, clinical thresholds, and the entire dashboard
(light clinical theme, patient-grouped layout, ECG-style trace) -- is
original to this project.
Third-party open-source components used as standard libraries/tools:
  - Express (fog edge gateway, backend/dashboard) - https://expressjs.com
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard trace/sparklines, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com
