Smart Parking Management

1. PREREQUISITES

- Docker Engine with the Docker Compose v2 plugin (the "docker compose" command)
- Python 3.12 (matches the base image used by every Dockerfile in this project)
- pip
- AWS CLI (only needed for the AWS Deployment Steps section)
- Terraform (only needed for the AWS Deployment Steps section)

2. INSTALLATION STEPS

1) Clone the repository and change into this project's directory:
   cd projects/14-smart-parking-management

2) Create a virtual environment and install the dependencies needed to run
   the test suite locally:
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements-dev.txt

3. CONFIGURATION

The following environment variables are read directly from the process
environment. Defaults shown are the values used when a variable is unset.

- AWS_ENDPOINT_URL - custom AWS service endpoint (e.g. a LocalStack URL).
  Unset by default, in which case boto3 talks to real AWS endpoints.
  Read by fog/app.py, backend/processor/handler.py,
  backend/processor/deploy_lambda.py, backend/dashboard/data_access.py.

- AWS_REGION - AWS region for every boto3 client. Default: eu-west-1.
  Read by the same four files listed above.

- SQS_QUEUE_NAME - SQS queue the fog node publishes window-aggregate
  messages to. Default: spm-lot-agg.
  Read by fog/app.py, backend/processor/deploy_lambda.py,
  backend/dashboard/data_access.py.

- TABLE_NAME - DynamoDB table window aggregates are written to and read
  from. Default: spm-readings.
  Read by backend/processor/handler.py, backend/processor/deploy_lambda.py,
  backend/dashboard/data_access.py.

- LAMBDA_FUNCTION_NAME - name of the deployed processor Lambda function.
  Default: spm-processor.
  Read by backend/processor/deploy_lambda.py, backend/dashboard/data_access.py.

- WINDOW_SECONDS - length in seconds of the fog node's aggregation window
  (also the interval between flushes). Default: 10.
  Read by fog/app.py.

- FOG_HEALTH_URL - URL the dashboard polls for the fog node's health check.
  Default: http://fog:8000/health.
  Read by backend/dashboard/app.py.

- FOG_THRESHOLDS_URL - URL the dashboard fetches the fog node's alert
  threshold catalogue from. Default: http://fog:8000/thresholds.
  Read by backend/dashboard/app.py.

- PORT - port the dashboard's HTTP server listens on. Default: 8000.
  Read by backend/dashboard/app.py.

- SENSOR_TYPE - the metric this sensor container simulates. One of:
  occupied_spaces, entry_rate_per_min, exit_rate_per_min,
  avg_dwell_time_min, gate_fault_events. Required, no default.
  Read by sensors/sensor.py.

- SITE_ID - the parking lot ID this sensor container simulates.
  Default: lot-a.
  Read by sensors/sensor.py.

- SAMPLE_INTERVAL - seconds between simulated sensor samples. Default: 2.
  Read by sensors/sensor.py.

- DISPATCH_INTERVAL - seconds between batches sent to the fog node's
  /ingest endpoint. Default: 10.
  Read by sensors/sensor.py.

- FOG_URL - URL the sensor container posts readings to.
  Default: http://fog:8000/ingest.
  Read by sensors/sensor.py.

4. BUILD INSTRUCTIONS

Each service is built as its own Docker image; dependencies are installed
inside the image build, not on the host.

- sensors: no third-party dependencies (standard library only, no
  requirements.txt). Build: docker build -t spm-sensor ./sensors

- fog: installs fog/requirements.txt (boto3==1.35.90).
  Build: docker build -t spm-fog ./fog

- backend/processor: installs backend/processor/requirements.txt
  (boto3==1.35.90).
  Build: docker build -t spm-processor ./backend/processor

- backend/dashboard: installs backend/dashboard/requirements.txt
  (boto3==1.35.90).
  Build: docker build -t spm-dashboard ./backend/dashboard

To build every image at once via Compose:
docker compose -f infra/docker-compose.yml build

5. RUN INSTRUCTIONS

From the project root:
cd infra
docker compose up --build

This brings up the following (Compose project name: spm):

- localstack - SQS, DynamoDB and Lambda emulation. Host port 4579 maps to
  container port 4566.
- fog - the fog aggregation node. Not published to the host; reachable at
  http://fog:8000 from other containers on the Compose network.
