Solar Farm Monitoring

1. PREREQUISITES

- Docker and Docker Compose (v2, `docker compose` subcommand)
- Python 3.12+ (only needed to run the test suite or ops scripts directly on
  the host; all four services run in python:3.12-slim containers)
- pip
- AWS CLI v2 (only needed for the AWS Deployment Steps section)
- Terraform >= 1.5 with the AWS provider ~> 5.0 (only needed for the AWS
  Deployment Steps section)

2. INSTALLATION STEPS

1. Clone the repository and change into the project folder:
   git clone <repository-url>
   cd projects/17-solar-farm-monitoring

2. Install the local dependencies needed to run the test suite and the
   infra/ scripts directly on the host:
   pip install -r requirements-dev.txt
   (installs pytest, aiohttp, boto3)

3. CONFIGURATION

Sensors (sensors/sensor.py):
- SENSOR_TYPE - no default, must be set to one of: irradiance_wm2,
  panel_temp_c, inverter_output_kw, dc_voltage_v, soiling_index_pct
- SITE_ID - default "array-1"
- SAMPLE_INTERVAL - default "2" (seconds between generated samples)
- DISPATCH_INTERVAL - default "10" (seconds between batches sent to the fog
  node)
- FOG_URL - default "http://fog:8000/ingest"

Fog node (fog/app.py):
- WINDOW_SECONDS - default "10" (aggregation window length in seconds)
- SQS_QUEUE_NAME - default "sfm-array-agg"
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local
  runs, unset for real AWS
- AWS_REGION - default "eu-west-1"

Backend processor Lambda (backend/processor/handler.py):
- TABLE_NAME - default "sfm-readings"
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local
  runs, unset for real AWS
- AWS_REGION - default "eu-west-1"

LocalStack Lambda deploy script (backend/processor/deploy_lambda.py, used
only inside the local docker-compose stack):
- AWS_ENDPOINT_URL, AWS_REGION - same as above
- SQS_QUEUE_NAME - default "sfm-array-agg"
- TABLE_NAME - default "sfm-readings"
- LAMBDA_FUNCTION_NAME - default "sfm-processor"

Backend dashboard (backend/dashboard/app.py, backend/dashboard/data_access.py):
- TABLE_NAME - default "sfm-readings"
- SQS_QUEUE_NAME - default "sfm-array-agg"
- LAMBDA_FUNCTION_NAME - default "sfm-processor"
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local
  runs, unset for real AWS
- AWS_REGION - default "eu-west-1"
- FOG_HEALTH_URL - default "http://fog:8000/health"
- FOG_THRESHOLDS_URL - default "http://fog:8000/thresholds"
- PORT - default "8000" (dashboard HTTP server listen port)

infra/verify_pipeline.py and infra/burst.py (ops scripts, not a running
service):
- AWS_ENDPOINT_URL - default "http://localhost:4582"
- AWS_REGION - default "eu-west-1"
- SQS_QUEUE_NAME - default "sfm-array-agg" (burst.py only)
- TABLE_NAME - default "sfm-readings" (verify_pipeline.py only)
- VERIFY_TIMEOUT - default "90" (verify_pipeline.py only)
- VERIFY_POLL_INTERVAL - default "3" (verify_pipeline.py only)

4. BUILD INSTRUCTIONS

There is no separate compile step; each module's Docker image installs its
own requirements.txt at image-build time.

Build all four images used by the local stack in one step:
docker compose -f infra/docker-compose.yml build

Or build a single module's image directly:
docker build -t sfm-sensor sensors/
docker build -t sfm-fog fog/
docker build -t sfm-processor backend/processor/
docker build -t sfm-dashboard backend/dashboard/

To install a single module's own dependencies for running it directly on
the host (outside Docker):
pip install -r fog/requirements.txt
pip install -r backend/processor/requirements.txt
pip install -r backend/dashboard/requirements.txt
(sensors/sensor.py has no third-party dependencies -- standard library
only, so sensors/ has no requirements.txt)

5. RUN INSTRUCTIONS

Bring up the full local stack (LocalStack, fog, dashboard, one-shot
processor Lambda deploy, and 10 sensor containers covering 5 sensor types
across array-1/array-2):

cd infra
docker compose up --build

Ports:
- Dashboard: http://localhost:8096 (container port 8000 published as 8096)
- LocalStack: localhost:4582 (container port 4566 published as 4582)
- fog: internal to the compose network only, not published to the host

Stop the stack:
docker compose down

6. AWS DEPLOYMENT STEPS

