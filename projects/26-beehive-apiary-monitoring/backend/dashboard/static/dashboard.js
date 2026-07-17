// API origin, sed-substituted into this script tag's data-api-base at S3 upload time; unsubstituted means same-origin for local dev.
const API_BASE = (() => {
  const el = document.getElementById("app");
  const v = (el && el.dataset.apiBase) || "";
  return v.startsWith("__API_BASE__") ? "" : v.replace(/\/$/, "");
})();

const SENSOR_TYPES = [
  "hive_weight_kg",
  "internal_hive_temp_c",
  "internal_humidity_pct",
  "acoustic_buzz_frequency_hz",
  "entrance_traffic_count",
];
const SITE_IDS = ["apiary-a", "apiary-b"];

const METRIC_LABELS = {
  hive_weight_kg: "Hive Weight",
  internal_hive_temp_c: "Brood Temperature",
  internal_humidity_pct: "Internal Humidity",
  acoustic_buzz_frequency_hz: "Acoustic Buzz",
  entrance_traffic_count: "Entrance Traffic",
};

const APIARY_LABELS = { "apiary-a": "Apiary A", "apiary-b": "Apiary B" };

const ALERT_LABELS = {
  brood_overheat_risk: "Brood overheat risk",
  brood_chilling_risk: "Brood chilling risk",
  colony_starvation_risk: "Colony starvation risk",
  swarming_precursor_detected: "Swarming precursor detected",
};

// Axis bounds each reading's <meter> is drawn against, not a decision threshold (real thresholds live in fog/alerts.js).
const AXIS_RANGE = {
  hive_weight_kg: { lo: 0, hi: 80 },
  internal_hive_temp_c: { lo: 20, hi: 40 },
  internal_humidity_pct: { lo: 30, hi: 80 },
  acoustic_buzz_frequency_hz: { lo: 150, hi: 500 },
  entrance_traffic_count: { lo: 0, hi: 500 },
};

const TREND_COLORS = { "apiary-a": "#a35a12", "apiary-b": "#5f7a9c" };
const trendCharts = {};

function metricTitle(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function combReadingRow(sensorType, metric) {
  const label = metricTitle(sensorType);
  if (!metric) {
    return `<li class="reading-row"><span class="reading-label">${label}</span><span class="reading-empty">no data yet</span></li>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  return `<li class="reading-row${flagged ? " flagged" : ""}">
    <span class="reading-label">${label}</span>
    <span class="reading-value">${metric.latest}<span class="reading-unit">${metric.unit}</span></span>
    <meter class="reading-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${metric.latest}"></meter>
  </li>`;
}

function paintApiaryCards(apiaries) {
  const list = document.getElementById("narrative-list");
  list.innerHTML = apiaries
    .map((apiary) => {
      const alertNote = apiary.compliant
        ? ""
        : `<span class="narrative-alert-flag">${apiary.alerts.map((a) => ALERT_LABELS[a.key] || a.key).join(", ")}</span>`;
      const rows = SENSOR_TYPES.map((sensorType) => combReadingRow(sensorType, apiary.metrics[sensorType])).join("");
      return `<article class="narrative-card${apiary.compliant ? "" : " flagged"}">
        <h3 class="narrative-heading">${APIARY_LABELS[apiary.site_id] || apiary.site_id}</h3>
        <p class="narrative-sentence">${apiary.health.sentence}</p>
        ${alertNote}
        <ul class="reading-list">${rows}</ul>
      </article>`;
    })
    .join("");
}

function paintAlertBanner(apiaries) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const apiary of apiaries) {
    for (const alert of apiary.alerts || []) {
      active.push(`${APIARY_LABELS[apiary.site_id] || apiary.site_id}: ${ALERT_LABELS[alert.key] || alert.key}`);
    }
  }
  if (active.length === 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.textContent = `${active.length} active alert(s) -- ${active.join(" | ")}`;
}

function paintHealthStrip(health) {
  const strip = document.getElementById("health-strip");
  const pill = (label, ok) => `<span class="health-pill ${ok ? "" : "down"}"><span class="swatch"></span>${label}</span>`;
  strip.innerHTML =
    pill("Gateway", health.gateway) +
    pill("Queue", health.queue) +
    pill("Lambda", health.lambda) +
    pill("Pipeline", health.pipeline);
}

function paintBackendStats(backendStats) {
  const el = document.getElementById("backend-stats");
  const queueInfo = backendStats.queue
    ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight`
    : "queue unknown";
  el.textContent = `${backendStats.items_in_table ?? 0} records stored -- ${queueInfo}`;
}

async function pullTrendSeries(sensorType) {
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function paintTrendChart(sensorType, items) {
  const canvasId = `trend-${sensorType}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const bySite = {};
  for (const item of items) {
    (bySite[item.site_id] = bySite[item.site_id] || []).push(item);
  }

  const labels = items.filter((i) => i.site_id === Object.keys(bySite)[0]).map((_, i) => i);
  const datasets = Object.entries(bySite).map(([siteId, points]) => ({
    label: APIARY_LABELS[siteId] || siteId,
    data: points.map((p) => p.avg),
    borderColor: TREND_COLORS[siteId] || "#8a6f4e",
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#8a6f4e" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#8a6f4e" }, grid: { color: "#e0c894" } },
      },
    },
  });
}

function paintTrendGrid() {
  const grid = document.getElementById("trend-grid");
  if (grid.childElementCount === 0) {
    grid.innerHTML = SENSOR_TYPES.map(
      (sensorType) => `<div class="trend-card">
        <h4>${metricTitle(sensorType)}</h4>
        <canvas id="trend-${sensorType}" width="260" height="140"></canvas>
      </div>`
    ).join("");
  }
}

async function refreshDashboard() {
  try {
    const [apiariesResp, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/apiaries`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const apiaries = apiariesResp.apiaries || [];
    paintApiaryCards(apiaries);
    paintAlertBanner(apiaries);
    paintHealthStrip(health);
    paintBackendStats(backendStats);

    paintTrendGrid();
    for (const sensorType of SENSOR_TYPES) {
      const trend = await pullTrendSeries(sensorType);
      paintTrendChart(sensorType, trend.items || []);
    }
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

refreshDashboard();
setInterval(refreshDashboard, 2500);
