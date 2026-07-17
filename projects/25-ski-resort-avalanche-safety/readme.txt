Ski Resort Avalanche Safety Monitoring

PREREQUISITES
--------------
- Docker Engine with the Compose v2 plugin (`docker compose`)
- Node.js 20.x and npm (matches the node:20-slim base image used by every
  Dockerfile in this project: sensors, fog, backend/processor,
  backend/dashboard)
- Python 3.9+ with the boto3 package (`pip install boto3`) -- only needed
  to run the optional pipeline verification scripts in infra/
  (verify_pipeline.py, burst.py)
- AWS CLI v2 and Terraform >= 1.5 -- only needed for the AWS Deployment
  Steps section below

INSTALLATION STEPS
--------------------
1. Clone the repository and change into the project folder:
     cd projects/25-ski-resort-avalanche-safety
   All further commands below assume this working directory unless a
   different one is stated.

2. Install each Node module's own dependencies (needed to run its unit
   tests locally; `docker compose` installs these automatically inside
   each image when building, so this step is only required for running
   tests or editing code outside Docker):
     cd sensors && npm install && cd ..
     cd fog && npm install && cd ..
     cd backend/processor && npm install && cd ../..
     cd backend/dashboard && npm install && cd ../..

3. Only if you plan to run the optional verification scripts in infra/:
     pip install boto3

CONFIGURATION
--------------
sensors/sensor.js reads:
  SENSOR_TYPE       -- no default, must be set; one of snowpack_depth_cm,
                        snow_temp_c, wind_speed_kmh, seismic_vibration_mg,
                        lift_chair_count
  SITE_ID           -- default "slope-a"
  SAMPLE_INTERVAL   -- default "2" (seconds between simulated samples)
  DISPATCH_INTERVAL -- default "10" (seconds between dispatch attempts to
                        the fog node)
  FOG_URL           -- default "http://fog:8000/ingest"

fog/app.js and fog/publisher.js read:
  WINDOW_SECONDS       -- default "10" (aggregation window length)
  SQS_QUEUE_NAME       -- default "ska-slope-agg"
  AWS_ENDPOINT_URL     -- unset by default; when set, the fog node's SQS
                           client targets this endpoint (e.g. LocalStack);
                           when unset, the AWS SDK's default credential
                           chain and endpoint are used
  AWS_REGION           -- default "eu-west-1"
  AWS_ACCESS_KEY_ID    -- default "test" (only applied when
                           AWS_ENDPOINT_URL is set)
  AWS_SECRET_ACCESS_KEY -- default "test" (only applied when
                           AWS_ENDPOINT_URL is set)

backend/processor/handler.js reads:
  TABLE_NAME            -- default "ska-readings"
  AWS_REGION            -- default "eu-west-1"
  AWS_ENDPOINT_URL      -- unset by default; same LocalStack-vs-real
                            behavior as above
  AWS_ACCESS_KEY_ID     -- default "test" (only applied when
                            AWS_ENDPOINT_URL is set)
  AWS_SECRET_ACCESS_KEY -- default "test" (only applied when
                            AWS_ENDPOINT_URL is set)

backend/processor/deploy_lambda.sh (LocalStack-only packaging/deploy
script invoked by its own Docker container) additionally reads:
  SQS_QUEUE_NAME     -- default "ska-slope-agg"
  LAMBDA_FUNCTION_NAME -- default "ska-processor"
  TABLE_NAME         -- default "ska-readings"

backend/dashboard/server.js, lambdaHandler.js and awsClients.js read:
  TABLE_NAME            -- default "ska-readings"
  SQS_QUEUE_NAME        -- default "ska-slope-agg"
  LAMBDA_FUNCTION_NAME  -- default "ska-processor"
  FOG_HEALTH_URL        -- default "http://fog:8000/health"
  FOG_THRESHOLDS_URL    -- default "http://fog:8000/thresholds"
  AWS_REGION            -- default "eu-west-1"
  AWS_ENDPOINT_URL      -- unset by default; same LocalStack-vs-real
                            behavior as above
  AWS_ACCESS_KEY_ID     -- default "test" (only applied when
                            AWS_ENDPOINT_URL is set)
  AWS_SECRET_ACCESS_KEY -- default "test" (only applied when
                            AWS_ENDPOINT_URL is set)

infra/verify_pipeline.py and infra/burst.py (optional scripts) read:
  AWS_ENDPOINT_URL  -- default "http://localhost:4590"
  AWS_REGION        -- default "eu-west-1"
  TABLE_NAME        -- default "ska-readings" (verify_pipeline.py)
  SQS_QUEUE_NAME    -- default "ska-slope-agg" (burst.py)
  VERIFY_TIMEOUT    -- default "90" (verify_pipeline.py, seconds)

