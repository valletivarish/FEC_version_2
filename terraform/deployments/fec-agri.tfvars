prefix       = "fec-agri"
project_root = "../projects/01-smart-agriculture"

# Pin the fog host to a t3.small-capable AZ (some default subnets land in us-east-1e, which lacks t3.small).
fog_availability_zone = "us-east-1a"

table_name = "fec-agri-readings"
queue_name = "fec-agri-agg"

processor_lambda_name   = "fec-agri-processor"
processor_build_command = "cd backend/processor && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp handler.py process.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.lambda_handler"
processor_runtime       = "python3.12"

dashboard_lambda_name   = "fec-agri-dashboard-api"
dashboard_build_command = "cd backend/dashboard && rm -rf build lambda.zip && pip install -r requirements.txt -t build --platform manylinux2014_x86_64 --python-version 3.12 --only-binary=:all: --quiet && cp -r app.py lambda_handler.py static build/ && cd build && zip -qr ../lambda.zip . && cd .."
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambda_handler.handler"
dashboard_runtime       = "python3.12"

frontend_bucket_name  = "smart-agriculture-field-monitor"
frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["runtime-config.js"]
