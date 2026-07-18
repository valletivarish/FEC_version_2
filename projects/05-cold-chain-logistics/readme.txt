Cold Chain Logistics

===========================================================================
1. PREREQUISITES
===========================================================================

- Docker and Docker Compose (v2 syntax; infra/docker-compose.yml uses the
  top-level "name:" key)
- Python 3.12 (the python:3.12-slim base image used by the Dockerfiles)
- pip
- AWS CLI v2, configured with credentials for the target AWS account
  (needed only for section 6, AWS Deployment Steps)
- Terraform (needed only for section 6)
- zip (needed only for section 6, to package Lambda deployment artifacts)

===========================================================================
2. INSTALLATION STEPS
===========================================================================

1. Clone the repository.
2. cd into projects/05-cold-chain-logistics.
3. Create and activate a Python virtual environment:
   python3 -m venv venv
   source venv/bin/activate
4. Install the dependencies needed to run the test suite locally:
   pip install -r requirements-dev.txt

===========================================================================
3. CONFIGURATION
===========================================================================

Sensors (sensors/sensor.py):
- SENSOR_TYPE          - required, no default. One of: storage_temperature,
                          humidity, door_open_seconds, shock_vibration,
                          co2_level. Selects which reading profile the
                          sensor simulates.
- SITE_ID              - default "container-1". Container identifier
                          attached to every reading this sensor sends.
- SAMPLE_INTERVAL      - default "2". Seconds between simulated readings.
- DISPATCH_INTERVAL    - default "10". Seconds between batch POSTs to the
                          fog relay.
- FOG_URL              - default "http://fog:8000/ingest". URL the sensor
                          posts its reading batches to.

Fog relay (fog/app.py, fog/publisher.py):
- WINDOW_SECONDS       - default "10". Length of each aggregation window
                          in seconds.
- SQS_QUEUE_NAME       - default "fcl-manifest-agg". SQS queue that window
                          aggregates are published to.
- AWS_ENDPOINT_URL     - default unset. AWS endpoint override; set to
                          http://localstack:4566 for local runs, leave
                          unset for real AWS.
- AWS_REGION           - default "eu-west-1". Region for the SQS client.

Backend processor (backend/processor/handler.py, deploy_lambda.py):
- TABLE_NAME           - default "fcl-readings". DynamoDB table window
                          aggregates are written to.
- AWS_ENDPOINT_URL     - default unset.
- AWS_REGION           - default "eu-west-1".
- SQS_QUEUE_NAME       - default "fcl-manifest-agg". Used by
                          deploy_lambda.py to look up the queue ARN wired
                          as this Lambda's event source (LocalStack-only
                          deploy tooling).
- LAMBDA_FUNCTION_NAME - default "fcl-processor". Used by deploy_lambda.py
                          to name the deployed function (LocalStack-only
                          deploy tooling).

Backend dashboard (backend/dashboard/routes.py, health.py):
- TABLE_NAME           - default "fcl-readings". DynamoDB table read by
                          the manifest/readings/backend-stats endpoints.
- SQS_QUEUE_NAME       - default "fcl-manifest-agg". SQS queue read for
                          queue-depth and health checks.
- LAMBDA_FUNCTION_NAME - default "fcl-processor". Lambda function name
                          checked by GET /api/health.
- AWS_ENDPOINT_URL     - default unset.
- AWS_REGION           - default "eu-west-1".
- FOG_HEALTH_URL       - default "http://fog:8000/health". Fog relay
                          health-check URL.
- FOG_THRESHOLDS_URL   - default "http://fog:8000/thresholds". Fog relay
                          alert-threshold URL.

Standard AWS SDK credential variables (consumed by boto3's default
credential chain): AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY. Local Docker
Compose sets both to "test" for LocalStack; real AWS deployment relies on
the IAM role/instance profile or configured CLI credentials instead.

===========================================================================
4. BUILD INSTRUCTIONS
===========================================================================

Build every module's Docker image in one step (from the project root):
   docker compose -f infra/docker-compose.yml build

Or build an individual module's image:
   docker build -t fcl-sensor ./sensors
   docker build -t fcl-fog ./fog
   docker build -t fcl-processor ./backend/processor
   docker build -t fcl-dashboard ./backend/dashboard

To install a module's dependencies locally without Docker (e.g. to run it
or its tests directly):
   pip install -r fog/requirements.txt
   pip install -r backend/processor/requirements.txt
   pip install -r backend/dashboard/requirements.txt

