// End-to-end local check: poll DynamoDB until every tower signal has a stored window.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localhost:4580";
const REGION = process.env.AWS_REGION || "eu-west-1";
const TABLE = process.env.TABLE_NAME || "ctm-readings";
const TIMEOUT = Number(process.env.VERIFY_TIMEOUT || 90) * 1000;

const SIGNALS = ["dc_load_amps", "battery_charge_pct", "genset_fuel_pct", "cabinet_temp_c", "rf_utilization_pct"];

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function storedSignals() {
  const found = new Set();
  for (const signal of SIGNALS) {
    const res = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "sensor_type = :s",
      ExpressionAttributeValues: { ":s": signal },
      Limit: 1,
    }));
    if (res.Items && res.Items.length > 0) found.add(signal);
  }
  return found;
}

async function main() {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const found = await storedSignals();
    console.log("stored signals:", [...found].sort().join(", ") || "(none)");
    if (found.size === SIGNALS.length) {
      console.log("PASS: every signal reached DynamoDB");
      return;
    }
    await sleep(3000);
  }
  console.error("FAIL: not all signals stored within the timeout");
  process.exit(1);
}

main();
