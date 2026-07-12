const SENSOR_TYPES = ["snowpack_depth_cm", "snow_temp_c", "wind_speed_kmh", "seismic_vibration_mg", "lift_chair_count"];
const SITE_IDS = ["slope-a", "slope-b"];

const METRIC_LABELS = {
  snowpack_depth_cm: "Snowpack Depth",
  snow_temp_c: "Snow Temperature",
  wind_speed_kmh: "Wind Speed",
  seismic_vibration_mg: "Seismic Vibration",
  lift_chair_count: "Lift Chair Count",
};

// Alert display text is a small local map -- the frontend does not call
// /api/thresholds directly (that proxy exists for API completeness and is
// covered by its own backend test; see readme.txt).
const ALERT_LABELS = {
  avalanche_risk_detected: "Avalanche risk detected",
  lift_wind_halt: "Lift wind halt",
  snowpack_instability_risk: "Snowpack instability risk",
  insufficient_snow_coverage: "Insufficient snow coverage",
};

// Axis bounds -- the range each reading's <meter> is drawn against in the
// secondary reading panel, not a decision threshold. Real alert thresholds
// come from fog/alerts.js.
const AXIS_RANGE = {
  snowpack_depth_cm: { lo: 0, hi: 400 },
  snow_temp_c: { lo: -25, hi: 5 },
  wind_speed_kmh: { lo: 0, hi: 120 },
  seismic_vibration_mg: { lo: 0, hi: 50 },
  lift_chair_count: { lo: 0, hi: 80 },
};

// The risk-scale index each gauge <meter> is drawn against: a plain 0-3
// numeric position for LOW/MODERATE/HIGH/EXTREME, computed server-side by
// readingsStore.js's deriveRiskLevel() and echoed back here purely as a
// display label lookup.
const RISK_SCALE = ["LOW", "MODERATE", "HIGH", "EXTREME"];

const TREND_COLORS = { "slope-a": "#0b6fa8", "slope-b": "#b23a2f" };
const trendCharts = {};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

// Primary structural view: a horizontal risk-level gauge per slope,
// rendered as plain LOW/MODERATE/HIGH/EXTREME text against a native
// <meter> (min=0 max=3, low=1 high=2 optimum=0 so the browser's own
// optimum/sub-optimum/even-less-good coloring tracks rising severity) --
// not a colored tile, dial, heatmap, or status-line.
function renderRiskGauge(slope) {
  const riskIndex = RISK_SCALE.indexOf(slope.risk_level);
  const ticks = RISK_SCALE.map(
    (level) => `<span class="${level === slope.risk_level ? "active" : ""}">${level}</span>`
  ).join("");
  const alerts = slope.alerts || [];
  const alertsHtml = alerts.length
    ? alerts.map((a) => `<span class="alert-line">${ALERT_LABELS[a.key] || a.key}</span>`).join("")
    : `<span class="no-alerts">No active alerts</span>`;

  return `<div class="risk-gauge-card">
    <p class="slope-name">${slope.site_id}</p>
    <p class="risk-level-text risk-${slope.risk_level}">${slope.risk_level}</p>
    <meter class="risk-meter" min="0" max="3" low="1" high="2" optimum="0" value="${riskIndex}"></meter>
    <div class="risk-scale-ticks">${ticks}</div>
    <div class="risk-active-alerts">${alertsHtml}</div>
  </div>`;
}

function renderRiskGaugeGrid(slopes) {
  const grid = document.getElementById("risk-gauge-grid");
  grid.innerHTML = slopes.map(renderRiskGauge).join("");
}

// Secondary detail: a plain label/value list per slope (not a rows-x-
// columns matrix table), one row per reading with a small <meter> against
// that reading's configured axis range.
function readingRow(sensorType, metric) {
  if (!metric) {
    return `<div class="reading-row"><span class="reading-label">${metricLabel(sensorType)}</span><span class="reading-value">&ndash;&ndash;</span></div>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  return `<div class="reading-row${flagged ? " flagged" : ""}">
    <span class="reading-label">${metricLabel(sensorType)}</span>
    <meter class="reading-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${metric.latest}"></meter>
    <span class="reading-value">${metric.latest}<span class="unit">${metric.unit}</span></span>
  </div>`;
}

function renderReadingPanel(slope) {
  const rows = SENSOR_TYPES.map((sensorType) => readingRow(sensorType, slope.metrics[sensorType])).join("");
  return `<div class="reading-panel">
    <h3>${slope.site_id}</h3>
    ${rows}
  </div>`;
}

function renderReadingPanelGrid(slopes) {
  const grid = document.getElementById("reading-panel-grid");
  grid.innerHTML = slopes.map(renderReadingPanel).join("");
}

function renderAlertBanner(slopes) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const slope of slopes) {
    for (const alert of slope.alerts || []) {
      active.push(`${slope.site_id}: ${ALERT_LABELS[alert.key] || alert.key}`);
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#5a7690" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#5a7690" }, grid: { color: "#c9dcec" } },
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
    const [slopesResp, health, backendStats] = await Promise.all([
      fetch("/api/slopes").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const slopes = slopesResp.slopes || [];
    renderRiskGaugeGrid(slopes);
    renderReadingPanelGrid(slopes);
    renderAlertBanner(slopes);
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
