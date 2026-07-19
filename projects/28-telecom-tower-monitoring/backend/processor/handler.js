import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { toItem } from "./mapper.js";

const REGION = process.env.AWS_REGION || "eu-west-1";
const ENDPOINT = process.env.AWS_ENDPOINT_URL || undefined;
const TABLE = process.env.TABLE_NAME || "ctm-readings";

function makeDoc() {
  const cfg = { region: REGION };
  if (ENDPOINT) {
    cfg.endpoint = ENDPOINT;
    cfg.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(cfg));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let doc = null;

async function persist(items, client) {
  const target = client || (doc ??= makeDoc());
  let written = 0;
  for (const group of chunk(items, 25)) {
    let requests = group.map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; attempt < 4 && requests.length > 0; attempt += 1) {
      const res = await target.send(new BatchWriteCommand({ RequestItems: { [TABLE]: requests } }));
      written += requests.length;
      const unprocessed = res.UnprocessedItems && res.UnprocessedItems[TABLE];
      requests = unprocessed || [];
      written -= requests.length;
    }
    if (requests.length > 0) throw new Error(`${requests.length} items unprocessed after retries`);
  }
  return written;
}

const handler = async (event, _context, client) => {
  const records = event.Records || [];
  const items = records.map((r) => toItem(JSON.parse(r.body)));
  const written = await persist(items, client);
  return { batchItemFailures: [], written };
};

export { handler, persist, chunk };
