Wildfire & Forest Monitoring

PREREQUISITES
--------------
- Docker and Docker Compose (to run the local stack)
- Node.js 20 or later (to install dependencies and run the unit test suites
  in sensors/, fog/, backend/processor/, backend/dashboard/)
- Python 3.12 or later with the boto3 package installed (only needed for
  the scripts in infra/)
- Terraform 1.5 or later and the AWS CLI (only needed for the real AWS
  deployment)

INSTALLATION STEPS
--------------------
1. Clone the repository and change into this project's folder:
     cd projects/10-wildfire-forest-monitoring

2. Install dependencies for each Node.js module (needed to run the unit
   tests outside Docker):
     cd sensors && npm install && cd ..
     cd fog && npm install && cd ..
     cd backend/processor && npm install && cd ../..
     cd backend/dashboard && npm install && cd ../..

3. If you plan to run infra/burst.py or infra/verify_pipeline.py, install
   boto3:
     pip install boto3

CONFIGURATION
---------------
sensors/sensor.js:
  SENSOR_TYPE       no default; must be one of temperature_c, humidity_pct,
                    smoke_density_ppm, wind_speed_kmh, soil_moisture_pct
  SITE_ID           default: station-1
  SAMPLE_INTERVAL   default: 2 (seconds between generated readings)
  DISPATCH_INTERVAL default: 10 (seconds between dispatches to the fog
                    gateway)
  FOG_URL           default: http://fog:8000/ingest

fog/app.js:
  WINDOW_SECONDS    default: 10
  SQS_QUEUE_NAME    default: wfm-station-agg
  AWS_REGION        default: eu-west-1
  AWS_ENDPOINT_URL  no default; only set to point at LocalStack, otherwise
                    the AWS SDK's default credential chain is used

backend/processor/handler.js:
  TABLE_NAME            default: wfm-readings
  AWS_REGION            default: eu-west-1
  AWS_ENDPOINT_URL      no default; only set to point at LocalStack
  AWS_ACCESS_KEY_ID     default: test (only applied when AWS_ENDPOINT_URL
                        is set)
  AWS_SECRET_ACCESS_KEY default: test (only applied when AWS_ENDPOINT_URL
                        is set)

backend/dashboard/server.js, lambdaHandler.js, awsClients.js:
  TABLE_NAME            default: wfm-readings
  SQS_QUEUE_NAME        default: wfm-station-agg
  LAMBDA_FUNCTION_NAME  default: wfm-processor
  FOG_HEALTH_URL        default: http://fog:8000/health
  FOG_THRESHOLDS_URL    default: http://fog:8000/thresholds
  AWS_REGION            default: eu-west-1
  AWS_ENDPOINT_URL      no default; only set to point at LocalStack
  AWS_ACCESS_KEY_ID     default: test (only applied when AWS_ENDPOINT_URL
                        is set)
  AWS_SECRET_ACCESS_KEY default: test (only applied when AWS_ENDPOINT_URL
                        is set)

BUILD INSTRUCTIONS
---------------------
Each Node.js module has no compile step; building means installing its
dependencies:
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

Build the Docker images used by the local stack:
  docker compose -f infra/docker-compose.yml build

Build the two Lambda deployment zip files used by the AWS deployment
(these run automatically as part of terraform/build.sh -- see AWS
Deployment Steps below):
  cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules
  cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js awsClients.js readingsStore.js fireRisk.js pipelineStatus.js thresholdsProxy.js package.json node_modules

RUN INSTRUCTIONS
-------------------
From this project's folder:
  docker compose -f infra/docker-compose.yml up --build

This starts LocalStack, the fog node, a one-shot container that registers
the processor Lambda against LocalStack, the dashboard, and ten sensor
containers (five sensor types across station-1 and station-2).

Exposed ports:
  Dashboard:  http://localhost:8089
  LocalStack: http://localhost:4575

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
Deployment uses the Terraform module at the repo root (terraform/)
with the variable file terraform/deployments/wfm.tfvars.

1. Configure AWS credentials for the target account, then confirm the
   active account:
     aws configure
     aws sts get-caller-identity

2. From the repo root, create and switch to a dedicated Terraform
   workspace for this project so its state does not collide with another
   project's:
     cd terraform
     terraform workspace new wfm
     terraform workspace list

3. Build the Lambda deployment zips and the EC2 source tarball:
     ./build.sh deployments/wfm.tfvars

4. Initialize and apply:
     terraform init
     terraform plan -var-file=deployments/wfm.tfvars
     terraform apply -var-file=deployments/wfm.tfvars

5. Read the dashboard and API URLs from the outputs:
     terraform output

6. When finished, switch back to the default workspace:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script (node --test). All of
the following were run and confirmed passing:
  sensors:           8 tests  - cd sensors && npm install && npm test
  fog:               36 tests - cd fog && npm install && npm test
  backend/processor: 7 tests  - cd backend/processor && npm install && npm test
  backend/dashboard: 44 tests - cd backend/dashboard && npm install && npm test
Total: 95 tests.

Without a local Node.js install, run any module's tests inside a
container, for example:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim bash -c "npm install && npm test"
