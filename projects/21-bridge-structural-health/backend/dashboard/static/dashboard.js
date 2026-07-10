const POLL_INTERVAL_MS = 2500;

const SENSOR_META = {
  strain_microstrain: { label: "Strain", lo: 0, hi: 2000 },
  deck_vibration_mms: { label: "Deck Vibration", lo: 0, hi: 30 },
  tilt_angle_deg: { label: "Tilt Angle", lo: 0, hi: 5 },
  traffic_load_tonnes: { label: "Traffic Load", lo: 0, hi: 200 },
  expansion_joint_mm: { label: "Expansion Joint", lo: -50, hi: 50 },
};

const SENSOR_ORDER = Object.keys(SENSOR_META);
const SPAN_LABELS = { "span-a": "Span A", "span-b": "Span B" };

let rulesLoaded = false;
let rulesByType = {};
let trendChart = null;

function fmt(value, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "--";
}

function renderHealth(health) {
  const pills = [
    ["Fog Gateway", health.gateway],
    ["SQS Queue", health.queue],
    ["Lambda", health.lambda],
    ["Pipeline Fresh", health.pipeline],
  ];
  document.getElementById("health-pills").innerHTML = pills
    .map(([label, ok]) => `<span class="pill"><span class="dot ${ok ? "ok" : "bad"}"></span>${label}</span>`)
    .join("");
}

function renderPipelineStages() {
  const stages = ["Sensors", "Fog Node", "SQS Queue", "Lambda", "DynamoDB", "Dashboard"];
  document.getElementById("pipeline-stages").innerHTML = stages
    .map((stage, i) => `<span class="stage">${stage}</span>${i < stages.length - 1 ? '<span class="stage-arrow">&rarr;</span>' : ""}`)
    .join("");
}

function renderBackendStats(stats) {
  const waiting = stats.queue ? stats.queue.waiting : "--";
  const inFlight = stats.queue ? stats.queue.in_flight : "--";
  document.getElementById("backend-stats").innerHTML = `
    <div class="stat"><span class="stat-label">Queue Waiting</span><span class="stat-value">${waiting}</span></div>
    <div class="stat"><span class="stat-label">Queue In-flight</span><span class="stat-value">${inFlight}</span></div>
    <div class="stat"><span class="stat-label">Items in Table</span><span class="stat-value">${stats.items_in_table}</span></div>
  `;
}

function integrityBandClass(band) {
  return band ? `band-${band}` : "";
}

function renderAlerts(readings) {
  const fired = [];
  for (const sensorType of SENSOR_ORDER) {
    const reading = readings[sensorType];
    if (reading && Array.isArray(reading.alerts)) {
      for (const key of reading.alerts) fired.push({ sensorType, key });
    }
  }
  if (fired.length === 0) {
    return '<span class="no-alerts">No active alerts</span>';
  }
  return fired
    .map(({ sensorType, key }) => {
      const rule = (rulesByType[sensorType] || []).find((r) => r.key === key);
      const title = rule ? `${sensorType}: ${rule.field} ${rule.op.replace("_", " ")} ${rule.limit}` : key;
      return `<span class="alert-badge" title="${title}"><span class="dot bad"></span>${key.replace(/_/g, " ")}</span>`;
    })
    .join("");
}

function renderDetailRows(readings) {
  return SENSOR_ORDER.map((sensorType) => {
    const meta = SENSOR_META[sensorType];
    const reading = readings[sensorType];
    const latest = reading ? reading.latest : null;
    const unit = reading ? reading.unit : "";
    const updated = reading ? reading.window_end : null;
    const meterValue = latest === null || latest === undefined ? meta.lo : Math.min(Math.max(latest, meta.lo), meta.hi);
    return `
      <tr>
        <td class="sensor-name">${meta.label}</td>
        <td class="sensor-value">${latest === null || latest === undefined ? "--" : fmt(latest)} ${unit}</td>
        <td><meter min="${meta.lo}" max="${meta.hi}" value="${meterValue}"></meter></td>
        <td class="sensor-value">${updated ? new Date(updated).toLocaleTimeString() : "--"}</td>
      </tr>`;
  }).join("");
}

function renderSpanCard(span) {
  const index = span.structural_integrity_index;
  const band = span.integrity_band;
  return `
    <div class="span-card">
      <h2>${SPAN_LABELS[span.site_id] || span.site_id} <span class="site-badge">${span.site_id}</span></h2>
      <div class="integrity-block">
        <div class="integrity-label">
          <span>Structural Integrity Index</span>
          <span class="integrity-value">${index === null || index === undefined ? "--" : index + "%"}</span>
        </div>
        <progress class="integrity-bar ${integrityBandClass(band)}" max="100" value="${index || 0}"></progress>
        <div class="integrity-band">${band || "pending"}</div>
      </div>
      <div class="alerts-row">${renderAlerts(span.readings)}</div>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead><tr><th>Sensor</th><th>Latest</th><th>Range</th><th>Updated</th></tr></thead>
          <tbody>${renderDetailRows(span.readings)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSpans(spans) {
  document.getElementById("span-grid").innerHTML = spans.map(renderSpanCard).join("");
}

function ensureTrendChart() {
  if (trendChart) return trendChart;
  const ctx = document.getElementById("strain-trend-chart");
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "span-a", data: [], borderColor: "#3d5a73", backgroundColor: "rgba(61,90,115,0.15)", tension: 0.25 },
        { label: "span-b", data: [], borderColor: "#8b8d8a", backgroundColor: "rgba(139,141,138,0.15)", tension: 0.25 },
      ],
    },
    options: {
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: true } },
    },
  });
  return trendChart;
}

async function refreshTrendChart() {
  try {
    const [respA, respB] = await Promise.all([
      fetch("/api/readings?sensor_type=strain_microstrain&site_id=span-a&limit=20"),
      fetch("/api/readings?sensor_type=strain_microstrain&site_id=span-b&limit=20"),
    ]);
    const [dataA, dataB] = await Promise.all([respA.json(), respB.json()]);
    const chart = ensureTrendChart();
    chart.data.labels = dataA.items.map((item) => new Date(item.window_end).toLocaleTimeString());
    chart.data.datasets[0].data = dataA.items.map((item) => item.avg);
    chart.data.datasets[1].data = dataB.items.map((item) => item.avg);
    chart.update("none");
  } catch (e) {
    // fog/dashboard may not have produced a window yet; next tick retries
  }
}

async function loadRulesOnce() {
  if (rulesLoaded) return;
  try {
    const resp = await fetch("/api/thresholds");
    if (resp.ok) {
      rulesByType = await resp.json();
      rulesLoaded = true;
    }
  } catch (e) {
    // fog unreachable yet; rulesLoaded stays false so the next tick retries
  }
}

async function pollOnce() {
  try {
    const [spansResp, healthResp, statsResp] = await Promise.all([
      fetch("/api/spans"),
      fetch("/api/health"),
      fetch("/api/backend-stats"),
    ]);
    const [spans, health, stats] = await Promise.all([spansResp.json(), healthResp.json(), statsResp.json()]);
    await loadRulesOnce();
    renderSpans(spans.spans);
    renderHealth(health);
    renderBackendStats(stats);
    await refreshTrendChart();
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

renderPipelineStages();
pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
