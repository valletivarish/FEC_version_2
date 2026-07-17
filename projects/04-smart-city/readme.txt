Smart City Traffic & Environmental Monitoring

All commands below assume your working directory is this folder
(projects/04-smart-city/), not the repo root.

PREREQUISITES
--------------
  Docker and Docker Compose
  Java 17 (JDK) and Maven -- only needed to build modules or run tests
                             outside Docker
  Python 3.12+ with boto3 installed -- only needed for infra/verify_pipeline.py
                                        and infra/burst.py
  AWS CLI -- only needed inside backend/processor/deploy_lambda.sh (runs
             automatically in its container) and for AWS deployment

INSTALLATION STEPS
-------------------
  1. Clone the repository and cd into projects/04-smart-city/.
  2. No manual dependency installation is required to run the stack or the
     unit tests: each module (sensors/, fog/, backend/processor/,
     backend/dashboard/) has its own pom.xml, and Maven resolves its
     dependencies automatically.
  3. To run the Python ops scripts in infra/ locally (outside Docker),
     install their one dependency:
       pip install boto3

CONFIGURATION
--------------
sensors/ (com.fec.smartcity.sensor.MetricSensor):
  SENSOR_TYPE        metric this sensor instance generates -- one of
                      vehicle_count, air_quality_pm25, noise_level,
                      parking_occupancy, ambient_light (no default, required)
  SITE_ID             zone tag attached to generated readings, default "zone-1"
  SAMPLE_INTERVAL      seconds between generated readings, default 2
  DISPATCH_INTERVAL   seconds between posting buffered readings to the fog
                      node, default 10
  FOG_URL             fog node ingest endpoint, default
                      "http://fog:8000/ingest"

fog/ (com.fec.smartcity.fog.CityFogNode):
  WINDOW_SECONDS      aggregation window length in seconds, default 10
  SQS_QUEUE_NAME      SQS queue aggregated windows are published to,
                      default "fsc-metrics-agg"
  AWS_ENDPOINT_URL    AWS endpoint override, unset by default
  AWS_REGION          AWS region, default "eu-west-1"

backend/processor/ (com.fec.smartcity.processor.Handler):
  TABLE_NAME          DynamoDB table readings are written to, default
                      "fsc-readings"
  AWS_ENDPOINT_URL    AWS endpoint override, unset by default
  AWS_REGION          AWS region, default "eu-west-1"
  (deploy_lambda.sh, the container entrypoint that registers the Lambda,
  also reads:)
  SQS_QUEUE_NAME      queue the Lambda's event source mapping is wired to,
                      default "fsc-metrics-agg"
  LAMBDA_FUNCTION_NAME name the Lambda function is registered under,
                      default "fsc-processor"

backend/dashboard/ (com.fec.smartcity.dashboard.CityDashboardApp):
  TABLE_NAME          DynamoDB table read for readings, default
                      "fsc-readings"
  SQS_QUEUE_NAME      queue queried for queue-depth/health, default
                      "fsc-metrics-agg"
  LAMBDA_FUNCTION_NAME processor Lambda function queried for health,
                      default "fsc-processor"
  AWS_ENDPOINT_URL    AWS endpoint override, unset by default
  AWS_REGION          AWS region, default "eu-west-1"
  FOG_HEALTH_URL      fog node health-check URL, default
                      "http://fog:8000/health"
  FOG_THRESHOLDS_URL  fog node thresholds URL, default
                      "http://fog:8000/thresholds"

infra/verify_pipeline.py and infra/burst.py:
  AWS_ENDPOINT_URL    AWS endpoint override, default "http://localhost:4569"
  AWS_REGION          AWS region, default "eu-west-1"
  TABLE_NAME          (verify_pipeline.py) DynamoDB table to poll, default
                      "fsc-readings"
  SQS_QUEUE_NAME      (burst.py) queue to send load-test messages to,
                      default "fsc-metrics-agg"
  VERIFY_TIMEOUT      (verify_pipeline.py) seconds to wait for all metric
                      types to appear, default 90

