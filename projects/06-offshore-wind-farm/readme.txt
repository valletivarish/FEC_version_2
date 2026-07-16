Offshore Wind Farm Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
This project (06-offshore-wind-farm) is the individual CA submission of
Vishvaksen Machana, Student ID X25173421. It shares this portfolio
repository with several other students' independently attributed projects
as a convenience; it is not part of the main portfolio owner's own
submission.

All commands below assume your working directory is this folder
(projects/06-offshore-wind-farm/), not the repo root.

OVERVIEW
--------
Two offshore turbines (turbine-1, turbine-2) each carry five sensors --
wind speed, blade vibration, generator temperature, power output, and
gearbox pressure. A fog node windows and aggregates each sensor's readings
in place using a streaming accumulator, evaluates structural/mechanical
threshold rules per sensor type, and dispatches one aggregate per window to
a queue. A Lambda function (running inside LocalStack) consumes the queue
and stores records in DynamoDB; a web dashboard renders the farm as a
spatial grid of turbine tiles, each showing all five live metrics and a
status beacon, plus a cross-turbine power-output trend comparison.

Phase 1 (this project) runs entirely on Docker with LocalStack emulating
AWS SQS, DynamoDB, and Lambda. The AWS SDK for JavaScript v3 is used
throughout, so a later move to real AWS is an endpoint/IAM configuration
change rather than a rewrite.

TECH STACK
----------
Node.js 20 (plain CommonJS, no TypeScript build step), the second Node.js
implementation in this CA portfolio alongside 03-patient-vitals. To keep
the two Node projects from sharing recognisable source-level structure,
this project deliberately uses different internal architecture for every
equivalent concern:
  - fog/: readings are folded into a live per (sensor_type, site_id)
    accumulator as they arrive (accumulator.js), never retained as a raw
    reading list. Alert rules are per-metric functions in a dispatch object
    (alerts.js), not a generic [field, op, limit] table. The SQS client is
    wrapped by a factory function returning a closure (publisher.js), not a
    class. Ingest buffering and the Express app itself live in separate
    modules (ingestRouter.js / app.js).
  - backend/dashboard/: routes are split by concern (routes/readings.js,
    routes/status.js) and mounted onto the Express app, rather than one
    file with every route inline. AWS clients and config are constructed
    once in awsClients.js and passed into routes via a small dependency
    object, instead of being cached module-level singletons that routes
    reach into directly.
  - sensors/: each sensor process builds a small stateful "rig" object
    (sample/dueForFlush/flush) rather than a single flat setInterval
    callback that both samples and dispatches inline.
  - backend/processor/: a plain Lambda handler module (exports.handler),
    zipped with its node_modules and deployed by a bash + AWS CLI script.
  - Testing uses Node's built-in node:test + node:assert/strict runner --
    no Jest/Mocha dependency. AWS-facing code is isolated behind small
    functions that accept an injected client, so unit tests use
    hand-written fake clients instead of hitting LocalStack.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/turbine)
  fog/                Express edge gateway: ingest -> streaming accumulator
                       -> window flush -> per-metric alert dispatch ->
                       SQS publish, plus a /thresholds endpoint exposing
                       the real alert rules
  backend/processor/  transform.js (pure transform building the sort_key)
                       + handler.js (Lambda entry point) + deploy_lambda.sh
                       (packages and registers the function with an SQS
                       event source mapping)
  backend/dashboard/  Express + Chart.js. Primary view is a farm-layout
                       grid of turbine tiles (CSS grid, not a vertical
                       list) with a status beacon per turbine; a secondary
                       section below compares power output across turbines
  infra/              docker-compose stack, LocalStack bootstrap, pipeline
                       verification, load test, and dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ (only for infra/burst.py and infra/verify_pipeline.py)

RUN THE STACK
-------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8085
  LocalStack: http://localhost:4571

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

CAPTURE DASHBOARD SCREENSHOTS (DESKTOP + MOBILE)
-------------------------------------------------
With the stack running, this renders the live dashboard in headless
Chromium (Playwright) at desktop (1440x900) and mobile (390x844) viewport
widths, saves both screenshots to infra/, and fails if either viewport
shows a browser console error or renders zero turbine tiles:
  cd scripts && npm install && node capture_dashboard_screenshots.js

This is a Node-based ops tool kept in its own infra/package.json,
isolated from the application package.json files (sensors/, fog/,
backend/processor/, backend/dashboard/), the same way verify_pipeline.py
and burst.py are kept as separate Python ops tooling.

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
the sort_key disambiguation scheme window_end#site_id, the dashboard
health-check pattern, the dual-rate SAMPLE_INTERVAL/DISPATCH_INTERVAL
sensor knobs) is a design pattern shared across this portfolio repository,
not built entirely from scratch for this project. It belongs to the main
portfolio owner and, in project 01's specific case, another individually
attributed student -- Kondragunta Lakshmi Chaitanya, X25171216 -- not this
student's own prior work. Every line of application code, the domain logic
(turbine sensor profiles, structural/mechanical thresholds), and the
entire dashboard (deep ocean-blue maritime theme, farm-layout grid,
turbine nameplate tiles, power-output trend comparison) are original to
this project.
Third-party open-source components used as standard libraries/tools:
  - Express (fog edge gateway, backend/dashboard) - https://expressjs.com
  - AWS SDK for JavaScript v3 (@aws-sdk/client-sqs, client-dynamodb,
    lib-dynamodb, client-lambda) - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (dashboard power-output trend chart, vendored at
    backend/dashboard/static/vendor/) - https://www.chartjs.org
  - LocalStack (local AWS emulation for SQS/DynamoDB/Lambda) -
    https://www.localstack.cloud
  - Node.js built-in test runner (node:test, node:assert/strict) -- no
    external test framework dependency
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) - https://boto3.amazonaws.com
  - Playwright (headless Chromium, used only by the ops screenshot tool
    infra/capture_dashboard_screenshots.js, isolated in its own
    infra/package.json -- not a dependency of any application module) -
    https://playwright.dev

NOTE ON /api/thresholds
------------------------
The dashboard backend proxies GET /api/thresholds from the fog gateway,
but the current frontend (dashboard.js) does not call it -- alert names are
rendered from a small local display-text map (ALERT_TEXT) instead. The
endpoint is kept for API completeness and possible future use, and is
covered by its own test, but is not claimed as a frontend feature.

REAL AWS DEPLOYMENT
--------------------
ARCHITECTURE: the dashboard API runs as an AWS Lambda function behind an
API Gateway REST API. EC2 runs the fog node and the ten sensor containers.

LIVE RESOURCES: DynamoDB table owf-readings, SQS queue owf-turbine-agg,
Lambda owf-processor and Lambda owf-dashboard-api (API Gateway REST API
zwwf3aohya), EC2 instance i-0a808bebdd67990f5 (security group
sg-025099662fc91f9c9, inbound TCP 8000 only), Elastic IP 54.227.202.229,
S3 buckets owf-frontend-015611713565 (dashboard) and
owf-deploy-015611713565 (staging).

Live URLs: dashboard at
https://owf-frontend-015611713565.s3.us-east-1.amazonaws.com/index.html,
API at https://zwwf3aohya.execute-api.us-east-1.amazonaws.com/prod.
