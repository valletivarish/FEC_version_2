// The S3 deploy step sed-replaces __API_BASE__ in the data-api-base
// attribute on this file's own <script> tag. document.currentScript only
// points at that tag during this file's initial synchronous evaluation, so
// the value is captured once here at the top, never inside a callback. An
// unreplaced placeholder (the local Docker profile) means same-origin
// requests, i.e. an empty prefix.
const API_BASE = (() => {
  const declared = document.currentScript && document.currentScript.dataset.apiBase;
  return declared && !declared.startsWith("__") ? declared.replace(/\/$/, "") : "";
})();

const METRIC_META = {
  temperature_c: { label: "Temperature", unit: "C" },
  humidity_pct: { label: "Humidity", unit: "%" },
  smoke_density_ppm: { label: "Smoke Density", unit: "ppm" },
  wind_speed_kmh: { label: "Wind Speed", unit: "km/h" },
  soil_moisture_pct: { label: "Soil Moisture", unit: "%" },
};

const METRIC_ORDER = ["temperature_c", "humidity_pct", "smoke_density_ppm", "wind_speed_kmh", "soil_moisture_pct"];

const ALERT_TEXT = {
  extreme_heat: "Extreme heat",
  fire_detected: "Fire detected",
  high_wind_warning: "High wind warning",
  drought_risk: "Drought risk",
};

const RISK_BANDS = [
  { band: "safe", label: "Safe", color: "#4a9c6d" },
  { band: "elevated", label: "Elevated", color: "#8fae3f" },
  { band: "watch", label: "Watch", color: "#d9a63b" },
  { band: "warning", label: "Warning", color: "#e0762e" },
  { band: "extreme", label: "Extreme", color: "#d43b2f" },
];

const STATION_COLORS = { "station-1": "#e8622c", "station-2": "#d9a63b" };

let smokeTrendChart = null;

function describeAlert(key) {
  return ALERT_TEXT[key] || key.replace(/_/g, " ");
}

