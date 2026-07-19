import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";
import { siteState } from "./powerstate.js";

const REGION = process.env.AWS_REGION || "eu-west-1";
const ENDPOINT = process.env.AWS_ENDPOINT_URL || undefined;
const TABLE = process.env.TABLE_NAME || "ctm-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "ctm-tower-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "ctm-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";
const HISTORY = Number(process.env.HISTORY_WINDOWS || 15);

const SITES = ["site-north", "site-south"];
const SIGNALS = ["dc_load_amps", "battery_charge_pct", "genset_fuel_pct", "cabinet_temp_c", "rf_utilization_pct"];

function makeClients() {
  const cfg = { region: REGION };
  if (ENDPOINT) {
    cfg.endpoint = ENDPOINT;
    cfg.credentials = { accessKeyId: "test", secretAccessKey: "test" };
  }
  const raw = new DynamoDBClient(cfg);
  return {
    raw,
    doc: DynamoDBDocumentClient.from(raw),
    sqs: new SQSClient(cfg),
    lambda: new LambdaClient(cfg),
  };
}

// --- pure assembly (no AWS) --------------------------------------------------

function summariseSignal(items) {
  if (!items || items.length === 0) return null;
  const newest = items[0];
  const series = [...items].reverse().map((it) => Number(it.mean));
  return {
    unit: newest.unit,
    last: Number(newest.last),
    min: Number(newest.min),
    max: Number(newest.max),
    mean: Number(newest.mean),
    series,
    window_end: newest.window_end,
    alerts: Array.isArray(newest.alerts) ? newest.alerts : [],
  };
}

function assembleSite(site, perSignal) {
  const signals = {};
  const alerts = [];
  let freshest = null;
  for (const signal of SIGNALS) {
    const summary = perSignal[signal];
    if (!summary) continue;
    signals[signal] = summary;
    for (const key of summary.alerts) alerts.push({ signal, key });
    if (!freshest || summary.window_end > freshest) freshest = summary.window_end;
  }
  const state = siteState(signals);
  return { site_id: site, ...state, active_alerts: alerts, updated: freshest, signals };
}

function rollup(sites) {
  const onBattery = sites.filter((s) => s.source === "on_battery").length;
  const degraded = sites.filter((s) => s.source === "degraded").length;
  const autonomies = sites.map((s) => s.autonomy_minutes).filter((n) => Number.isFinite(n));
  return {
    sites: sites.length,
    on_battery: onBattery,
    on_genset: sites.filter((s) => s.source === "on_genset").length,
    degraded,
    worst_autonomy_minutes: autonomies.length ? Math.min(...autonomies) : null,
    alerting: sites.filter((s) => s.active_alerts.length > 0).length,
  };
}

// --- AWS-backed reads --------------------------------------------------------

async function signalWindows(clients, signal, site, limit = HISTORY) {
  const res = await clients.doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "sensor_type = :s AND begins_with(sort_key, :p)",
    ExpressionAttributeValues: { ":s": signal, ":p": `${site}#` },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return res.Items || [];
}

async function siteView(clients, site) {
  const perSignal = {};
  await Promise.all(SIGNALS.map(async (signal) => {
    perSignal[signal] = summariseSignal(await signalWindows(clients, signal, site));
  }));
  return assembleSite(site, perSignal);
}

async function network(clients) {
  const sites = await Promise.all(SITES.map((site) => siteView(clients, site)));
  return { generated: new Date().toISOString(), rollup: rollup(sites), sites };
}

async function readings(clients, site, signal) {
  const wantSites = site ? [site] : SITES;
  const wantSignals = signal ? [signal] : SIGNALS;
  const out = [];
  for (const s of wantSites) {
    for (const sig of wantSignals) {
      const items = await signalWindows(clients, sig, s);
      out.push({ site_id: s, sensor_type: sig, windows: [...items].reverse() });
    }
  }
  return out;
}

async function queueReachable(clients) {
  try {
    await clients.sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
    return true;
  } catch {
    return false;
  }
}

async function queueDepth(clients) {
  const url = (await clients.sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }))).QueueUrl;
  const attrs = (await clients.sqs.send(new GetQueueAttributesCommand({
    QueueUrl: url,
    AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
  }))).Attributes || {};
  return Number(attrs.ApproximateNumberOfMessages || 0) + Number(attrs.ApproximateNumberOfMessagesNotVisible || 0);
}

async function lambdaActive(clients) {
  try {
    const res = await clients.lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    return res.Configuration.State === "Active";
  } catch {
    return false;
  }
}

async function storedWindows(clients) {
  try {
    const res = await clients.raw.send(new DescribeTableCommand({ TableName: TABLE }));
    return res.Table.ItemCount ?? 0;
  } catch {
    return 0;
  }
}

async function freshestAgeSeconds(clients) {
  let newest = null;
  await Promise.all(SITES.map(async (site) => {
    const items = await signalWindows(clients, "dc_load_amps", site, 1);
    if (items[0] && (!newest || items[0].window_end > newest)) newest = items[0].window_end;
  }));
  if (!newest) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(newest)) / 1000));
}

async function gatewayReachable() {
  try {
    const res = await fetch(FOG_HEALTH_URL, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function health(clients) {
  const [gateway, queue, lambda] = await Promise.all([
    gatewayReachable(),
    queueReachable(clients),
    lambdaActive(clients),
  ]);
  const up = (b) => (b ? "up" : "down");
  return {
    gateway: up(gateway),
    queue: up(queue),
    lambda: up(lambda),
    pipeline: up(gateway && queue && lambda),
  };
}

async function backendStats(clients) {
  const [depth, active, stored, age] = await Promise.all([
    queueDepth(clients).catch(() => null),
    lambdaActive(clients),
    storedWindows(clients),
    freshestAgeSeconds(clients),
  ]);
  return { queue_depth: depth, lambda_active: active, stored_windows: stored, freshest_age_seconds: age };
}

async function thresholds() {
  const res = await fetch(FOG_THRESHOLDS_URL, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`fog thresholds ${res.status}`);
  return res.json();
}

export {
  makeClients,
  summariseSignal,
  assembleSite,
  rollup,
  network,
  readings,
  health,
  backendStats,
  thresholds,
  SITES,
  SIGNALS,
};
