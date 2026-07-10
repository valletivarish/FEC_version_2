#!/bin/bash
set -e

# Deploys Nithin's individually-required backend architecture: the dce-api
# Lambda function plus a real API Gateway REST API in front of it (a single
# {proxy+} resource with an ANY AWS_PROXY integration, deployed to a
# stage). This replaces the directly-running dashboard REST API every
# other Node sibling in this portfolio uses -- see readme.txt's REUSE
# section for the full architectural writeup.

ENDPOINT="${AWS_ENDPOINT_URL:-http://localstack:4566}"
FUNCTION_NAME="${API_FUNCTION_NAME:-dce-api}"
API_NAME="${API_GATEWAY_NAME:-dce-api-gateway}"
STAGE_NAME="${API_STAGE_NAME:-local}"
TABLE_NAME="${TABLE_NAME:-dce-readings}"
QUEUE_NAME="${SQS_QUEUE_NAME:-dce-hall-agg}"
PROCESSOR_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-dce-processor}"
FOG_HEALTH_URL="${FOG_HEALTH_URL:-http://fog:8000/health}"
FOG_THRESHOLDS_URL="${FOG_THRESHOLDS_URL:-http://fog:8000/thresholds}"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION="${AWS_REGION:-eu-west-1}"

echo "waiting for table $TABLE_NAME..."
for i in $(seq 1 60); do
  aws --endpoint-url "$ENDPOINT" dynamodb describe-table --table-name "$TABLE_NAME" >/dev/null 2>&1 && break
  sleep 3
done

# --- Lambda function ---
if aws --endpoint-url "$ENDPOINT" lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "updating existing function code"
  aws --endpoint-url "$ENDPOINT" lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file fileb://function.zip >/dev/null
else
  echo "creating function $FUNCTION_NAME"
  aws --endpoint-url "$ENDPOINT" lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --handler handler.handler \
    --zip-file fileb://function.zip \
    --timeout 30 \
    --memory-size 512 \
    --environment "Variables={TABLE_NAME=$TABLE_NAME,SQS_QUEUE_NAME=$QUEUE_NAME,LAMBDA_FUNCTION_NAME=$PROCESSOR_FUNCTION_NAME,FOG_HEALTH_URL=$FOG_HEALTH_URL,FOG_THRESHOLDS_URL=$FOG_THRESHOLDS_URL,AWS_ENDPOINT_URL=$ENDPOINT,AWS_REGION=$AWS_DEFAULT_REGION}" >/dev/null
fi

echo "waiting for lambda to become active..."
STATE=""
for i in $(seq 1 60); do
  STATE=$(aws --endpoint-url "$ENDPOINT" lambda get-function --function-name "$FUNCTION_NAME" --query "Configuration.State" --output text 2>/dev/null || true)
  [ "$STATE" = "Active" ] && break
  sleep 3
done
if [ "$STATE" != "Active" ]; then
  echo "lambda $FUNCTION_NAME never became active"
  exit 1
fi

# --- API Gateway REST API, {proxy+} resource, AWS_PROXY integration ---
API_ID=$(aws --endpoint-url "$ENDPOINT" apigateway get-rest-apis --query "items[?name=='$API_NAME'].id | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  echo "creating REST API $API_NAME"
  API_ID=$(aws --endpoint-url "$ENDPOINT" apigateway create-rest-api --name "$API_NAME" --query "id" --output text)
fi
echo "REST API id: $API_ID"

ROOT_ID=$(aws --endpoint-url "$ENDPOINT" apigateway get-resources --rest-api-id "$API_ID" --query "items[?path=='/'].id | [0]" --output text)

PROXY_ID=$(aws --endpoint-url "$ENDPOINT" apigateway get-resources --rest-api-id "$API_ID" --query "items[?pathPart=='{proxy+}'].id | [0]" --output text)
if [ -z "$PROXY_ID" ] || [ "$PROXY_ID" = "None" ]; then
  echo "creating {proxy+} resource under root"
  PROXY_ID=$(aws --endpoint-url "$ENDPOINT" apigateway create-resource --rest-api-id "$API_ID" --parent-id "$ROOT_ID" --path-part "{proxy+}" --query "id" --output text)
fi

LAMBDA_ARN="arn:aws:lambda:${AWS_DEFAULT_REGION}:000000000000:function:${FUNCTION_NAME}"
INTEGRATION_URI="arn:aws:apigateway:${AWS_DEFAULT_REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations"

# ANY method + AWS_PROXY integration on both root ("/") and the {proxy+}
# resource, so the dashboard's reverse proxy can hit either "/" itself or
# any "/api/*" sub-path and always land on this one Lambda.
for RESOURCE_ID in "$ROOT_ID" "$PROXY_ID"; do
  aws --endpoint-url "$ENDPOINT" apigateway put-method \
    --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
    --http-method ANY --authorization-type NONE >/dev/null 2>&1 || true

  aws --endpoint-url "$ENDPOINT" apigateway put-integration \
    --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
    --http-method ANY --type AWS_PROXY --integration-http-method POST \
    --uri "$INTEGRATION_URI" >/dev/null
done

aws --endpoint-url "$ENDPOINT" lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${AWS_DEFAULT_REGION}:000000000000:${API_ID}/*/*" >/dev/null 2>&1 || echo "invoke permission already exists, continuing"

aws --endpoint-url "$ENDPOINT" apigateway create-deployment \
  --rest-api-id "$API_ID" --stage-name "$STAGE_NAME" >/dev/null

echo "API Gateway $API_NAME ($API_ID) deployed to stage $STAGE_NAME, proxying ANY /{proxy+} to Lambda $FUNCTION_NAME"
echo "invoke URL (path-style, LocalStack): ${ENDPOINT}/restapis/${API_ID}/${STAGE_NAME}/_user_request_"
