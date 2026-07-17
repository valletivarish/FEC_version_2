Beehive Apiary Monitoring

PREREQUISITES
-------------
  - Docker and Docker Compose (Compose V2, i.e. the "docker compose" subcommand --
    infra/docker-compose.yml uses a top-level "name:" key that requires it)
  - Node.js 20+ (to run the unit tests locally; every module's Dockerfile is based
    on node:20-slim and uses the built-in node:test runner)
  - Python 3 with the boto3 package (only needed for infra/verify_pipeline.py and
    infra/burst.py)
  - AWS CLI v2 and Terraform (only needed for the AWS deployment steps)

INSTALLATION STEPS
-------------------
1. Clone the repository and change into the project folder:
     cd projects/26-beehive-apiary-monitoring
   All commands below assume this folder is your working directory.
2. Install local dependencies for each Node module (only required to run tests
   locally; docker compose builds its own images):
     cd sensors && npm install && cd ..
     cd fog && npm install && cd ..
     cd backend/processor && npm install && cd ../..
     cd backend/dashboard && npm install && cd ../..
3. Install Python dependencies for the ops scripts:
     pip install boto3

CONFIGURATION
-------------
Environment variables read by the application code:

  sensors/sensor.js:
    SENSOR_TYPE         sensor metric name, no default -- must be set to one of
                        hive_weight_kg, internal_hive_temp_c, internal_humidity_pct,
                        acoustic_buzz_frequency_hz, entrance_traffic_count
    SITE_ID             apiary identifier, default "apiary-a"
    SAMPLE_INTERVAL     seconds between generated readings, default "2"
    DISPATCH_INTERVAL   seconds between dispatches to the fog gateway, default "10"
    FOG_URL             fog ingest endpoint, default "http://fog:8000/ingest"

  fog/app.js:
    WINDOW_SECONDS      aggregation window length in seconds, default "10"
    SQS_QUEUE_NAME      SQS queue the fog node publishes aggregates to, default "bam-apiary-agg"
    AWS_ENDPOINT_URL    AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_REGION          AWS region, default "eu-west-1"

  backend/processor/handler.js:
    TABLE_NAME             DynamoDB table readings are written to, default "bam-readings"
    AWS_REGION             AWS region, default "eu-west-1"
    AWS_ENDPOINT_URL       AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_ACCESS_KEY_ID      static access key, default "test" (only used when AWS_ENDPOINT_URL is set)
    AWS_SECRET_ACCESS_KEY  static secret key, default "test" (only used when AWS_ENDPOINT_URL is set)

  backend/processor/deploy_lambda.sh:
    AWS_ENDPOINT_URL       Lambda/SQS endpoint, default "http://localstack:4566"
    SQS_QUEUE_NAME         queue to wire the Lambda's event source mapping to, default "bam-apiary-agg"
    LAMBDA_FUNCTION_NAME   Lambda function name to create/update, default "bam-processor"
    TABLE_NAME             DynamoDB table name passed to the Lambda's environment, default "bam-readings"
    AWS_REGION             region, default "eu-west-1"

  backend/dashboard/server.js:
    TABLE_NAME             DynamoDB table the dashboard reads from, default "bam-readings"
    SQS_QUEUE_NAME         SQS queue the dashboard reports health/depth for, default "bam-apiary-agg"
    LAMBDA_FUNCTION_NAME   Lambda function the dashboard checks the state of, default "bam-processor"
    FOG_HEALTH_URL         fog node health endpoint, default "http://fog:8000/health"
    FOG_THRESHOLDS_URL     fog node thresholds endpoint, default "http://fog:8000/thresholds"

  backend/dashboard/awsClients.js:
    AWS_REGION             region, default "eu-west-1"
    AWS_ENDPOINT_URL       AWS endpoint override (set for LocalStack, unset for real AWS)
    AWS_ACCESS_KEY_ID      static access key, default "test" (only used when AWS_ENDPOINT_URL is set)
    AWS_SECRET_ACCESS_KEY  static secret key, default "test" (only used when AWS_ENDPOINT_URL is set)

  infra/verify_pipeline.py:
    AWS_ENDPOINT_URL       DynamoDB endpoint, default "http://localhost:4591"
    AWS_REGION             region, default "eu-west-1"
    TABLE_NAME             DynamoDB table to poll, default "bam-readings"
    VERIFY_TIMEOUT          seconds to wait for all sensor types to appear, default "90"

  infra/burst.py:
    AWS_ENDPOINT_URL       SQS endpoint, default "http://localhost:4591"
    AWS_REGION             region, default "eu-west-1"
    SQS_QUEUE_NAME          queue to send load-test messages to, default "bam-apiary-agg"