sensors/sensor.py has no requirements.txt; it uses only the Python
standard library.

===========================================================================
5. RUN INSTRUCTIONS
===========================================================================

From the project root:
   cd infra
   docker compose up --build

This starts:
- localstack        - host port 4570 -> container port 4566
- fog                - no host port published; reachable at
                       http://fog:8000 from other containers on the
                       compose network
- processor          - one-shot container (restart: "no"); deploys
                       handler.py as a Lambda into LocalStack, wires it to
                       the SQS queue, then exits
- dashboard          - host port 8084 -> container port 8000
- 10 sensor containers (sensor-temp-c1/c2, sensor-humidity-c1/c2,
  sensor-door-c1/c2, sensor-shock-c1/c2, sensor-co2-c1/c2) - no host ports
  published

Dashboard UI:  http://localhost:8084
Dashboard API: http://localhost:8084/api/...
LocalStack endpoint: http://localhost:4570

To stop everything:
   docker compose down

===========================================================================
6. AWS DEPLOYMENT STEPS
===========================================================================

No terraform/deployments/*.tfvars file exists yet.
Follow these steps to prepare and deploy it:

1. Confirm AWS credentials are configured for the target account:
   aws sts get-caller-identity

2. Create terraform/deployments/fcl.tfvars defining the fields below:
   prefix                   = "fcl"
   project_root             = "../projects/05-cold-chain-logistics"
   table_name               = "fcl-readings"
   queue_name               = "fcl-manifest-agg"
   processor_lambda_name    = "fcl-processor"
   processor_build_command  = <command that installs backend/processor's
                                requirements.txt into a build directory,
                                copies handler.py and reshape.py into it,
                                and zips the result>
   processor_zip_path       = "backend/processor/lambda.zip"
   processor_handler        = "handler.lambda_handler"
   processor_runtime        = "python3.12"
   dashboard_lambda_name    = "fcl-dashboard-api"
   dashboard_build_command  = <command that packages a Lambda-compatible
                                handler for backend/dashboard>
   dashboard_zip_path       = "backend/dashboard/lambda.zip"
   dashboard_handler        = <entry point of that handler>
   dashboard_runtime        = "python3.12"
   frontend_local_dir       = "backend/dashboard/static"
   api_base_placeholder     = <a placeholder token>
   api_base_search_files    = ["index.html"]

   backend/processor/handler.py already exposes a Lambda-shaped entry
   point (lambda_handler(event, context)), so the processor fields above
   can be filled in directly. backend/dashboard has no Lambda-handler
   module yet; add one (an entry point function accepting (event,
   context), built on top of the existing ManifestRepository/health-check
   code in routes.py and health.py) before filling in the dashboard_* fields.
   backend/dashboard/static/dashboard.js currently calls the API via
   relative /api/... paths (same-origin); add a placeholder token to
   index.html and prefix those fetch calls with it before filling in
   api_base_placeholder/api_base_search_files.

3. Add infra/docker-compose.aws.yml alongside the existing
   infra/docker-compose.yml: the fog service and the 10 sensor services,
   with fog's port published, and no localstack/processor/dashboard
   services (those are provisioned separately by Terraform as Lambda/S3
   resources).

4. terraform workspace new fcl
5. terraform workspace list
   (confirm "fcl" is the selected workspace before applying)
6. cd terraform
7. ./build.sh deployments/fcl.tfvars
8. terraform plan -var-file=deployments/fcl.tfvars
   (confirm the plan shows only resources being added, 0 to destroy)
9. terraform apply -var-file=deployments/fcl.tfvars
10. terraform workspace select default

===========================================================================
7. TESTING INSTRUCTIONS
===========================================================================

From the project root, with requirements-dev.txt installed (see section 2):
   pytest

133 tests total, across 10 files:
   tests/test_aggregation.py  - 21 tests
   tests/test_alerts.py       - 9 tests
   tests/test_app.py          - 7 tests
   tests/test_fog_endpoint.py - 15 tests
   tests/test_handler.py      - 12 tests
   tests/test_health.py       - 16 tests
   tests/test_publisher.py    - 20 tests
   tests/test_reshape.py      - 8 tests
   tests/test_routes.py       - 12 tests
   tests/test_sensor.py       - 13 tests

To run a single file:
   pytest tests/test_aggregation.py
