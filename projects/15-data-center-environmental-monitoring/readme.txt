Data Center Environmental Monitoring

===============================================================================
1. PREREQUISITES
===============================================================================

- Docker and Docker Compose (runs the local sensor/fog/LocalStack/dashboard
  stack)
- Node.js 20.x and npm (every service image is built FROM node:20-slim; npm
  is bundled with Node.js)
- AWS CLI (only needed to confirm AWS Academy Learner Lab credentials and for
  the AWS deployment steps below)
- Terraform (only needed for the AWS deployment steps below)
- Python 3 with boto3 installed (optional, only needed to run
  infra/verify_pipeline.py or infra/burst.py directly on the host against the
  LocalStack stack)

===============================================================================
2. INSTALLATION STEPS
===============================================================================

1. Clone the repository:
   git clone <repository-url>
2. Change into the project directory:
   cd projects/15-data-center-environmental-monitoring
3. Install the dependencies each module needs to run its tests locally:
   cd fog && npm install && cd ..
   cd backend/processor && npm install && cd ../..
   cd backend/api && npm install && cd ../..
   cd backend/dashboard && npm install && cd ../..
   (sensors/package.json declares no dependencies, so no install step is
   required there.)

===============================================================================
3. CONFIGURATION
===============================================================================

Sensors (sensors/sensor.js), one container per sensor instance:
- SENSOR_TYPE       required, no default. Must be one of: temperature_c,
                    humidity_pct, airflow_cfm, power_load_kw,
                    dust_density_ugm3
- SITE_ID           default: hall-1
- SAMPLE_INTERVAL   default: 2 (seconds between readings)
- DISPATCH_INTERVAL default: 10 (seconds between POSTs to the fog gateway)
- FOG_URL           default: http://fog:8000/ingest

Fog gateway (fog/app.js, fog/publisher.js):
- WINDOW_SECONDS    default: 10 (aggregation window length, seconds)
- SQS_QUEUE_NAME    default: dce-hall-agg
- AWS_REGION        default: eu-west-1
- AWS_ENDPOINT_URL  no default. When set, the SQS client points at that
                    endpoint with static "test"/"test" credentials. When
                    unset, the AWS SDK's default credential chain is used
                    (e.g. an EC2 instance profile).

Processor Lambda (backend/processor/handler.js):
- TABLE_NAME        default: dce-readings
- AWS_REGION        default: eu-west-1
- AWS_ENDPOINT_URL  no default. When set, the DynamoDB client points at that
                    endpoint with static "test"/"test" credentials. When
                    unset, the AWS SDK's default credential chain is used.

API Lambda (backend/api/handler.js, router.js, awsClients.js):
- TABLE_NAME            default: dce-readings
- SQS_QUEUE_NAME        default: dce-hall-agg
- LAMBDA_FUNCTION_NAME  default: dce-processor (name of the processor Lambda
                        this Lambda checks the status of)
- FOG_HEALTH_URL        default: http://fog:8000/health
- FOG_THRESHOLDS_URL    default: http://fog:8000/thresholds
- AWS_REGION            default: eu-west-1
- AWS_ENDPOINT_URL      no default. When set, DynamoDB/SQS/Lambda clients
                        point at that endpoint with static "test"/"test"
                        credentials. When unset, the AWS SDK's default
                        credential chain is used.

Local dashboard server (backend/dashboard/server.js) -- static file server
and API Gateway reverse proxy, used only against LocalStack:
- AWS_ENDPOINT_URL   default: http://localstack:4566
- AWS_REGION         default: eu-west-1
- API_GATEWAY_NAME   default: dce-api-gateway
- API_STAGE_NAME     default: local

Lambda deploy scripts (backend/processor/deploy_lambda.sh,
backend/api/deploy_api.sh) -- run as one-shot Docker Compose jobs against
LocalStack, read the same AWS_ENDPOINT_URL/AWS_REGION/TABLE_NAME/
SQS_QUEUE_NAME/LAMBDA_FUNCTION_NAME variables above, plus:
- API_FUNCTION_NAME  default: dce-api
- API_GATEWAY_NAME   default: dce-api-gateway
- API_STAGE_NAME     default: local

===============================================================================
4. BUILD INSTRUCTIONS
===============================================================================

Each service builds inside its own Docker image. To build every image in one
step:
   docker compose -f infra/docker-compose.yml build

The commands each Dockerfile actually runs:

