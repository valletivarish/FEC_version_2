EV Charging Network Monitoring

PREREQUISITES
--------------
- Docker Engine with the Docker Compose v2 plugin (the `docker compose` command)
- Python 3.12+ (only needed to run the test suite or any script locally
  outside Docker; every Dockerfile in this project builds on
  python:3.12-slim)
- pip
- AWS CLI v2 and Terraform >= 1.5 with the hashicorp/aws provider ~> 5.0
  (only needed for the AWS Deployment Steps section)

INSTALLATION STEPS
-------------------
1. Clone the repository.
2. Change into the project directory (all commands below assume this
   is your working directory):
     cd projects/13-ev-charging-network
3. Install the local test dependencies:
     pip install -r requirements-dev.txt

CONFIGURATION
-------------
Sensors (sensors/sensor.py):
  SENSOR_TYPE         required, no default -- one of charging_current_a,
                      battery_soc_pct, station_temp_c, grid_load_kw,
                      session_duration_min
  SITE_ID             default "hub-1"
  SAMPLE_INTERVAL     default "2" (seconds between generated readings)
  DISPATCH_INTERVAL   default "10" (seconds between dispatches to the
                      fog node)
  FOG_URL             default "http://fog:8000/ingest"

Fog node (fog/app.py, fog/publisher.py):
  WINDOW_SECONDS         default "10" (aggregation window length, seconds)
  AWS_ENDPOINT_URL       default unset (boto3 SQS client endpoint override)
  AWS_REGION             default "eu-west-1"
  SQS_QUEUE_NAME         default "ecn-hub-agg"

Lambda processor (backend/processor/handler.py, deploy_lambda.py):
  TABLE_NAME             default "ecn-readings" (DynamoDB table)
  AWS_ENDPOINT_URL       default unset (boto3 endpoint override)
  AWS_REGION             default "eu-west-1"
  SQS_QUEUE_NAME         default "ecn-hub-agg" (deploy_lambda.py:
                        resolves the queue ARN for the event source
                        mapping)
  LAMBDA_FUNCTION_NAME   default "ecn-processor" (deploy_lambda.py only)

Dashboard backend (backend/dashboard/app.py, data_access.py):
  TABLE_NAME             default "ecn-readings" (DynamoDB table)
  SQS_QUEUE_NAME         default "ecn-hub-agg"
  LAMBDA_FUNCTION_NAME   default "ecn-processor"
  AWS_ENDPOINT_URL       default unset (boto3 endpoint override)
  AWS_REGION             default "eu-west-1"
  FOG_HEALTH_URL         default "http://fog:8000/health"
  FOG_THRESHOLDS_URL     default "http://fog:8000/thresholds"
  PORT                   default "8000" (HTTP port the dashboard binds to)

BUILD INSTRUCTIONS
-------------------
Each module is a plain Python service with its own requirements.txt; there
is no compiled artifact:
  pip install -r sensors/requirements.txt            (empty -- stdlib only)
  pip install -r fog/requirements.txt
  pip install -r backend/processor/requirements.txt
  pip install -r backend/dashboard/requirements.txt

Or build each module's Docker image directly:
  docker build -t ecn-sensor sensors/
  docker build -t ecn-fog fog/
  docker build -t ecn-processor backend/processor/
  docker build -t ecn-dashboard backend/dashboard/

Or build every service's image in one step:
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog node, processor, dashboard,
and 10 sensor containers):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8092
  LocalStack:  http://localhost:4578
(the fog node's port 8000 is not published to the host; it is reachable
only at http://fog:8000 inside the compose network)

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
----------------------
No terraform/deployments/*.tfvars file exists yet. To deploy it with the
Terraform configuration in terraform/ at the repository root:

1. Configure AWS credentials for the target account, then confirm them:
     aws sts get-caller-identity

2. Create terraform/deployments/ecn.tfvars with these keys: prefix,
   project_root, table_name, queue_name, processor_lambda_name,
   processor_build_command, processor_zip_path, processor_handler,
   processor_runtime, dashboard_lambda_name, dashboard_build_command,
   dashboard_zip_path, dashboard_handler, dashboard_runtime,
   frontend_local_dir, api_base_placeholder, api_base_search_files.
   - Set project_root to "../projects/13-ev-charging-network".
   - Set table_name to "ecn-readings" and queue_name to "ecn-hub-agg".
   - processor_handler = "handler.lambda_handler",
     processor_runtime = "python3.12".
   - backend/dashboard/app.py currently runs as a plain Flask dev server
     and does not expose a Lambda-compatible handler function yet; add
     one under backend/dashboard/ before setting dashboard_handler and
     dashboard_build_command.
   - frontend_local_dir = "backend/dashboard/static".

3. Add an infra/docker-compose.aws.yml file (the fog node plus all ten
   sensor containers, no localstack service, port 8000 published) for the
   EC2 provisioning step to use.

4. From the terraform/ directory, create and switch to a dedicated
   workspace before running any apply:
     terraform workspace new ecn
     terraform workspace list

5. Build the Lambda zips and deploy tarball, then plan and apply:
     ./build.sh deployments/ecn.tfvars
     terraform plan -var-file=deployments/ecn.tfvars
     terraform apply -var-file=deployments/ecn.tfvars

6. After applying, switch back to the default workspace:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Install test dependencies and run the full suite from the project
directory:
  pip install -r requirements-dev.txt
  pytest

Or without a local Python 3.12+ install:
  docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
    bash -c "pip install -r requirements-dev.txt && pytest"

118 tests currently pass:
  test_aggregation.py       5 tests
  test_alerts.py            11 tests
  test_dashboard_http.py    12 tests
  test_data_access.py       12 tests
  test_fog_http.py          16 tests
  test_handler.py           3 tests
  test_publisher.py         11 tests
  test_sensor.py            21 tests
  test_thresholds_proxy.py  2 tests
  test_transform.py         7 tests
  test_validation.py        18 tests
