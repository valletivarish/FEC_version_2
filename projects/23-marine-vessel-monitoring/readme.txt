Marine Vessel Monitoring

All commands below assume your working directory is this folder
(projects/23-marine-vessel-monitoring/) unless stated otherwise.

1. PREREQUISITES
-----------------
  - Docker and Docker Compose (to run the local stack)
  - Python 3.12+ (every Dockerfile in this project builds on python:3.12-slim;
    a local Python 3.12+ install is only needed to run the test suite or the
    infra/ scripts outside Docker)
  - pip
  - AWS CLI (only needed for the AWS deployment steps)
  - Terraform >= 1.5 with the AWS provider ~> 5.0 (only needed for the AWS
    deployment steps; the Terraform module lives at the repository
    root's terraform/ directory, not inside this project folder)

2. INSTALLATION STEPS
----------------------
  1. Clone the repository.
  2. cd into projects/23-marine-vessel-monitoring
  3. Install the local dependencies needed to run the test suite:
       pip install -r requirements-dev.txt
     This installs pytest, tornado, and boto3 (the same tornado/boto3
     versions the fog node and dashboard backend use at runtime).

3. CONFIGURATION
-----------------
Environment variables actually read by the code, grouped by component. All
have working defaults except SENSOR_TYPE, which is required.

Fog node (fog/app.py):
  WINDOW_SECONDS      aggregation window length in seconds (default: 10)
  SQS_QUEUE_NAME       SQS queue the fog node publishes aggregates to
                        (default: mvs-vessel-agg)
  AWS_ENDPOINT_URL     AWS endpoint override; set for LocalStack, unset for
                        real AWS so boto3 falls back to its default
                        credential/endpoint chain (no default)
  AWS_REGION           AWS region for the SQS client (default: eu-west-1)

Sensors (sensors/sensor.py):
  SENSOR_TYPE          sensor type identifier, e.g. engine_room_temp_c
                        (required, no default -- process exits if unset)
  SITE_ID              vessel identifier (default: vessel-a)
  SAMPLE_INTERVAL      seconds between generated readings (default: 2)
  DISPATCH_INTERVAL    seconds between dispatches to the fog node
                        (default: 10)
  FOG_URL              fog node ingest endpoint
                        (default: http://fog:8000/ingest)

Backend processor (backend/processor/handler.py, deploy_lambda.py):
  TABLE_NAME           DynamoDB table records are written to
                        (default: mvs-readings)
  AWS_ENDPOINT_URL     AWS endpoint override, same as above (no default)
  AWS_REGION           AWS region (default: eu-west-1)
  SQS_QUEUE_NAME       queue deploy_lambda.py wires the event source
                        mapping to (default: mvs-vessel-agg)
  LAMBDA_FUNCTION_NAME name deploy_lambda.py registers the function under
                        (default: mvs-processor)

Dashboard backend (backend/dashboard/app.py, data_access.py,
lambda_handler.py):
  TABLE_NAME           DynamoDB table queried for readings
                        (default: mvs-readings)
  SQS_QUEUE_NAME       queue whose depth is reported by /api/backend-stats
                        (default: mvs-vessel-agg)
  LAMBDA_FUNCTION_NAME processor function name checked by /api/health
                        (default: mvs-processor)
  AWS_ENDPOINT_URL     AWS endpoint override, same as above (no default)
  AWS_REGION           AWS region (default: eu-west-1)
  FOG_HEALTH_URL       fog node health endpoint polled by /api/health
                        (default: http://fog:8000/health)
  FOG_THRESHOLDS_URL   fog node thresholds endpoint polled by
                        /api/thresholds (default: http://fog:8000/thresholds)
  PORT                 local Tornado server port, app.py only, not used by
                        the Lambda handler (default: 8000)

Ops scripts (infra/verify_pipeline.py, infra/burst.py):
  AWS_ENDPOINT_URL     AWS endpoint (default: http://localhost:4588)
  AWS_REGION           AWS region (default: eu-west-1)
  TABLE_NAME           DynamoDB table, verify_pipeline.py only
                        (default: mvs-readings)
  SQS_QUEUE_NAME       SQS queue, burst.py only (default: mvs-vessel-agg)
  VERIFY_TIMEOUT       seconds to wait for the pipeline to settle,
                        verify_pipeline.py only (default: 90)

4. BUILD INSTRUCTIONS
-----------------------
There is no separate compile step; each service is plain Python built into
a Docker image at container-build time.

  Build every image (fog, sensors, backend/processor, backend/dashboard):
    docker compose -f infra/docker-compose.yml build

  Each Dockerfile (fog/Dockerfile, sensors/Dockerfile,
  backend/processor/Dockerfile, backend/dashboard/Dockerfile) starts from
  python:3.12-slim, copies its own requirements.txt, and runs
  pip install -r requirements.txt inside the image.

  For the AWS Lambda zip packages (processor and dashboard), see the build
  commands in AWS DEPLOYMENT STEPS below -- those are built by Terraform's
  build.sh, not by docker compose build.

5. RUN INSTRUCTIONS
---------------------
  docker compose -f infra/docker-compose.yml up --build

  This starts: localstack, fog, the one-shot processor (deploys the
  Lambda into LocalStack and exits), dashboard, and all 10 sensor
  containers (5 sensor types x 2 vessels).

  Exposed ports:
    Dashboard:   http://localhost:8102   (container port 8000)
    LocalStack:  http://localhost:4588   (container port 4566)
  fog is not published to the host in this compose file; it is reachable
  only at http://fog:8000 from inside the compose network.

  Stop and remove volumes:
    docker compose -f infra/docker-compose.yml down -v

  Bring services up incrementally:
    docker compose -f infra/docker-compose.yml up -d localstack
    docker compose -f infra/docker-compose.yml up -d fog dashboard
    docker compose -f infra/docker-compose.yml up -d processor
    docker compose -f infra/docker-compose.yml up -d

6. AWS DEPLOYMENT STEPS
-------------------------
No terraform/deployments/mvs.tfvars file exists yet for this project. The
Terraform module lives at the repository root's terraform/
directory (not inside this project folder) and is driven by one .tfvars
file.

  1. Configure AWS CLI credentials for the target account, then confirm:
       aws sts get-caller-identity

  2. From the repository root, create terraform/deployments/mvs.tfvars,
     defining (prefix, project_root, table_name, queue_name, per-Lambda
     name/build command/zip path/handler/runtime, frontend_local_dir,
     api_base_placeholder, api_base_search_files), filled in with the
     values below, for example:

       prefix       = "mvs"
       project_root = "../projects/23-marine-vessel-monitoring"

       table_name = "mvs-readings"
       queue_name = "mvs-vessel-agg"

       processor_lambda_name   = "mvs-processor"
       processor_build_command = "cd backend/processor && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp handler.py transform.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
       processor_zip_path      = "backend/processor/lambda.zip"
       processor_handler       = "handler.lambda_handler"
       processor_runtime       = "python3.12"

       dashboard_lambda_name   = "mvs-dashboard-api"
       dashboard_build_command = "cd backend/dashboard && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp lambda_handler.py data_access.py thresholds_proxy.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
       dashboard_zip_path      = "backend/dashboard/lambda.zip"
       dashboard_handler       = "lambda_handler.lambda_handler"
       dashboard_runtime       = "python3.12"

       frontend_local_dir    = "backend/dashboard/static"
       api_base_placeholder  = "%%API_BASE%%"
       api_base_search_files = ["dashboard.js"]

  3. From terraform/, create and switch to a dedicated workspace before
     ever applying (the default workspace already tracks another
     project's live state):
       cd terraform
       terraform workspace new mvs
       terraform workspace list

  4. Build the Lambda zip packages and the EC2 deploy tarball:
       ./build.sh deployments/mvs.tfvars

  5. Review the plan before applying:
       terraform plan -var-file=deployments/mvs.tfvars
     Confirm the "Plan: N to add, 0 to change, 0 to destroy" line shows
     0 to destroy before proceeding.

  6. Apply:
       terraform apply -var-file=deployments/mvs.tfvars

  7. Switch back to the default workspace when finished so the working
     directory doesn't default into this workspace for a later command:
       terraform workspace select default

7. TESTING INSTRUCTIONS
-------------------------
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12+:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

120 tests currently pass across:
  tests/test_aggregation.py              4 tests
  tests/test_alerts.py                  10 tests
  tests/test_buffering.py                4 tests
  tests/test_dashboard_http.py          15 tests
  tests/test_dashboard_lambda_handler.py 10 tests
  tests/test_data_access.py             13 tests
  tests/test_fog_http.py                13 tests
  tests/test_handler.py                  3 tests
  tests/test_publisher.py                9 tests
  tests/test_sensor.py                  12 tests
  tests/test_thresholds_proxy.py         2 tests
  tests/test_transform.py                6 tests
  tests/test_validation.py              19 tests

Run a single file:
  pytest tests/test_aggregation.py

To exercise the pipeline end-to-end against a running local stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 python infra/verify_pipeline.py

For a burst-load check against a running local stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4588 \
    python infra/burst.py --messages 2000 --workers 32
