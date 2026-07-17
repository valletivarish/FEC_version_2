Water Treatment Utility

All commands below assume your working directory is this folder
(projects/11-water-treatment-utility/), not the repo root, unless stated
otherwise.

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - Node.js 20.x (only needed to run the unit tests, or build/run any module,
    outside Docker)
  - Python 3.12+ with the boto3 package installed (only needed for
    infra/verify_pipeline.py and infra/burst.py)
  - AWS CLI (only needed for the AWS Deployment Steps below)
  - Terraform (only needed for the AWS Deployment Steps below, via the
    terraform/ module at the repo root)

INSTALLATION STEPS
--------------------
  1. Clone the repository and cd into projects/11-water-treatment-utility.
  2. Install local Node.js dependencies for each module:
       cd sensors && npm install
       cd ../fog && npm install
       cd ../backend/processor && npm install
       cd ../backend/dashboard && npm install
  3. (Optional, only for the scripts in infra/) install the Python
     dependency:
       pip install boto3

CONFIGURATION
---------------
Real environment variables read by the code, what each configures, and its
real default:

  SENSOR_TYPE            (sensors) metric a sensor container generates; one
                         of turbidity_ntu, ph_level, chlorine_ppm,
                         flow_rate_lps, pressure_bar. No default -- must be
                         set.
  SITE_ID                (sensors) plant identifier tagged onto readings.
                         Default: plant-1
  SAMPLE_INTERVAL        (sensors) seconds between generated readings.
                         Default: 2
  DISPATCH_INTERVAL      (sensors) seconds the drain loop waits once the
                         outbox has items before sending the next batch.
                         Default: 10
  FOG_URL                (sensors) URL a sensor POSTs readings to.
                         Default: http://fog:8000/ingest
  WINDOW_SECONDS         (fog) seconds between window flush/aggregate cycles.
                         Default: 10
  SQS_QUEUE_NAME         (fog, dashboard) SQS queue name aggregated window
                         messages are published to / read from.
                         Default: wtu-plant-agg
  TABLE_NAME             (backend/processor, backend/dashboard) DynamoDB
                         table name reading records are written to / read
                         from. Default: wtu-readings
  LAMBDA_FUNCTION_NAME   (backend/dashboard) name of the processor Lambda
                         function whose active state the dashboard checks.
                         Default: wtu-processor
  AWS_REGION             (fog, backend/processor, backend/dashboard) AWS
                         region used by every AWS SDK client.
                         Default: eu-west-1
  AWS_ENDPOINT_URL       (fog, backend/processor, backend/dashboard) endpoint
                         override for AWS SDK clients. Unset by default,
                         which leaves the SDK's own default credential chain
                         in place; when set (e.g. to http://localstack:4566),
                         SQS/DynamoDB/Lambda clients target that endpoint and
                         also switch to a static access key/secret pair.
  AWS_ACCESS_KEY_ID      (backend/processor, backend/dashboard) static
                         access key used only when AWS_ENDPOINT_URL is set.
                         Default: test
  AWS_SECRET_ACCESS_KEY  (backend/processor, backend/dashboard) static
                         secret key used only when AWS_ENDPOINT_URL is set.
                         Default: test
  FOG_HEALTH_URL         (backend/dashboard) URL polled for fog gateway
                         health. Default: http://fog:8000/health
  FOG_THRESHOLDS_URL     (backend/dashboard) URL proxied for the fog
                         gateway's threshold rules.
                         Default: http://fog:8000/thresholds

BUILD INSTRUCTIONS
---------------------
Each module is plain Node.js with its own package.json; "build" is npm
install plus, for the two Lambda-bound backend modules, zipping the runtime
files:

  sensors:              cd sensors && npm install
  fog:                  cd fog && npm install
  backend/processor:    cd backend/processor && npm install
                        (Lambda zip, matching backend/processor/Dockerfile):
                        npm install --omit=dev --no-audit --no-fund &&
                        zip -qr function.zip handler.js transform.js node_modules
  backend/dashboard:    cd backend/dashboard && npm install

Docker images (matching each module's own Dockerfile):
  docker build -t wtu-sensor    ./sensors
  docker build -t wtu-fog       ./fog
  docker build -t wtu-processor ./backend/processor
  docker build -t wtu-dashboard ./backend/dashboard

RUN INSTRUCTIONS
------------------
Bring up the full local stack (LocalStack, fog gateway, one-shot processor
Lambda deploy, dashboard, and 10 sensor containers):

  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:  http://localhost:8090  (container listens on 8000, published
              on host port 8090)
  LocalStack: http://localhost:4576  (container listens on 4566, published
              on host port 4576)

Stop and remove volumes:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
-----------------------
This project deploys via the Terraform module in the repo root's terraform/
directory, using terraform/deployments/wtu.tfvars.

  1. Obtain AWS credentials for the target account and run
     `aws configure` (or export the access key / secret key / session token
     directly), then confirm you're in the intended account:
       aws sts get-caller-identity

  2. From the terraform/ directory, create and switch to a dedicated
     workspace for this project before ever applying:
       cd terraform
       terraform workspace new wtu
       terraform workspace list

  3. Build the Lambda deployment artifacts and the sensors/fog/infra source
     tarball:
       ./build.sh deployments/wtu.tfvars

  4. Review the plan and confirm it only adds resources (0 to destroy)
     before applying:
       terraform plan -var-file=deployments/wtu.tfvars

  5. Apply:
       terraform apply -var-file=deployments/wtu.tfvars

  6. After the apply completes, switch back to the default workspace:
       terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script (Node's built-in
node --test runner). All commands below were run directly and confirmed
passing (exit 0) against the current code:

  cd sensors && npm test               -- 11 tests
  cd fog && npm test                   -- 51 tests
  cd backend/processor && npm test     -- 10 tests
  cd backend/dashboard && npm test     -- 43 tests

Total: 115 tests passing across all four modules.

Without a local Node.js install, any module's tests can be run in a
container, for example:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

With the local stack running (docker compose -f infra/docker-compose.yml up),
two additional Python scripts exercise the pipeline end-to-end against real
SQS/DynamoDB calls:

  End-to-end pipeline check:
    AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

  Burst load test (default 2000 messages across 32 worker threads):
    AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/burst.py --messages 2000 --workers 32
