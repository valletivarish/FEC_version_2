"use strict";

const { buildClients } = require("./awsClients");
const { route } = require("./router");

let cachedClients;
function getClients() {
  if (!cachedClients) cachedClients = buildClients();
  return cachedClients;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    // Real deployment serves the dashboard's static assets from a separate
    // S3 origin and has the browser call this API directly, so responses
    // need to be readable cross-origin; the local reverse-proxy path (see
    // backend/dashboard/apiGatewayProxy.js) never hits a browser CORS check
    // at all, so this header is inert there.
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

// Single Lambda behind a real API Gateway {proxy+} REST API on LocalStack, doing its own internal path/method routing via router.js instead of per-endpoint API Gateway resources -- the one Node sibling in this portfolio not exposing a directly-running dashboard REST API.
exports.handler = async (event) => {
  try {
    const method = event.httpMethod || "GET";
    const path = event.path || "/";
    const query = event.queryStringParameters || {};
    const result = await route(method, path, query, getClients());
    return jsonResponse(result.status, result.body);
  } catch (err) {
    return jsonResponse(500, { error: err.message || "internal error" });
  }
};

exports.jsonResponse = jsonResponse;
exports.getClients = getClients;
