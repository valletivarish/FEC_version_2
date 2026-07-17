Aquaculture Fish Farm Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - JDK 17 and Maven (only needed to build/test the four Java modules
    outside Docker)
  - Python 3.12+ with boto3 installed (only needed to run the ops scripts
    in infra/: verify_pipeline.py and burst.py)
  - AWS CLI and Terraform >= 1.5 (only needed for the AWS deployment steps)

INSTALLATION STEPS
--------------------
  1. Clone the repository and change into the project folder:
       cd projects/09-aquaculture-fish-farm
  2. All commands below assume this folder is your working directory.
  3. If you plan to run the Maven test suites or build locally, no extra
     install step is required beyond having JDK 17 and Maven on PATH --
     each module's own pom.xml declares its dependencies and Maven will
     fetch them on first build/test.
  4. If you plan to run the Python ops scripts (infra/verify_pipeline.py,
     infra/burst.py), install boto3:
       pip install boto3

CONFIGURATION
--------------
Environment variables actually read by the code, by component:

  sensors/ (PondSensorUnit.java):
    SENSOR_TYPE        sensor type this container simulates, no default
                        (must be set)
    SITE_ID            pond identifier, default "pond-1"
    SAMPLE_INTERVAL    seconds between generated readings, default "2"
    DISPATCH_INTERVAL  seconds between dispatches to the fog gateway,
                        default "10"
    FOG_URL            fog gateway ingest URL, default
                        "http://fog:8000/ingest"

  fog/ (PondGateway.java):
    WINDOW_SECONDS      aggregation window length in seconds, default "10"
    SQS_QUEUE_NAME      target SQS queue name, default "aff-pond-agg"
    AWS_ENDPOINT_URL    AWS endpoint override (set for LocalStack, unset
                         for real AWS so the SDK's default credential/
                         endpoint chain is used), no default
    AWS_REGION          AWS region, default "eu-west-1"

  backend/processor/ (PondHandler.java, the Lambda entry point):
    TABLE_NAME          DynamoDB table name, default "aff-readings"
    AWS_ENDPOINT_URL    AWS endpoint override (LocalStack only), no
                         default
    AWS_REGION          AWS region, default "eu-west-1"

  backend/dashboard/ (PondDashboardApp.java for local/Docker,
  PondDashboardLambda.java for the real AWS deployment):
    TABLE_NAME           DynamoDB table name, default "aff-readings"
    SQS_QUEUE_NAME        SQS queue name (for queue-depth checks), default
                         "aff-pond-agg"
    LAMBDA_FUNCTION_NAME  processor Lambda name (for health checks),
                         default "aff-processor"
    AWS_ENDPOINT_URL     AWS endpoint override (LocalStack only), no
                         default
    AWS_REGION            AWS region, default "eu-west-1"
    FOG_HEALTH_URL        fog gateway health endpoint, default
                         "http://fog:8000/health"
    FOG_THRESHOLDS_URL    fog gateway thresholds endpoint, default
                         "http://fog:8000/thresholds"

  infra/verify_pipeline.py:
    AWS_ENDPOINT_URL    default "http://localhost:4574"
    AWS_REGION          default "eu-west-1"
    TABLE_NAME          default "aff-readings"
    VERIFY_TIMEOUT      seconds to poll before giving up, default "90"

  infra/burst.py:
    AWS_ENDPOINT_URL    default "http://localhost:4574"
    AWS_REGION          default "eu-west-1"
    SQS_QUEUE_NAME      default "aff-pond-agg"

BUILD INSTRUCTIONS
--------------------
Each module is an independent Maven project and builds a shaded jar:
  cd sensors && mvn package -DskipTests
  cd fog && mvn package -DskipTests
  cd backend/processor && mvn package -DskipTests
  cd backend/dashboard && mvn package -DskipTests

Or build all four via Docker (each module's own Dockerfile does the same
Maven build inside a maven:3.9-eclipse-temurin-17 stage):
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog gateway, one-shot Lambda
deploy job, dashboard, and all 10 sensor containers for pond-1/pond-2):
  docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
  Dashboard:  http://localhost:8088  (container port 8000)
  LocalStack: http://localhost:4574  (container port 4566)

The fog gateway (container port 8000) is not published to the host in
this compose file; it is reachable only from other containers on the
compose network at http://fog:8000.

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
Deployment uses the Terraform module in terraform/, with the
existing terraform/deployments/aff.tfvars file for resource names
and build commands.

  1. Configure AWS credentials for the target account:
       aws configure
     (or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
     AWS_SESSION_TOKEN directly)
  2. Confirm you are pointed at the correct account:
       aws sts get-caller-identity
  3. From the repo root, create and switch to a dedicated Terraform
     workspace before ever applying:
       cd terraform
       terraform workspace new aff
       terraform workspace list
  4. Build the Lambda jars and the EC2 deploy tarball:
       ./build.sh deployments/aff.tfvars
  5. Review the plan:
       terraform plan -var-file=deployments/aff.tfvars
  6. Apply:
       terraform apply -var-file=deployments/aff.tfvars
  7. When finished, switch back to the default workspace:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each Maven module has its own JUnit 5 test suite:
  cd sensors && mvn test
  cd fog && mvn test
  cd backend/processor && mvn test
  cd backend/dashboard && mvn test

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

Real per-module test counts (verified by running each suite):
  sensors:            57 tests  (PondSensorUnitTest: 4, RandomWalkTest: 53)
  fog:                53 tests  (IngestPayloadTest: 9, PathDispatcherTest: 3,
                       PondAlertsTest: 10, PondGatewayHttpTest: 5,
                       PondGatewayTest: 5, QueuePublisherTest: 4,
                       ReadingAccumulatorTest: 5, RuleTest: 4,
                       StreamingJsonTest: 4, WindowAggregateTest: 4)
  backend/processor:  17 tests  (PondHandlerTest: 7, RecordMapperTest: 5,
                       TallyTest: 5)
  backend/dashboard:  29 tests  (PathDispatcherTest: 4, PipelineChecksTest: 8,
                       PondDashboardAppTest: 4, PondDashboardLambdaTest: 7,
                       PondRepositoryTest: 4, ThresholdsGatewayTest: 2)
  total:              156 tests, all passing

End-to-end pipeline check, with the local stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Load test:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

Or probe the dashboard's own REST API directly:
  curl http://localhost:8088/api/health
  curl http://localhost:8088/api/backend-stats
  curl http://localhost:8088/api/ponds
  curl "http://localhost:8088/api/readings?sensor_type=dissolved_oxygen_mgl&limit=10"
  curl http://localhost:8088/api/thresholds