No terraform/deployments/*.tfvars file exists yet for this project (checked
terraform/deployments/ for an "sfm" prefix, matching this project's
resource naming in infra/docker-compose.yml -- none found). Create one
before applying.

From the repository root:

1. Configure AWS credentials (access key, secret key, session token if
   using temporary credentials):
   aws configure

2. Confirm the credentials resolve to the intended account:
   aws sts get-caller-identity

3. Create terraform/deployments/sfm.tfvars. Follow the key layout already
   used by the other files in that directory (prefix, project_root,
   table_name, queue_name, then a processor_* block and a dashboard_* block
   each carrying a lambda name/build_command/zip_path/handler/runtime, then
   frontend_local_dir, api_base_placeholder, api_base_search_files) --
   reference those files for the FORMAT only, not their content. Values
   already fixed by this project's own code:
     prefix                = "sfm"
     project_root           = "../projects/17-solar-farm-monitoring"
     table_name              = "sfm-readings"
     queue_name               = "sfm-array-agg"
     processor_lambda_name    = "sfm-processor"
     processor_handler        = "handler.lambda_handler"
     processor_runtime        = "python3.12"
     dashboard_runtime        = "python3.12"
     frontend_local_dir       = "backend/dashboard/static"
   The processor module packages the same two files
   backend/processor/deploy_lambda.py already zips for its LocalStack path
   (handler.py + transform.py). For processor_build_command: install
   backend/processor/requirements.txt into a build directory, copy
   handler.py and transform.py into it, then zip that directory to
   backend/processor/lambda.zip (processor_zip_path); set
   processor_handler to handler.lambda_handler.
   backend/dashboard/ currently only exposes app.py's standalone
   ThreadingHTTPServer entry point, which is not API Gateway-proxy
   compatible -- add a lambda_handler.py there (a lambda_handler(event,
   context) function dispatching API Gateway proxy-integration requests
   into the existing data_access.py/scoring.py/thresholds_proxy.py
   functions) before filling in dashboard_lambda_name/
   dashboard_build_command/dashboard_zip_path/dashboard_handler.
   backend/dashboard/static/dashboard.js's fetch() calls currently use
   relative paths (e.g. "/api/arrays") with no API-base placeholder in
   index.html -- add one (matching whatever value you set for
   api_base_placeholder) before deploying, so the S3-hosted frontend can
   reach the API Gateway origin instead of its own relative path.
   the module's ec2_compose_file variable defaults to
   docker-compose.aws.yml under ec2_source_dirs (sensors, fog, infra), so
   also add infra/docker-compose.aws.yml (the fog and sensor services only,
   without LocalStack, with the fog service's port published -- unlike
   infra/docker-compose.yml, which keeps fog internal to the compose
   network only) before applying.

4. Change into the Terraform module directory:
   cd terraform

5. Create and switch to a dedicated workspace for this project (do not
   apply into the default workspace):
   terraform workspace new sfm
   terraform workspace list

6. Build the Lambda zips and the EC2 deploy tarball (must run before
   apply):
   ./build.sh deployments/sfm.tfvars

7. Review the plan:
   terraform plan -var-file=deployments/sfm.tfvars

8. Apply:
   terraform apply -var-file=deployments/sfm.tfvars

9. Read the resulting resource identifiers and URLs:
   terraform output

10. When finished, switch back to the default workspace so the working
    directory does not default into this project's workspace next time:
    terraform workspace select default

To tear the stack down:
cd terraform
terraform workspace select sfm
terraform destroy -var-file=deployments/sfm.tfvars

7. TESTING INSTRUCTIONS

Run the full suite from the project root (pytest.ini sets testpaths=tests):
pip install -r requirements-dev.txt
pytest

-> 111 tests pass: test_aggregation.py (3), test_alerts.py (12),
test_buffering.py (6), test_dashboard_http.py (11), test_data_access.py
(13), test_fog_http.py (14), test_handler.py (3), test_publisher.py (7),
test_scoring.py (7), test_sensor.py (9), test_thresholds_proxy.py (2),
test_transform.py (5), test_validation.py (19).

Or without a local Python install:
docker run --rm -v "$PWD":/app -w /app python:3.12-slim \
  bash -c "pip install -r requirements-dev.txt && pytest"

With the local stack running (see RUN INSTRUCTIONS), two additional
end-to-end scripts are available:

Pipeline verification -- polls DynamoDB until every sensor type has landed
at least one row:
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4582 \
  python infra/verify_pipeline.py

Load test -- sends a burst of synthetic messages straight to the queue and
checks it drains:
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_ENDPOINT_URL=http://localhost:4582 \
  python infra/burst.py --messages 2000 --workers 32
