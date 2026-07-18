prefix       = "fsc"
project_root = "../projects/04-smart-city"

table_name = "fsc-readings"
queue_name = "fsc-metrics-agg"

processor_lambda_name   = "fsc-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.smartcity.processor.Handler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "fsc-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.smartcity.dashboard.CityDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
