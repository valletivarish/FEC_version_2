Elevator and Escalator Fleet Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - Node.js 20 or later (to run any module's test suite locally; all four
    Dockerfiles build from node:20-slim)
  - Python 3.12 or later with boto3 installed (pip install boto3) -- needed
    only for infra/verify_pipeline.py and infra/burst.py
  - AWS CLI -- needed on the host only for the AWS Deployment Steps below
    (it is already installed inside backend/processor's Docker image for
    local LocalStack use)
  - Terraform -- needed on the host only for the AWS Deployment Steps below
  - zip -- needed on the host only for the AWS Deployment Steps below, to
    build Lambda deployment packages

INSTALLATION STEPS
--------------------
  1. Clone the repository.
  2. Change into this project's directory:
       cd projects/18-elevator-escalator-fleet-monitoring
  3. Each of the four modules (sensors/, fog/, backend/processor/,
     backend/dashboard/) has its own package.json and is installed
     separately, for example:
       cd sensors && npm install
     Repeat for fog/, backend/processor/, and backend/dashboard/ as needed.

CONFIGURATION
---------------
sensors/sensor.js:
  SENSOR_TYPE       sensor metric to generate -- no default, must be set to
                    one of: motor_temp_c, door_cycle_count,
                    cab_vibration_mm, load_weight_kg, travel_speed_mps
  SITE_ID           tower identifier tagged on each reading, default
                    "tower-a"
  SAMPLE_INTERVAL   seconds between generated readings, default "2"
  DISPATCH_INTERVAL seconds between POSTs to the fog gateway, default "10"
  FOG_URL           fog gateway ingest URL, default
                    "http://fog:8000/ingest"

fog/app.js:
  WINDOW_SECONDS    aggregation window length in seconds, default "10"
  SQS_QUEUE_NAME    SQS queue the fog node publishes aggregated windows to,
                    default "eef-tower-agg"
  AWS_ENDPOINT_URL  AWS endpoint override; when set, the SQS client is
                    built with static "test"/"test" credentials; when
                    unset, the AWS SDK's default credential chain is used
                    -- no default
  AWS_REGION        AWS region, default "eu-west-1"

backend/processor/handler.js:
  TABLE_NAME        DynamoDB table readings are written to, default
                    "eef-readings"
  AWS_REGION        AWS region, default "eu-west-1"
  AWS_ENDPOINT_URL  AWS endpoint override; when set, the DynamoDB client is
                    built with static "test"/"test" credentials; when
                    unset, the AWS SDK's default credential chain is used
                    -- no default

backend/dashboard/server.js and awsClients.js:
  TABLE_NAME          DynamoDB table read for dashboard data, default
                      "eef-readings"
  SQS_QUEUE_NAME      SQS queue name reported by pipeline/health checks,
                      default "eef-tower-agg"
  LAMBDA_FUNCTION_NAME Lambda function name reported by pipeline/health
                      checks, default "eef-processor"
  FOG_HEALTH_URL      fog gateway health endpoint the dashboard polls,
                      default "http://fog:8000/health"
  FOG_THRESHOLDS_URL  fog gateway thresholds endpoint the dashboard
                      proxies, default "http://fog:8000/thresholds"
  AWS_REGION          AWS region, default "eu-west-1"
  AWS_ENDPOINT_URL    AWS endpoint override; when set, the DynamoDB, SQS,
                      and Lambda clients are all built with static
                      "test"/"test" credentials; when unset, the AWS SDK's
                      default credential chain is used -- no default

infra/verify_pipeline.py:
  AWS_ENDPOINT_URL  AWS endpoint to query, default
                    "http://localhost:4583"
  AWS_REGION        AWS region, default "eu-west-1"
  TABLE_NAME        DynamoDB table to poll, default "eef-readings"
  VERIFY_TIMEOUT    seconds to wait for all sensor types to appear,
                    default "90"

infra/burst.py:
  AWS_ENDPOINT_URL  AWS endpoint to send load against, default
                    "http://localhost:4583"
  AWS_REGION        AWS region, default "eu-west-1"
  SQS_QUEUE_NAME    SQS queue to burst-load, default "eef-tower-agg"

BUILD INSTRUCTIONS
---------------------
Each module builds independently with npm; there is no TypeScript/bundler
compile step, so npm install alone produces a runnable module:
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog gateway, dashboard backend,
the one-shot Lambda-packaging/registration container, and 10 sensor
containers):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8097  (container port 8000)
  LocalStack:  http://localhost:4583  (container port 4566)

The fog gateway listens on port 8000 inside its own container but is not
published to the host; it is reachable only from other containers on the
compose network.

Stop the stack and remove its volumes:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
No terraform/deployments/*.tfvars file exists yet for this project. To
deploy it with the Terraform module in terraform/:

  1. Configure AWS credentials for the target account:
       aws configure
     (or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and
     AWS_SESSION_TOKEN directly).

  2. Confirm the credentials point at the intended account:
       aws sts get-caller-identity

  3. Create terraform/deployments/eef.tfvars, defining: prefix,
     project_root, table_name, queue_name, processor_lambda_name,
     processor_build_command, processor_zip_path, processor_handler,
     processor_runtime, dashboard_lambda_name, dashboard_build_command,
     dashboard_zip_path, dashboard_handler, dashboard_runtime,
     frontend_local_dir, api_base_placeholder, and api_base_search_files.
     Populate the values below, for example:
       prefix                  = "eef"
       project_root            = "../projects/18-elevator-escalator-fleet-monitoring"
       table_name              = "eef-readings"
       queue_name              = "eef-tower-agg"
       processor_lambda_name   = "eef-processor"
       processor_handler       = "handler.handler"
       processor_runtime       = "nodejs20.x"
       processor_zip_path      = "backend/processor/lambda.zip"
       processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
       frontend_local_dir      = "backend/dashboard/static"
       api_base_placeholder    = "__API_BASE__"
       api_base_search_files   = ["index.html"]
     backend/dashboard/ does not yet contain a Lambda entry point (a file
     exporting a `handler` function for API Gateway, comparable to
     handler.js in backend/processor/); one must be added there before
     dashboard_lambda_name/dashboard_build_command/dashboard_zip_path/
     dashboard_handler/dashboard_runtime can be filled in and the build
     below will produce a working dashboard Lambda.

  4. cd terraform

  5. Create and switch to a dedicated Terraform workspace for this
     project (do not apply against the default workspace):
       terraform workspace new eef
       terraform workspace list

  6. Build the Lambda deployment packages and the EC2 source tarball:
       ./build.sh deployments/eef.tfvars

  7. Review the plan before applying:
       terraform plan -var-file=deployments/eef.tfvars
     Confirm the "Plan: N to add, 0 to change, 0 to destroy" line shows no
     destroys.

  8. Apply:
       terraform apply -var-file=deployments/eef.tfvars

  9. Switch back to the default workspace when finished:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own test script, run with Node's built-in test runner
(node --test, no Jest/Mocha dependency):
  cd sensors && npm install && npm test               (14 tests)
  cd fog && npm install && npm test                    (57 tests)
  cd backend/processor && npm install && npm test      (10 tests)
  cd backend/dashboard && npm install && npm test      (36 tests)

Total: 117 tests. All four suites were run directly (node --test) and
confirmed passing with 0 failures.

Without a local Node.js install, run any module's suite in a container,
for example:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"
(substitute -w /app/sensors, -w /app/backend/processor, or
-w /app/backend/dashboard for the other modules)
