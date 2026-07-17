Warehouse Robotics Fleet

1. PREREQUISITES

- Docker and Docker Compose (to run the local stack)
- Java 17 JDK (all four Maven modules build with maven.compiler.release=17;
  Dockerfiles build on eclipse-temurin:17)
- Maven 3.9 or later (Dockerfiles use maven:3.9-eclipse-temurin-17 to build)
- For AWS deployment only: AWS CLI and Terraform >= 1.5


2. INSTALLATION STEPS

1. Clone the repository.
2. cd into projects/07-warehouse-robotics-fleet
3. There are four independent Maven modules: sensors, fog, backend/processor,
   and backend/dashboard. Each resolves its own dependencies from its pom.xml
   the first time it is built or tested; no separate manual install step is
   required beyond having Maven and a JDK 17 on PATH. To pre-fetch dependencies
   for a module without building it, run, from inside that module's directory:
   mvn -q -B dependency:go-offline


3. CONFIGURATION

Sensors (sensors/src/main/java/com/fec/warehouse/sensor/RobotUnit.java):
- SENSOR_TYPE - required, no default. Must be one of: battery_level_pct,
  payload_kg, motor_temp_c, position_drift_cm, task_queue_depth
- SITE_ID - default "zone-a"
- SAMPLE_INTERVAL - default "2" (seconds between simulated readings)
- DISPATCH_INTERVAL - default "10" (seconds between HTTP dispatch batches sent
  to the fog node)
- FOG_URL - default "http://fog:8000/ingest" (fog node ingest endpoint)

Fog node (fog/src/main/java/com/fec/warehouse/fog/FleetGateway.java and
RelayPublisher.java):
- WINDOW_SECONDS - default "10" (aggregation window length in seconds)
- SQS_QUEUE_NAME - default "wrf-fleet-agg"
- AWS_ENDPOINT_URL - no default. Unset means the real AWS SQS endpoint for the
  configured region; set it to point at a LocalStack endpoint instead
- AWS_REGION - default "eu-west-1". On EC2/Lambda this is normally supplied by
  the AWS runtime environment itself

Backend processor Lambda (backend/processor/src/main/java/com/fec/warehouse/processor/FleetHandler.java):
- TABLE_NAME - default "wrf-readings" (DynamoDB table written on each SQS
  message)
- AWS_ENDPOINT_URL - no default, same LocalStack-vs-real-AWS switch as above
- AWS_REGION - default "eu-west-1"

Backend dashboard API (backend/dashboard/src/main/java/com/fec/warehouse/dashboard/FleetDashboardApp.java,
also read by FleetDashboardLambda.java):
- TABLE_NAME - default "wrf-readings" (DynamoDB table read for fleet/readings
  data)
- SQS_QUEUE_NAME - default "wrf-fleet-agg" (queue whose depth is reported)
- LAMBDA_FUNCTION_NAME - default "wrf-processor" (function whose deployment
  state is checked)
- AWS_ENDPOINT_URL - no default, same LocalStack-vs-real-AWS switch as above
- AWS_REGION - default "eu-west-1"
- FOG_HEALTH_URL - default "http://fog:8000/health" (fog node health check)
- FOG_THRESHOLDS_URL - default "http://fog:8000/thresholds" (fog node alert
  threshold definitions)


4. BUILD INSTRUCTIONS

Each module is built independently with Maven, producing a shaded (fat) jar
under its own target/ directory:

- Sensors:
  cd sensors && mvn package -DskipTests -q
  -> sensors/target/sensor.jar

- Fog:
  cd fog && mvn package -DskipTests -q
  -> fog/target/fog.jar

- Backend processor (Lambda):
  cd backend/processor && mvn package -DskipTests -q
  -> backend/processor/target/processor.jar

- Backend dashboard (Lambda / local HTTP server):
  cd backend/dashboard && mvn package -DskipTests -q
  -> backend/dashboard/target/dashboard.jar

Docker images for the local stack are built automatically by the run command
in section 5 (each service's Dockerfile runs its own Maven build inside the
image).


5. RUN INSTRUCTIONS

From the project root, bring up the full local stack (LocalStack, fog,
processor, dashboard, and 10 simulated robot sensor containers) with:

docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
- Dashboard HTTP API and static frontend: http://localhost:8086 (mapped from
  container port 8000)
- LocalStack: http://localhost:4572 (mapped from container port 4566)

The fog node's port 8000 is not published to the host in this compose file;
it is reachable only from other containers on the compose network at
http://fog:8000. The "processor" service is a one-shot container (restart:
"no") that deploys FleetHandler as a Lambda inside LocalStack and wires it to
the SQS queue, then exits.

To stop the stack:
docker compose -f infra/docker-compose.yml down


6. AWS DEPLOYMENT STEPS

Deployment to real AWS uses the Terraform module in terraform/ with
the terraform/deployments/wrf.tfvars file.

1. Configure AWS CLI credentials for the target AWS account (access key,
   secret key, and session token if using temporary credentials):
   aws configure

2. Confirm the credentials resolve to the intended account:
   aws sts get-caller-identity

3. cd terraform

4. Create and switch to an isolated workspace (use
   "select" instead of "new" if the workspace already exists):
   terraform workspace new wrf
   terraform workspace list

5. Build the Lambda deployment artifacts (runs the Maven package commands and
   tars sensors/fog/infra for the EC2 fog host):
   ./build.sh deployments/wrf.tfvars

6. Review the plan before applying:
   terraform plan -var-file=deployments/wrf.tfvars

7. Apply:
   terraform apply -var-file=deployments/wrf.tfvars

8. Note the dashboard_url, api_url, and fog_public_ip values in the apply
   output.

9. When finished, switch back to the default workspace:
   terraform workspace select default


7. TESTING INSTRUCTIONS

Each of the four Maven modules has its own JUnit 5 test suite, run with:

- Sensors:
  cd sensors && mvn test
  56 tests

- Fog:
  cd fog && mvn test
  24 tests

- Backend processor:
  cd backend/processor && mvn test
  9 tests

- Backend dashboard:
  cd backend/dashboard && mvn test
  27 tests

Total: 116 tests across all four modules.
