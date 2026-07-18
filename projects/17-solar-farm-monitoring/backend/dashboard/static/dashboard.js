// API origin: sed-substituted into the app script tag's data-api-base at S3 upload time; unset means same-origin.
const API_BASE = (() => {
  const el = document.getElementById("app");
  const v = (el && el.dataset.apiBase) || "";
  return v.startsWith("__API_BASE__") ? "" : v.replace(/\/$/, "");
})();

const POLL_INTERVAL_MS = 2500;

const SENSOR_META = {
  irradiance_wm2: { label: "Irradiance", lo: 0, hi: 1200 },
  panel_temp_c: { label: "Panel Temp", lo: 10, hi: 80 },
  inverter_output_kw: { label: "Inverter Output", lo: 0, hi: 150 },
  dc_voltage_v: { label: "DC Voltage", lo: 300, hi: 500 },
  soiling_index_pct: { label: "Soiling Index", lo: 0, hi: 60 },
};
const SENSOR_ORDER = Object.keys(SENSOR_META);

function setDot(id, ok) {
  const el = document.getElementById(id);
  el.classList.remove("ok", "down");
  el.classList.add(ok ? "ok" : "down");
  const lamp = el.closest(".health-lamp");
  if (lamp) lamp.classList.toggle("is-down", !ok);
}

function formatNumber(value, digits) {
  return typeof value === "number" ? value.toFixed(digits) : "--";
}

function renderReadingRow(sensorType, reading) {
  const meta = SENSOR_META[sensorType];
  if (!reading) {
    return `
      <div class="reading-row">
        <span class="reading-label">${meta.label}</span>
        <meter class="reading-meter" min="${meta.lo}" max="${meta.hi}" value="${meta.lo}"></meter>
        <span class="reading-value no-data">no data</span>
      </div>`;
  }
  return `
    <div class="reading-row">
      <span class="reading-label">${meta.label}</span>
      <meter class="reading-meter" min="${meta.lo}" max="${meta.hi}" value="${reading.latest}"></meter>
      <span class="reading-value">${formatNumber(reading.latest, 1)}<span class="unit">${reading.unit}</span></span>
    </div>`;
}

function renderAlertTags(readings) {
  const alerts = [];
  for (const sensorType of SENSOR_ORDER) {
    const reading = readings[sensorType];
    if (reading && Array.isArray(reading.alerts)) {
      for (const key of reading.alerts) alerts.push(key);
    }
  }
  if (alerts.length === 0) {
    return `<ul class="alert-tags clear"></ul>`;
  }
  const tags = alerts.map((key) => `<li class="alert-tag">${key}</li>`).join("");
  return `<ul class="alert-tags">${tags}</ul>`;
}

function renderArrayCard(array) {
  const indexText = typeof array.efficiency_index === "number"
    ? `index ${array.efficiency_index.toFixed(1)}`
    : "index pending";

  let updated = "no windows yet";
  for (const sensorType of SENSOR_ORDER) {
    const reading = array.readings[sensorType];
    if (reading && reading.window_end) {
      updated = new Date(reading.window_end).toLocaleTimeString();
      break;
    }
  }

  const rows = SENSOR_ORDER.map((sensorType) => renderReadingRow(sensorType, array.readings[sensorType])).join("");

  return `
    <article class="array-card">
      <div class="array-card-head">
        <div>
          <h3 class="array-name">${array.site_id}</h3>
          <p class="array-updated">latest window: ${updated}</p>
        </div>
        <span class="array-index">${indexText}</span>
      </div>
      ${renderAlertTags(array.readings)}
      <div class="reading-rows">${rows}</div>
    </article>`;
}

