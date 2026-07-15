const SENSOR_TYPES = ["methane_ppm", "co_ppm", "dust_concentration_mgm3", "ground_vibration_mms", "ambient_temp_c"];

const METRIC_LABELS = {
  methane_ppm: "Methane",
  co_ppm: "Carbon Monoxide",
  dust_concentration_mgm3: "Respirable Dust",
  ground_vibration_mms: "Ground Vibration",
  ambient_temp_c: "Ambient Temp",
};

const ALERT_LABELS = {
  methane_buildup_risk: "Methane buildup risk",
  co_exposure_risk: "CO exposure risk",
  silica_dust_hazard: "Silica dust hazard",
  blast_vibration_exceedance: "Blast vibration exceedance",
};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from /api/thresholds.
const AXIS_RANGE = {
  methane_ppm: { lo: 0, hi: 5000 },
  co_ppm: { lo: 0, hi: 500 },
  dust_concentration_mgm3: { lo: 0, hi: 50 },
  ground_vibration_mms: { lo: 0, hi: 50 },
  ambient_temp_c: { lo: 15, hi: 45 },
};

const TREND_COLORS = { "shaft-a": "#b87333", "shaft-b": "#7f9779" };
let methaneChart = null;

// Read once from the body's data-api-base attribute, sed-substituted into
// index.html at S3 upload time. Falls back to same-origin ("") for local
// dev, where index.html is served straight off disk with __API_BASE__
// left untouched.
const API_BASE = (() => {
  const raw = document.body.dataset.apiBase || "";
  return raw.startsWith("__API_BASE__") ? "" : raw.replace(/\/$/, "");
})();

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function readingRow(sensorType, m) {
  const label = metricLabel(sensorType);
  if (!m) {
    return `<div class="reading-row">
      <div class="row-head"><span class="row-label">${label}</span></div>
      <div class="no-data">no data yet</div>
    </div>`;
  }
  const flagged = m.alerts && m.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  const alertText = flagged ? m.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
  return `<div class="reading-row ${flagged ? "has-alert" : ""}">
    <div class="row-head">
      <span class="row-label">${label}</span>
      <span class="row-value">${m.latest}<span class="row-unit">${m.unit}</span></span>
    </div>
    <meter class="row-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${m.latest}"></meter>
    <div class="row-stats"><span>min ${m.min}</span><span>avg ${m.avg}</span><span>max ${m.max}</span></div>
    ${flagged ? `<div class="row-alert">${alertText}</div>` : ""}
  </div>`;
}

function renderShaftRows(containerId, shaft) {
  const container = document.getElementById(containerId);
  if (!shaft) {
    container.innerHTML = SENSOR_TYPES.map((t) => readingRow(t, null)).join("");
    return;
  }
  container.innerHTML = SENSOR_TYPES.map((sensorType) => readingRow(sensorType, shaft.metrics[sensorType])).join("");
}

function statusTile(elId, label, shaft) {
  const el = document.getElementById(elId);
  if (!shaft) {
    el.className = "status-tile";
    el.innerHTML = `<span class="status-shaft">${label}</span><span class="status-label">NO DATA</span>`;
    return;
  }
  el.className = `status-tile ${shaft.status.toLowerCase()}`;
  el.innerHTML = `<span class="status-shaft">${label}</span><span class="status-label">${shaft.status}</span>`;
}

function renderAlertBanner(shafts) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const shaft of shafts) {
    for (const sensorType of SENSOR_TYPES) {
      const m = shaft.metrics[sensorType];
      if (m && m.alerts && m.alerts.length) {
        for (const alert of m.alerts) active.push(`${shaft.site_id}: ${ALERT_LABELS[alert] || alert}`);
      }
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
  const pill = (label, ok) => `<span class="health-pill ${ok ? "" : "down"}"><span class="swatch"></span>${label}</span>`;
  strip.innerHTML =
    pill("Gateway", health.gateway) +
    pill("Queue", health.queue) +
    pill("Lambda", health.lambda) +
    pill("Pipeline", health.pipeline);
}

function renderBackendStats(backendStats) {
  const el = document.getElementById("backend-stats");
  const queueInfo = backendStats.queue
    ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight`
    : "queue unknown";
  el.textContent = `${backendStats.items_in_table ?? 0} records stored -- ${queueInfo}`;
}

async function fetchTrend(sensorType) {
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function renderMethaneTrend(items) {
  const canvas = document.getElementById("trend-methane");
  if (!canvas) return;

  const bySite = {};
  for (const item of items) {
    (bySite[item.site_id] = bySite[item.site_id] || []).push(item);
  }

  const labels = items.filter((i) => i.site_id === Object.keys(bySite)[0]).map((_, i) => i);
  const datasets = Object.entries(bySite).map(([siteId, points]) => ({
    label: siteId,
    data: points.map((p) => p.avg),
    borderColor: TREND_COLORS[siteId] || "#999",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));

  if (methaneChart) {
    methaneChart.data.labels = labels.length ? labels : [0];
    methaneChart.data.datasets = datasets;
    methaneChart.update();
    return;
  }

  methaneChart = new Chart(canvas, {
    type: "line",
    data: { labels: labels.length ? labels : [0], datasets },
    options: {
      animation: false,
      responsive: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#b3a696" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#b3a696" }, grid: { color: "#574e42" } },
      },
    },
  });
}

async function tick() {
  try {
    const [shaftsResp, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/shafts`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const shafts = shaftsResp.shafts || [];
    const shaftA = shafts.find((s) => s.site_id === "shaft-a");
    const shaftB = shafts.find((s) => s.site_id === "shaft-b");

    statusTile("status-shaft-a", "Shaft A", shaftA);
    statusTile("status-shaft-b", "Shaft B", shaftB);
    renderShaftRows("shaft-a-rows", shaftA);
    renderShaftRows("shaft-b-rows", shaftB);
    renderAlertBanner(shafts);
    renderHealth(health);
    renderBackendStats(backendStats);

    const methaneTrend = await fetchTrend("methane_ppm");
    renderMethaneTrend(methaneTrend.items || []);
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

tick();
setInterval(tick, 2500);