// Renders the primary derived-metric visualization: a radial dial (SVG arc)
// for the 0-4 fire-risk score, swept 270 degrees so the fill amount reads
// as "how far around the danger arc are we" rather than a full circle
// (which would read more like a raw percentage than a discrete 0-4 score).
function riskDialSvg(score) {
  const clamped = Math.max(0, Math.min(4, score));
  const info = RISK_BANDS[clamped];
  const startAngle = 135;
  const sweep = 270;
  const fraction = clamped / 4;
  const cx = 74, cy = 74, r = 60;

  function point(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(fromDeg, toDeg) {
    const start = point(fromDeg);
    const end = point(toDeg);
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  const trackPath = arcPath(startAngle, startAngle + sweep);
  const fillPath = fraction > 0 ? arcPath(startAngle, startAngle + sweep * fraction) : null;

  return `
    <svg class="risk-dial" viewBox="0 0 148 148" role="img" aria-label="Fire risk index ${clamped} of 4, ${info.label}">
      <path d="${trackPath}" fill="none" stroke="#3a2e1e" stroke-width="14" stroke-linecap="round" />
      ${fillPath ? `<path d="${fillPath}" fill="none" stroke="${info.color}" stroke-width="14" stroke-linecap="round" />` : ""}
      <text x="74" y="80" text-anchor="middle" font-size="34" font-weight="800" fill="#e8ddc9">${clamped}</text>
      <text x="74" y="100" text-anchor="middle" font-size="10" fill="#a89b82" letter-spacing="1">OF 4</text>
    </svg>`;
}

function detailTileHtml(sensorType, metric) {
  const meta = METRIC_META[sensorType];
  if (!metric) {
    return `<div class="detail-tile"><div class="detail-label">${meta.label}</div><div class="detail-value">&ndash;</div></div>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  return `
    <div class="detail-tile${flagged ? " flagged" : ""}">
      <div class="detail-label">${meta.label}</div>
      <div class="detail-value">${metric.latest}<span class="unit">${meta.unit}</span></div>
      <div class="detail-range">${metric.min}&ndash;${metric.max} avg ${metric.avg}</div>
    </div>`;
}

function stationCardHtml(station) {
  const flagged = station.alerts.length > 0;
  const hasData = Object.keys(station.metrics).length > 0;
  const clamped = Math.max(0, Math.min(4, station.fire_risk_index));
  const info = RISK_BANDS[clamped];

  return `
    <article class="station-card${flagged ? " has-alert" : ""}">
      <div class="station-head">
        <h3 class="station-name">${station.site_id}</h3>
        <span class="station-status${flagged ? " alert" : ""}">${flagged ? station.alerts.map((a) => describeAlert(a.key)).join(", ") : "nominal"}</span>
      </div>
      <div class="risk-dial-wrap">
        ${riskDialSvg(station.fire_risk_index)}
        <div class="risk-dial-caption">
          <span class="risk-band-label risk-band-${info.band}">${info.label}</span>
          <span class="risk-hint">Derived from temperature, smoke, wind and soil moisture window averages</span>
        </div>
      </div>
      ${hasData
        ? `<div class="detail-grid">${METRIC_ORDER.map((m) => detailTileHtml(m, station.metrics[m])).join("")}</div>`
        : `<div class="detail-grid"><div class="detail-empty">awaiting telemetry</div></div>`}
    </article>`;
}

function paintSummaryReadout(stations, backendStats) {
  const flaggedCount = stations.reduce((sum, s) => sum + s.alerts.length, 0);
  const maxRisk = stations.reduce((max, s) => Math.max(max, s.fire_risk_index), 0);
  const box = document.getElementById("summary-readout");
  box.innerHTML = `
    <div><dt>Stations</dt><dd>${stations.length}</dd></div>
    <div><dt>Active Alerts</dt><dd>${flaggedCount}</dd></div>
    <div><dt>Peak Risk</dt><dd>${maxRisk} / 4</dd></div>
    <div><dt>Records Archived</dt><dd>${backendStats.items_in_table}</dd></div>`;
}

function paintAlertBanner(stations) {
  const banner = document.getElementById("alert-banner");
  const flagged = [];
  for (const station of stations) {
    for (const alert of station.alerts) flagged.push(`${station.site_id}: ${describeAlert(alert.key)}`);
  }
  if (flagged.length === 0) {
    banner.className = "alert-banner calm";
    banner.textContent = "All stations within normal conditions";
    return;
  }
  banner.className = "alert-banner hot";
  banner.textContent = flagged.join("   |   ");
}

function paintPipelineFooter(health) {
  const footer = document.getElementById("pipeline-footer");
  const item = (label, ok) => `<span class="${ok ? "" : "down"}">${label}: ${ok ? "up" : "down"}</span>`;
  footer.innerHTML = [
    item("fog gateway", health.gateway),
    item("queue", health.queue),
    item("lambda", health.lambda),
    item("pipeline", health.pipeline),
    `<span>freshest window: ${health.freshest_age_seconds === null ? "n/a" : health.freshest_age_seconds.toFixed(1) + "s ago"}</span>`,
  ].join("");
}

function ensureSmokeTrendChart() {
  if (smokeTrendChart) return smokeTrendChart;
  const ctx = document.getElementById("smoke-trend-chart");
  smokeTrendChart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#a89b82" } },
      },
      scales: {
        x: { ticks: { color: "#a89b82", font: { size: 10 } }, grid: { color: "#3a2e1e" } },
        y: { ticks: { color: "#a89b82", font: { size: 10 } }, grid: { color: "#3a2e1e" }, title: { display: true, text: "ppm", color: "#a89b82" } },
      },
    },
  });
  return smokeTrendChart;
}

async function refreshSmokeTrend(siteIds) {
  const chart = ensureSmokeTrendChart();
  const series = await Promise.all(siteIds.map(async (siteId) => {
    const res = await fetch(`${API_BASE}/api/readings?sensor_type=smoke_density_ppm&site_id=${siteId}&limit=30`);
    const data = await res.json();
    return { siteId, items: data.items };
  }));

  const longest = series.reduce((a, b) => (a.items.length > b.items.length ? a : b), series[0]);
  chart.data.labels = longest.items.map((i) => new Date(i.window_end).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }));
  chart.data.datasets = series.map((s) => ({
    label: s.siteId,
    data: s.items.map((i) => i.avg),
    borderColor: STATION_COLORS[s.siteId] || "#e8622c",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));
  chart.update();
}

async function poll() {
  try {
    const [stationData, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/stations`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const stations = stationData.stations;
    paintSummaryReadout(stations, backendStats);
    paintAlertBanner(stations);
    document.getElementById("station-grid").innerHTML = stations.map(stationCardHtml).join("");
    paintPipelineFooter(health);
    await refreshSmokeTrend(stations.map((s) => s.site_id));
  } catch (err) {
    // backend not ready yet; next poll retries
  }
}

poll();
setInterval(poll, 2500);
