prefix       = "ptf"
project_root = "../projects/16-public-transit-fleet-monitoring"

table_name = "ptf-readings"
queue_name = "ptf-depot-agg"

processor_lambda_name   = "ptf-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.transit.processor.TransitHandler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "ptf-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.transit.dashboard.TransitDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
