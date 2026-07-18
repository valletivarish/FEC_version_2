// API origin: sed-substituted into the app script tag's data-api-base at S3 upload time; unset means same-origin.
const API_BASE = (() => {
  const el = document.getElementById("app");
  const v = (el && el.dataset.apiBase) || "";
  return v.startsWith("__API_BASE__") ? "" : v.replace(/\/$/, "");
})();

const SENSOR_TYPES = ["engine_temp_c", "brake_pad_wear_pct", "passenger_count", "fuel_level_pct", "gps_speed_kmh"];

const METRIC_LABELS = {
  engine_temp_c: "Engine Temp",
  brake_pad_wear_pct: "Brake Pad Wear",
  passenger_count: "Passenger Count",
  fuel_level_pct: "Fuel Level",
  gps_speed_kmh: "GPS Speed",
};

const ALERT_LABELS = {
  engine_overheat_risk: "Engine overheat risk",
  brake_service_required: "Brake service required",
  low_fuel_warning: "Low fuel warning",
  overcrowding_alert: "Overcrowding alert",
};

const TREND_COLORS = { "depot-a": "#ff5a1f", "depot-b": "#3ecf8e" };
const trendCharts = {};

// Axis bounds for each reading's <meter> -- display range only, not a decision threshold.
const AXIS_RANGE = {
  engine_temp_c: { lo: 60, hi: 120 },
  brake_pad_wear_pct: { lo: 0, hi: 100 },
  passenger_count: { lo: 0, hi: 80 },
  fuel_level_pct: { lo: 0, hi: 100 },
  gps_speed_kmh: { lo: 0, hi: 100 },
};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function metricCard(sensorType, m) {
  const label = metricLabel(sensorType);
  if (!m) {
    return `<div class="metric-card">
      <div class="metric-card-head"><span class="name">${label}</span></div>
      <div class="no-data">no data yet</div>
    </div>`;
  }
  const flagged = m.alerts && m.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  const alertText = flagged ? m.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
  return `<div class="metric-card ${flagged ? "has-alert" : ""}">
    <div class="metric-card-head"><span class="name">${label}</span></div>
    <div class="value">${m.latest}<span class="unit">${m.unit}</span></div>
    <meter class="reading-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${m.latest}"></meter>
    <div class="stats"><span>min ${m.min}</span><span>avg ${m.avg}</span><span>max ${m.max}</span></div>
    ${flagged ? `<div class="alert-badge">${alertText}</div>` : ""}
  </div>`;
}

function renderDepotCards(containerId, depot) {
  const container = document.getElementById(containerId);
  if (!depot) {
    container.innerHTML = SENSOR_TYPES.map((t) => metricCard(t, null)).join("");
    return;
  }
  container.innerHTML = SENSOR_TYPES.map((sensorType) => metricCard(sensorType, depot.metrics[sensorType])).join("");
}

function renderAlertBanner(depots) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const depot of depots) {
    for (const sensorType of SENSOR_TYPES) {
      const m = depot.metrics[sensorType];
      if (m && m.alerts && m.alerts.length) {
        for (const alert of m.alerts) active.push(`${depot.site_id}: ${ALERT_LABELS[alert] || alert}`);
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
  const tab = (label, ok) => `<span class="health-tab ${ok ? "up" : "down"}">${label}</span>`;
  strip.innerHTML =
    tab("Gateway", health.gateway) +
    tab("Queue", health.queue) +
    tab("Lambda", health.lambda) +
    tab("Pipeline", health.pipeline);
}

function renderBackendStats(backendStats) {
  const el = document.getElementById("backend-stats");
  const queueInfo = backendStats.queue
    ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight`
    : "queue unknown";
  el.textContent = `${backendStats.items_in_table ?? 0} records stored -- ${queueInfo}`;
}

async function fetchTrend(sensorType) {
  const res = await fetch(API_BASE + `/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function renderTrendChart(sensorType, items) {
  const canvasId = `trend-${sensorType}`;
  let canvas = document.getElementById(canvasId);
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#8fa6cc" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#8fa6cc" }, grid: { color: "#24487c" } },
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
    const [depotsResp, health, backendStats] = await Promise.all([
      fetch(API_BASE + "/api/depots").then((r) => r.json()),
      fetch(API_BASE + "/api/health").then((r) => r.json()),
      fetch(API_BASE + "/api/backend-stats").then((r) => r.json()),
    ]);

    const depots = depotsResp.depots || [];
    const depotA = depots.find((d) => d.site_id === "depot-a");
    const depotB = depots.find((d) => d.site_id === "depot-b");

    renderDepotCards("depot-a-cards", depotA);
    renderDepotCards("depot-b-cards", depotB);
    renderAlertBanner(depots);
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
