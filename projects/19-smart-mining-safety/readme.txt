Smart Mining Safety & Environmental Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - JDK 17 and Apache Maven (to build/test any module outside Docker)
  - Python 3 with the boto3 package installed (only needed for
    infra/verify_pipeline.py and infra/burst.py)

INSTALLATION STEPS
--------------------
  1. Clone the repository and change into the project directory:
       cd projects/19-smart-mining-safety
  2. All commands below assume this directory as the working directory.
  3. No local dependency installation is required beyond the prerequisites
     above -- each Maven module resolves its own dependencies (AWS SDK for
     Java v2, Jackson, JUnit 5, aws-lambda-java-core/events) automatically
     on build.

CONFIGURATION
--------------
Sensor containers (sensors/src/main/java/.../ShaftSensorUnit.java):
  SENSOR_TYPE        sensor type identifier, no default (must be set)
  SITE_ID            shaft/site identifier, default "shaft-a"
  SAMPLE_INTERVAL    seconds between generated readings, default "2"
  DISPATCH_INTERVAL  seconds between batched dispatches to the fog node,
                     default "10"
  FOG_URL            fog node ingest endpoint, default
                     "http://fog:8000/ingest"

Fog node (fog/src/main/java/.../MineFogNode.java):
  WINDOW_SECONDS     aggregation window length in seconds, default "10"
  SQS_QUEUE_NAME     target SQS queue name, default "msm-shaft-agg"
  AWS_ENDPOINT_URL   AWS endpoint override; unset means real AWS,
                     resolved via the default credential chain
  AWS_REGION         AWS region, default "eu-west-1"

Backend processor Lambda (backend/processor/src/main/java/.../SafetyHandler.java):
  TABLE_NAME         target DynamoDB table name, default "msm-readings"
  AWS_ENDPOINT_URL   AWS endpoint override; unset means real AWS,
                     resolved via the default credential chain
  AWS_REGION         AWS region, default "eu-west-1"

Backend processor deploy script (backend/processor/deploy_lambda.sh,
LocalStack-only tooling):
  AWS_ENDPOINT_URL      default "http://localstack:4566"
  SQS_QUEUE_NAME        default "msm-shaft-agg"
  LAMBDA_FUNCTION_NAME  default "msm-processor"
  TABLE_NAME            default "msm-readings"
  AWS_REGION            default "eu-west-1"

Dashboard API (backend/dashboard/src/main/java/.../MineDashboardApp.java):
  TABLE_NAME            DynamoDB table to read, default "msm-readings"
  SQS_QUEUE_NAME        SQS queue to report on, default "msm-shaft-agg"
  LAMBDA_FUNCTION_NAME  processor Lambda name to report on, default
                        "msm-processor"
  AWS_ENDPOINT_URL      AWS endpoint override; unset means real AWS,
                        resolved via the default credential chain
  AWS_REGION            AWS region, default "eu-west-1"
  FOG_HEALTH_URL        fog node health-check URL, default
                        "http://fog:8000/health"
  FOG_THRESHOLDS_URL    fog node thresholds URL, default
                        "http://fog:8000/thresholds"

Pipeline verification / load test scripts (infra/verify_pipeline.py,
infra/burst.py):
  AWS_ENDPOINT_URL   default "http://localhost:4584"
  AWS_REGION         default "eu-west-1"
  TABLE_NAME         default "msm-readings" (verify_pipeline.py)
  SQS_QUEUE_NAME     default "msm-shaft-agg" (burst.py)
  VERIFY_TIMEOUT     default "90" (verify_pipeline.py, seconds)

BUILD INSTRUCTIONS
--------------------
Each module is built independently with Maven:
  cd sensors && mvn package
  cd fog && mvn package
  cd backend/processor && mvn package
  cd backend/dashboard && mvn package

Add -DskipTests to any of the above to skip that module's test run during
the build (this is what the Dockerfiles and the Terraform build script do).

Or build inside Docker without local Maven/JDK (repeat per module directory):
  docker run --rm -v "$PWD":/app -w /app maven:3.9-eclipse-temurin-17 mvn package

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog node, one-shot processor
Lambda deploy, dashboard, and all 10 sensor containers):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8098  (container port 8000)
  LocalStack:  http://localhost:4584  (container port 4566)

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

If "down -v" reports the network is still in use, a LocalStack-spawned
Lambda-executor helper container may still be attached to it:
  docker ps -a --filter "name=msm"
  docker network ls --filter "name=msm"
  docker rm -f <the lambda-executor container name>
  docker network rm msm_default

A separate compose file (infra/docker-compose.aws.yml) runs only the fog
node and the 10 sensor containers, with the fog node's port 8000 published
to the host, for use on an EC2 instance alongside the Lambda-based backend:
  docker compose -f infra/docker-compose.aws.yml up --build -d

AWS DEPLOYMENT STEPS
-----------------------
This project has a prepared Terraform variable file at
terraform/deployments/msm.tfvars (prefix "msm") for the Terraform
module in terraform/. From the repository root:

  1. Configure AWS credentials for the target account:
       aws configure
     (or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
  2. Confirm you are targeting the intended account:
       aws sts get-caller-identity
  3. Change into the Terraform directory and select an isolated workspace:
       cd terraform
       terraform workspace new msm
       terraform workspace list
  4. Build the Lambda deployment artifacts and staging tarball:
       ./build.sh deployments/msm.tfvars
  5. Review the plan before applying:
       terraform plan -var-file=deployments/msm.tfvars
  6. Apply:
       terraform apply -var-file=deployments/msm.tfvars
  7. Switch back to the default workspace when finished:
       terraform workspace select default

This provisions a DynamoDB table, an SQS queue, the processor and
dashboard Lambda functions behind an API Gateway REST API, an EC2 instance
running the fog node and sensor containers, an Elastic IP, and two S3
buckets (frontend hosting and deploy staging) -- all named with the "msm"
prefix as configured in deployments/msm.tfvars.

TESTING INSTRUCTIONS
-----------------------
Each Maven module has its own JUnit 5 test suite, runnable independently:
  cd sensors && mvn test                  (5 tests)
  cd fog && mvn test                      (47 tests)
  cd backend/processor && mvn test        (8 tests)
  cd backend/dashboard && mvn test        (30 tests)

All 90 tests pass.

Or run each module's tests inside Docker without local Maven/JDK (repeat
per module directory):
  docker run --rm -v "$PWD":/app -w /app maven:3.9-eclipse-temurin-17 mvn test

With the local stack running (docker compose -f infra/docker-compose.yml
up --build), verify the end-to-end pipeline:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4584 python3 infra/verify_pipeline.py

Run a load test against the local SQS queue:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    AWS_ENDPOINT_URL=http://localhost:4584 python3 infra/burst.py --messages 2000 --workers 32

Or check the dashboard API directly:
  curl http://localhost:8098/api/health
  curl http://localhost:8098/api/thresholds
  curl "http://localhost:8098/api/readings?sensor_type=methane_ppm&limit=5"
  curl http://localhost:8098/api/shafts
  curl http://localhost:8098/api/backend-stats
