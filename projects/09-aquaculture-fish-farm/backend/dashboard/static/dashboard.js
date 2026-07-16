// Read once from the hidden #api-base input's value, sed-substituted at S3
// upload time. Falls back to same-origin ("") for local dev, where the
// value is left as __API_BASE__.
const API_BASE = (() => {
  const raw = (document.getElementById("api-base") || {}).value || "";
  return !raw || raw.includes("__API_BASE__") ? "" : raw.replace(/\/$/, "");
})();

const SENSOR_TYPES = ["water_temp_c", "dissolved_oxygen_mgl", "ph_level", "ammonia_ppm", "feed_dispensed_g"];

const METRIC_LABELS = {
  water_temp_c: "Water Temp",
  dissolved_oxygen_mgl: "Dissolved O2",
  ph_level: "pH",
  ammonia_ppm: "Ammonia",
  feed_dispensed_g: "Feed",
};

const ALERT_LABELS = {
  hypoxia_risk: "Hypoxia risk",
  toxicity_risk: "Toxicity risk",
  heat_stress: "Heat stress",
  alkaline_risk: "Alkaline risk",
  acidic_risk: "Acidic risk",
};

const TREND_COLORS = { "pond-1": "#2f9e8f", "pond-2": "#e0a34a" };
const trendCharts = {};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from /api/thresholds.
const AXIS_RANGE = {
  water_temp_c: { lo: 10, hi: 34 },
  dissolved_oxygen_mgl: { lo: 1, hi: 12 },
  ph_level: { lo: 5.5, hi: 9 },
  ammonia_ppm: { lo: 0, hi: 2 },
  feed_dispensed_g: { lo: 0, hi: 500 },
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

function renderPondMap(ponds) {
  const container = document.getElementById("pond-map");

  container.innerHTML = ponds
    .map((pond) => {
      let alertCount = 0;
      const rows = SENSOR_TYPES.map((sensorType) => {
        const m = pond.metrics[sensorType];
        if (m && m.alerts) alertCount += m.alerts.length;
        return metricRow(sensorType, m);
      }).join("");

      const hasAlert = alertCount > 0;
      return `<div class="pond-card ${hasAlert ? "has-alert" : ""}">
        <div class="pond-head">
          <span class="name">${pond.site_id}</span>
          <span class="status ${hasAlert ? "alert" : ""}">${hasAlert ? alertCount + " alert(s)" : "nominal"}</span>
        </div>
        ${rows}
      </div>`;
    })
    .join("");
}

function renderAlertBanner(ponds) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const pond of ponds) {
    for (const sensorType of SENSOR_TYPES) {
      const m = pond.metrics[sensorType];
      if (m && m.alerts && m.alerts.length) {
        for (const alert of m.alerts) active.push(`${pond.site_id}: ${ALERT_LABELS[alert] || alert}`);
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
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${sensorType}&limit=20`);
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#8fb0b0" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#8fb0b0" }, grid: { color: "#2c5c62" } },
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
    const [pondsResp, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/ponds`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const ponds = pondsResp.ponds || [];
    renderPondMap(ponds);
    renderAlertBanner(ponds);
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
