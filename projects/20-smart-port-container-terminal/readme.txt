Smart Port Container Terminal

1. PREREQUISITES

- Docker and Docker Compose (v2, `docker compose` subcommand)
- Java 17 JDK
- Apache Maven 3.9+
- AWS CLI v2 (only needed for the AWS Deployment Steps section)
- Terraform >= 1.5 with the AWS provider ~> 5.0 (only needed for the AWS Deployment Steps section)

2. INSTALLATION STEPS

1. Clone the repository and change into the project folder:
   git clone <repository-url>
   cd projects/20-smart-port-container-terminal

2. Each module is a standalone Maven project (sensors, fog, backend/processor,
   backend/dashboard). To pre-fetch dependencies for local test/build runs
   without network access later, run in each module directory:
   mvn -q -B dependency:go-offline

3. CONFIGURATION

Sensor units (sensors/src/main/java/com/fec/port/sensor/BerthSensorUnit.java):
- SENSOR_TYPE - no default, must be set to one of: crane_load_kg,
  container_stack_height, wind_speed_knots, berth_occupancy_pct, reefer_temp_c
- SITE_ID - default "berth-a"
- SAMPLE_INTERVAL - default "2" (seconds between generated samples)
- DISPATCH_INTERVAL - default "10" (seconds between batches sent to the fog node)
- FOG_URL - default "http://fog:8000/ingest"

Fog node (fog/src/main/java/com/fec/port/fog/TerminalGateway.java):
- WINDOW_SECONDS - default "10" (aggregation window length in seconds)
- SQS_QUEUE_NAME - default "spc-berth-agg"
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local runs,
  unset for real AWS
- AWS_REGION - default "eu-west-1"

Backend processor Lambda (backend/processor/src/main/java/com/fec/port/processor/TerminalHandler.java):
- TABLE_NAME - default "spc-readings" (DynamoDB table written per SQS record)
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local runs,
  unset for real AWS
- AWS_REGION - default "eu-west-1"

Backend dashboard (TerminalDashboardApp.java for local HTTP server,
TerminalDashboardLambda.java for the API Gateway-backed Lambda):
- TABLE_NAME - default "spc-readings"
- SQS_QUEUE_NAME - default "spc-berth-agg"
- LAMBDA_FUNCTION_NAME - default "spc-processor"
- AWS_ENDPOINT_URL - no default; set to a LocalStack endpoint for local runs,
  unset for real AWS
- AWS_REGION - default "eu-west-1"
- FOG_HEALTH_URL - default "http://fog:8000/health"
- FOG_THRESHOLDS_URL - default "http://fog:8000/thresholds"

LocalStack Lambda deploy script (backend/processor/deploy_lambda.sh, used only
inside the local docker-compose stack, reads the same AWS_ENDPOINT_URL,
SQS_QUEUE_NAME, LAMBDA_FUNCTION_NAME, TABLE_NAME, AWS_REGION variables above).

4. BUILD INSTRUCTIONS

Build each module (produces a jar in that module's target/ directory):

cd sensors && mvn package -DskipTests -q && cd ..
   -> target/sensor.jar

cd fog && mvn package -DskipTests -q && cd ..
   -> target/fog.jar (shaded jar)

cd backend/processor && mvn package -DskipTests -q && cd ../..
   -> target/processor.jar (shaded jar)

cd backend/dashboard && mvn package -DskipTests -q && cd ../..
   -> target/dashboard.jar (shaded jar)

5. RUN INSTRUCTIONS

Bring up the full local stack (LocalStack, fog, dashboard, one-shot processor
Lambda deploy, and 10 sensor containers covering 5 sensor types across
berth-a/berth-b):

cd infra
docker compose up --build

Ports:
- Dashboard: http://localhost:8099 (container port 8000 published as 8099)
- LocalStack: localhost:4585 (container port 4566 published as 4585)
- fog: internal to the compose network only, not published to the host

Stop the stack:
docker compose down

6. AWS DEPLOYMENT STEPS

A terraform/deployments/spc.tfvars file is already prepared.
From the repository root:

1. Configure AWS credentials (access key, secret key, session token if using
   temporary credentials):
   aws configure

2. Confirm the credentials resolve to the intended account:
   aws sts get-caller-identity

3. Change into the Terraform module directory:
   cd terraform

4. Create and switch to a dedicated workspace:
   terraform workspace new spc
   terraform workspace list

5. Build the Lambda jars and the EC2 deploy tarball (must run before apply):
   ./build.sh deployments/spc.tfvars

6. Review the plan:
   terraform plan -var-file=deployments/spc.tfvars

7. Apply:
   terraform apply -var-file=deployments/spc.tfvars

8. Read the resulting resource identifiers and URLs:
   terraform output

9. When finished, switch back to the default workspace:
   terraform workspace select default

To tear the stack down:
cd terraform
terraform workspace select spc
terraform destroy -var-file=deployments/spc.tfvars

7. TESTING INSTRUCTIONS

Run each module's test suite from its own directory:

cd sensors && mvn test
   -> 6 tests (BerthSensorUnitTest)

cd fog && mvn test
   -> 48 tests (TerminalRouterTest 4, WindowAggregateTest 4, TerminalLedgerTest 6,
      TerminalGatewayTest 6, TerminalGatewayHttpTest 9, BatchPayloadJsonTest 3,
      IngestValidationTest 7, BerthRulesTest 9)

cd backend/processor && mvn test
   -> 8 tests (ItemMapperTest 5, TerminalHandlerTest 3)

cd backend/dashboard && mvn test
   -> 33 tests (BerthRepositoryTest 4, PipelineStatusTest 8, StatusLineTest 6,
      TerminalDashboardAppTest 4, TerminalDashboardLambdaTest 9, ThresholdsGatewayTest 2)

Total: 95 tests across all four modules.
