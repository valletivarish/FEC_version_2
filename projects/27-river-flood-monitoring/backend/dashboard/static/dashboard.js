const appEl = document.getElementById("app");
const rawBase = (appEl && appEl.dataset.apiBase) || "";
const API_BASE = rawBase.startsWith("__API_BASE__") ? "" : rawBase.replace(/\/$/, "");
const POLL_MS = 2500;
const GAUGE_MAX = 8;

const SECONDARY = {
  rainfall_mmph: "Rainfall",
  flow_velocity_ms: "Flow",
  soil_moisture_pct: "Soil moisture",
  turbidity_ntu: "Turbidity",
};
const ALERT_LABELS = {
  flood_advisory: "Flood advisory", flood_watch: "Flood watch", flood_warning: "Flood warning",
  rapid_rise: "Rapid rise", torrential_rain: "Torrential rain",
  dangerous_current: "Dangerous current", saturated_catchment: "Saturated catchment",
};
const TREND = { rising: "▲ rising", falling: "▼ falling", steady: "— steady" };

let freshest = "--";

function fmt(value, digits) {
  return typeof value === "number" ? value.toFixed(digits) : "--";
}

function reachCard(reach) {
  const level = reach.level;
  const pct = typeof level === "number" ? Math.max(2, Math.min(100, (level / GAUGE_MAX) * 100)) : 0;
  const readings = reach.readings || {};
  const rows = Object.entries(SECONDARY).map(([type, label]) => {
    const reading = readings[type];
    const flagged = reading && reading.alerts && reading.alerts.length;
    const value = reading ? `${fmt(reading.latest, 1)}<span class="u">${reading.unit || ""}</span>` : `<span class="u">no data</span>`;
    return `<div class="reading ${flagged ? "flagged" : ""}"><span class="label">${label}</span><span class="val">${value}</span></div>`;
  }).join("");
  const tags = (reach.active_alerts || []).map((a) => `<span class="alert-tag">${ALERT_LABELS[a] || a}</span>`).join("");
  return `<article class="gauge-card">
    <div class="gauge-head">
      <h3 class="reach-name">${reach.site_id}</h3>
      <span class="stage-pill stage-${reach.stage}">${reach.stage}</span>
    </div>
    <div class="gauge-body">
      <div class="gauge-column">
        <div class="gauge">
          <div class="gauge-tick" style="bottom:43.75%"></div>
          <div class="gauge-tick" style="bottom:56.25%"></div>
          <div class="gauge-tick" style="bottom:68.75%"></div>
          <div class="gauge-water" style="height:${pct}%"></div>
        </div>
        <div class="gauge-value">${fmt(level, 2)} m</div>
        <div class="gauge-rise ${reach.trend === "rising" ? "trend-rising" : reach.trend === "falling" ? "trend-falling" : ""}">${TREND[reach.trend] || ""}${typeof reach.rise_mph === "number" ? " · " + fmt(reach.rise_mph, 2) + " m/h" : ""}</div>
      </div>
      <div class="gauge-readings">${rows}</div>
    </div>
    ${tags ? `<div class="alert-tags">${tags}</div>` : ""}
  </article>`;
}

async function refreshReaches() {
  const body = await (await fetch(API_BASE + "/api/reaches")).json();
  const stage = body.catchment_stage || "normal";
  const banner = document.getElementById("catchment");
  banner.className = "catchment catchment-" + stage;
  banner.textContent = "Catchment status: " + stage.toUpperCase();
  document.getElementById("reach-grid").innerHTML = (body.reaches || []).map(reachCard).join("");
}

async function refreshHealth() {
  const body = await (await fetch(API_BASE + "/api/health")).json();
  const item = (label, ok) => `<span class="health-item ${ok ? "up" : "down"}">${label}</span>`;
  document.getElementById("health").innerHTML =
    item("Gateway", body.gateway) + item("Queue", body.queue) + item("Lambda", body.lambda) + item("Pipeline", body.pipeline);
  freshest = typeof body.freshest_age_seconds === "number" ? body.freshest_age_seconds.toFixed(1) + "s ago" : "no data";
}

async function refreshStats() {
  const body = await (await fetch(API_BASE + "/api/backend-stats")).json();
  const queue = body.queue;
  document.getElementById("stats").innerHTML =
    `<span>queue waiting: ${queue ? queue.waiting : "--"}</span>` +
    `<span>in flight: ${queue ? queue.in_flight : "--"}</span>` +
    `<span>records stored: ${body.items_in_table}</span>` +
    `<span>freshest window: ${freshest}</span>`;
}

let levelChart = null;
async function refreshChart() {
  const [a, b] = await Promise.all([
    fetch(API_BASE + "/api/readings?sensor_type=river_level_m&site_id=reach-a&limit=20").then((r) => r.json()),
    fetch(API_BASE + "/api/readings?sensor_type=river_level_m&site_id=reach-b&limit=20").then((r) => r.json()),
  ]);
  const labels = a.items.map((i) => new Date(i.window_end).toLocaleTimeString());
  const series = (items, color, label) => ({ label, data: items.map((i) => i.latest), borderColor: color, backgroundColor: "transparent", tension: 0.3, pointRadius: 0, borderWidth: 2 });
  const datasets = [series(a.items, "#0e6ba8", "reach-a"), series(b.items, "#2aa5c9", "reach-b")];
  const ctx = document.getElementById("level-chart");
  if (!levelChart) {
    levelChart = new Chart(ctx, { type: "line", data: { labels, datasets }, options: { responsive: true, animation: false, scales: { y: { beginAtZero: true, suggestedMax: 8 } }, plugins: { legend: { position: "bottom" } } } });
  } else {
    levelChart.data.labels = labels;
    levelChart.data.datasets = datasets;
    levelChart.update("none");
  }
}

let rulesLoaded = false;
async function loadRules() {
  if (rulesLoaded) return;
  try {
    const rules = await (await fetch(API_BASE + "/api/thresholds")).json();
    document.getElementById("rules").innerHTML = Object.entries(rules).map(([type, list]) => {
      const lines = (list || []).map((r) => `<p class="rule-line">${r.field} ${r.op} ${r.limit} &rarr; ${r.key}</p>`).join("") || `<p class="rule-line">context only, no alarm</p>`;
      return `<div class="rule-group"><h4>${type}</h4>${lines}</div>`;
    }).join("");
    rulesLoaded = true;
  } catch (err) { /* fog not reachable yet */ }
}

async function tick() {
  try {
    await Promise.all([refreshReaches(), refreshHealth(), refreshChart()]);
    await refreshStats();
    await loadRules();
    document.getElementById("foot").textContent = "Refreshes every 2.5 s · stage bands: advisory 3.5 m, watch 4.5 m, warning 5.5 m; rapid-rise trigger at 0.5 m/h.";
  } catch (err) {
    console.error("poll failed", err);
  }
}

tick();
setInterval(tick, POLL_MS);
