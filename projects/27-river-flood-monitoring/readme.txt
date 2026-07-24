River Flood Early-Warning Monitoring

1. PREREQUISITES
------------------
  - Docker and the Docker Compose v2 plugin
  - Python 3.12 (only to run the test suite or ops scripts outside Docker)
  - pip
  - AWS CLI and Terraform (only for the AWS Deployment Steps section)

2. INSTALLATION STEPS
-----------------------
  1. Clone the repository and change into this project's folder:
       cd projects/27-river-flood-monitoring
  2. (optional) create a virtual environment and install the dev/test deps:
       python3 -m venv .venv && source .venv/bin/activate
       pip install -r requirements-dev.txt

3. CONFIGURATION
------------------
Environment variables read by each component (default shown):

  sensors/sensor.py:
    SENSOR_TYPE        required; one of river_level_m, rainfall_mmph,
                       flow_velocity_ms, soil_moisture_pct, turbidity_ntu
    SITE_ID            river reach, default "reach-a"
    SAMPLE_INTERVAL    seconds between samples, default "2"
    DISPATCH_INTERVAL  seconds between dispatches, default "10"
    FOG_URL            default "http://fog:8000/ingest"

  fog/gateway.py:
    WINDOW_SECONDS     aggregation window length, default "10"
    SQS_QUEUE_NAME     default "rfw-catchment-agg"
    AWS_ENDPOINT_URL   leave unset so the code uses the real AWS services
    AWS_REGION         set to us-east-1 for the deployment

  backend/processor/handler.py:
    TABLE_NAME         default "rfw-readings"
    AWS_ENDPOINT_URL, AWS_REGION   as above

  backend/dashboard/server.py and data_access.py:
    TABLE_NAME, SQS_QUEUE_NAME, LAMBDA_FUNCTION_NAME
    FOG_HEALTH_URL     default "http://fog:8000/health"
    FOG_THRESHOLDS_URL default "http://fog:8000/thresholds"
    PORT               default "8000"
    AWS_ENDPOINT_URL, AWS_REGION   as above

4. BUILD INSTRUCTIONS
-----------------------
The deployable artifacts are produced by build.sh (see AWS Deployment Steps).
For the target tfvars it installs each Lambda's dependencies and zips the two
functions (backend/processor and backend/dashboard, python:3.12), and tars the
fog gateway and sensor sources for the EC2 host. Each service is a python:3.12
Docker image built on the EC2 host from infra/docker-compose.aws.yml.

  ./build.sh deployments/rfw.tfvars

5. RUN INSTRUCTIONS
---------------------
The system runs on AWS. After deploying it (Section 6), Terraform prints two
URLs:
  dashboard_url  the web dashboard (open it in a browser)
  api_url        the JSON API, e.g. api_url + /api/health and
                 api_url + /api/readings?sensor_type=river_level_m

The dashboard, its API and the web page are serverless (S3 + API Gateway +
Lambda + DynamoDB) and stay available on their own; live sensor readings flow
while the EC2 fog host is running.

6. AWS DEPLOYMENT STEPS
-------------------------
Deploy through the Terraform module in terraform/ at the repository root,
driven by terraform/deployments/rfw.tfvars (which defines the DynamoDB table,
the SQS queue, both python3.12 Lambdas and their build commands, and the
frontend upload settings). The dashboard's API Gateway entry point is
backend/dashboard/lambda_handler.py, which dispatches to the same view
functions the aiohttp server uses.

On AWS the EC2 host runs infra/docker-compose.aws.yml (not the local
docker-compose.yml): only the fog gateway and the 10 sensor containers, which
publish to the real SQS queue through the instance role -- no processor or
dashboard containers, because those run as the Terraform-provisioned Lambdas
against the real SQS and DynamoDB services. build.sh packages this file into the
EC2 tarball automatically, so no extra step is needed.

  1. Configure AWS credentials for the target account:
       aws configure
     (region must be us-east-1).
  2. Confirm the account:
       aws sts get-caller-identity
  3. cd terraform
  4. Create and switch to a dedicated workspace:
       terraform workspace new rfw
       terraform workspace list
  5. Build the Lambda packages and the EC2 tarball:
       ./build.sh deployments/rfw.tfvars
  6. Review the plan (confirm "0 to destroy"):
       terraform plan -var-file=deployments/rfw.tfvars
  7. Apply:
       terraform apply -var-file=deployments/rfw.tfvars
  8. Switch back to the default workspace:
       terraform workspace select default

7. TESTING INSTRUCTIONS
-------------------------
  pip install -r requirements-dev.txt
  pytest

60 tests pass across the sensor gauge, the fog gateway (validation, drain,
live HTTP ingest), window aggregation, the flood-stage logic, the batched
processor, the read-time reach status, the shared view functions, and the
Lambda entry point. They run against in-memory fakes, so no cloud connection is
needed, and they run in GitHub Actions on every push.
