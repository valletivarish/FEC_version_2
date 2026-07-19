Public Transit Fleet Monitoring

PREREQUISITES
--------------
- Docker and Docker Compose
- JDK 17 and Maven (only needed to build or run the test suites outside Docker)
- Python 3.12+ with the boto3 package (only needed for infra/verify_pipeline.py
  and infra/burst.py)
- AWS CLI (only needed for the AWS deployment steps)
- Terraform (only needed for the AWS deployment steps)

INSTALLATION STEPS
--------------------
1. Clone the repository and change into this project's folder:
     cd projects/16-public-transit-fleet-monitoring
2. Install the Python dependency used by the ops scripts in infra/:
     pip install boto3
3. No other local install step is required. Each Maven module (sensors/,
   fog/, backend/processor/, backend/dashboard/) downloads its own
   dependencies automatically the first time it is built or tested.

CONFIGURATION
--------------
Environment variables actually read by each module (all have the shown
default unless marked "required"):

sensors (TransitSensorUnit.java):
  SENSOR_TYPE        required, no default (e.g. engine_temp_c,
                      brake_pad_wear_pct, passenger_count, fuel_level_pct,
                      gps_speed_kmh)
  SITE_ID            default: depot-a
  SAMPLE_INTERVAL    default: 2 (seconds between generated readings)
  DISPATCH_INTERVAL  default: 10 (seconds between dispatches to the fog
                      gateway)
  FOG_URL            default: http://fog:8000/ingest

fog (TransitGateway.java):
  WINDOW_SECONDS     default: 10 (aggregation window length in seconds)
  SQS_QUEUE_NAME     default: ptf-depot-agg
  AWS_ENDPOINT_URL   no default (unset means the real AWS endpoint; set to
                      a LocalStack URL for local runs)
  AWS_REGION         default: eu-west-1

backend/processor (TransitHandler.java):
  TABLE_NAME         default: ptf-readings
  AWS_ENDPOINT_URL   no default (same as above)
  AWS_REGION         default: eu-west-1

backend/dashboard (TransitDashboardApp.java):
  TABLE_NAME             default: ptf-readings
  SQS_QUEUE_NAME         default: ptf-depot-agg
  LAMBDA_FUNCTION_NAME   default: ptf-processor
  AWS_ENDPOINT_URL       no default (same as above)
  AWS_REGION             default: eu-west-1
  FOG_HEALTH_URL         default: http://fog:8000/health
  FOG_THRESHOLDS_URL     default: http://fog:8000/thresholds

infra/verify_pipeline.py and infra/burst.py (Python ops tooling):
  AWS_ENDPOINT_URL   default: http://localhost:4581
  AWS_REGION         default: eu-west-1
  TABLE_NAME         default: ptf-readings (verify_pipeline.py only)
  SQS_QUEUE_NAME     default: ptf-depot-agg (burst.py only)
  VERIFY_TIMEOUT     default: 90 (seconds, verify_pipeline.py only)

AWS credentials for the SQS/DynamoDB/Lambda clients (AWS_ACCESS_KEY_ID,
AWS_SECRET_ACCESS_KEY) are picked up through the AWS SDK's default
credential chain rather than read individually in code; docker-compose.yml
sets both to "test" for LocalStack.

BUILD INSTRUCTIONS
---------------------
Each module is a separate Maven project and is built independently:
  cd sensors && mvn package -DskipTests -q
  cd fog && mvn package -DskipTests -q
  cd backend/processor && mvn package -DskipTests -q
  cd backend/dashboard && mvn package -DskipTests -q

This produces:
  sensors/target/sensors.jar
  fog/target/fog.jar
  backend/processor/target/processor.jar
  backend/dashboard/target/dashboard.jar

Each module's Dockerfile runs the same build inside a
maven:3.9-eclipse-temurin-17 build stage, so `docker compose ... up --build`
(see RUN INSTRUCTIONS below) builds all four without a local Maven/JDK
install.

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog gateway, dashboard API, and
10 sensor containers -- 5 sensor types across depot-a and depot-b):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8095  (container port 8000)
  LocalStack:  http://localhost:4581  (container port 4566)

The fog gateway (container port 8000) is not published to the host; it is
only reachable from other containers on the compose network.

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
Deploy through the Terraform module in terraform/ at the repository root,
driven by the deployment variables file terraform/deployments/ptf.tfvars
(which defines the DynamoDB table, the SQS queue, both java17 Lambdas and
their Maven build commands, and the frontend upload settings). The
dashboard's API Gateway entry point is
com.fec.transit.dashboard.TransitDashboardLambda, which drives the same
route methods as the standalone TransitDashboardApp through an in-memory
exchange, so no route logic is duplicated.

1. Configure AWS credentials for the target account:
     aws configure
   (or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and
   AWS_SESSION_TOKEN directly). Region must be us-east-1.

2. Confirm the credentials point at the intended account:
     aws sts get-caller-identity

3. cd terraform

4. Create and switch to a dedicated Terraform workspace (do not apply
   against the default workspace):
     terraform workspace new ptf
     terraform workspace list
   (confirm ptf is marked as the current workspace)

5. Build the Lambda deployment packages and the EC2 source tarball:
     ./build.sh deployments/ptf.tfvars

6. Review the plan before applying:
     terraform plan -var-file=deployments/ptf.tfvars
   Confirm the "Plan: N to add, 0 to change, 0 to destroy" line shows no
   destroys.

7. Apply:
     terraform apply -var-file=deployments/ptf.tfvars

8. Switch back to the default workspace when finished:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each Maven module has its own JUnit 5 test suite (hand-written fakes
implementing the AWS SDK v2 client interfaces, no Mockito, no calls to
real AWS/LocalStack):
  cd sensors && mvn test
  cd fog && mvn test
  cd backend/processor && mvn test
  cd backend/dashboard && mvn test

Or without a local Maven/JDK install:
  docker run --rm -v "$PWD/fog":/app -w /app maven:3.9-eclipse-temurin-17 mvn test
  (repeat for sensors/, backend/processor/, backend/dashboard/)

Current test counts:
  sensors:            57 tests (RandomWalkTest 53, TransitSensorUnitTest 4)
  fog:                50 tests (IngestPayloadTest 9, IntakeQueueTest 5,
                       RuleTest 4, TransitAlertsTest 9,
                       TransitGatewayHttpTest 9, TransitGatewayTest 6,
                       TransitPublisherTest 4, WindowAggregateTest 4)
  backend/processor:  10 tests (RecordMapperTest 5, TransitHandlerTest 5)
  backend/dashboard:  22 tests (DepotRepositoryTest 4, PipelineChecksTest 8,
                       ThresholdsGatewayTest 2, TransitDashboardAppTest 4,
                       TransitDashboardLambdaTest 4)
  Total: 139 tests, all passing.

End-to-end verification against a running stack (after `docker compose ...
up --build`):
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Load test:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32

Or probe the dashboard's REST API directly:
  curl http://localhost:8095/api/health
  curl http://localhost:8095/api/backend-stats
  curl http://localhost:8095/api/depots
  curl "http://localhost:8095/api/readings?sensor_type=engine_temp_c&limit=10"
  curl http://localhost:8095/api/thresholds
