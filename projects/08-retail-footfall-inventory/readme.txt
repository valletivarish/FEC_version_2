Retail Footfall & Inventory Monitoring

All commands below assume your working directory is this folder
(projects/08-retail-footfall-inventory/), not the repo root.

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - JDK 17 and Apache Maven (to build/test the sensors, fog,
    backend/processor, and backend/dashboard modules locally, outside
    Docker)
  - Python 3.12+ with the boto3 package installed (to run
    infra/verify_pipeline.py and infra/burst.py)
  - AWS CLI and Terraform >= 1.5 (only needed for the AWS deployment
    steps below)

INSTALLATION STEPS
--------------------
  1. Clone the repository.
  2. cd projects/08-retail-footfall-inventory
  3. pip install boto3
  4. No separate local install step is needed for the Java modules --
     each `mvn test` / `mvn package` invocation below resolves its own
     dependencies (JUnit 5, AWS SDK for Java v2, Jackson Databind,
     aws-lambda-java-core/events) automatically on first run.

CONFIGURATION
---------------
sensors/ (one container per sensor type/store, StoreSensorUnit.java):
  SENSOR_TYPE       required, no default. One of: footfall_count,
                    shelf_stock_pct, fridge_temp_c, queue_length,
                    energy_draw_kw
  SITE_ID           default: store-1
  SAMPLE_INTERVAL   default: 2 (seconds between generated readings)
  DISPATCH_INTERVAL default: 10 (seconds between dispatches to the fog
                    gateway)
  FOG_URL           default: http://fog:8000/ingest

fog/ (StoreGateway.java, publishes aggregates to SQS):
  WINDOW_SECONDS    default: 10 (aggregation window length in seconds)
  SQS_QUEUE_NAME    default: rfi-store-agg
  AWS_ENDPOINT_URL  no default. When set, the SQS client is pointed at
                    this endpoint with static test/test credentials
                    (LocalStack). When unset, the AWS SDK's default
                    endpoint/credential resolution is used.
  AWS_REGION        default: eu-west-1

backend/processor/ (StoreHandler.java, Lambda entry point consuming the
SQS event source mapping and writing to DynamoDB):
  TABLE_NAME        default: rfi-readings
  AWS_ENDPOINT_URL  no default, same behaviour as above (DynamoDB client)
  AWS_REGION        default: eu-west-1

backend/processor/deploy_lambda.sh (registers the Lambda + event source
mapping against LocalStack):
  AWS_ENDPOINT_URL     default: http://localstack:4566
  SQS_QUEUE_NAME       default: rfi-store-agg
  LAMBDA_FUNCTION_NAME default: rfi-processor
  TABLE_NAME           default: rfi-readings
  AWS_REGION           default: eu-west-1

backend/dashboard/ (StoreDashboardApp.java, serves the REST API + static
frontend):
  TABLE_NAME           default: rfi-readings
  SQS_QUEUE_NAME       default: rfi-store-agg
  LAMBDA_FUNCTION_NAME default: rfi-processor
  AWS_ENDPOINT_URL     no default, same behaviour as above (DynamoDB/SQS/
                       Lambda clients)
  AWS_REGION           default: eu-west-1
  FOG_HEALTH_URL       default: http://fog:8000/health
  FOG_THRESHOLDS_URL   default: http://fog:8000/thresholds

infra/verify_pipeline.py (polls DynamoDB until every sensor type has a
record):
  AWS_ENDPOINT_URL  default: http://localhost:4573
  AWS_REGION        default: eu-west-1
  TABLE_NAME        default: rfi-readings
  VERIFY_TIMEOUT    default: 90 (seconds)

infra/burst.py (load-test tool, sends synthetic messages to SQS):
  AWS_ENDPOINT_URL  default: http://localhost:4573
  AWS_REGION        default: eu-west-1
  SQS_QUEUE_NAME    default: rfi-store-agg

infra/docker-compose.yml also sets AWS_ACCESS_KEY_ID=test and
AWS_SECRET_ACCESS_KEY=test on every AWS-facing container, for LocalStack.

