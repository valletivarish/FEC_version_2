Smart Agriculture Fog/Edge Pipeline

All commands below assume your working directory is this folder
(projects/01-smart-agriculture/) unless stated otherwise.

PREREQUISITES
-------------
- Docker and Docker Compose (to run the local stack)
- Python 3.12+ (to run the unit tests locally; matches the python:3.12-slim
  base image used by every Dockerfile in this project)
- pip
- AWS CLI (for the AWS deployment steps)
- Terraform (for the AWS deployment steps)

INSTALLATION STEPS
-------------------
1. Clone the repository and change into this project's folder:
     git clone <repository-url>
     cd projects/01-smart-agriculture
2. Install the local Python dependencies needed to run the test suite:
     pip install -r requirements-dev.txt

CONFIGURATION
-------------
Environment variables read by the code, with their real defaults:

  SENSOR_TYPE            sensors/sensor.py. No default, required. One of:
                         soil_moisture, temperature, humidity,
                         light_intensity, rainfall.
  SITE_ID                sensors/sensor.py. Default "field-1". Site
                         identifier attached to each posted reading batch.
  SAMPLE_INTERVAL        sensors/sensor.py. Default "2". Seconds between
                         generated readings.
  DISPATCH_INTERVAL      sensors/sensor.py. Default "10". Seconds between
                         posts to the fog node.
  FOG_URL                sensors/sensor.py. Default
                         "http://fog:8000/ingest". Fog node ingest endpoint
                         the sensor posts batches to.
  WINDOW_SECONDS         fog/app.py. Default "10". Length in seconds of the
                         fog node's aggregation window.
  SQS_QUEUE_NAME         fog/app.py, backend/processor/handler.py (via
                         deploy_lambda.py), backend/dashboard/app.py,
                         infra/burst.py, infra/verify_pipeline.py. Default
                         "fec-sensor-agg". SQS queue the fog node publishes
                         window aggregates to.
  AWS_ENDPOINT_URL       fog/app.py, backend/processor/handler.py,
                         backend/processor/deploy_lambda.py,
                         backend/dashboard/app.py. No default (unset), which
                         makes boto3 talk to real AWS; set to a LocalStack
                         URL (e.g. http://localstack:4566) for local runs.
                         infra/burst.py and infra/verify_pipeline.py default
                         this to "http://localhost:4566".
  AWS_REGION             fog/app.py, backend/processor/handler.py,
                         backend/processor/deploy_lambda.py,
                         backend/dashboard/app.py, infra/burst.py,
                         infra/verify_pipeline.py. Default "eu-west-1".
                         Region used for every boto3 client.
  TABLE_NAME             backend/processor/handler.py,
                         backend/processor/deploy_lambda.py,
                         backend/dashboard/app.py, infra/verify_pipeline.py.
                         Default "fec-readings". DynamoDB table records are
                         written to and read from.
  LAMBDA_FUNCTION_NAME   backend/processor/deploy_lambda.py,
                         backend/dashboard/app.py. Default "fec-processor".
                         Name of the processor Lambda function whose state
                         the dashboard's health check looks up.
  FOG_HEALTH_URL         backend/dashboard/app.py. Default
                         "http://fog:8000/health". URL the dashboard polls
                         to determine fog node health.
  VERIFY_TIMEOUT         infra/verify_pipeline.py. Default "90". Seconds to
                         wait for data to appear in DynamoDB before giving
                         up.

BUILD INSTRUCTIONS
-------------------
Per-module dependency installs (each module's own requirements.txt; sensors
has no requirements.txt, it uses only the Python standard library):
  pip install -r fog/requirements.txt
  pip install -r backend/processor/requirements.txt
  pip install -r backend/dashboard/requirements.txt

Or, for the full local test environment in one step:
  pip install -r requirements-dev.txt

Build the Docker images used by the local stack:
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
-----------------
Bring up the full local stack (LocalStack, fog node, six sensor containers,
one-shot Lambda-processor deployer, and dashboard):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8080  (container port 8000)
  LocalStack:  http://localhost:4566

Stop and remove the stack (including volumes):
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
----------------------
Deployment is done through the Terraform module at terraform/ in the
repository root, using this project's deployment file,
terraform/deployments/fec-agri.tfvars, and the prefix "fec-agri".

1. Configure AWS credentials for the target account:
     aws configure
   (or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and
   AWS_SESSION_TOKEN directly)
2. Confirm you are pointed at the correct account:
     aws sts get-caller-identity
3. From the repository root, create and switch to a dedicated Terraform
   workspace for this project (never apply against the default workspace):
     cd terraform
     terraform workspace new fec-agri
     terraform workspace list
4. Build the Lambda deployment packages and the EC2 source tarball:
     ./build.sh deployments/fec-agri.tfvars
5. Review the plan before applying:
     terraform plan -var-file=deployments/fec-agri.tfvars
6. Apply:
     terraform apply -var-file=deployments/fec-agri.tfvars
7. When finished, switch back to the default workspace so it is not left
   pointed at this project's state:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Install test dependencies and run the suite from this project's root
(pytest.ini sets testpaths = tests):
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12 install:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

39 tests total, verified by running the suite:
  tests/test_aggregation.py            3
  tests/test_alerts.py                 5
  tests/test_dashboard.py              8
  tests/test_dashboard_static_layout.py 4
  tests/test_fog_endpoint.py           3
  tests/test_handler.py                2
  tests/test_process.py                4
  tests/test_publisher.py              6
  tests/test_sensor.py                 4
