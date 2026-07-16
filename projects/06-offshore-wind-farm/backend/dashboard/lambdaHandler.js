"use strict";

// Bridges an API Gateway (REST API, proxy integration) event straight into
// the same Express app createApp() builds for local dev -- no parallel
// route table, no duplicated business logic. The bridge itself is a pair of
// hand-rolled objects shaped like http.IncomingMessage / http.ServerResponse:
// real instances of those classes demand a live net.Socket, which a Lambda
// invocation never has, so instead this builds plain objects that carry
// just the properties Express's router, query middleware, and response
// helpers (res.json/res.send/res.status/res.type/req.fresh, ...) actually
// touch. The request/response low-level primitives (setHeader/getHeader/
// write/end/etc.) are attached as the objects' OWN properties rather than
// prototype methods, because Express's own `expressInit` middleware runs
// `setPrototypeOf(req, app.request)` / `setPrototypeOf(res, app.response)`
// on every request to graft on its higher-level helpers -- an own property
// always wins over anything on the (possibly just-swapped) prototype chain,
// so our primitives keep answering the calls Express's helpers make into
// them no matter what the object's prototype has become.

const { Readable } = require("node:stream");
const { createApp } = require("./server");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function decodeBody(event) {
  if (!event.body) return Buffer.alloc(0);
  return Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8");
}

function lowercaseHeaders(headers) {
  const out = {};
  for (const key of Object.keys(headers || {})) {
    out[key.toLowerCase()] = headers[key];
  }
  return out;
}

function buildQueryString(params) {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const key of Object.keys(params)) {
    if (params[key] !== undefined) search.append(key, params[key]);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function buildRequest(event) {
  const bodyBuffer = decodeBody(event);
  let bodyDelivered = false;

  const req = new Readable({
    // Express's expressInit middleware reparents this object onto its own
    // request prototype (setPrototypeOf), which chains up through the
    // real http.IncomingMessage.prototype. That prototype's _destroy
    // assumes a live socket and reaches into it once the stream reaches
    // EOF and auto-destroys itself -- there is no such socket here, so
    // auto-destroy is turned off; the body has already been fully
    // delivered by the time 'end' fires, so nothing is lost by skipping it.
    autoDestroy: false,
    read() {
      if (bodyDelivered) return;
      bodyDelivered = true;
      if (bodyBuffer.length) this.push(bodyBuffer);
      this.push(null);
    },
  });

  req.method = event.httpMethod || "GET";
  req.headers = lowercaseHeaders(event.headers);
  req.url = (event.path || "/") + buildQueryString(event.queryStringParameters);
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.socket = req.connection = {
    remoteAddress: req.headers["x-forwarded-for"] || "127.0.0.1",
    encrypted: true,
    destroy() {},
  };

  return req;
}

function findHeaderKey(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === lower);
}

function buildResponse() {
  const headers = {};
  const chunks = [];
  const finishListeners = [];

  const res = {
    statusCode: 200,
    statusMessage: undefined,
    headersSent: false,
    finished: false,

    setHeader(name, value) {
      headers[findHeaderKey(headers, name) || name] = value;
    },
    getHeader(name) {
      const key = findHeaderKey(headers, name);
      return key ? headers[key] : undefined;
    },
    removeHeader(name) {
      const key = findHeaderKey(headers, name);
      if (key) delete headers[key];
    },
    hasHeader(name) {
      return findHeaderKey(headers, name) !== undefined;
    },
    getHeaderNames() {
      return Object.keys(headers);
    },
    getHeaders() {
      return { ...headers };
    },
    writeHead(statusCode, statusMessageOrHeaders, maybeHeaders) {
      res.statusCode = statusCode;
      const extra = typeof statusMessageOrHeaders === "object" ? statusMessageOrHeaders : maybeHeaders;
      if (typeof statusMessageOrHeaders === "string") res.statusMessage = statusMessageOrHeaders;
      if (extra) for (const key of Object.keys(extra)) res.setHeader(key, extra[key]);
      res.headersSent = true;
      return res;
    },
    write(chunk, encoding) {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      res.headersSent = true;
      return true;
    },
    end(chunk, encoding, callback) {
      let cb = callback;
      let body = chunk;
      let enc = encoding;
      if (typeof chunk === "function") {
        cb = chunk;
        body = undefined;
        enc = undefined;
      } else if (typeof encoding === "function") {
        cb = encoding;
        enc = undefined;
      }
      if (body !== undefined) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body, enc));
      res.headersSent = true;
      res.finished = true;
      if (typeof cb === "function") cb();
      finishListeners.splice(0).forEach((fn) => fn());
    },

    on(event, fn) {
      if (event === "finish") finishListeners.push(fn);
      return res;
    },
    once(event, fn) {
      return res.on(event, fn);
    },
    removeListener() {
      return res;
    },
    emit() {
      return false;
    },
  };

  function capture() {
    // API Gateway's proxy-integration response contract requires header
    // values to be strings; finalhandler (unlike Express's own res.set)
    // writes Content-Length straight through setHeader as a number.
    const stringHeaders = {};
    for (const key of Object.keys(headers)) stringHeaders[key] = String(headers[key]);
    return {
      statusCode: res.statusCode,
      headers: stringHeaders,
      body: Buffer.concat(chunks).toString("utf8"),
    };
  }

  return { res, capture };
}

// Runs the request all the way through Express and resolves once the
// response is actually finished (res.end() called), not once app(req, res)
// returns -- Express dispatches synchronously but this app's route
// handlers are async, so the real work still happens after that call.
function runThroughExpress(app, event) {
  return new Promise((resolve, reject) => {
    const req = buildRequest(event);
    const { res, capture } = buildResponse();
    res.once("finish", () => resolve(capture()));
    try {
      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

function normalizePath(rawPath) {
  const path = rawPath || "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function withCors(response) {
  return { ...response, headers: { ...response.headers, ...CORS_HEADERS } };
}

// clients overrides the real AWS SDK clients createApp() would otherwise
// build for itself, so tests can inject fakes without touching AWS. The
// app is built lazily on first invocation and then cached on this
// handler's own closure -- reused across warm invocations of the same
// Lambda container, the same way app.listen() reuses one app instance
// for every request locally, but scoped per-handler so independent tests
// (each calling createHandler() with its own fakes) never share a cache.
function createHandler(clients) {
  let cachedApp;
  function dashboardApp() {
    if (!cachedApp) cachedApp = createApp(clients);
    return cachedApp;
  }

  return async function handler(event) {
    if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
      return withCors({ statusCode: 200, headers: {}, body: "" });
    }

    const path = normalizePath(event.path);
    // Only /api/* is this Lambda's job -- the frontend (index.html, css,
    // js) is uploaded straight to S3, the same as every other project in
    // this portfolio, so a request for it landing on this Lambda at all
    // means it was misrouted at the API Gateway stage; the correct answer
    // here is a plain 404, not spending a Lambda invocation reading
    // static/index.html off local disk via res.sendFile().
    if (!path.startsWith("/api/") && path !== "/api") {
      return withCors({ statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "not found" }) });
    }

    try {
      const response = await runThroughExpress(dashboardApp(), event);
      return withCors(response);
    } catch (err) {
      return withCors({
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: err.message || "internal error" }),
      });
    }
  };
}

module.exports = {
  createHandler,
  handler: createHandler(),
  normalizePath,
  buildQueryString,
};
