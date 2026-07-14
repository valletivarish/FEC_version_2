const SENSORS = ["soil_moisture", "temperature", "humidity", "light_intensity", "rainfall"];

// runtime-config.js sets window.RUNTIME_CONFIG before this file loads; it is
// empty for local dev (same-origin FastAPI) and holds the deployed API
// Gateway URL once the static assets are copied onto S3 at deploy time.
const API_BASE = (window.RUNTIME_CONFIG && window.RUNTIME_CONFIG.apiBase) || "";

function swatch(sensor) {
  return `<span class="swatch ${sensor}"></span>`;
}

// Mirrors fog/alerts.py THRESHOLDS exactly (key = the alert label fog emits,
// field/op/limit = the same rule). Kept in sync manually since fog and
// dashboard are independently deployable services. Used both for the text
// legend and for shading the danger zone directly on each chart.
const RULES = {
  soil_moisture: [{ key: "irrigation_needed", label: "Needs irrigation", field: "avg", op: "<", limit: 20 }],
  temperature: [
    { key: "heat_stress", label: "Heat stress", field: "avg", op: ">", limit: 35 },
    { key: "frost_risk", label: "Frost risk", field: "min", op: "<", limit: 3 },
  ],
  humidity: [{ key: "fungal_risk", label: "Fungal risk", field: "avg", op: ">", limit: 90 }],
  light_intensity: [{ key: "low_light", label: "Low light", field: "avg", op: "<", limit: 1000 }],
  rainfall: [{ key: "heavy_rain", label: "Heavy rain", field: "max", op: ">", limit: 10 }],
};

const STALE_AFTER_SECONDS = 30;

const charts = {};

function shortTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function secondsAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function rightAlign(values, length) {
  if (values.length >= length) return values.slice(values.length - length);
  return Array(length - values.length).fill(null).concat(values);
}

function groupBySite(items) {
  const bySite = new Map();
  for (const item of items) {
    if (!bySite.has(item.site_id)) bySite.set(item.site_id, []);
    bySite.get(item.site_id).push(item);
  }
  return bySite;
}

function bandDataset(color, data) {
  return { data, borderWidth: 0, pointRadius: 0, backgroundColor: color + "00" };
}

// Shades the actual danger zone from fog/alerts.py's real thresholds directly
// on the chart, so a reading's meaning is visible at a glance without reading
// the rules legend text.
function thresholdDatasets(sensor, labelLength) {
  return RULES[sensor].map((rule) => ({
    label: `${rule.key} threshold`,
    data: Array(labelLength).fill(rule.limit),
    borderWidth: 0,
    pointRadius: 0,
    backgroundColor: "#ff5c401a",
    fill: rule.op === "<" ? "start" : "end",
  }));
}

function buildDatasets(sensor, bySite, labelLength) {
  const datasets = thresholdDatasets(sensor, labelLength);
  let colorIndex = -1;
  for (const [siteId, items] of bySite) {
    colorIndex += 1;
    const color = COLORS_BY_INDEX(colorIndex);
    const mins = rightAlign(items.map((i) => i.min), labelLength);
    const maxs = rightAlign(items.map((i) => i.max), labelLength);
    const avgs = rightAlign(items.map((i) => i.avg), labelLength);

    datasets.push({ ...bandDataset(color, mins), label: `${siteId} min` });
    datasets.push({ ...bandDataset(color, maxs), label: `${siteId} max`, fill: "-1", backgroundColor: color + "26" });
    datasets.push({
      label: siteId,
      data: avgs,
      borderColor: color,
      backgroundColor: color + "00",
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointRadius: 0,
    });
  }
  return datasets;
}

function COLORS_BY_INDEX(i) {
  return ["#4fa3ff", "#ff7a59", "#37c9a3", "#ffcf4f", "#8a7bff"][i % 5];
}

function isBandLabel(label) {
  return label.endsWith(" min") || label.endsWith(" max") || label.endsWith(" threshold");
}

function makeChart(sensor) {
  const ctx = document.getElementById(sensor);
  charts[sensor] = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: false,
          labels: { filter: (item) => !isBandLabel(item.text), color: "#8a93a3" },
        },
        tooltip: { filter: (item) => !isBandLabel(item.dataset.label) },
      },
      scales: {
        x: { ticks: { color: "#8a93a3", maxTicksLimit: 6 }, grid: { color: "#20252f" } },
        y: { ticks: { color: "#8a93a3" }, grid: { color: "#20252f" } },
      },
    },
  });
}

function renderRules(sensor, firedAlerts, unit) {
  const box = document.getElementById(`rules-${sensor}`);
  const fired = new Set(firedAlerts);
  box.innerHTML = RULES[sensor]
    .map((r) => {
      const cls = fired.has(r.key) ? "rule fired" : "rule";
      return `<span class="${cls}">${r.label} (${r.op} ${r.limit}${unit})</span>`;
    })
    .join("");
}

function renderDetailTable(sensor, bySite) {
  const body = document.getElementById(`detail-${sensor}`);
  const rows = [];
  for (const [siteId, items] of bySite) {
    const last = items[items.length - 1];
    const age = secondsAgo(last.window_end);
    const staleClass = age > STALE_AFTER_SECONDS ? "stale" : "";
    rows.push(
      `<tr class="${staleClass}"><td>${siteId}</td><td>${last.count}</td>` +
      `<td>${last.min}</td><td>${last.max}</td><td>${age}s ago</td></tr>`
    );
  }
  body.innerHTML = rows.join("") || `<tr><td colspan="5">no data yet</td></tr>`;
}

