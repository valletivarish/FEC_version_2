Wildfire & Forest Monitoring Fog/Edge Pipeline
Fog and Edge Computing (H9FECC) - CA Project

ATTRIBUTION
-----------
Student: Deekonda Rakshan
Student ID: X25180754
This project (projects/10-wildfire-forest-monitoring/) is Deekonda
Rakshan's individual CA submission.

All commands below assume your working directory is this folder
(projects/10-wildfire-forest-monitoring/), not the repo root.

OVERVIEW
--------
A forest service monitors fire risk at two remote ranger stations
(station-1, station-2). Each station carries five sensors: temperature,
humidity, smoke density, wind speed, and soil moisture. A fog node buffers
incoming readings per (sensor_type, site_id), windows and aggregates them
every WINDOW_SECONDS, evaluates fire/weather threshold rules against the
aggregate, and dispatches the window's aggregates to an SQS queue in
batched sends. A Lambda function consumes the queue and stores records in
DynamoDB. A web dashboard renders, per station, a derived 0-4 fire-risk
index as a radial dial (computed live from four of the five sensors'
window averages) plus the five raw readings as secondary detail tiles,
and a cross-station smoke-density trend comparison.

The stack runs in two profiles:
  - Local development: Docker Compose with LocalStack emulating SQS,
    DynamoDB, and Lambda (infra/docker-compose.yml).
  - Real AWS: DynamoDB, SQS, two Lambda functions behind an API Gateway
    REST API, an EC2 instance running the fog node and ten sensor
    containers (infra/docker-compose.aws.yml), and the dashboard frontend
    served from S3. Provisioning is automated by the shared Terraform
    module at the repo root (terraform/, variable file
    terraform/deployments/wfm.tfvars).

