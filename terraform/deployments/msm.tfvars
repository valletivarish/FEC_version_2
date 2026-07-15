prefix       = "msm"
project_root = "../projects/19-smart-mining-safety"

table_name = "msm-readings"
queue_name = "msm-shaft-agg"

processor_lambda_name   = "msm-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.mining.processor.SafetyHandler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "msm-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.mining.dashboard.MineDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
