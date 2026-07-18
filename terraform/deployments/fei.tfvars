prefix       = "fei"
project_root = "../projects/02-industrial-equipment"

table_name = "fei-readings"
queue_name = "fei-sensor-agg"

processor_lambda_name   = "fei-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.industrial.processor.Handler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "fei-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.industrial.dashboard.EquipmentDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
