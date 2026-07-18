prefix       = "fcl"
project_root = "../projects/05-cold-chain-logistics"

table_name = "fcl-readings"
queue_name = "fcl-manifest-agg"

processor_lambda_name   = "fcl-processor"
processor_build_command = "cd backend/processor && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp handler.py reshape.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.lambda_handler"
processor_runtime       = "python3.12"

dashboard_lambda_name   = "fcl-dashboard-api"
dashboard_build_command = "cd backend/dashboard && rm -rf build lambda.zip && pip install -r requirements.txt -t build --quiet && cp lambda_handler.py app.py health.py routes.py build/ && cd build && zip -qr ../lambda.zip . && cd .."
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambda_handler.lambda_handler"
dashboard_runtime       = "python3.12"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
