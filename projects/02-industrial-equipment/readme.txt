Industrial Equipment Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - JDK 17 and Maven (only needed to build/test the four Java modules
    outside Docker)
  - Python 3 with boto3 installed (only needed to run the ops scripts in
    infra/: verify_pipeline.py and burst.py)
  - AWS CLI and Terraform >= 1.5 (only needed for the AWS deployment steps)

INSTALLATION STEPS
--------------------
  1. Clone the repository and change into this project's folder:
       cd projects/02-industrial-equipment
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

  sensors/ (Sensor.java):
    SENSOR_TYPE        sensor type this container simulates; one of
                       vibration, motor_temperature, bearing_acoustic,
                       rotation_speed, power_draw; no default (must be set)
    SITE_ID            site/line identifier, default "line-1"
    SAMPLE_INTERVAL    seconds between generated readings, default "2"
    DISPATCH_INTERVAL  seconds between dispatches to the fog gateway,
                       default "10"
    FOG_URL            fog gateway ingest URL, default
                       "http://fog:8000/ingest"

  fog/ (FogApp.java, QueueRelay.java):
    WINDOW_SECONDS      aggregation window length in seconds, default "10"
    SQS_QUEUE_NAME      target SQS queue name, default "fei-sensor-agg"
    AWS_ENDPOINT_URL    AWS endpoint override (set for LocalStack, unset
                        for real AWS so the SDK's default credential/
                        endpoint chain is used), no default
    AWS_REGION          AWS region, default "eu-west-1"

  backend/processor/ (Handler.java, the Lambda entry point):
    TABLE_NAME          DynamoDB table name, default "fei-readings"
    AWS_ENDPOINT_URL    AWS endpoint override (LocalStack only), no
                        default
    AWS_REGION          AWS region, default "eu-west-1"

  backend/processor/deploy_lambda.sh (LocalStack one-shot Lambda deploy
  job -- this script only creates/updates the function against the
  LocalStack endpoint, it is not used for the real AWS deployment):
    AWS_ENDPOINT_URL     LocalStack endpoint, default
                        "http://localstack:4566"
    SQS_QUEUE_NAME        queue to wire the function's event source
                        mapping to, default "fei-sensor-agg"
    LAMBDA_FUNCTION_NAME  name to create/update the function under,
                        default "fei-processor"
    TABLE_NAME             passed through as the created function's own
                        TABLE_NAME variable, default "fei-readings"
    AWS_REGION            AWS region, default "eu-west-1"

  backend/dashboard/ (DashboardApp.java):
    TABLE_NAME            DynamoDB table name, default "fei-readings"
    SQS_QUEUE_NAME        SQS queue name (for queue-depth checks),
                        default "fei-sensor-agg"
    LAMBDA_FUNCTION_NAME  processor Lambda name (for health checks),
                        default "fei-processor"
    AWS_ENDPOINT_URL      AWS endpoint override (LocalStack only), no
                        default
    AWS_REGION            AWS region, default "eu-west-1"
    FOG_HEALTH_URL        fog gateway health endpoint, default
                        "http://fog:8000/health"
    FOG_THRESHOLDS_URL    fog gateway thresholds endpoint, default
                        "http://fog:8000/thresholds"

  infra/verify_pipeline.py:
    AWS_ENDPOINT_URL    default "http://localhost:4567"
    AWS_REGION          default "eu-west-1"
    TABLE_NAME          default "fei-readings"
    VERIFY_TIMEOUT      seconds to poll before giving up, default "90"

  infra/burst.py:
    AWS_ENDPOINT_URL    default "http://localhost:4567"
    AWS_REGION          default "eu-west-1"
    SQS_QUEUE_NAME      default "fei-sensor-agg"

BUILD INSTRUCTIONS
--------------------
Each module is an independent Maven project and builds a jar:
  cd sensors && mvn package -DskipTests               (target/sensor.jar)
  cd fog && mvn package -DskipTests                    (target/fog.jar, shaded)
  cd backend/processor && mvn package -DskipTests      (target/processor.jar, shaded)
  cd backend/dashboard && mvn package -DskipTests      (target/dashboard.jar, shaded)