function renderHeatmapRow(array) {
  const cells = array.history.length
    ? array.history.map((point) => {
        const band = point.efficiency_index >= 80 ? "excellent"
          : point.efficiency_index >= 60 ? "good"
          : point.efficiency_index >= 40 ? "fair"
          : point.efficiency_index >= 20 ? "poor"
          : "critical";
        const time = new Date(point.window_end).toLocaleTimeString();
        return `<span class="heatmap-cell band-${band}" title="${array.site_id} at ${time}">${point.efficiency_index.toFixed(0)}</span>`;
      }).join("")
    : `<span class="heatmap-cell">--</span>`;

  return `
    <div class="heatmap-row">
      <span class="heatmap-row-label">${array.site_id}</span>
      <div class="heatmap-cells">${cells}</div>
    </div>`;
}

async function refreshArrays() {
  const resp = await fetch(API_BASE + "/api/arrays");
  const body = await resp.json();
  document.getElementById("heatmap-grid").innerHTML = body.arrays.map(renderHeatmapRow).join("");
  document.getElementById("arrays-section").innerHTML =
    `<div class="arrays-grid">${body.arrays.map(renderArrayCard).join("")}</div>`;
}

async function refreshHealth() {
  const resp = await fetch(API_BASE + "/api/health");
  const body = await resp.json();
  setDot("dot-gateway", !!body.gateway);
  setDot("dot-queue", !!body.queue);
  setDot("dot-lambda", !!body.lambda);
  setDot("dot-pipeline", !!body.pipeline);
  const freshness = typeof body.freshest_age_seconds === "number"
    ? `${body.freshest_age_seconds.toFixed(1)}s ago`
    : "no data yet";
  document.getElementById("stat-freshness").textContent = `freshest window: ${freshness}`;
}

async function refreshBackendStats() {
  const resp = await fetch(API_BASE + "/api/backend-stats");
  const body = await resp.json();
  const queue = body.queue;
  document.getElementById("stat-queue-waiting").textContent =
    `queue waiting: ${queue ? queue.waiting : "--"}`;
  document.getElementById("stat-queue-inflight").textContent =
    `in flight: ${queue ? queue.in_flight : "--"}`;
  document.getElementById("stat-items").textContent = `records stored: ${body.items_in_table}`;
}

let rulesLoaded = false;
async function loadRulesOnce() {
  if (rulesLoaded) return;
  try {
    const resp = await fetch(API_BASE + "/api/thresholds");
    const rules = await resp.json();
    const groups = Object.entries(rules).map(([sensorType, ruleList]) => {
      const lines = ruleList.map((rule) => `<p class="rule-line">${rule.field} ${rule.op} ${rule.limit} &rarr; ${rule.key}</p>`).join("");
      return `<div class="rule-group"><p class="rule-group-title">${sensorType}</p>${lines}</div>`;
    });
    document.getElementById("rules-list").innerHTML = groups.join("");
    rulesLoaded = true;
  } catch (err) {
    document.getElementById("rules-list").innerHTML = `<p class="loading-note">Rules unavailable: gateway unreachable.</p>`;
  }
}

let trendChart = null;
async function refreshTrendChart() {
  const [array1, array2] = await Promise.all([
    fetch(API_BASE + "/api/readings?sensor_type=inverter_output_kw&site_id=array-1&limit=20").then((r) => r.json()),
    fetch(API_BASE + "/api/readings?sensor_type=inverter_output_kw&site_id=array-2&limit=20").then((r) => r.json()),
  ]);

  const labels = array1.items.map((item) => new Date(item.window_end).toLocaleTimeString());
  const data1 = array1.items.map((item) => item.avg);
  const data2 = array2.items.map((item) => item.avg);

  if (!trendChart) {
    const ctx = document.getElementById("output-trend-chart").getContext("2d");
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "array-1 (kW)", data: data1, borderColor: "#1f7aad", backgroundColor: "transparent", tension: 0.25 },
          { label: "array-2 (kW)", data: data2, borderColor: "#b8860b", backgroundColor: "transparent", tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  } else {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = data1;
    trendChart.data.datasets[1].data = data2;
    trendChart.update("none");
  }
}

async function pollOnce() {
  try {
    await Promise.all([refreshArrays(), refreshHealth(), refreshBackendStats(), refreshTrendChart()]);
    await loadRulesOnce();
  } catch (err) {
    console.error("dashboard poll failed", err);
  }
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
