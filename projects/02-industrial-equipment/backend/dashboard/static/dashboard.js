const SENSORS = ["vibration", "motor_temperature", "bearing_acoustic", "rotation_speed", "power_draw"];

// Axis bounds only (the range each reading's <meter> is drawn against) —
// purely cosmetic scaling, not a decision threshold. Real alert thresholds
// come from /api/thresholds, fetched live from the fog node's own
// Alerts.java, not duplicated here.
const AXIS_RANGE = {
  vibration: { lo: 0.2, hi: 9.0 },
  motor_temperature: { lo: 30, hi: 110 },
  bearing_acoustic: { lo: 40, hi: 100 },
  rotation_speed: { lo: 800, hi: 3600 },
  power_draw: { lo: 5, hi: 75 },
};

const TREND_COLOR = {
  vibration: "#f2b705",
  motor_temperature: "#e2483d",
  bearing_acoustic: "#4fc3bf",
  rotation_speed: "#6ea8ff",
  power_draw: "#b98af0",
};

const DISPLAY_LABEL = {
  bearing_wear_risk: "Bearing wear risk",
  overheating: "Overheating",
  acoustic_anomaly: "Acoustic anomaly",
  underspeed_fault: "Underspeed fault",
  overspeed_fault: "Overspeed fault",
  power_spike: "Power spike",
};

const STALE_AFTER_SECONDS = 30;
let THRESHOLDS = {};
const trendCharts = {};

function secondsAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function readingMeter(sensor, value, alertsFired) {
  const { lo, hi } = AXIS_RANGE[sensor];
  const danger = alertsFired.length > 0;
  // <meter> is a real native form control for "a scalar value within a known
  // range" -- exactly what a sensor reading against its configured axis is --
  // so the range is rendered by the browser itself, not a hand-drawn graphic.
  return `<meter class="reading-meter${danger ? " danger" : ""}" min="${lo}" max="${hi}" value="${value}"></meter>`;
}

// Plain text, not a drawn arc: the real alarm rule(s) for this sensor,
// straight from /api/thresholds (the fog gateway's own configured limits).
function limitNote(sensor) {
  const rules = THRESHOLDS[sensor];
  if (!rules || !rules.length) return "";
  return rules.map((r) => `${r.op} ${r.limit}`).join(" &middot; ");
}

async function loadThresholds() {
  const res = await fetch("/api/thresholds");
  THRESHOLDS = await res.json();
}

function renderPlantStats(summary, backend) {
  const withSites = summary.sensors.filter((s) => s.sites.length > 0);
  const totalUnits = withSites.reduce((sum, s) => sum + s.sites.length, 0);
  const alertCount = withSites.reduce(
    (sum, s) => sum + s.sites.filter((site) => site.alerts.length).length, 0
  );
  const box = document.getElementById("plant-stats");
  box.innerHTML =
    `<span><b>${withSites.length}</b>Sensor types</span>` +
    `<span><b>${totalUnits}</b>Units online</span>` +
    `<span class="${alertCount ? "danger" : ""}"><b>${alertCount}</b>Alarms active</span>` +
    `<span><b>${backend.items_in_table}</b>Records logged</span>`;
}

function renderAlarmStrip(summary) {
  const box = document.getElementById("alarm-strip");
  const firing = [];
  for (const s of summary.sensors) {
    for (const site of s.sites) {
      for (const key of site.alerts) {
        firing.push({ sensor: s.sensor_type, site_id: site.site_id, label: DISPLAY_LABEL[key] || key });
      }
    }
  }
  if (firing.length === 0) {
    box.className = "alarm-strip clear";
    box.innerHTML = `<div class="alarm-row">All systems nominal &mdash; no active alarms</div>`;
    return;
  }
  box.className = "alarm-strip active";
  box.innerHTML = firing
    .map((f) => `<div class="alarm-row"><span class="tag">${f.site_id}</span>${f.sensor.replace(/_/g, " ")} &mdash; ${f.label}</div>`)
    .join("");
}

function makeTrendChart(canvas, color) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { fill: false } },
    },
  });
}

function renderTile(sensorType, sites) {
  const tile = document.querySelector(`.nameplate[data-sensor="${sensorType}"]`);
  const mount = tile.querySelector(".dial-row");
  const tbody = tile.querySelector(".site-table tbody");

  if (sites.length === 0) {
    mount.innerHTML = `<div class="no-data">No data</div>`;
    tbody.innerHTML = "";
    return;
  }

  const note = limitNote(sensorType);
  mount.innerHTML = sites
    .map((site) => `
      <div class="dial-unit">
        <div class="dial-reading">${site.latest}<small>${site.unit}</small></div>
        ${readingMeter(sensorType, site.latest, site.alerts)}
        <div class="dial-site">${site.site_id}</div>
      </div>`)
    .join("") + (note ? `<div class="limit-note">Alarm ${note}</div>` : "");

  tbody.innerHTML = sites
    .map((site) => {
      const age = secondsAgo(site.window_end);
      const staleClass = age > STALE_AFTER_SECONDS ? "stale" : "";
      return `<tr class="${staleClass}"><td>${site.site_id}</td><td>${site.count} rdg</td>` +
        `<td>${site.min}&ndash;${site.max}</td><td>${age}s ago</td></tr>`;
    })
    .join("");
}

async function refreshTrend(sensorType) {
  const res = await fetch(`/api/readings?sensor_type=${sensorType}&limit=30`);
  const data = await res.json();
  if (!data.items.length) return;
  const bySite = {};
  for (const item of data.items) (bySite[item.site_id] ||= []).push(item);
  const primarySite = Object.keys(bySite).sort()[0];
  const series = bySite[primarySite];

  if (!trendCharts[sensorType]) {
    const canvas = document.querySelector(`.nameplate[data-sensor="${sensorType}"] canvas.trend`);
    trendCharts[sensorType] = makeTrendChart(canvas, TREND_COLOR[sensorType]);
  }
  const chart = trendCharts[sensorType];
  chart.data.labels = series.map((_, i) => i);
  chart.data.datasets[0].data = series.map((i) => i.avg);
  chart.update();
}

async function tick() {
  try {
    const [summary, health, backend] = await Promise.all([
      fetch("/api/summary").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    renderPlantStats(summary, backend);
    renderAlarmStrip(summary);
    for (const s of summary.sensors) renderTile(s.sensor_type, s.sites);
    await Promise.all(SENSORS.map(refreshTrend));

    const box = document.getElementById("system-status");
    box.innerHTML =
      `<span>Fog gateway: <b>${health.fog ? "ok" : "down"}</b></span>` +
      `<span>Queue: <b>${health.queue ? "ok" : "down"}</b> (${backend.queue ? backend.queue.waiting : "?"} waiting)</span>` +
      `<span>Lambda: <b>${health.lambda ? "deployed" : "not found"}</b></span>` +
      `<span>Data flow: <b>${health.pipeline ? "live" : "stalled"}</b></span>`;
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

loadThresholds().then(() => {
  tick();
  setInterval(tick, 2500);
});
