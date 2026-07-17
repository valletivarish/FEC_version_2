Bridge & Structural Health Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - Python 3.12+ (to run the test suite and the infra/ scripts outside
    Docker; each service's own Dockerfile also uses python:3.12-slim)
  - AWS CLI and Terraform >= 1.5 (only needed for the AWS deployment steps)

INSTALLATION STEPS
--------------------
  1. Clone the repository and change into this project's folder:
       cd projects/21-bridge-structural-health
  2. All commands below assume this folder is your working directory.
  3. To run the test suite or the infra/ scripts locally (outside Docker),
     install the Python dependencies:
       pip install -r requirements-dev.txt
     No install step is needed just to run the Docker stack -- each
     service's own Dockerfile installs its own requirements.txt inside
     its image at build time.

CONFIGURATION
--------------
Environment variables actually read by the code, by component:

  sensors/ (sensor.py):
    SENSOR_TYPE          sensor type this container simulates, no
                         default (must be set)
    SITE_ID              bridge span identifier, default "span-a"
    SAMPLE_INTERVAL      seconds between generated readings, default "2"
    DISPATCH_INTERVAL    seconds between dispatches to the fog node,
                         default "10"
    FOG_URL               fog node ingest URL, default
                         "http://fog:8000/ingest"

  fog/ (app.py):
    WINDOW_SECONDS       aggregation window length in seconds, default
                         "10"
    SQS_QUEUE_NAME        target SQS queue name, default "bshm-span-agg"
    AWS_ENDPOINT_URL      AWS endpoint override (set for LocalStack,
                         unset for real AWS so boto3's default
                         credential/endpoint chain is used), no default
    AWS_REGION             AWS region, default "eu-west-1"

  backend/processor/ (handler.py, the Lambda entry point):
    TABLE_NAME            DynamoDB table name, default "bshm-readings"
    AWS_ENDPOINT_URL      AWS endpoint override (LocalStack only), no
                         default
    AWS_REGION             AWS region, default "eu-west-1"

  backend/processor/deploy_lambda.py (LocalStack-only packaging helper,
  not used for the real AWS deployment):
    AWS_ENDPOINT_URL      no default
    AWS_REGION             default "eu-west-1"
    SQS_QUEUE_NAME          default "bshm-span-agg"
    TABLE_NAME              default "bshm-readings"
    LAMBDA_FUNCTION_NAME    default "bshm-processor"

  backend/dashboard/ (app.py for local/Docker, lambda_handler.py for the
  real AWS deployment; both call into data_access.py, which owns the
  boto3 client construction):
    TABLE_NAME              DynamoDB table name, default "bshm-readings"
    SQS_QUEUE_NAME           SQS queue name (for queue-depth checks),
                            default "bshm-span-agg"
    LAMBDA_FUNCTION_NAME     processor Lambda name (for health checks),
                            default "bshm-processor"
    AWS_ENDPOINT_URL        AWS endpoint override (LocalStack only), no
                            default
    AWS_REGION                AWS region, default "eu-west-1"
    FOG_HEALTH_URL            fog node health endpoint, default
                            "http://fog:8000/health"
    FOG_THRESHOLDS_URL        fog node thresholds endpoint, default
                            "http://fog:8000/thresholds"
    PIPELINE_FRESH_SECONDS    max age in seconds for the freshest window
                            before /api/health reports the pipeline
                            unhealthy, default "30"
    PORT                      port app.py's HTTP server binds to
                            (local/Docker only), default "8000"

  infra/verify_pipeline.py:
    AWS_ENDPOINT_URL    default "http://localhost:4586"
    AWS_REGION          default "eu-west-1"
    TABLE_NAME          default "bshm-readings"
    VERIFY_TIMEOUT      seconds to poll before giving up, default "90"

  infra/burst.py:
    AWS_ENDPOINT_URL    default "http://localhost:4586"
    AWS_REGION          default "eu-west-1"
    SQS_QUEUE_NAME      default "bshm-span-agg"

BUILD INSTRUCTIONS
--------------------
Each Python module has its own requirements.txt and builds inside its own
Docker image (no separate compile step needed):
  cd sensors && docker build -t bshm-sensor .          (stdlib only, no
                                                          requirements.txt)
  cd fog && docker build -t bshm-fog .
  cd backend/processor && docker build -t bshm-processor .
  cd backend/dashboard && docker build -t bshm-dashboard .

Or build all of them at once via Docker Compose:
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog node, one-shot Lambda
deploy job, dashboard, and all 10 sensor containers for span-a/span-b):
  docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
  Dashboard:  http://localhost:8100  (container port 8000)
  LocalStack: http://localhost:4586  (container port 4566)

The fog node (container port 8000) is not published to the host in this
compose file; it is reachable only from other containers on the compose
network at http://fog:8000.

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

If "down -v" reports the network is still in use, LocalStack's own
Lambda-executor helper container can be left behind. Check for it and
remove it, then remove the network:
  docker ps -a --filter "name=bshm"
  docker network ls --filter "name=bshm"
  docker rm -f <the lambda-executor container name>
  docker network rm bshm_default

AWS DEPLOYMENT STEPS
-----------------------
Deployment uses the Terraform module in terraform/, with the
existing terraform/deployments/bshm.tfvars file for this project's
resource names and build commands.

  1. Configure AWS credentials for the target account:
       aws configure
     (or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
     AWS_SESSION_TOKEN directly)
  2. Confirm you are pointed at the correct account:
       aws sts get-caller-identity
  3. From the repo root, create and switch to a dedicated Terraform
     workspace for this project before ever applying:
       cd terraform
       terraform workspace new bshm
       terraform workspace list
  4. Build the Lambda zips and the EC2 deploy tarball:
       ./build.sh deployments/bshm.tfvars
  5. Review the plan:
       terraform plan -var-file=deployments/bshm.tfvars
  6. Apply:
       terraform apply -var-file=deployments/bshm.tfvars
  7. When finished, switch back to the default workspace so it does not
     carry into the next deployment run:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Install the test dependencies and run the full suite from the project
root:
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

Real per-file test counts (verified by running the suite):
  tests/test_aggregation.py:       4 tests
  tests/test_alerts.py:            9 tests
  tests/test_buffering.py:         7 tests
  tests/test_dashboard_http.py:   13 tests
  tests/test_data_access.py:      13 tests
  tests/test_fog_http.py:         10 tests
  tests/test_handler.py:           3 tests
  tests/test_lambda_handler.py:   13 tests
  tests/test_publisher.py:         5 tests
  tests/test_scoring.py:          10 tests
  tests/test_sensor.py:            8 tests
  tests/test_thresholds_proxy.py:  2 tests
  tests/test_transform.py:         6 tests
  tests/test_validation.py:       12 tests
  total:                          115 tests, all passing

End-to-end pipeline check, with the local stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4586 python infra/verify_pipeline.py

Load test:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4586 \
    python infra/burst.py --messages 2000 --workers 32

Or probe the dashboard's own REST API directly:
  curl http://localhost:8100/api/health
  curl http://localhost:8100/api/thresholds
  curl http://localhost:8100/api/spans
  curl "http://localhost:8100/api/readings?sensor_type=strain_microstrain&site_id=span-a&limit=10"
  curl http://localhost:8100/api/backend-stats