BUILD INSTRUCTIONS
-------------------
Each Node module is installed independently (no shared build step):
  cd sensors && npm install
  cd fog && npm install
  cd backend/processor && npm install
  cd backend/dashboard && npm install

Docker images are built as part of "docker compose ... up --build" (see RUN
INSTRUCTIONS). To build an individual image directly:
  docker build -t bam-sensor ./sensors
  docker build -t bam-fog ./fog
  docker build -t bam-processor ./backend/processor
  docker build -t bam-dashboard ./backend/dashboard

For a processor Lambda deployment zip built outside Docker (matching the build
stage in backend/processor/Dockerfile):
  cd backend/processor && npm ci --omit=dev && rm -f function.zip && \
    zip -qr function.zip handler.js transform.js node_modules

RUN INSTRUCTIONS
-----------------
Bring up the full local stack (LocalStack, fog node, one-shot Lambda deployer,
dashboard, and 10 sensor containers):
  docker compose -f infra/docker-compose.yml up --build

Exposed ports:
  Dashboard:   http://localhost:8105
  LocalStack:  http://localhost:4591

Stop and remove the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
----------------------
This project deploys via the Terraform module in terraform/. The resource
naming prefix is "bam" (used in infra/docker-compose.yml and the backend
code -- bam-readings, bam-apiary-agg, bam-processor).

1. Configure AWS credentials for the target account:
     aws configure
   (or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN for
   temporary credentials)
2. Confirm you are targeting the correct account:
     aws sts get-caller-identity
3. Create terraform/deployments/bam.tfvars defining the variables.
   The file needs:
     prefix
     project_root
     table_name
     queue_name
     processor_lambda_name, processor_build_command, processor_zip_path,
       processor_handler, processor_runtime
     dashboard_lambda_name, dashboard_build_command, dashboard_zip_path,
       dashboard_handler, dashboard_runtime
     frontend_local_dir, api_base_placeholder, api_base_search_files
   The Terraform module's ec2_compose_file variable defaults to
   "docker-compose.aws.yml" under infra/, which does not currently exist in
   the infra/ directory -- either add that file (fog node and
   sensor containers only, no LocalStack) or set ec2_compose_file in the
   tfvars to point at a compose file that does exist.
4. From the terraform/ directory, create and switch to a dedicated workspace
   before ever applying:
     terraform workspace new bam
     terraform workspace list
5. Build the Lambda deployment artifacts and the sensors/fog/infra source
   tarball:
     ./build.sh deployments/bam.tfvars
6. Review the plan, then apply:
     terraform plan -var-file=deployments/bam.tfvars
     terraform apply -var-file=deployments/bam.tfvars
7. After the apply completes, switch back to the default workspace:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script, run with Node's
built-in test runner (node --test):
  cd sensors && npm install && npm test               (14 tests)
  cd fog && npm install && npm test                    (64 tests)
  cd backend/processor && npm install && npm test      (12 tests)
  cd backend/dashboard && npm install && npm test      (43 tests)

Total: 133 tests, all passing (verified by running each suite directly).

Without a local Node.js install, run any module's tests in a container, for
example:
  docker run --rm -v "$PWD":/app -w /app/fog node:20-slim \
    bash -c "npm install && npm test"

End-to-end pipeline check against a running stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test python infra/verify_pipeline.py

Load test against a running stack:
  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
    python infra/burst.py --messages 2000 --workers 32
