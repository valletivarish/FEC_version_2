prefix       = "rfw"
project_root = "../projects/27-river-flood-monitoring"

# Pin the fog host to a t3.small-capable AZ; the first default subnet can land in us-east-1e, which lacks t3.small.
fog_availability_zone = "us-east-1a"

table_name = "rfw-readings"
queue_name = "rfw-catchment-agg"

processor_lambda_name   = "rfw-processor"
processor_build_command = "cd backend/processor && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp handler.py transform.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.lambda_handler"
processor_runtime       = "python3.12"

dashboard_lambda_name   = "rfw-dashboard-api"
dashboard_build_command = "cd backend/dashboard && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp lambda_handler.py views.py data_access.py stage_view.py thresholds_proxy.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambda_handler.lambda_handler"
dashboard_runtime       = "python3.12"

frontend_bucket_name  = "river-flood-early-warning"
frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
