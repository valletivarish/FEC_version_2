prefix       = "ctm"
project_root = "../projects/28-telecom-tower-monitoring"

# Pin the fog host to a t3.small-capable AZ (some default subnets land in us-east-1e, which lacks t3.small).
fog_availability_zone = "us-east-1a"

table_name = "ctm-readings"
queue_name = "ctm-tower-agg"

processor_lambda_name   = "ctm-processor"
processor_build_command = "cd backend/processor && npm install --omit=dev --no-audit --no-fund --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js mapper.js package.json node_modules"
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.handler"
processor_runtime       = "nodejs20.x"

dashboard_lambda_name   = "ctm-dashboard-api"
dashboard_build_command = "cd backend/dashboard && npm install --omit=dev --no-audit --no-fund --silent && rm -f lambda.zip && zip -qr lambda.zip lambda.js app.js service.js powerstate.js package.json node_modules static"
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambda.handler"
dashboard_runtime       = "nodejs20.x"

frontend_bucket_name  = "cell-site-power-monitor"
frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