Or build all four via Docker (each module's own Dockerfile does the same
Maven build inside a maven:3.9-eclipse-temurin-17 stage):
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog gateway, one-shot Lambda
deploy job for backend/processor, dashboard, and 6 sensor containers
covering the 5 sensor types across 2 production lines):
  docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
  Dashboard:  http://localhost:8081  (container port 8000)
  LocalStack: http://localhost:4567  (container port 4566)

The fog gateway (container port 8000) is not published to the host in
this compose file; it is reachable only from other containers on the
compose network at http://fog:8000.

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
No terraform/deployments/*.tfvars file exists yet for this project.
Before deploying, create one (for example
terraform/deployments/fei.tfvars) following the structure of the other
files already in terraform/deployments/ -- use those files as a format
reference only, not as values to copy. The file needs:
  - prefix              a short resource-name prefix (this project's own
                        code and docker-compose.yml already use "fei" for
                        its queue/table names, so reusing "fei" here
                        keeps naming consistent)
  - project_root         path to this project's folder relative to
                        terraform/, e.g. "../projects/02-industrial-equipment"
  - table_name            "fei-readings"
  - queue_name            "fei-sensor-agg"
  - processor_lambda_name, processor_build_command, processor_zip_path,
    processor_handler, processor_runtime -- for backend/processor; the
    existing build is "cd backend/processor && mvn package -DskipTests -q",
    the zip/jar path is "backend/processor/target/processor.jar", the
    handler class is already Lambda-ready at
    "com.fec.industrial.processor.Handler::handleRequest", and the
    runtime is "java17"
  - dashboard_lambda_name, dashboard_build_command, dashboard_zip_path,
    dashboard_handler, dashboard_runtime -- for backend/dashboard; note
    that DashboardApp.java currently runs as a plain HTTP server (see
    RUN INSTRUCTIONS) rather than implementing a Lambda request handler,
    so a Lambda-compatible entry point needs to be added to this module
    before it can be referenced here and deployed behind API Gateway
  - frontend_local_dir, api_base_placeholder, api_base_search_files --
    for the static dashboard frontend in backend/dashboard/static

Once the tfvars file exists:
  1. Configure AWS credentials for the target account:
       aws configure
     (or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
     AWS_SESSION_TOKEN directly)
  2. Confirm you are pointed at the correct account:
       aws sts get-caller-identity
  3. From the repo root, create and switch to a dedicated Terraform
     workspace for this project before ever applying:
       cd terraform
       terraform workspace new fei
       terraform workspace list
  4. Build the Lambda jars and the EC2 deploy tarball:
       ./build.sh deployments/fei.tfvars
  5. Review the plan:
       terraform plan -var-file=deployments/fei.tfvars
  6. Apply:
       terraform apply -var-file=deployments/fei.tfvars
  7. When finished, switch back to the default workspace so it does not
     carry into the next deployment run:
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
  sensors:            4 tests   (SensorTest: 4)
  fog:                18 tests  (AggregationTest: 3, AlertsTest: 7,
                       FogAppTest: 4, QueueRelayTest: 4)
  backend/processor:  5 tests   (HandlerTest: 2, ReshapeTest: 3)
  backend/dashboard:  15 tests  (DashboardAppTest: 3, DynamoHelperTest: 3,
                       HealthChecksTest: 9)
  total:              42 tests, all passing

End-to-end pipeline check, with the local stack running:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Load test:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

Or probe the dashboard's own REST API directly:
  curl http://localhost:8081/api/health
  curl http://localhost:8081/api/backend-stats
  curl http://localhost:8081/api/summary
  curl "http://localhost:8081/api/readings?sensor_type=vibration&limit=10"
  curl http://localhost:8081/api/thresholds
