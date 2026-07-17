Offshore Wind Farm Monitoring Fog/Edge Pipeline

PREREQUISITES
-------------
  - Docker and Docker Compose (to run the local stack)
  - Node.js 20+ (to run the unit tests locally; each module targets
    node:20-slim in its Dockerfile and uses the built-in node:test runner)
  - Python 3.12+ with the boto3 package (only needed for infra/verify_pipeline.py
    and infra/burst.py)
  - AWS CLI v2 and Terraform (only needed for the AWS deployment steps)

INSTALLATION STEPS
-------------------
1. Clone the repository and change into this project's folder:
     cd projects/06-offshore-wind-farm
   All commands below assume this folder is your working directory.
2. Install local dependencies for each Node module (only required to run
   tests or lint locally; docker compose builds its own images):
     cd sensors && npm install && cd ..
     cd fog && npm install && cd ..
     cd backend/processor && npm install && cd ../..
     cd backend/dashboard && npm install && cd ../..
3. Install Python dependencies for the ops scripts:
     pip install boto3

CONFIGURATION
-------------
Environment variables read by the application code:

  sensors/sensor.js:
    SENSOR_TYPE        sensor metric name (no default, must be set)
    SITE_ID            turbine identifier, default "turbine-1"
    SAMPLE_INTERVAL    seconds between generated readings, default "2"
    DISPATCH_INTERVAL  seconds between dispatches to the fog gateway, default "10"
    FOG_URL            fog ingest endpoint, default "http://fog:8000/ingest"

  fog/app.js:
    WINDOW_SECONDS      aggregation window length in seconds, default "10"
    SQS_QUEUE_NAME      SQS queue the fog node publishes aggregates to, default "owf-turbine-agg"
    AWS_ENDPOINT_URL    AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_REGION          AWS region, default "eu-west-1"

  backend/processor/handler.js:
    TABLE_NAME          DynamoDB table readings are written to, default "owf-readings"
    AWS_REGION           AWS region, default "eu-west-1"
    AWS_ENDPOINT_URL     AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_ACCESS_KEY_ID    static access key, default "test" (only used when AWS_ENDPOINT_URL is set)
    AWS_SECRET_ACCESS_KEY static secret key, default "test" (only used when AWS_ENDPOINT_URL is set)

  backend/processor/deploy_lambda.sh:
    AWS_ENDPOINT_URL      Lambda/SQS endpoint, default "http://localstack:4566"
    SQS_QUEUE_NAME        queue to wire the Lambda's event source mapping to, default "owf-turbine-agg"
    LAMBDA_FUNCTION_NAME  Lambda function name to create/update, default "owf-processor"
    TABLE_NAME             DynamoDB table name passed to the Lambda's environment, default "owf-readings"
    AWS_REGION              region, default "eu-west-1"

  backend/dashboard/server.js:
    TABLE_NAME           DynamoDB table the dashboard reads from, default "owf-readings"
    SQS_QUEUE_NAME        SQS queue the dashboard reports health/depth for, default "owf-turbine-agg"
    LAMBDA_FUNCTION_NAME  Lambda function the dashboard checks the state of, default "owf-processor"
    FOG_HEALTH_URL         fog node health endpoint, default "http://fog:8000/health"
    FOG_THRESHOLDS_URL     fog node thresholds endpoint, default "http://fog:8000/thresholds"

  backend/dashboard/awsClients.js:
    AWS_REGION             region, default "eu-west-1"
    AWS_ENDPOINT_URL       AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_ACCESS_KEY_ID      static access key, default "test" (only used when AWS_ENDPOINT_URL is set)
    AWS_SECRET_ACCESS_KEY  static secret key, default "test" (only used when AWS_ENDPOINT_URL is set)

  infra/capture_dashboard_screenshots.js:
    DASHBOARD_URL          dashboard URL to screenshot, default "http://localhost:8085/"
    SCREENSHOT_DIR         output directory for screenshots, default the script's own directory

  infra/verify_pipeline.py:
    AWS_ENDPOINT_URL       DynamoDB endpoint, default "http://localhost:4571"
    AWS_REGION              region, default "eu-west-1"
    TABLE_NAME               DynamoDB table to poll, default "owf-readings"
    VERIFY_TIMEOUT           seconds to wait for all sensor types to appear, default "90"

  infra/burst.py:
    AWS_ENDPOINT_URL        SQS endpoint, default "http://localhost:4571"
    AWS_REGION               region, default "eu-west-1"
    SQS_QUEUE_NAME            queue to send load-test messages to, default "owf-turbine-agg"

BUILD INSTRUCTIONS
-------------------
Each Node module is installed independently (no shared build step):
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

Docker images are built as part of "docker compose ... up --build" (see RUN
INSTRUCTIONS). To build an individual image directly:
  docker build -t owf-sensor ./sensors
  docker build -t owf-fog ./fog
  docker build -t owf-processor ./backend/processor
  docker build -t owf-dashboard ./backend/dashboard

For an AWS Lambda deployment zip built outside Terraform (matching the real
commands in terraform/deployments/owf.tfvars):
  cd backend/processor && npm ci --omit=dev && zip -qr lambda.zip handler.js transform.js package.json node_modules
  cd backend/dashboard && npm ci --omit=dev && zip -qr lambda.zip lambdaHandler.js server.js awsClients.js readingsStore.js pipelineStatus.js routes package.json node_modules

RUN INSTRUCTIONS
-----------------
Bring up the full local stack (LocalStack, fog node, one-shot Lambda
deployer, dashboard, and 10 sensor containers):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8085
  LocalStack:  http://localhost:4571

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

To run the fog node and sensors against real AWS instead of LocalStack
(used on the EC2 host in the AWS deployment, no dashboard/localstack/
processor services included):
  docker compose -f infra/docker-compose.aws.yml up --build

This variant exposes the fog node on port 8000 (http://localhost:8000) and
relies on the AWS SDK's default credential provider chain (for example an
EC2 instance profile) rather than any AWS_ACCESS_KEY_ID set in the file.

AWS DEPLOYMENT STEPS
----------------------
This project deploys via the Terraform module in terraform/, using
terraform/deployments/owf.tfvars.

1. Configure AWS credentials for the target account:
     aws configure
   (or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
   for temporary credentials)
2. Confirm you are targeting the correct account:
     aws sts get-caller-identity
3. From the terraform/ directory, create and switch to a dedicated
   workspace for this project before ever applying:
     terraform workspace new owf
     terraform workspace list
4. Build the Lambda deployment artifacts and the sensors/fog/infra source
   tarball:
     ./build.sh deployments/owf.tfvars
5. Review the plan, then apply:
     terraform plan -var-file=deployments/owf.tfvars
     terraform apply -var-file=deployments/owf.tfvars
6. After the apply completes, switch back to the default workspace so the
   working directory doesn't default into this workspace for a later
   deployment:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script, run with Node's
built-in test runner (node --test):
  cd sensors && npm install && npm test              (8 tests)
  cd fog && npm install && npm test                  (25 tests)
  cd backend/processor && npm install && npm test    (7 tests)
  cd backend/dashboard && npm install && npm test     (31 tests)

Total: 71 tests, all passing (verified by running each suite directly).

Without a local Node.js install, run any module's tests in a container, for
example:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

End-to-end pipeline check against a running stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Load test against a running stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32
