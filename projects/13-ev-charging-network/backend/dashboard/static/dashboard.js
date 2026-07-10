const POLL_INTERVAL_MS = 2500;

const SENSOR_META = {
  charging_current_a: { label: "Charging Current", lo: 0, hi: 50 },
  battery_soc_pct: { label: "Battery SoC", lo: 0, hi: 100 },
  station_temp_c: { label: "Station Temp", lo: 10, hi: 55 },
  grid_load_kw: { label: "Grid Load", lo: 10, hi: 100 },
  session_duration_min: { label: "Session Duration", lo: 0, hi: 240 },
};
const SENSOR_ORDER = Object.keys(SENSOR_META);

function setDot(id, ok) {
  const el = document.getElementById(id);
  el.classList.remove("ok", "down");
  el.classList.add(ok ? "ok" : "down");
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

function renderHubCard(hub) {
  let updated = "no windows yet";
  for (const sensorType of SENSOR_ORDER) {
    const reading = hub.readings[sensorType];
    if (reading && reading.window_end) {
      updated = new Date(reading.window_end).toLocaleTimeString();
      break;
    }
  }

  const rows = SENSOR_ORDER.map((sensorType) => renderReadingRow(sensorType, hub.readings[sensorType])).join("");

  return `
    <article class="hub-card">
      <div class="hub-card-head">
        <div>
          <h3 class="hub-name">${hub.site_id}</h3>
          <p class="hub-updated">latest window: ${updated}</p>
        </div>
        <span class="bay-badge">charging bay</span>
      </div>
      ${renderAlertTags(hub.readings)}
      <div class="reading-rows">${rows}</div>
    </article>`;
}

async function refreshHubs() {
  const resp = await fetch("/api/hubs");
  const body = await resp.json();
  document.getElementById("hub-grid").innerHTML = body.hubs.map(renderHubCard).join("");
}

async function refreshHealth() {
  const resp = await fetch("/api/health");
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
  const resp = await fetch("/api/backend-stats");
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
    const resp = await fetch("/api/thresholds");
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
  const [hub1, hub2] = await Promise.all([
    fetch("/api/readings?sensor_type=grid_load_kw&site_id=hub-1&limit=20").then((r) => r.json()),
    fetch("/api/readings?sensor_type=grid_load_kw&site_id=hub-2&limit=20").then((r) => r.json()),
  ]);

  const labels = hub1.items.map((item) => new Date(item.window_end).toLocaleTimeString());
  const data1 = hub1.items.map((item) => item.avg);
  const data2 = hub2.items.map((item) => item.avg);

  if (!trendChart) {
    const ctx = document.getElementById("grid-load-trend-chart").getContext("2d");
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "hub-1 (kW)", data: data1, borderColor: "#27e881", backgroundColor: "transparent", tension: 0.25 },
          { label: "hub-2 (kW)", data: data2, borderColor: "#7fe9b8", backgroundColor: "transparent", tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          y: { beginAtZero: true, ticks: { color: "#85978d" }, grid: { color: "#2a332e" } },
          x: { ticks: { color: "#85978d" }, grid: { color: "#2a332e" } },
        },
        plugins: { legend: { position: "bottom", labels: { color: "#eaf3ee" } } },
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
    await Promise.all([refreshHubs(), refreshHealth(), refreshBackendStats(), refreshTrendChart()]);
    await loadRulesOnce();
  } catch (err) {
    console.error("dashboard poll failed", err);
  }
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
