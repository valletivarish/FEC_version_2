const SENSOR_TYPES = ["motor_temp_c", "door_cycle_count", "cab_vibration_mm", "load_weight_kg", "travel_speed_mps"];
const SITE_IDS = ["tower-a", "tower-b"];

const METRIC_LABELS = {
  motor_temp_c: "Motor Temp",
  door_cycle_count: "Door Cycles",
  cab_vibration_mm: "Cab Vibration",
  load_weight_kg: "Load Weight",
  travel_speed_mps: "Travel Speed",
};

const TOWER_LABELS = { "tower-a": "Tower A", "tower-b": "Tower B" };

// Alert display text map; the frontend does not call /api/thresholds directly.
const ALERT_LABELS = {
  motor_overheat_risk: "Motor overheat risk",
  ride_quality_fault: "Ride quality fault",
  overload_warning: "Overload warning",
  stall_suspected: "Stall suspected",
};

// Axis bounds each <meter> is drawn against, not a decision threshold.
const AXIS_RANGE = {
  motor_temp_c: { lo: 30, hi: 110 },
  door_cycle_count: { lo: 0, hi: 500 },
  cab_vibration_mm: { lo: 0, hi: 15 },
  load_weight_kg: { lo: 0, hi: 1200 },
  travel_speed_mps: { lo: 0, hi: 4 },
};

const TREND_COLORS = { "tower-a": "#ffcc00", "tower-b": "#5cc9ff" };
const trendCharts = {};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

// One row per sensor type inside a tower card: label, latest value, native <meter>, and an alert badge when flagged.
function readingRow(sensorType, metric) {
  const range = AXIS_RANGE[sensorType];
  if (!metric) {
    return `<div class="reading-row" data-empty="true">
      <div class="reading-label">${metricLabel(sensorType)}<span class="unit-tag">${range.lo}&ndash;${range.hi}</span></div>
      <div class="reading-value"><span class="empty">&ndash;&ndash;</span></div>
    </div>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const alertText = flagged ? metric.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
  return `<div class="reading-row${flagged ? " flagged" : ""}">
    <div class="reading-label">${metricLabel(sensorType)}<span class="unit-tag">${range.lo}&ndash;${range.hi} ${metric.unit || ""}</span></div>
    <div class="reading-value">${metric.latest}<span class="unit">${metric.unit || ""}</span></div>
    <meter class="reading-meter${flagged ? " danger" : ""}" min="${range.lo}" max="${range.hi}" value="${metric.latest}"></meter>
    ${flagged ? `<span class="reading-badge">${alertText}</span>` : ""}
  </div>`;
}

function towerCard(tower) {
  const label = TOWER_LABELS[tower.site_id] || tower.site_id;
  const statusText = tower.nominal ? "Nominal" : `${tower.alerts.length} alert(s)`;
  const rows = SENSOR_TYPES.map((sensorType) => readingRow(sensorType, tower.metrics[sensorType])).join("");
  return `<article class="tower-card${tower.nominal ? "" : " has-alert"}">
    <header class="tower-card-head">
      <h3>${label}</h3>
      <span class="tower-status${tower.nominal ? "" : " alert"}"><span class="swatch"></span>${statusText}</span>
    </header>
    <div class="reading-list">${rows}</div>
  </article>`;
}

function renderTowers(towers) {
  const grid = document.getElementById("tower-grid");
  const bySite = Object.fromEntries(towers.map((t) => [t.site_id, t]));
  grid.innerHTML = SITE_IDS.map((siteId) => towerCard(bySite[siteId] || { site_id: siteId, metrics: {}, alerts: [], nominal: true })).join("");
}

function renderAlertBanner(towers) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const tower of towers) {
    for (const alert of tower.alerts || []) {
      active.push(`${TOWER_LABELS[tower.site_id] || tower.site_id}: ${ALERT_LABELS[alert.key] || alert.key}`);
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
  const badge = (label, up, upWord) =>
    `<span class="health-badge ${up ? "up" : "down"}"><span class="health-badge-label">${label}</span><span class="health-badge-state">${up ? upWord : "down"}</span></span>`;
  strip.innerHTML =
    badge("Gateway", health.gateway, "online") +
    badge("Queue", health.queue, "reachable") +
    badge("Lambda", health.lambda, "deployed") +
    badge("Pipeline", health.pipeline, "live");
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
  const canvas = document.getElementById(`trend-${sensorType}`);
  if (!canvas) return;

  const bySite = {};
  for (const item of items) {
    (bySite[item.site_id] = bySite[item.site_id] || []).push(item);
  }

  const labels = items.filter((i) => i.site_id === Object.keys(bySite)[0]).map((_, i) => i);
  const datasets = Object.entries(bySite).map(([siteId, points]) => ({
    label: TOWER_LABELS[siteId] || siteId,
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#9a9da3" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#9a9da3" }, grid: { color: "#35383e" } },
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
    const [towersResp, health, backendStats] = await Promise.all([
      fetch("/api/towers").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const towers = towersResp.towers || [];
    renderTowers(towers);
    renderAlertBanner(towers);
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