BUILD INSTRUCTIONS
--------------------
Each module builds independently with Maven:
  cd sensors             && mvn package -DskipTests
  cd fog                 && mvn package -DskipTests
  cd backend/processor   && mvn package -DskipTests
  cd backend/dashboard   && mvn package -DskipTests

Resulting artifacts:
  sensors/target/sensor.jar               main class:
                                           com.fec.smartcity.sensor.MetricSensor
  fog/target/fog.jar                      shaded jar, main class:
                                           com.fec.smartcity.fog.CityFogNode
  backend/processor/target/processor.jar  shaded jar, Lambda handler:
                                           com.fec.smartcity.processor.Handler::handleRequest
  backend/dashboard/target/dashboard.jar  shaded jar, main class:
                                           com.fec.smartcity.dashboard.CityDashboardApp

Each module's own Dockerfile runs the equivalent build (`mvn -q -B
dependency:go-offline` then `mvn -q -B -DskipTests package`) inside a
maven:3.9-eclipse-temurin-17 build stage, then copies the resulting jar into
a runtime image (eclipse-temurin:17-jre for sensors/fog/dashboard;
python:3.12-slim for backend/processor, whose container entrypoint is
deploy_lambda.sh, an AWS CLI script that registers the built jar as a
Lambda function).

RUN INSTRUCTIONS
------------------
  docker compose -f infra/docker-compose.yml up --build

This starts: localstack (SQS/DynamoDB/Lambda emulation), fog (edge relay),
processor (one-shot: builds and registers the processor Lambda against
LocalStack, then exits), dashboard (dashboard API + static frontend), and
10 sensor containers (5 metrics x 2 zones: vehicle_count, air_quality_pm25,
noise_level, parking_occupancy, ambient_light).

Ports exposed to the host:
  Dashboard:   http://localhost:8083  (container port 8000)
  LocalStack:  http://localhost:4569  (container port 4566)

Stop and remove:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
----------------------
Deploy this project to AWS through the Terraform module in
terraform/ at the repo root.

1. Configure AWS credentials for the target account, then confirm identity:
     aws configure
     aws sts get-caller-identity

2. Create terraform/deployments/fsc.tfvars with the values below, for
   example:
     prefix       = "fsc"
     project_root = "../projects/04-smart-city"

     table_name = "fsc-readings"
     queue_name = "fsc-metrics-agg"

     processor_lambda_name   = "fsc-processor"
     processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
     processor_zip_path      = "backend/processor/target/processor.jar"
     processor_handler       = "com.fec.smartcity.processor.Handler::handleRequest"
     processor_runtime       = "java17"

     dashboard_lambda_name   = "fsc-dashboard-api"
     dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
     dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
     dashboard_handler       = "<dashboard module's Lambda entry point class>::handleRequest"
     dashboard_runtime       = "java17"

     frontend_local_dir    = "backend/dashboard/static"
     api_base_placeholder  = "__API_BASE__"
     api_base_search_files = ["index.html"]

3. From the terraform/ directory, create and switch to an isolated
   workspace before applying:
     terraform workspace new fsc
     terraform workspace list

4. Run the pre-flight build, then plan and apply:
     cd terraform
     ./build.sh deployments/fsc.tfvars
     terraform plan -var-file=deployments/fsc.tfvars
     terraform apply -var-file=deployments/fsc.tfvars

5. Switch back to the default workspace once finished:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own pom.xml and its own JUnit 5 test suite:
  cd sensors             && mvn test    (6 tests)
  cd fog                 && mvn test    (16 tests)
  cd backend/processor   && mvn test    (10 tests)
  cd backend/dashboard   && mvn test    (29 tests)

Total: 61 tests.

Without a local Java/Maven install, run any module's tests in a container,
for example:
  docker run --rm -v "$PWD":/app -w /app/fog maven:3.9-eclipse-temurin-17 \
    mvn -B test

With the local stack running (see RUN INSTRUCTIONS), verify the end-to-end
pipeline:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/verify_pipeline.py

Load test (with the local stack running):
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32
