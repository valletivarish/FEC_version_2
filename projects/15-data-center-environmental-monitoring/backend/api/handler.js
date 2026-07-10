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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// API Gateway AWS_PROXY integration invokes this Lambda directly, handing
// it the full request as event.httpMethod / event.path / event.
// queryStringParameters. There is exactly one {proxy+} resource (plus
// root "/") wired to this function -- see deploy_api.sh -- so this handler
// does its own internal path/method routing (router.js's route()) rather
// than relying on API Gateway to have a resource per endpoint. This is the
// project's genuinely different backend architecture: a single Lambda
// fronted by a real API Gateway REST API deployed to LocalStack, replacing
// the directly-running dashboard REST API every other Node sibling in this
// portfolio uses.
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