BUILD INSTRUCTIONS
--------------------
Node modules (dependency install, per module):
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

Docker images (built automatically by `docker compose up --build`, or
manually per service):
  cd infra && docker compose build

Lambda deployment packages (used by the AWS Deployment Steps below, run
automatically by terraform/build.sh -- shown here for reference):
  # backend/processor
  cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip \
    && zip -qr lambda.zip handler.js transform.js package.json node_modules

  # backend/dashboard
  cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip \
    && zip -qr lambda.zip lambdaHandler.js server.js awsClients.js \
    readingsStore.js pipelineStatus.js thresholdsProxy.js package.json \
    node_modules

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog node, one-shot Lambda
deploy container, dashboard, and 10 sensor containers -- 2 slopes x 5
sensor types):
  cd infra
  docker compose up --build

Ports exposed to the host:
  - Dashboard:  http://localhost:8104  (container port 8000)
  - LocalStack: http://localhost:4590  (container port 4566)
  The fog node's HTTP port (8000) is only reachable inside the Docker
  network in this local compose file (sensors and the dashboard reach it
  via the service name "fog"); it is not published to the host.

The `processor` service is a one-shot container (restart: "no") that
zips backend/processor, deploys it as a Lambda function inside
LocalStack, and wires it to the SQS queue via an event source mapping,
then exits.

To stop the stack:
  docker compose down

AWS DEPLOYMENT STEPS
-----------------------
This project is deployed using the Terraform module in
terraform/ at the repository root. No terraform/deployments/ska.tfvars
file exists yet -- create one first, with these fields: prefix,
project_root, table_name, queue_name,
processor_lambda_name/build_command/zip_path/handler/runtime,
dashboard_lambda_name/build_command/zip_path/handler/runtime,
frontend_local_dir, api_base_placeholder, api_base_search_files.

1. Configure AWS CLI credentials for the target AWS account (access key,
   secret key, session token for an AWS Academy Learner Lab session):
     aws configure
   Confirm you are pointed at the correct account before proceeding:
     aws sts get-caller-identity

2. Create terraform/deployments/ska.tfvars, for example:
     prefix       = "ska"
     project_root = "../projects/25-ski-resort-avalanche-safety"

     table_name = "ska-readings"
     queue_name = "ska-slope-agg"

     processor_lambda_name   = "ska-processor"
     processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
     processor_zip_path      = "backend/processor/lambda.zip"
     processor_handler       = "handler.handler"
     processor_runtime       = "nodejs20.x"

     dashboard_lambda_name   = "ska-dashboard-api"
     dashboard_build_command = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js server.js awsClients.js readingsStore.js pipelineStatus.js thresholdsProxy.js package.json node_modules"
     dashboard_zip_path      = "backend/dashboard/lambda.zip"
     dashboard_handler       = "lambdaHandler.handler"
     dashboard_runtime       = "nodejs20.x"

     frontend_local_dir    = "backend/dashboard/static"
     api_base_placeholder  = "__API_BASE__"
     api_base_search_files = ["index.html"]

   Before building, replace the empty string in the apiBase field of the
   <script id="api-config"> element in backend/dashboard/static/index.html
   with the literal token you set as api_base_placeholder above, so the
   deploy step can substitute the real API Gateway URL into it.

3. Create and switch to an isolated Terraform workspace before applying:
     cd terraform
     terraform workspace new ska
     terraform workspace list

4. Build the Lambda deployment packages and the EC2 source tarball:
     ./build.sh deployments/ska.tfvars

5. Review the plan before applying, and confirm it shows only resources
   to add, not to destroy:
     terraform plan -var-file=deployments/ska.tfvars

6. Apply:
     terraform apply -var-file=deployments/ska.tfvars

7. Switch back to the default workspace afterward:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module uses Node's built-in test runner (node:test). Run from
within each module's own directory (after `npm install` where the module
has dependencies):

  cd sensors && node --test
  -> 13 tests

  cd fog && node --test
  -> 47 tests

  cd backend/processor && node --test
  -> 10 tests

  cd backend/dashboard && node --test
  -> 51 tests

Total: 121 tests across all four modules.

Optional pipeline verification scripts (require the local stack running
via `docker compose up` in infra/, and boto3 installed):

  python3 infra/verify_pipeline.py
  Polls DynamoDB until all 5 sensor types have at least one record, or
  fails after VERIFY_TIMEOUT seconds (default 90).

  python3 infra/burst.py --messages 2000 --workers 32
  Sends synthetic messages directly onto the SQS queue in parallel and
  verifies the Lambda consumer makes real progress draining them.
