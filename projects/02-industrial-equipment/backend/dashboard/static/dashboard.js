const SENSORS = ["vibration", "motor_temperature", "bearing_acoustic", "rotation_speed", "power_draw"];

// Axis bounds only (how wide the gauge arc is drawn) — purely cosmetic scaling,
// not a decision threshold. Real alert thresholds come from /api/thresholds,
// fetched live from the fog node's own alerts.py, not duplicated here.
const AXIS_RANGE = {
  vibration: { lo: 0.2, hi: 9.0 },
  motor_temperature: { lo: 30, hi: 110 },
  bearing_acoustic: { lo: 40, hi: 100 },
  rotation_speed: { lo: 800, hi: 3600 },
  power_draw: { lo: 5, hi: 75 },
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
const sparklines = {};

function swatch(sensor) {
  return `<span class="swatch ${sensor}"></span>`;
}

function secondsAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(cx, cy, r, fromAngle, toAngle) {
  const start = polarToCartesian(cx, cy, r, fromAngle);
  const end = polarToCartesian(cx, cy, r, toAngle);
  const largeArc = Math.abs(fromAngle - toAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function valueToAngle(value, lo, hi) {
  const clamped = Math.max(lo, Math.min(hi, value));
  return 180 - ((clamped - lo) / (hi - lo)) * 180;
}

function gaugeSvg(sensor, value, alertsFired) {
  const { lo, hi } = AXIS_RANGE[sensor];
  const cx = 90, cy = 85, r = 70;
  const rules = THRESHOLDS[sensor] || [];

  let dangerArcs = "";
  for (const rule of rules) {
    const isDanger = alertsFired.includes(rule.key);
    const color = isDanger ? "#ff5c40" : "#4a3418";
    if (rule.op === ">") {
      dangerArcs += `<path d="${arcPath(cx, cy, r, valueToAngle(rule.limit, lo, hi), 0)}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    } else {
      dangerArcs += `<path d="${arcPath(cx, cy, r, 180, valueToAngle(rule.limit, lo, hi))}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    }
  }

  const needleAngle = valueToAngle(value, lo, hi);
  const needleTip = polarToCartesian(cx, cy, r - 14, needleAngle);

  return `
    <svg viewBox="0 0 180 100" class="gauge-svg">
      <path d="${arcPath(cx, cy, r, 180, 0)}" stroke="#2a2f38" stroke-width="10" fill="none" stroke-linecap="round"/>
      ${dangerArcs}
      <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(2)}" y2="${needleTip.y.toFixed(2)}"
            stroke="#ffb648" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#ffb648"/>
    </svg>`;
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
    `<span>${withSites.length} SENSOR TYPES</span>` +
    `<span>${totalUnits} UNITS ONLINE</span>` +
    `<span class="${alertCount ? "danger" : ""}">${alertCount} ALARMS ACTIVE</span>` +
    `<span>${backend.items_in_table} RECORDS LOGGED</span>`;
}

function renderAlarmPanel(summary) {
  const box = document.getElementById("alarm-panel");
  const firing = [];
  for (const s of summary.sensors) {
    for (const site of s.sites) {
      for (const key of site.alerts) {
        firing.push({ sensor: s.sensor_type, site_id: site.site_id, label: DISPLAY_LABEL[key] || key });
      }
    }
  }
  if (firing.length === 0) {
    box.className = "alarm-panel clear";
    box.innerHTML = `<div class="alarm-row">ALL SYSTEMS NOMINAL — NO ACTIVE ALARMS</div>`;
    return;
  }
  box.className = "alarm-panel active";
  box.innerHTML = firing
    .map((f) => `<div class="alarm-row">${swatch(f.sensor)}${f.sensor.replace("_", " ").toUpperCase()} [${f.site_id}] — ${f.label.toUpperCase()}</div>`)
    .join("");
}

function makeSparkline(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: "#ffb648", borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
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
  const tile = document.querySelector(`.gauge-tile[data-sensor="${sensorType}"]`);
  const mount = tile.querySelector(".gauge-mount");
  const tbody = tile.querySelector(".detail tbody");

  if (sites.length === 0) {
    mount.innerHTML = `<div class="no-data">NO DATA</div>`;
    tbody.innerHTML = "";
    return;
  }

  mount.innerHTML = sites
    .map((site) => `
      <div class="gauge-unit">
        ${gaugeSvg(sensorType, site.latest, site.alerts)}
        <div class="gauge-reading">${site.latest}<small>${site.unit}</small></div>
        <div class="gauge-site">${site.site_id}</div>
      </div>`)
    .join("");

  tbody.innerHTML = sites
    .map((site) => {
      const age = secondsAgo(site.window_end);
      const staleClass = age > STALE_AFTER_SECONDS ? "stale" : "";
      return `<tr class="${staleClass}"><td>${site.site_id}</td><td>${site.count} rdg</td>` +
        `<td>${site.min}&ndash;${site.max}</td><td>${age}s ago</td></tr>`;
    })
    .join("");
}

async function refreshSpark(sensorType) {
  const res = await fetch(`/api/readings?sensor_type=${sensorType}&limit=30`);
  const data = await res.json();
  if (!data.items.length) return;
  const bySite = {};
  for (const item of data.items) (bySite[item.site_id] ||= []).push(item);
  const primarySite = Object.keys(bySite).sort()[0];
  const series = bySite[primarySite];

  if (!sparklines[sensorType]) {
    const canvas = document.querySelector(`.gauge-tile[data-sensor="${sensorType}"] canvas.spark`);
    sparklines[sensorType] = makeSparkline(canvas);
  }
  const chart = sparklines[sensorType];
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
    renderAlarmPanel(summary);
    for (const s of summary.sensors) renderTile(s.sensor_type, s.sites);
    await Promise.all(SENSORS.map(refreshSpark));

    const box = document.getElementById("system-status");
    box.innerHTML =
      `<span>fog: ${health.fog ? "ok" : "down"}</span>` +
      `<span>queue: ${health.queue ? "ok" : "down"} (${backend.queue ? backend.queue.waiting : "?"} waiting)</span>` +
      `<span>lambda: ${health.lambda ? "deployed" : "not found"}</span>` +
      `<span>data flow: ${health.pipeline ? "live" : "stalled"}</span>`;
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

loadThresholds().then(() => {
  tick();
  setInterval(tick, 2500);
});