async function refreshChart(sensor) {
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${sensor}&limit=60`);
  const data = await res.json();
  const bySite = groupBySite(data.items);
  if (bySite.size === 0) return;

  const labelSource = [...bySite.values()].reduce((a, b) => (a.length >= b.length ? a : b));
  const labels = labelSource.map((i) => shortTime(i.window_end));

  const chart = charts[sensor];
  chart.data.labels = labels;
  chart.data.datasets = buildDatasets(sensor, bySite, labels.length);
  chart.options.plugins.legend.display = bySite.size > 1;
  chart.update();

  renderDetailTable(sensor, bySite);
}

function renderFleetOverview(data) {
  const box = document.getElementById("fleet");
  const withSites = data.sensors.filter((s) => s.sites.length > 0);
  const totalUnits = withSites.reduce((sum, s) => sum + s.sites.length, 0);
  const totalReadings = withSites.reduce(
    (sum, s) => sum + s.sites.reduce((n, site) => n + site.count, 0), 0
  );
  const alertCount = withSites.reduce(
    (sum, s) => sum + s.sites.filter((site) => site.alerts.length).length, 0
  );
  const breakdown = withSites
    .map((s) => `${swatch(s.sensor_type)}${s.sensor_type.replace("_", " ")} &times;${s.sites.length}`)
    .join(", ");

  box.innerHTML =
    `<div class="fleet-stat"><strong>${withSites.length}</strong><span>sensor types</span></div>` +
    `<div class="fleet-stat"><strong>${totalUnits}</strong><span>active units</span></div>` +
    `<div class="fleet-stat"><strong>${totalReadings}</strong><span>readings / latest cycle</span></div>` +
    `<div class="fleet-stat${alertCount ? " warn" : ""}"><strong>${alertCount}</strong><span>units alerting</span></div>` +
    `<div class="fleet-breakdown">${breakdown}</div>`;
}

function plainAlertLabel(sensor, key) {
  const rule = RULES[sensor].find((r) => r.key === key);
  return rule ? rule.label : key.replace("_", " ");
}

function renderSummaryChips(data) {
  const box = document.getElementById("summary");
  box.innerHTML = "";
  for (const s of data.sensors) {
    renderRules(s.sensor_type, s.sites.flatMap((site) => site.alerts), s.sites[0] ? s.sites[0].unit : "");
    for (const site of s.sites) {
      const chip = document.createElement("div");
      chip.className = "chip" + (site.alerts.length ? " alert" : "");
      const plainAlerts = site.alerts.map((key) => plainAlertLabel(s.sensor_type, key));
      chip.innerHTML =
        `<div class="name">${swatch(s.sensor_type)}${s.sensor_type.replace("_", " ")} <span class="site">${site.site_id}</span></div>` +
        `<div class="value">${site.latest} <small>${site.unit}</small></div>` +
        `<div class="range">min ${site.min} &middot; max ${site.max} &middot; ${site.count} readings</div>` +
        (plainAlerts.length ? `<div class="flags">${plainAlerts.join(", ")}</div>` : "");
      box.appendChild(chip);
    }
  }
}

function renderActiveAlerts(data) {
  const box = document.getElementById("active-alerts");
  const firing = [];
  for (const s of data.sensors) {
    for (const site of s.sites) {
      for (const key of site.alerts) {
        firing.push({ sensor: s.sensor_type, site_id: site.site_id, label: plainAlertLabel(s.sensor_type, key) });
      }
    }
  }
  if (firing.length === 0) {
    box.className = "active-alerts ok";
    box.innerHTML = `<span class="dot green"></span> No active alerts`;
    return;
  }
  box.className = "active-alerts warn";
  box.innerHTML =
    `<span class="dot red"></span> ` +
    firing.map((f) => `${swatch(f.sensor)}${f.label} (${f.site_id})`).join(" &middot; ");
}

function pill(label, ok) {
  return `<div class="pill ${ok ? "up" : "down"}"><span class="dot ${ok ? "green" : "red"}"></span>${label}</div>`;
}

function renderHealth(health) {
  const box = document.getElementById("health");
  box.innerHTML =
    pill("Fog Node", health.fog) +
    pill("Queue Reachable", health.queue) +
    pill("Lambda Deployed", health.lambda) +
    pill("Data Flowing", health.pipeline);
}

function renderPipeline(summary, health, backend) {
  const totalUnits = summary.sensors.reduce((sum, s) => sum + s.sites.length, 0);
  document.getElementById("pipeline-sensors").textContent = `${totalUnits} active`;
  document.getElementById("pipeline-fog").textContent = health.fog ? "healthy" : "unreachable";
  document.getElementById("pipeline-queue").textContent = backend.queue
    ? `${backend.queue.waiting} waiting, ${backend.queue.in_flight} in flight`
    : "unknown";
  document.getElementById("pipeline-lambda").textContent = health.lambda ? "deployed" : "not found";
  document.getElementById("pipeline-db").textContent = `${backend.items_in_table} records stored`;
}

async function tick() {
  try {
    const [summary, health, backend] = await Promise.all([
      fetch(`${API_BASE}/api/summary`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);
    renderFleetOverview(summary);
    renderHealth(health);
    renderActiveAlerts(summary);
    renderPipeline(summary, health, backend);
    renderSummaryChips(summary);
    await Promise.all(SENSORS.map(refreshChart));
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

SENSORS.forEach(makeChart);
tick();
setInterval(tick, 2500);
