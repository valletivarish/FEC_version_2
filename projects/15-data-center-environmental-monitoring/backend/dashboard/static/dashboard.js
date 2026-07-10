const SENSOR_TYPES = ["temperature_c", "humidity_pct", "airflow_cfm", "power_load_kw", "dust_density_ugm3"];
const SITE_IDS = ["hall-1", "hall-2"];

const METRIC_LABELS = {
  temperature_c: "Temperature",
  humidity_pct: "Humidity",
  airflow_cfm: "Airflow",
  power_load_kw: "Power Load",
  dust_density_ugm3: "Dust Density",
};

// Alert display text is a small local map -- the frontend does not call
// /api/thresholds directly (that proxy exists for API completeness and is
// covered by its own backend/api/thresholdsProxy.test.js).
const ALERT_LABELS = {
  overheat_risk: "Overheat risk",
  condensation_risk: "Condensation risk",
  static_discharge_risk: "Static discharge risk",
  insufficient_cooling: "Insufficient cooling",
  capacity_warning: "Capacity warning",
  air_quality_risk: "Air quality risk",
};

const TREND_COLORS = { "hall-1": "#3fb8c4", "hall-2": "#d98f4e" };
const trendCharts = {};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from fog/alerts.js (RULES),
// exposed descriptively at GET /thresholds and proxied at GET /api/thresholds.
const AXIS_RANGE = {
  temperature_c: { lo: 15, hi: 35 },
  humidity_pct: { lo: 10, hi: 80 },
  airflow_cfm: { lo: 200, hi: 2000 },
  power_load_kw: { lo: 5, hi: 150 },
  dust_density_ugm3: { lo: 0, hi: 100 },
};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function metricRow(sensorType, m) {
  const label = metricLabel(sensorType);
  if (!m) {
    return `<div class="metric-row"><div class="metric-label">${label}</div><div class="metric-value">&ndash;&ndash;</div></div>`;
  }
  const flagged = m.alerts && m.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  const alertText = flagged ? m.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
  return `<div class="metric-row">
    <div class="metric-label">${label}</div>
    <div class="metric-value">${m.latest}<span class="unit">${m.unit}</span></div>
    <meter class="reading-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${m.latest}"></meter>
    ${flagged ? `<div class="metric-alert">${alertText}</div>` : ""}
  </div>`;
}

function renderHallGrid(halls) {
  const container = document.getElementById("hall-grid");

  container.innerHTML = halls
    .map((hall) => {
      let alertCount = 0;
      const rows = SENSOR_TYPES.map((sensorType) => {
        const m = hall.metrics[sensorType];
        if (m && m.alerts) alertCount += m.alerts.length;
        return metricRow(sensorType, m);
      }).join("");

      const hasAlert = alertCount > 0;
      return `<div class="hall-card ${hasAlert ? "has-alert" : ""}">
        <div class="hall-head">
          <span class="name">${hall.site_id}</span>
          <span class="status ${hasAlert ? "alert" : ""}">${hasAlert ? alertCount + " alert(s)" : "nominal"}</span>
        </div>
        ${rows}
      </div>`;
    })
    .join("");
}

function renderAlertBanner(halls) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const hall of halls) {
    for (const sensorType of SENSOR_TYPES) {
      const m = hall.metrics[sensorType];
      if (m && m.alerts && m.alerts.length) {
        for (const alert of m.alerts) active.push(`${hall.site_id}: ${ALERT_LABELS[alert] || alert}`);
      }
    }
  }
  if (active.length === 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.textContent = `${active.length} active alert(s) -- ${active.join(" | ")}`;
}

function renderHealth(health) {
  const strip = document.getElementById("health-strip");
  const pill = (label, ok) => `<span class="health-pill ${ok ? "" : "down"}"><span class="swatch"></span>${label}</span>`;
  strip.innerHTML =
    pill("Gateway", health.gateway) +
    pill("Queue", health.queue) +
    pill("Lambda", health.lambda) +
    pill("Pipeline", health.pipeline);
}

function renderBackendStats(backendStats) {
  const el = document.getElementById("backend-stats");
  const queueInfo = backendStats.queue
    ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight`
    : "queue unknown";
  el.textContent = `${backendStats.items_in_table ?? 0} records stored -- ${queueInfo}`;
}

async function fetchTrend(sensorType) {
  const res = await fetch(`/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function renderTrendChart(sensorType, items) {
  const canvasId = `trend-${sensorType}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const bySite = {};
  for (const item of items) {
    (bySite[item.site_id] = bySite[item.site_id] || []).push(item);
  }

  const labels = items.filter((i) => i.site_id === Object.keys(bySite)[0]).map((_, i) => i);
  const datasets = Object.entries(bySite).map(([siteId, points]) => ({
    label: siteId,
    data: points.map((p) => p.avg),
    borderColor: TREND_COLORS[siteId] || "#999",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));

  if (trendCharts[sensorType]) {
    trendCharts[sensorType].data.datasets = datasets;
    trendCharts[sensorType].update();
    return;
  }

  trendCharts[sensorType] = new Chart(canvas, {
    type: "line",
    data: { labels: labels.length ? labels : [0], datasets },
    options: {
      animation: false,
      responsive: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#7d94a6" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#7d94a6" }, grid: { color: "#26404f" } },
      },
    },
  });
}

function renderTrendGrid() {
  const grid = document.getElementById("trend-grid");
  if (grid.childElementCount === 0) {
    grid.innerHTML = SENSOR_TYPES.map(
      (sensorType) => `<div class="trend-card">
        <h4>${metricLabel(sensorType)}</h4>
        <canvas id="trend-${sensorType}" width="260" height="140"></canvas>
      </div>`
    ).join("");
  }
}

// Every /api/* call in this project is a real Lambda invocation behind API
// Gateway (see backend/api/), which is inherently slower and more
// contention-sensitive than the other projects' direct HTTP handlers. A
// plain setInterval(tick, 2500) does not wait for the previous tick to
// finish, so if one round of Lambda invocations runs long (cold start,
// LocalStack under load), the next tick starts anyway -- the resulting
// pile of overlapping in-flight requests competes for the same Lambda
// executor and makes every one of them slower still, a feedback loop that
// can leave the dashboard blank far longer than a single slow tick would.
// tickInFlight skips starting a new tick while one is still running,
// letting the backend catch up instead of digging the hole deeper.
let tickInFlight = false;

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const [hallsResp, health, backendStats] = await Promise.all([
      fetch("/api/halls").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const halls = hallsResp.halls || [];
    renderHallGrid(halls);
    renderAlertBanner(halls);
    renderHealth(health);
    renderBackendStats(backendStats);

    // Fetched in parallel, not one-at-a-time: awaiting 5 trend requests
    // sequentially would chain 5 real invocation latencies end to end.
    // Firing them together lets LocalStack's Lambda executor service them
    // concurrently instead.
    renderTrendGrid();
    const trends = await Promise.all(SENSOR_TYPES.map((sensorType) => fetchTrend(sensorType)));
    SENSOR_TYPES.forEach((sensorType, i) => renderTrendChart(sensorType, trends[i].items || []));
  } catch (e) {
    // backend not ready yet; next tick retries
  } finally {
    tickInFlight = false;
  }
}

tick();
setInterval(tick, 2500);
