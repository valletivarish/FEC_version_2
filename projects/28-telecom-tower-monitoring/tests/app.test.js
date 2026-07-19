import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../backend/dashboard/app.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function fakeService(over = {}) {
  return {
    makeClients: () => ({}),
    network: async () => ({ sites: [{ site_id: "site-north", source: "on_grid" }], rollup: { sites: 1 } }),
    readings: async (_c, site, signal) => [{ site_id: site || "all", sensor_type: signal || "all", windows: [] }],
    health: async () => ({ gateway: "up", queue: "up", lambda: "up", pipeline: "up" }),
    backendStats: async () => ({ queue_depth: 0, lambda_active: true, stored_windows: 12, freshest_age_seconds: 3 }),
    thresholds: async () => ({ battery_charge_pct: [] }),
    ...over,
  };
}

test("GET /api/sites returns the network payload", async () => {
  const { server, base } = await listen(buildApp({ clients: {}, service: fakeService() }));
  try {
    const body = await (await fetch(`${base}/api/sites`)).json();
    assert.equal(body.sites[0].site_id, "site-north");
    assert.equal(body.rollup.sites, 1);
  } finally { server.close(); }
});

test("GET /api/readings passes site and signal filters through", async () => {
  const { server, base } = await listen(buildApp({ clients: {}, service: fakeService() }));
  try {
    const body = await (await fetch(`${base}/api/readings?site=site-south&signal=dc_load_amps`)).json();
    assert.equal(body[0].site_id, "site-south");
    assert.equal(body[0].sensor_type, "dc_load_amps");
  } finally { server.close(); }
});

test("GET /api/health and /api/backend-stats return service data", async () => {
  const { server, base } = await listen(buildApp({ clients: {}, service: fakeService() }));
  try {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.pipeline, "up");
    const stats = await (await fetch(`${base}/api/backend-stats`)).json();
    assert.equal(stats.stored_windows, 12);
  } finally { server.close(); }
});

test("GET /api/thresholds proxies fog and 502s when fog is unreachable", async () => {
  const good = fakeService();
  let { server, base } = await listen(buildApp({ clients: {}, service: good }));
  try {
    assert.equal((await fetch(`${base}/api/thresholds`)).status, 200);
  } finally { server.close(); }

  const bad = fakeService({ thresholds: async () => { throw new Error("timeout"); } });
  ({ server, base } = await listen(buildApp({ clients: {}, service: bad })));
  try {
    assert.equal((await fetch(`${base}/api/thresholds`)).status, 502);
  } finally { server.close(); }
});

test("a service error surfaces as a 500 json body", async () => {
  const broken = fakeService({ network: async () => { throw new Error("boom"); } });
  const { server, base } = await listen(buildApp({ clients: {}, service: broken }));
  try {
    const res = await fetch(`${base}/api/sites`);
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /boom/);
  } finally { server.close(); }
});

test("the dashboard serves its static board", async () => {
  const { server, base } = await listen(buildApp({ clients: {}, service: fakeService() }));
  try {
    const res = await fetch(`${base}/index.html`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Tower Power/);
  } finally { server.close(); }
});
