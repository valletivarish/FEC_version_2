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

// Hand-drawn two-reach level plot on a plain canvas: 0..GAUGE_MAX metres on the
// y axis with the three stage bands drawn as faint reference lines.
const BAND_LINES = [
  { level: 3.5, tint: "rgba(46,165,201,0.35)" },
  { level: 4.5, tint: "rgba(214,158,50,0.40)" },
  { level: 5.5, tint: "rgba(197,74,74,0.45)" },
];

function plotLine(ctx, points, w, h, color) {
  if (points.length < 2) return;
  const x = (i) => (i / (points.length - 1)) * (w - 8) + 4;
  const y = (v) => h - 6 - (Math.max(0, Math.min(GAUGE_MAX, v)) / GAUGE_MAX) * (h - 12);
  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(x(i), y(points[i]));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

async function refreshChart() {
  const [a, b] = await Promise.all([
    fetch(API_BASE + "/api/readings?sensor_type=river_level_m&site_id=reach-a&limit=20").then((r) => r.json()),
    fetch(API_BASE + "/api/readings?sensor_type=river_level_m&site_id=reach-b&limit=20").then((r) => r.json()),
  ]);
  const canvas = document.getElementById("level-chart");
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth;
  const h = 90;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  for (const band of BAND_LINES) {
    const y = h - 6 - (band.level / GAUGE_MAX) * (h - 12);
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(w - 4, y);
    ctx.strokeStyle = band.tint;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  plotLine(ctx, a.items.map((i) => i.latest), w, h, "#0e6ba8");
  plotLine(ctx, b.items.map((i) => i.latest), w, h, "#2aa5c9");
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
