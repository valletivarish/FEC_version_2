prefix       = "ecn"
project_root = "../projects/13-ev-charging-network"

table_name = "ecn-readings"
queue_name = "ecn-hub-agg"

processor_lambda_name   = "ecn-processor"
processor_build_command = "cd backend/processor && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp handler.py transform.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.lambda_handler"
processor_runtime       = "python3.12"

dashboard_lambda_name   = "ecn-dashboard-api"
dashboard_build_command = "cd backend/dashboard && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp lambda_handler.py app.py data_access.py thresholds_proxy.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambda_handler.lambda_handler"
dashboard_runtime       = "python3.12"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
