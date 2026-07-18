prefix       = "eef"
project_root = "../projects/18-elevator-escalator-fleet-monitoring"

table_name = "eef-readings"
queue_name = "eef-tower-agg"

processor_lambda_name   = "eef-processor"
processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.handler"
processor_runtime       = "nodejs20.x"

dashboard_lambda_name   = "eef-dashboard-api"
dashboard_build_command = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js server.js router.js awsClients.js readingsStore.js pipelineStatus.js thresholdsProxy.js package.json node_modules"
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambdaHandler.handler"
dashboard_runtime       = "nodejs20.x"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
