const READING_KEYS = ["turbidity_ntu", "ph_level", "chlorine_ppm", "flow_rate_lps", "pressure_bar"];
const PLANT_IDS = ["plant-1", "plant-2"];

// API origin is carried as a query parameter on this script's own src
// (?apiBase=...), substituted with the real API Gateway origin at S3 upload
// time. In local development the placeholder is left untouched and the empty
// base keeps same-origin fetches working, since the dashboard is served from
// the same host as its API there.
const apiOrigin = (() => {
  const el = document.getElementById("dashboard-script") || document.currentScript;
  try {
    const v = new URL(el.src).searchParams.get("apiBase");
    return v && !v.startsWith("__API_BASE__") ? v.replace(/\/$/, "") : "";
  } catch {
    return "";
  }
})();

const READING_TITLES = {
  turbidity_ntu: "Turbidity",
  ph_level: "pH Level",
  chlorine_ppm: "Chlorine",
  flow_rate_lps: "Flow Rate",
  pressure_bar: "Pressure",
};

// Alert display text is a small local map -- the frontend does not call
// /api/thresholds directly (that proxy exists for API completeness and is
// covered by its own backend test; see readme.txt).
const FAULT_TITLES = {
  turbidity_alert: "Turbidity alert",
  under_chlorination: "Under-chlorination",
  low_pressure_fault: "Low pressure fault",
  acidic_violation: "Acidic violation",
};

const SERIES_COLOURS = { "plant-1": "#1c6ea4", "plant-2": "#b3402b" };
const seriesCharts = {};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from fog/alerts.js.
const METER_BOUNDS = {
  turbidity_ntu: { lo: 0, hi: 15 },
  ph_level: { lo: 5.5, hi: 9 },
  chlorine_ppm: { lo: 0, hi: 3 },
  flow_rate_lps: { lo: 5, hi: 120 },
  pressure_bar: { lo: 0.5, hi: 8 },
};

function readingTitle(sensorType) {
  return READING_TITLES[sensorType] || sensorType;
}

function plantCell(sensorType, metric) {
  if (!metric) {
    return `<td class="reading-cell" data-site-empty="true"><span class="empty">&ndash;&ndash;</span></td>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const { lo, hi } = METER_BOUNDS[sensorType];
  const alertText = flagged ? metric.alerts.map((a) => FAULT_TITLES[a] || a).join(", ") : "";
  return `<td class="reading-cell${flagged ? " flagged" : ""}">
    <span class="value">${metric.latest}<span class="unit">${metric.unit}</span></span>
    <meter class="cell-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${metric.latest}"></meter>
    ${flagged ? `<span class="cell-alert">${alertText}</span>` : ""}
  </td>`;
}

// Rows = readings, columns = plants, so each row lets you compare the same
// reading across both plants at a glance.
function paintReadingsGrid(plants) {
  const bySite = Object.fromEntries(plants.map((p) => [p.site_id, p]));
  const body = document.getElementById("matrix-body");

  body.innerHTML = READING_KEYS.map((sensorType) => {
    const cells = PLANT_IDS.map((siteId) => plantCell(sensorType, (bySite[siteId] || {}).metrics && bySite[siteId].metrics[sensorType])).join("");
    return `<tr>
      <th scope="row">${readingTitle(sensorType)}<span class="unit-tag">${METER_BOUNDS[sensorType].lo}&ndash;${METER_BOUNDS[sensorType].hi} ${(bySite[PLANT_IDS[0]] && bySite[PLANT_IDS[0]].metrics[sensorType] && bySite[PLANT_IDS[0]].metrics[sensorType].unit) || ""}</span></th>
      ${cells}
    </tr>`;
  }).join("");
}

function paintPlantChips(plants) {
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

function paintAlertBar(plants) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const plant of plants) {
    for (const alert of plant.alerts || []) {
      active.push(`${plant.site_id}: ${FAULT_TITLES[alert.key] || alert.key}`);
    }
  }
  if (active.length === 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.textContent = `${active.length} active alert(s) -- ${active.join(" | ")}`;
}

function paintFlowTrack(health) {
  const strip = document.getElementById("health-strip");
  const stages = [
    ["Gateway", health.gateway],
    ["Queue", health.queue],
    ["Lambda", health.lambda],
    ["Pipeline", health.pipeline],
  ];
  strip.innerHTML = stages
    .map(([label, ok], i) =>
      (i ? '<span class="flow-link" aria-hidden="true"></span>' : "") +
      `<span class="flow-node ${ok ? "up" : "down"}"><span class="flow-led"></span>${label}</span>`)
    .join("");
}

function paintStoreLine(backendStats) {
  const el = document.getElementById("backend-stats");
  const queueInfo = backendStats.queue
    ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight`
    : "queue unknown";
  el.textContent = `${backendStats.items_in_table ?? 0} records stored -- ${queueInfo}`;
}

async function pullSeries(sensorType) {
  const res = await fetch(`${apiOrigin}/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function drawSeriesChart(sensorType, items) {
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
    borderColor: SERIES_COLOURS[siteId] || "#999",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));

  if (seriesCharts[sensorType]) {
    seriesCharts[sensorType].data.datasets = datasets;
    seriesCharts[sensorType].update();
    return;
  }

  seriesCharts[sensorType] = new Chart(canvas, {
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

function buildChartCards() {
  const grid = document.getElementById("trend-grid");
  if (grid.childElementCount === 0) {
    grid.innerHTML = READING_KEYS.map(
      (sensorType) => `<div class="trend-card">
        <h4>${readingTitle(sensorType)}</h4>
        <canvas id="trend-${sensorType}" width="260" height="140"></canvas>
      </div>`
    ).join("");
  }
}

async function refreshCycle() {
  try {
    const [plantsResp, health, backendStats] = await Promise.all([
      fetch(`${apiOrigin}/api/plants`).then((r) => r.json()),
      fetch(`${apiOrigin}/api/health`).then((r) => r.json()),
      fetch(`${apiOrigin}/api/backend-stats`).then((r) => r.json()),
    ]);

    const plants = plantsResp.plants || [];
    paintReadingsGrid(plants);
    paintPlantChips(plants);
    paintAlertBar(plants);
    paintFlowTrack(health);
    paintStoreLine(backendStats);

    buildChartCards();
    for (const sensorType of READING_KEYS) {
      const trend = await pullSeries(sensorType);
      drawSeriesChart(sensorType, trend.items || []);
    }
  } catch (e) {
    // backend not ready yet; next refreshCycle retries
  }
}

refreshCycle();
setInterval(refreshCycle, 2500);
