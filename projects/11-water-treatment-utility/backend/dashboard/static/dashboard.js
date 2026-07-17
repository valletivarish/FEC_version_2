const SENSOR_TYPES = ["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"];
const SITE_IDS = ["plant-1", "plant-2"];

// API origin is carried as a query parameter on this script's own src
// (?apiBase=...), substituted with the real API Gateway origin at S3 upload
// time. In local development the placeholder is left untouched and the empty
// base keeps same-origin fetches working, since the dashboard is served from
// the same host as its API there.
const API_BASE = (() => {
  const el = document.getElementById("dashboard-script") || document.currentScript;
  try {
    const v = new URL(el.src).searchParams.get("apiBase");
    return v && !v.startsWith("__API_BASE__") ? v.replace(/\/$/, "") : "";
  } catch {
    return "";
  }
})();

const METRIC_LABELS = {
  turbidity_ntu: "Turbidity",
  ph_level: "pH Level",
  chlorine_ppm: "Chlorine",
  flow_rate_lps: "Flow Rate",
  pressure_bar: "Pressure",
};

// Alert display text is a small local map -- the frontend does not call
// /api/thresholds directly (that proxy exists for API completeness and is
// covered by its own backend test; see readme.txt).
const ALERT_LABELS = {
  turbidity_alert: "Turbidity alert",
  under_chlorination: "Under-chlorination",
  low_pressure_fault: "Low pressure fault",
  acidic_violation: "Acidic violation",
};

const TREND_COLORS = { "plant-1": "#1c6ea4", "plant-2": "#b3402b" };
const trendCharts = {};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from fog/alerts.js.
const AXIS_RANGE = {
  turbidity_ntu: { lo: 0, hi: 15 },
  ph_level: { lo: 5.5, hi: 9 },
  chlorine_ppm: { lo: 0, hi: 3 },
  flow_rate_lps: { lo: 5, hi: 120 },
  pressure_bar: { lo: 0.5, hi: 8 },
};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function readingCell(sensorType, metric) {
  if (!metric) {
    return `<td class="reading-cell" data-site-empty="true"><span class="empty">&ndash;&ndash;</span></td>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  const alertText = flagged ? metric.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
  return `<td class="reading-cell${flagged ? " flagged" : ""}">
    <span class="value">${metric.latest}<span class="unit">${metric.unit}</span></span>
    <meter class="cell-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${metric.latest}"></meter>
    ${flagged ? `<span class="cell-alert">${alertText}</span>` : ""}
  </td>`;
}

// Rows = readings, columns = plants -- the inverse orientation of a
// per-plant card listing its own metrics as rows (contrast
// 09-aquaculture-fish-farm's pond cards), so each row lets you compare the
// same reading across both plants at a glance.
function renderMatrix(plants) {
  const bySite = Object.fromEntries(plants.map((p) => [p.site_id, p]));
  const body = document.getElementById("matrix-body");

  body.innerHTML = SENSOR_TYPES.map((sensorType) => {
    const cells = SITE_IDS.map((siteId) => readingCell(sensorType, (bySite[siteId] || {}).metrics && bySite[siteId].metrics[sensorType])).join("");
    return `<tr>
      <th scope="row">${metricLabel(sensorType)}<span class="unit-tag">${AXIS_RANGE[sensorType].lo}&ndash;${AXIS_RANGE[sensorType].hi} ${(bySite[SITE_IDS[0]] && bySite[SITE_IDS[0]].metrics[sensorType] && bySite[SITE_IDS[0]].metrics[sensorType].unit) || ""}</span></th>
      ${cells}
    </tr>`;
  }).join("");
}

function renderComplianceStrip(plants) {
  const strip = document.getElementById("compliance-strip");
  strip.innerHTML = plants
    .map((plant) => {
      const alert = !plant.compliant;
      return `<span class="plant-status${alert ? " alert" : ""}">
        <span class="swatch"></span>${plant.site_id}: ${alert ? plant.alerts.length + " alert(s)" : "compliant"}
      </span>`;
    })
    .join("");
}

function renderAlertBanner(plants) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const plant of plants) {
    for (const alert of plant.alerts || []) {
      active.push(`${plant.site_id}: ${ALERT_LABELS[alert.key] || alert.key}`);
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
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${sensorType}&limit=20`);
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#5c7286" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#5c7286" }, grid: { color: "#c3d6e5" } },
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

async function tick() {
  try {
    const [plantsResp, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/plants`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const plants = plantsResp.plants || [];
    renderMatrix(plants);
    renderComplianceStrip(plants);
    renderAlertBanner(plants);
    renderHealth(health);
    renderBackendStats(backendStats);

    renderTrendGrid();
    for (const sensorType of SENSOR_TYPES) {
      const trend = await fetchTrend(sensorType);
      renderTrendChart(sensorType, trend.items || []);
    }
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

tick();
setInterval(tick, 2500);
