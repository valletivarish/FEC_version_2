Smart Waste Management

PREREQUISITES
--------------
  - Docker and Docker Compose (runs the local stack: LocalStack + fog +
    dashboard + 10 sensor containers)
  - Node.js 20+ (all four modules -- sensors, fog, backend/processor,
    backend/dashboard -- are plain CommonJS, tested with Node's built-in
    node:test runner; each module's Dockerfile builds from node:20-slim)
  - Python 3.12+ with the boto3 package (infra/verify_pipeline.py and
    infra/burst.py; both import boto3, argparse, and botocore.exceptions)
  - AWS CLI (used inside the backend/processor Docker image by
    deploy_lambda.sh to register the Lambda function against LocalStack;
    also needed to run aws sts get-caller-identity / deploy to real AWS)
  - Terraform (for AWS deployment via the terraform/ module)

INSTALLATION STEPS
--------------------
  1. Clone the repository and cd into projects/22-smart-waste-management/
  2. Install local dependencies for each module (only needed to run the
     unit tests on the host without Docker -- docker compose build
     installs each module's dependencies inside its own image
     automatically):
       cd sensors && npm install
       cd fog && npm install
       cd backend/processor && npm install
       cd backend/dashboard && npm install

CONFIGURATION
--------------
Environment variables actually read by the source code, by module:

sensors/sensor.js:
  SENSOR_TYPE       required, no default. Must be one of: fill_level_pct,
                    internal_temp_c, gas_level_ppm, bin_weight_kg,
                    lid_open_count (sensors/profiles.js)
  SITE_ID           default: district-a
  SAMPLE_INTERVAL   seconds between generated readings. Default: 2
  DISPATCH_INTERVAL seconds between dispatch POSTs to the fog gateway.
                    Default: 10
  PULSE_MS          sensor timer tick in milliseconds. Default: 250
  FOG_URL           fog gateway ingest URL. Default:
                    http://fog:8000/ingest

fog/app.js, fog/publishQueue.js:
  WINDOW_SECONDS    fog aggregation window length in seconds. Default: 10
  SQS_QUEUE_NAME    SQS queue fog publishes aggregated windows to.
                    Default: swm-district-agg
  AWS_ENDPOINT_URL  AWS/LocalStack endpoint override. No default.
  AWS_REGION        Default: eu-west-1

backend/processor/handler.js (Lambda handler), deploy_lambda.sh
(LocalStack registration script run inside its own Docker image):
  TABLE_NAME            DynamoDB table name. Default: swm-readings
  AWS_REGION            Default: eu-west-1
  AWS_ENDPOINT_URL      AWS/LocalStack endpoint override. No default.
  AWS_ACCESS_KEY_ID     Default: test
  AWS_SECRET_ACCESS_KEY Default: test
  SQS_QUEUE_NAME        (deploy_lambda.sh only) queue the function is
                        wired to via an event source mapping. Default:
                        swm-district-agg
  LAMBDA_FUNCTION_NAME  (deploy_lambda.sh only) name the function is
                        registered under. Default: swm-processor

backend/dashboard/server.js, lambdaHandler.js, awsClients.js:
  TABLE_NAME            DynamoDB table name. Default: swm-readings
  SQS_QUEUE_NAME        SQS queue name. Default: swm-district-agg
  LAMBDA_FUNCTION_NAME  processor Lambda name checked by /api/health.
                        Default: swm-processor
  FOG_HEALTH_URL        fog health URL polled by /api/health. Default:
                        http://fog:8000/health
  FOG_THRESHOLDS_URL    fog thresholds URL proxied by /api/thresholds.
                        Default: http://fog:8000/thresholds
  AWS_REGION            Default: eu-west-1
  AWS_ENDPOINT_URL      AWS/LocalStack endpoint override. No default.
  AWS_ACCESS_KEY_ID     Default: test
  AWS_SECRET_ACCESS_KEY Default: test

infra/verify_pipeline.py, infra/burst.py:
  AWS_ENDPOINT_URL  Default: http://localhost:4587
  AWS_REGION        Default: eu-west-1
  TABLE_NAME        (verify_pipeline.py) Default: swm-readings
  SQS_QUEUE_NAME    (burst.py) Default: swm-district-agg
  VERIFY_TIMEOUT    (verify_pipeline.py) seconds to wait for data.
                    Default: 90

BUILD INSTRUCTIONS
--------------------
Each of the four Node.js modules has its own package.json and no separate
build step beyond dependency installation:
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

To build the Docker images used by the local stack instead:
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
  docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
  Dashboard   http://localhost:8101  (container port 8000)
  LocalStack  http://localhost:4587  (container port 4566)

The fog gateway's port is not published to the host in this compose file;
it is reachable from other containers on the compose network at
http://fog:8000.

Stop and remove volumes:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
No terraform/deployments/swm.tfvars exists yet for this project. Create
one before deploying, defining the fields below:

  prefix                  = "swm"
  project_root            = "../projects/22-smart-waste-management"
  table_name              = "swm-readings"
  queue_name              = "swm-district-agg"
  processor_lambda_name   = "swm-processor"
  processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
  processor_zip_path      = "backend/processor/lambda.zip"
  processor_handler       = "handler.handler"
  processor_runtime       = "nodejs20.x"
  dashboard_lambda_name   = "swm-dashboard-api"
  dashboard_build_command = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js server.js awsClients.js router.js readingsStore.js pipelineStatus.js thresholdsProxy.js package.json node_modules"
  dashboard_zip_path      = "backend/dashboard/lambda.zip"
  dashboard_handler       = "lambdaHandler.handler"
  dashboard_runtime       = "nodejs20.x"
  frontend_local_dir      = "backend/dashboard/static"
  api_base_placeholder    = "__API_BASE__"
  api_base_search_files   = ["index.html"]

backend/dashboard/static/index.html currently assigns window.API_BASE to
a literal URL string in an inline <script> tag. Before applying with the
tfvars file above, change that line to
window.API_BASE = "__API_BASE__"; so the module's sed substitution step
(terraform/modules/fec-stack/s3.tf) has a token to replace with the real
API Gateway URL at upload time.

Steps to deploy:
  1. Configure AWS credentials for the target account (aws configure, or
     export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN
     for an AWS Academy Learner Lab session) and confirm the account:
       aws sts get-caller-identity
  2. Create terraform/deployments/swm.tfvars with the content above.
  3. Create and switch to an isolated Terraform workspace before applying
     (the module's local state tracks whichever workspace is currently selected):
       cd terraform
       terraform workspace new swm
       terraform workspace list
  4. Build both Lambda zip packages and the sensors/fog/infra deploy
     tarball:
       ./build.sh deployments/swm.tfvars
  5. Review the plan before applying:
       terraform plan -var-file=deployments/swm.tfvars
  6. Apply:
       terraform apply -var-file=deployments/swm.tfvars
  7. Switch back to the default workspace afterward:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script (node --test). All
four suites were run and confirmed passing at the time this readme was
written -- 115 tests total (19 + 46 + 11 + 39), 0 failures:

  cd sensors && npm install && npm test
    -> 19 tests, 19 pass

  cd fog && npm install && npm test
    -> 46 tests, 46 pass

  cd backend/processor && npm install && npm test
    -> 11 tests, 11 pass

  cd backend/dashboard && npm install && npm test
    -> 39 tests, 39 pass

With the local stack running (docker compose -f infra/docker-compose.yml
up), an end-to-end pipeline check and a burst load test are also
available:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/burst.py --messages 2000 --workers 32
