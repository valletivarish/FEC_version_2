const POLL_INTERVAL_MS = 2500;

const SENSOR_META = {
  engine_room_temp_c: { label: "Engine Room Temp", lo: 20, hi: 90 },
  fuel_consumption_lph: { label: "Fuel Consumption", lo: 0, hi: 500 },
  ballast_water_level_pct: { label: "Ballast Water Level", lo: 0, hi: 100 },
  hull_vibration_mm: { label: "Hull Vibration", lo: 0, hi: 20 },
  passenger_count: { label: "Passenger Count", lo: 0, hi: 3000 },
};

const SENSOR_ORDER = Object.keys(SENSOR_META);
const VESSEL_IDS = ["vessel-a", "vessel-b"];
const VESSEL_LABELS = { "vessel-a": "Vessel A", "vessel-b": "Vessel B" };

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

function alertTitle(sensorType, key) {
  const rule = (rulesByType[sensorType] || []).find((r) => r.key === key);
  return rule ? `${sensorType}: ${rule.field} ${rule.op} ${rule.limit}` : key;
}

function renderReadingCell(sensorType, reading) {
  const meta = SENSOR_META[sensorType];
  if (!reading) {
    return `<td class="reading-cell"><span class="value-num">--</span></td>`;
  }
  const value = reading.latest;
  const clamped = Math.min(Math.max(value, meta.lo), meta.hi);
  const alerts = (reading.alerts || [])
    .map((key) => `<span class="alert-badge" title="${alertTitle(sensorType, key)}">${key.replace(/_/g, " ")}</span>`)
    .join("");
  const noAlert = reading.alerts && reading.alerts.length === 0
    ? '<span class="no-alert-tag">nominal</span>'
    : "";
  return `
    <td class="reading-cell">
      <div class="reading-value">
        <span class="value-num">${fmt(value)}</span>
        <span class="value-unit">${reading.unit || ""}</span>
      </div>
      <meter min="${meta.lo}" max="${meta.hi}" value="${clamped}"></meter>
      ${alerts}${noAlert}
    </td>`;
}

function renderConsole(vessels) {
  const bySite = {};
  for (const vessel of vessels) bySite[vessel.site_id] = vessel.readings;

  const rows = SENSOR_ORDER.map((sensorType) => {
    const meta = SENSOR_META[sensorType];
    const cellA = renderReadingCell(sensorType, (bySite["vessel-a"] || {})[sensorType]);
    const cellB = renderReadingCell(sensorType, (bySite["vessel-b"] || {})[sensorType]);
    return `<tr><td class="reading-name">${meta.label}</td>${cellA}${cellB}</tr>`;
  });
  document.getElementById("console-body").innerHTML = rows.join("");
}

function renderVoyageLog(entries) {
  const el = document.getElementById("voyage-log");
  if (!entries || entries.length === 0) {
    el.innerHTML = '<li class="log-empty">No voyage log entries yet -- waiting for the first aggregation window.</li>';
    return;
  }
  el.innerHTML = entries
    .map((entry) => {
      const label = (SENSOR_META[entry.sensor_type] || {}).label || entry.sensor_type;
      const alertText = entry.alerts && entry.alerts.length
        ? `<span class="log-alert">${entry.alerts.join(", ").replace(/_/g, " ")}</span>`
        : "";
      return `
        <li>
          <span class="log-time">${new Date(entry.window_end).toLocaleTimeString()}</span>
          <span class="log-vessel">${VESSEL_LABELS[entry.site_id] || entry.site_id}</span>
          <span class="log-sensor">${label}</span>
          <span class="log-value">avg ${fmt(entry.avg)} ${entry.unit || ""} (min ${fmt(entry.min)} / max ${fmt(entry.max)})</span>
          ${alertText}
        </li>`;
    })
    .join("");
}

function ensureTrendChart() {
  if (trendChart) return trendChart;
  const ctx = document.getElementById("trend-chart");
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "vessel-a", data: [], borderColor: "#0e6e6a", backgroundColor: "rgba(14,110,106,0.15)", tension: 0.25 },
        { label: "vessel-b", data: [], borderColor: "#9c7a34", backgroundColor: "rgba(156,122,52,0.15)", tension: 0.25 },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: true } },
    },
  });
  return trendChart;
}

async function refreshTrendChart() {
  try {
    const [respA, respB] = await Promise.all([
      fetch("/api/readings?sensor_type=engine_room_temp_c&site_id=vessel-a&limit=20"),
      fetch("/api/readings?sensor_type=engine_room_temp_c&site_id=vessel-b&limit=20"),
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
    const [vesselsResp, healthResp, statsResp, logResp] = await Promise.all([
      fetch("/api/vessels"),
      fetch("/api/health"),
      fetch("/api/backend-stats"),
      fetch("/api/voyage-log?limit=25"),
    ]);
    const [vessels, health, stats, log] = await Promise.all([
      vesselsResp.json(), healthResp.json(), statsResp.json(), logResp.json(),
    ]);
    await loadRulesOnce();
    renderConsole(vessels.vessels);
    renderHealth(health);
    renderBackendStats(stats);
    renderVoyageLog(log.entries);
    await refreshTrendChart();
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

renderPipelineStages();
pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
