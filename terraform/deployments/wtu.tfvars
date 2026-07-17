prefix       = "wtu"
project_root = "../projects/11-water-treatment-utility"

table_name = "wtu-readings"
queue_name = "wtu-plant-agg"

processor_lambda_name   = "wtu-processor"
processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.handler"
processor_runtime       = "nodejs20.x"

dashboard_lambda_name   = "wtu-dashboard-api"
dashboard_build_command = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js awsClients.js readingsStore.js pipelineStatus.js thresholdsProxy.js package.json node_modules"
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambdaHandler.handler"
dashboard_runtime       = "nodejs20.x"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