BUILD INSTRUCTIONS
---------------------
Each module builds independently with Maven and produces a shaded jar:
  cd sensors && mvn package -DskipTests            -> target/sensor.jar
  cd fog && mvn package -DskipTests                -> target/fog.jar
  cd backend/processor && mvn package -DskipTests  -> target/processor.jar
  cd backend/dashboard && mvn package -DskipTests  -> target/dashboard.jar

Or let Docker build each image (used by RUN INSTRUCTIONS below):
  docker compose -f infra/docker-compose.yml build

RUN INSTRUCTIONS
------------------
  docker compose -f infra/docker-compose.yml up --build

This starts LocalStack, the fog gateway, the one-shot Lambda-deploy
container, the dashboard, and 10 sensor containers (5 sensor types x 2
stores).

  Dashboard:  http://localhost:8087
  LocalStack: http://localhost:4573

  Stop:  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
Deploy this project with the Terraform module in terraform/ by
following these steps:

  1. Configure AWS credentials for the target account and confirm them:
       aws configure
       aws sts get-caller-identity

  2. Create infra/docker-compose.aws.yml alongside the existing
     infra/docker-compose.yml: include the fog service and all 10
     sensor services (store1-footfall through store2-energy) with the
     same environment variables as infra/docker-compose.yml, but drop
     the localstack and processor services and remove AWS_ENDPOINT_URL
     from every environment block, so the AWS SDK's default credential
     chain is used instead of the LocalStack override. Publish the fog
     container's port 8000.

  3. Create terraform/deployments/rfi.tfvars. The fields required by
     terraform/variables.tf are:
       prefix                  = "rfi"
       project_root            = "../projects/08-retail-footfall-inventory"
       table_name              = "rfi-readings"
       queue_name              = "rfi-store-agg"
       processor_lambda_name   = "rfi-processor"
       processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
       processor_zip_path      = "backend/processor/target/processor.jar"
       processor_handler       = "com.fec.retail.processor.StoreHandler::handleRequest"
       processor_runtime       = "java17"
       dashboard_lambda_name   = "rfi-dashboard-api"
       dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
       dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
       dashboard_handler       = <fully-qualified class::method of an
                                  API Gateway Lambda entry point class,
                                  added to
                                  backend/dashboard/src/main/java, that
                                  answers the dashboard's REST API>
       dashboard_runtime       = "java17"
       frontend_local_dir      = "backend/dashboard/static"
       api_base_placeholder    = <a placeholder token added to the
                                  frontend, substituted with the real
                                  API Gateway URL at upload time>
       api_base_search_files   = [<the file(s) containing that
                                  placeholder>]

  4. Create and switch to an isolated Terraform workspace before
     applying:
       cd terraform
       terraform workspace new rfi
       terraform workspace list

  5. Build the deployment artifacts, then preview and apply:
       ./build.sh deployments/rfi.tfvars
       terraform plan -var-file=deployments/rfi.tfvars
       terraform apply -var-file=deployments/rfi.tfvars

  6. Confirm the plan's destroy count is 0 before approving apply.

  7. Switch back to the default workspace afterward:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each Maven module has its own JUnit 5 test suite (hand-written fakes
implementing the real AWS SDK v2 client interfaces, no LocalStack calls
in the tests themselves):
  cd sensors && mvn test                  (56 tests)
  cd fog && mvn test                      (28 tests)
  cd backend/processor && mvn test        (14 tests)
  cd backend/dashboard && mvn test        (20 tests)

All 118 tests pass (verified by running each suite directly).

Or without local Maven/JDK:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

With the stack running (docker compose up, above), verify the pipeline
end-to-end:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Or probe the dashboard's own REST API directly:
  curl http://localhost:8087/api/health
  curl http://localhost:8087/api/backend-stats
  curl http://localhost:8087/api/stores
  curl "http://localhost:8087/api/readings?sensor_type=queue_length&limit=10"
  curl http://localhost:8087/api/thresholds

Load test (with the stack running):
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32
