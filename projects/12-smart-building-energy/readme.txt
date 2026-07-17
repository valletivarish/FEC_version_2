Smart Building Energy Monitoring

All commands below assume your working directory is this folder
(projects/12-smart-building-energy/) unless a step says otherwise.

2. PREREQUISITES
-----------------
  - Docker and Docker Compose (to run the local stack)
  - Python 3.12+ (only needed to run the test suite or ops scripts outside
    Docker; every Dockerfile in this project builds from python:3.12-slim)
  - pip
  - AWS CLI v2 and Terraform (only needed for the AWS Deployment Steps
    section below)

3. INSTALLATION STEPS
----------------------
  1. Clone the repository and change into this project's folder:
       cd projects/12-smart-building-energy
  2. (optional) create and activate a virtual environment:
       python3 -m venv .venv
       source .venv/bin/activate
  3. Install the dependencies needed to run tests and ops scripts locally:
       pip install -r requirements-dev.txt

4. CONFIGURATION
-----------------
Environment variables actually read by each component (name, what it
configures, real default):

  fog/app.py (fog node):
    WINDOW_SECONDS      aggregation window length in seconds, default "10"
    SQS_QUEUE_NAME       SQS queue window aggregates are published to,
                          default "sbe-floor-agg"
    AWS_ENDPOINT_URL      boto3 endpoint override, no default (unset means
                          the real AWS endpoint is used)
    AWS_REGION            boto3 region, default "eu-west-1"

  backend/processor/handler.py (SQS-triggered Lambda entry point):
    TABLE_NAME             DynamoDB table readings are written to, default
                          "sbe-readings"
    AWS_ENDPOINT_URL      as above
    AWS_REGION             as above

  backend/processor/deploy_lambda.py (LocalStack-only packaging/
  registration script, run as the "processor" container's entry point):
    AWS_ENDPOINT_URL, AWS_REGION   as above
    SQS_QUEUE_NAME                  queue the function's event source
                                    mapping is wired to, default
                                    "sbe-floor-agg"
    TABLE_NAME                      default "sbe-readings"
    LAMBDA_FUNCTION_NAME            function name created/updated, default
                                    "sbe-processor"

  backend/dashboard/app.py and backend/dashboard/data_access.py (dashboard
  API + static frontend server):
    FOG_HEALTH_URL         URL polled for fog node health, default
                          "http://fog:8000/health"
    FOG_THRESHOLDS_URL    URL /api/thresholds proxies, default
                          "http://fog:8000/thresholds"
    PORT                   port the dashboard HTTP server listens on,
                          default "8000"
    TABLE_NAME              DynamoDB table read for readings, default
                          "sbe-readings"
    SQS_QUEUE_NAME         SQS queue read for queue-depth stats, default
                          "sbe-floor-agg"
    LAMBDA_FUNCTION_NAME    Lambda function checked for /api/health's
                          lambda status, default "sbe-processor"
    AWS_ENDPOINT_URL, AWS_REGION   as above

  sensors/sensor.py (one process per sensor container):
    SENSOR_TYPE            required, no default -- process raises an error
                          on startup if unset
    SITE_ID                 default "floor-1"
    SAMPLE_INTERVAL        seconds between generated readings, default "2"
    DISPATCH_INTERVAL     seconds between dispatches to the fog node,
                          default "10"
    FOG_URL                 fog node ingest endpoint, default
                          "http://fog:8000/ingest"

  infra/verify_pipeline.py and infra/burst.py (local ops/verification
  scripts, not services):
    AWS_ENDPOINT_URL       default "http://localhost:4577"
    AWS_REGION              default "eu-west-1"
    TABLE_NAME              verify_pipeline.py only, default "sbe-readings"
    VERIFY_TIMEOUT         verify_pipeline.py only, seconds, default "90"
    VERIFY_POLL_INTERVAL  verify_pipeline.py only, seconds, default "3"
    SQS_QUEUE_NAME         burst.py only, default "sbe-floor-agg"

5. BUILD INSTRUCTIONS
----------------------
Per-module dependency install (each module's only third-party dependency
is boto3==1.35.90, except sensors, which has none):
  pip install -r fog/requirements.txt
  pip install -r backend/processor/requirements.txt
  pip install -r backend/dashboard/requirements.txt
  pip install -r sensors/requirements.txt   (empty -- stdlib only)

Build every container image via Compose in one command:
  docker compose -f infra/docker-compose.yml build

Or build a single service's image directly, e.g.:
  docker build -t sbe-fog fog/
  docker build -t sbe-processor backend/processor/
  docker build -t sbe-dashboard backend/dashboard/
  docker build -t sbe-sensor sensors/

6. RUN INSTRUCTIONS
---------------------
Bring up the full local stack:
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8091  (maps to container port 8000)
  LocalStack:  http://localhost:4577  (maps to container port 4566)

fog and processor are not published to the host. fog is reachable only at
http://fog:8000 from inside the compose network; processor runs once
(restart: "no") and exits after registering the Lambda function in
LocalStack.

Bring services up incrementally:
  docker compose -f infra/docker-compose.yml up -d localstack
  docker compose -f infra/docker-compose.yml up -d fog dashboard
  docker compose -f infra/docker-compose.yml up -d processor
  docker compose -f infra/docker-compose.yml up -d

Stop and remove volumes:
  docker compose -f infra/docker-compose.yml down -v

7. AWS DEPLOYMENT STEPS
-------------------------
No terraform/deployments/*.tfvars file exists yet for this project. Create
one before deploying.

  1. Confirm your AWS credentials are active and pointed at the target
     account:
       aws sts get-caller-identity

  2. backend/dashboard/app.py implements a raw http.server request
     handler and is not directly callable as a Lambda function. Add a
     Lambda entry point (e.g. backend/dashboard/lambda_handler.py) that
     accepts an API Gateway proxy integration event and calls into
     data_access.py, scoring.py, and thresholds_proxy.py directly.
     backend/processor/handler.py already exposes a usable
     lambda_handler(event, context) entry point and needs no changes.

  3. backend/dashboard/static/dashboard.js currently calls the API with
     relative paths (fetch("/api/floors"), fetch("/api/health"), etc.),
     assuming the frontend and API are served from the same origin. For a
     split-origin deployment (static frontend on S3, API behind API
     Gateway), add an API base configuration mechanism to
     backend/dashboard/static/index.html and dashboard.js.

  4. Create terraform/deployments/sbe.tfvars, following the same field
     structure used by the other files in that directory (field names
     shown below; fill in values matching this project's real files and
     handler names once step 2's handler exists):
       prefix                   = "sbe"
       project_root             = "../projects/12-smart-building-energy"
       table_name                = "sbe-readings"
       queue_name                = "sbe-floor-agg"
       processor_lambda_name    = "sbe-processor"
       processor_build_command  = <pip-install-and-zip command for
                                    backend/processor/handler.py +
                                    transform.py>
       processor_zip_path       = "backend/processor/lambda.zip"
       processor_handler         = "handler.lambda_handler"
       processor_runtime         = "python3.12"
       dashboard_lambda_name    = "sbe-dashboard-api"
       dashboard_build_command  = <pip-install-and-zip command for
                                    backend/dashboard/lambda_handler.py +
                                    data_access.py + scoring.py +
                                    thresholds_proxy.py>
       dashboard_zip_path       = "backend/dashboard/lambda.zip"
       dashboard_handler         = "lambda_handler.lambda_handler"
       dashboard_runtime         = "python3.12"
       frontend_local_dir        = "backend/dashboard/static"
       api_base_placeholder     = <placeholder token used by step 3>
       api_base_search_files    = ["index.html"]

  5. Create and switch to a dedicated Terraform workspace before applying,
     so this project's apply cannot plan a destroy against whatever
     project the module's state currently tracks:
       cd terraform
       terraform workspace new sbe
       terraform workspace list

  6. Build the Lambda packages and deploy tarball, then review the plan
     before applying:
       ./build.sh deployments/sbe.tfvars
       terraform plan -var-file=deployments/sbe.tfvars

  7. Apply once the plan's destroy count is 0:
       terraform apply -var-file=deployments/sbe.tfvars

  8. Switch back to the default workspace afterward:
       terraform workspace select default

8. TESTING INSTRUCTIONS
-------------------------
  pip install -r requirements-dev.txt
  pytest

pytest.ini sets testpaths = tests and addopts = -q, so a bare `pytest`
run from this project's root picks up every file under tests/.

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

133 tests currently pass (0 failures, 0 errors, 0 skipped), verified by
running the suite directly. Per-file breakdown:
  tests/test_aggregation.py        5
  tests/test_alerts.py            17
  tests/test_dashboard_http.py    10
  tests/test_data_access.py       12
  tests/test_fog_http.py          12
  tests/test_handler.py            3
  tests/test_ingest_pipeline.py    6
  tests/test_publisher.py          6
  tests/test_scoring.py           17
  tests/test_sensor.py            19
  tests/test_thresholds_proxy.py   2
  tests/test_transform.py          7
  tests/test_validation.py        17