FIRE RISK INDEX (the dashboard's primary derived metric)
---------------------------------------------------------
The dial score is not a raw sensor value. It is computed on read from
four of the five sensors' current window averages, +1 point each:
  temperature_c avg      > 30   C
  smoke_density_ppm avg  > 60   ppm
  wind_speed_kmh avg     > 35   km/h
  soil_moisture_pct avg  < 20   %
humidity_pct never contributes a point. These risk-contribution
thresholds are deliberately lower/earlier than the hard alert thresholds
evaluated at the fog tier (42C / 150ppm / 60km/h / 10%), so the dial
climbs gradually as conditions worsen instead of jumping straight to 4
only when a hard alert actually fires.

TECH STACK
----------
Node.js 20 (plain CommonJS), the AWS SDK for JavaScript v3, and Node's
built-in http module and test runner. Chart.js renders the smoke-density
trend. Docker Compose runs the local stack; LocalStack emulates the AWS
services in the local profile; Terraform provisions the real one.

LAYOUT
------
  sensors/            sensor simulator (one container per metric/station)
                       with independently configurable sample and dispatch
                       rates
  fog/                edge gateway: ingest buffering, windowed
                       aggregation, threshold alert evaluation, and
                       batched SQS publishing, plus a /thresholds endpoint
                       exposing the live alert rules
  backend/processor/  the queue-consumer Lambda that transforms each
                       aggregate window into a DynamoDB item
  backend/dashboard/  the dashboard: a local HTTP server for the Docker
                       profile, an API Gateway Lambda entry point for the
                       real AWS profile, and the static frontend (radial
                       fire-risk dial, station detail tiles, smoke trend)
  infra/              docker-compose stacks (local + AWS), LocalStack
                       bootstrap, pipeline verification, load test, and
                       dashboard screenshots

REQUIREMENTS
------------
  Docker + Docker Compose (for the running stack)
  Node.js 20+ (only if running the unit tests locally)
  Python 3.12+ with `pip install boto3` (only for infra/burst.py and
  infra/verify_pipeline.py)
  Terraform 1.5+ and the AWS CLI (only for the real AWS deployment)

RUN THE STACK (LOCAL)
---------------------
  docker compose -f infra/docker-compose.yml up --build

  Dashboard:  http://localhost:8089
  LocalStack: http://localhost:4575

  Stop:  docker compose -f infra/docker-compose.yml down -v

CONFIGURE SENSOR RATES
----------------------
Each sensor takes two independent rates (set per service in
infra/docker-compose.yml):
  SAMPLE_INTERVAL    seconds between generated readings
  DISPATCH_INTERVAL  seconds between dispatches to the fog gateway
Every sensor service in docker-compose.yml uses a visibly different pair
(e.g. smoke sensors sample every 1s but dispatch every 6-7s; soil
moisture sensors sample every 4s and dispatch every 12-13s).

VERIFY END-TO-END (LOCAL)
-------------------------
With the stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Example curl commands against the live REST API:
  curl http://localhost:8089/api/health
  curl http://localhost:8089/api/stations
  curl "http://localhost:8089/api/readings?sensor_type=smoke_density_ppm&site_id=station-1&limit=10"
  curl http://localhost:8089/api/thresholds
  curl http://localhost:8089/api/backend-stats

DEPLOY TO REAL AWS
------------------
From the repo root, with AWS credentials configured for the target
account (aws sts get-caller-identity must show the intended account):
  cd terraform
  ./build.sh deployments/wfm.tfvars
  terraform init
  terraform apply -var-file=deployments/wfm.tfvars
The apply provisions DynamoDB, SQS, both Lambda functions, the API
Gateway REST API, the EC2 fog host (running
infra/docker-compose.aws.yml), and the S3 frontend, and prints the
dashboard and API URLs as outputs.

RUN THE TESTS
-------------
Each module has its own package.json and test script. All 95 tests below
were run and confirmed passing (node --test) at the time this readme was
written: 8 in sensors/, 36 in fog/, 7 in backend/processor/, 44 in
backend/dashboard/.
  cd sensors && npm install && npm test
  cd fog && npm install && npm test
  cd backend/processor && npm install && npm test
  cd backend/dashboard && npm install && npm test

Or without a local Node.js install:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

Coverage includes the window aggregation math, threshold evaluation
against the exact hard-alert limits, the fire-risk-index derivation
(including that its risk-contribution thresholds are strictly earlier
than the hard alert thresholds, and that humidity never contributes),
sort-key disambiguation, batched SQS publishing at the ten-entry batch
limit, DynamoDB scan pagination across multiple pages, the API Gateway
entry point's routing/CORS/error behaviour, and real HTTP-level tests
against a live local server for both the fog ingest endpoint and the
dashboard's thresholds proxy.

LOAD TEST (SCALABILITY EVIDENCE)
---------------------------------
With the local stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

This asserts (1) the queue shows the burst immediately after sending, and
(2) either the queue fully drains within the timeout, or the remaining
count strictly decreased from the immediate post-burst count, proving the
Lambda consumer is making real progress rather than being stalled.

REUSE / THIRD-PARTY COMPONENTS
-------------------------------
The overall pipeline architecture (SQS -> Lambda -> DynamoDB, the
sort-key disambiguation scheme, the dashboard health-check pattern, the
dual-rate sensor knobs, and the load-test assertion pattern) is adapted
from sibling projects in this shared repository. Those siblings belong to
the repository's main portfolio owner and, where individually attributed,
to other students (see each project's own readme); they are not this
student's prior work, and the adaptation is disclosed here accordingly.
The domain logic (wildfire sensor profiles, fire threshold rules, the
fire-risk-index derivation) and the entire dashboard (charcoal/ember
forest-watch theme, radial fire-risk dial, station detail tiles,
smoke-density trend comparison) are original to this project.

Third-party open-source components used as standard libraries/tools:
  - AWS SDK for JavaScript v3 - https://github.com/aws/aws-sdk-js-v3
  - Chart.js (vendored at backend/dashboard/static/vendor/) -
    https://www.chartjs.org
  - LocalStack (local AWS emulation) - https://www.localstack.cloud
  - Terraform (real AWS provisioning) - https://www.terraform.io
  - boto3 (Python AWS SDK, used only by the ops tooling in infra/) -
    https://boto3.amazonaws.com
