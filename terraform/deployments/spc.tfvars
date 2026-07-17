prefix       = "spc"
project_root = "../projects/20-smart-port-container-terminal"

table_name = "spc-readings"
queue_name = "spc-berth-agg"

processor_lambda_name   = "spc-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.port.processor.TerminalHandler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "spc-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.port.dashboard.TerminalDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