- sensors: no dependency install (package.json declares no dependencies);
  the container copies sensor.js/profiles.js and runs `node sensor.js`
  directly.

- fog: `npm install --omit=dev --no-audit --no-fund`, then the container
  runs `node app.js`.

- backend/processor (processor Lambda build stage): `npm install --omit=dev
  --no-audit --no-fund`, then `zip -qr function.zip handler.js transform.js
  node_modules`. The resulting function.zip is deployed by
  deploy_lambda.sh.

- backend/api (API Lambda build stage): `npm install --omit=dev --no-audit
  --no-fund`, then `zip -qr function.zip handler.js router.js
  readingsStore.js pipelineStatus.js thresholdsProxy.js awsClients.js
  node_modules`. The resulting function.zip is deployed by deploy_api.sh.

- backend/dashboard: `npm install --omit=dev --no-audit --no-fund`, then
  the container runs `node server.js`.

===============================================================================
5. RUN INSTRUCTIONS
===============================================================================

Bring up the full local stack (LocalStack, fog, the processor/API Lambda
one-shot deploy jobs, the dashboard, and 10 sensor containers):
   docker compose -f infra/docker-compose.yml up --build

Ports exposed on the host:
- Dashboard:  http://localhost:8094  (container port 8000)
- LocalStack: http://localhost:4580  (container port 4566)

The fog gateway (container port 8000) is not published to the host in this
compose file; it is reachable only inside the dce_net Docker network, at
fog:8000, by the sensor containers and by the API Lambda's health checks.

Stop the stack:
   docker compose -f infra/docker-compose.yml down

===============================================================================
6. AWS DEPLOYMENT STEPS
===============================================================================

No terraform/deployments/*.tfvars file exists yet. To deploy it with the
Terraform module in terraform/:

1. Confirm the AWS Academy Learner Lab credentials in use are the intended
   account:
      aws sts get-caller-identity

2. From the repository root, create and switch to an isolated Terraform
   workspace before ever applying:
      cd terraform
      terraform workspace new dce
      terraform workspace list

3. Create terraform/deployments/dce.tfvars, defining these variables:

      prefix       = "dce"
      project_root = "../projects/15-data-center-environmental-monitoring"

      table_name = "dce-readings"
      queue_name = "dce-hall-agg"

      processor_lambda_name   = "dce-processor"
      processor_build_command = "cd backend/processor && npm install --omit=dev --no-audit --no-fund && rm -f function.zip && zip -qr function.zip handler.js transform.js node_modules"
      processor_zip_path      = "backend/processor/function.zip"
      processor_handler       = "handler.handler"
      processor_runtime       = "nodejs20.x"

      dashboard_lambda_name   = "dce-api"
      dashboard_build_command = "cd backend/api && npm install --omit=dev --no-audit --no-fund && rm -f function.zip && zip -qr function.zip handler.js router.js readingsStore.js pipelineStatus.js thresholdsProxy.js awsClients.js node_modules"
      dashboard_zip_path      = "backend/api/function.zip"
      dashboard_handler       = "handler.handler"
      dashboard_runtime       = "nodejs20.x"

      frontend_local_dir    = "backend/dashboard/static"
      api_base_placeholder  = "__API_BASE__"
      api_base_search_files = ["index.html"]

   backend/dashboard/static/index.html currently ships its API base
   configuration as `<meta name="api-base" content="">` with an empty
   content attribute. Before applying, replace that empty value with the
   api_base_placeholder token above (e.g. `content="__API_BASE__"`) so the
   module's sed substitution at upload time has a token to match.

4. Build the Lambda zips and the deploy tarball:
      ./build.sh deployments/dce.tfvars

5. Preview the plan and confirm it only adds dce-prefixed resources:
      terraform plan -var-file=deployments/dce.tfvars

6. Apply:
      terraform apply -var-file=deployments/dce.tfvars

7. Switch back to the default workspace when finished:
      terraform workspace select default

===============================================================================
7. TESTING INSTRUCTIONS
===============================================================================

Each module has its own test suite, run with Node's built-in test runner.
All were run and passed as of this writing:

   cd sensors && npm test               (12 tests)
   cd fog && npm test                   (46 tests)
   cd backend/processor && npm test     (9 tests)
   cd backend/api && npm test           (37 tests)
   cd backend/dashboard && npm test     (10 tests)

Total: 114 tests across all five modules.
