prefix       = "rfi"
project_root = "../projects/08-retail-footfall-inventory"

# Pin the fog host to a t3.small-capable AZ (this account's first default subnet may land in us-east-1e, which lacks t3.small).
fog_availability_zone = "us-east-1a"

table_name = "rfi-readings"
queue_name = "rfi-store-agg"

processor_lambda_name   = "rfi-processor"
processor_build_command = "cd backend/processor && mvn package -DskipTests -q"
processor_zip_path      = "backend/processor/target/processor.jar"
processor_handler       = "com.fec.retail.processor.StoreHandler::handleRequest"
processor_runtime       = "java17"

dashboard_lambda_name   = "rfi-dashboard-api"
dashboard_build_command = "cd backend/dashboard && mvn package -DskipTests -q"
dashboard_zip_path      = "backend/dashboard/target/dashboard.jar"
dashboard_handler       = "com.fec.retail.dashboard.StoreDashboardLambda::handleRequest"
dashboard_runtime       = "java17"

# Domain-branded public dashboard bucket instead of the default rfi-frontend-<account> name.
frontend_bucket_name  = "retail-footfall-inventory-monitor"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