- processor - a one-shot container (restart: "no") that packages and
  deploys backend/processor/handler.py as a real Lambda function inside
  LocalStack and wires it to the SQS queue via an event source mapping.
- dashboard - the dashboard API and static frontend. Host port 8093 maps
  to container port 8000. Open http://localhost:8093 in a browser.
- 10 sensor containers (sensor-occupied-a, sensor-occupied-b,
  sensor-entry-a, sensor-entry-b, sensor-exit-a, sensor-exit-b,
  sensor-dwell-a, sensor-dwell-b, sensor-gatefault-a,
  sensor-gatefault-b) - no published ports; each posts simulated
  readings to the fog node's /ingest endpoint.

To stop the stack:
docker compose down
(add -v to also remove the LocalStack volume/state)

6. AWS DEPLOYMENT STEPS

No terraform/deployments/*.tfvars file exists yet for this project. Follow
these steps to deploy it using the Terraform module in terraform/:

1) Obtain AWS credentials for the target account and configure them:
   aws configure
   (enter the access key, secret key, and session token if using
   temporary/session credentials)

2) Confirm the credentials point at the intended account:
   aws sts get-caller-identity

3) From the repository root, create and switch to a dedicated Terraform
   workspace for this project, so the apply cannot be planned against
   different tracked state:
   cd terraform
   terraform workspace new spm
   terraform workspace list
   (confirm spm is marked as the current workspace)

4) Create terraform/deployments/spm.tfvars, following the variable names
   and structure of the other .tfvars files already in that directory
   (use their FORMAT as a reference only, not their values), setting:
   - prefix: spm
   - project_root: ../projects/14-smart-parking-management
   - table_name: spm-readings
   - queue_name: spm-lot-agg
   - processor_lambda_name: spm-processor
   - processor_build_command: a command that installs
     backend/processor/requirements.txt into a build directory, copies
     handler.py and transform.py into it, and zips the result to
     lambda.zip
   - processor_zip_path: backend/processor/lambda.zip
   - processor_handler: handler.lambda_handler
   - processor_runtime: python3.12
   - dashboard_lambda_name: spm-dashboard-api
   - dashboard_build_command: a command that installs
     backend/dashboard/requirements.txt into a build directory, copies the
     dashboard's Lambda entry-point module and its supporting files into
     it, and zips the result to lambda.zip. backend/dashboard/app.py
     currently runs as a WSGI server, not an API-Gateway-shaped Lambda
     handler -- write a Lambda entry point that maps API Gateway
     proxy-integration events onto the existing data_access.py/status.py/
     thresholds_proxy.py logic before this step.
   - dashboard_zip_path: backend/dashboard/lambda.zip
   - dashboard_handler: the module.function path of that new Lambda entry
     point
   - dashboard_runtime: python3.12
   - frontend_local_dir: backend/dashboard/static
   - api_base_placeholder: a placeholder token to substitute the deployed
     API Gateway URL into at upload time (add it to
     static/index.html or static/dashboard.js wherever the frontend reads
     its API base -- neither file currently defines one)
   - api_base_search_files: the file(s) containing that placeholder

5) Build and apply:
   cd terraform
   ./build.sh deployments/spm.tfvars
   terraform apply -var-file=deployments/spm.tfvars
   Read the "Plan: N to add, 0 to change, 0 to destroy" line before
   confirming; do not proceed if the destroy count is nonzero.

6) After the apply completes, switch back to the default workspace:
   terraform workspace select default

7. TESTING INSTRUCTIONS

From the project root, with requirements-dev.txt installed (see
Installation Steps):
pytest
(pytest.ini sets testpaths=tests, so this is equivalent to
python -m pytest tests/ -q)

127 tests pass across 13 test files:
- tests/test_aggregation.py: 5
- tests/test_alerts.py: 10
- tests/test_buffering.py: 9
- tests/test_dashboard_http.py: 10
- tests/test_data_access.py: 13
- tests/test_fog_http.py: 13
- tests/test_handler.py: 3
- tests/test_publisher.py: 10
- tests/test_sensor.py: 22
- tests/test_status.py: 6
- tests/test_thresholds_proxy.py: 2
- tests/test_transform.py: 7
- tests/test_validation.py: 17

To run a single test file:
pytest tests/test_aggregation.py -q
