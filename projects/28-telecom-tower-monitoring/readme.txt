Telecom Tower Power & Availability Monitoring

1. PREREQUISITES
------------------
  - Docker and the Docker Compose v2 plugin
  - Node.js 20 or newer (only to run the test suite or ops scripts outside Docker)
  - npm
  - AWS CLI and Terraform (only for the AWS Deployment Steps section)

2. INSTALLATION STEPS
-----------------------
  1. Clone the repository and change into this project's folder:
       cd projects/28-telecom-tower-monitoring
  2. Install the dev/test dependencies (used by the test runner):
       npm install

3. CONFIGURATION
------------------
Environment variables read by each component (default shown):

  sensors/sensor.js:
    SENSOR_TYPE        required; one of dc_load_amps, battery_charge_pct,
                       genset_fuel_pct, cabinet_temp_c, rf_utilization_pct
    SITE_ID            tower site, default "site-north"
    SAMPLE_INTERVAL    seconds between samples, default "2"
    DISPATCH_INTERVAL  seconds between dispatches, default "10"
    FOG_URL            default "http://fog:8000/ingest"

  fog/gateway.js:
    WINDOW_SECONDS     aggregation window length, default "10"
    SQS_QUEUE_NAME     default "ctm-tower-agg"
    PORT               default "8000"
    AWS_ENDPOINT_URL   unset for real AWS; a LocalStack URL for local runs
    AWS_REGION         default "eu-west-1"

  backend/processor/handler.js:
    TABLE_NAME         default "ctm-readings"
    AWS_ENDPOINT_URL, AWS_REGION   as above

  backend/dashboard (server.js / service.js):
    TABLE_NAME, SQS_QUEUE_NAME, LAMBDA_FUNCTION_NAME
    FOG_HEALTH_URL     default "http://fog:8000/health"
    FOG_THRESHOLDS_URL default "http://fog:8000/thresholds"
    PORT               default "8000"
    AWS_ENDPOINT_URL, AWS_REGION   as above

4. BUILD INSTRUCTIONS
-----------------------
Each service builds as its own Docker image. Build all images via Compose:
  docker compose -f infra/docker-compose.yml build

5. RUN INSTRUCTIONS
---------------------
Bring up the full local stack (LocalStack, the one-shot processor Lambda
deploy, the fog gateway, the dashboard, and 10 sensor containers -- 5 signals
across site-north and site-south):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8100  (container port 8000)
  LocalStack:  http://localhost:4580  (container port 4566)

Stop and remove volumes:
  docker compose -f infra/docker-compose.yml down -v

6. AWS DEPLOYMENT STEPS
-------------------------
Deploy through the Terraform module in terraform/ at the repository root,
driven by terraform/deployments/ctm.tfvars (DynamoDB table, SQS queue, both
nodejs20.x Lambdas with their build commands, and the frontend upload). The
dashboard's API Gateway entry point is backend/dashboard/lambda.js, which wraps
the same Express app the local server runs (via serverless-http). On EC2 the
fog gateway and ten sensors run from infra/docker-compose.aws.yml.

  1. Configure AWS credentials for the target account:
       aws configure
     (region must be us-east-1).
  2. Confirm the account:
       aws sts get-caller-identity
  3. cd terraform
  4. Create and switch to a dedicated workspace:
       terraform workspace new ctm
       terraform workspace list
  5. Build the Lambda packages and the EC2 tarball:
       ./build.sh deployments/ctm.tfvars
  6. Review the plan (confirm "0 to destroy"):
       terraform plan -var-file=deployments/ctm.tfvars
  7. Apply:
       terraform apply -var-file=deployments/ctm.tfvars
  8. Switch back to the default workspace:
       terraform workspace select default

7. TESTING INSTRUCTIONS
-------------------------
  npm install
  npm test

67 tests pass across the sensor waveforms and retain-on-failure dispatch, the
EventEmitter windower, the per-signal alarms, the SQS batch dispatcher, the
record mapper, the batched processor with its unprocessed-item retry, the
read-time power-state fusion, the dashboard service and Express routes, and the
fog gateway over live HTTP.

  End-to-end local check (after the stack is up):
    AWS_ENDPOINT_URL=http://localhost:4580 node infra/verify_pipeline.js
  Load test:
    AWS_ENDPOINT_URL=http://localhost:4580 node infra/burst.js --messages 2000 --workers 32
