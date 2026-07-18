"use strict";

const { APIGatewayClient, GetRestApisCommand } = require("@aws-sdk/client-api-gateway");

// Resolved exactly once at startup: this dashboard
// process never talks to DynamoDB/SQS/Lambda directly and holds no
// persistent knowledge of the API Gateway REST API beyond this single
// lookup-by-name. Every subsequent /api/* request is a plain reverse-proxy
// HTTP call against the invoke URL computed here once and cached in
// server.js for the life of the process.
async function resolveInvokeUrl({ endpoint, region, apiName, stageName, retries = 30, delayMs = 2000 }) {
  const client = new APIGatewayClient({
    endpoint,
    region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { items = [] } = await client.send(new GetRestApisCommand({}));
    const api = items.find((item) => item.name === apiName);
    if (api) {
      return `${endpoint}/restapis/${api.id}/${stageName}/_user_request_`;
    }
    if (attempt === retries) throw new Error(`API Gateway REST API "${apiName}" never became available`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// Forwards one incoming request to the resolved API Gateway invoke URL,
// preserving method/headers/body, and hands back a plain
// {status, contentType, body} envelope for server.js to write to the real
// client response.
async function proxyRequest(invokeUrlBase, req, rawBody) {
  const target = `${invokeUrlBase}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : rawBody,
  });
  const body = Buffer.from(await upstream.arrayBuffer());
  return { status: upstream.status, contentType: upstream.headers.get("content-type") || "application/json", body };
}

module.exports = { resolveInvokeUrl, proxyRequest };
