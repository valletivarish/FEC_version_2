// API origin: sed-substituted into the app script tag's data-api-base at S3 upload time; unset means same-origin.
const API_BASE = (() => {
  const el = document.getElementById("app");
  const v = (el && el.dataset.apiBase) || "";
  return v.startsWith("__API_BASE__") ? "" : v.replace(/\/$/, "");
})();

const METRICS = ["vehicle_count", "air_quality_pm25", "noise_level", "parking_occupancy", "ambient_light"];

const METRIC_META = {
  vehicle_count:      { label: "Traffic Flow",  unit: "veh/min" },
  air_quality_pm25:   { label: "Air Quality",   unit: "ug/m3" },
  noise_level:        { label: "Noise Level",   unit: "dB" },
  parking_occupancy:  { label: "Parking",       unit: "%" },
  ambient_light:      { label: "Ambient Light", unit: "lux" },
};

const ALERT_TEXT = {
  congestion_risk: "Congestion risk",
  air_quality_alert: "Air quality alert",
  noise_violation: "Noise violation",
  parking_full: "Parking full",
  low_visibility_alert: "Low visibility",
};

const ZONE_COLORS = ["#00d4ff", "#a78bfa", "#f472b6", "#facc15"];
const STALE_AFTER_SECONDS = 30;
const trendCharts = {};

function zoneDot(metric) {
  return `<span class="zdot ${metric}"></span>`;
}

function elapsedLabel(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function clockLabel(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function describeIncident(key) {
  return ALERT_TEXT[key] || key.replace(/_/g, " ");
}

function paintCitySummary(zones) {
  const box = document.getElementById("city-summary");
  const incidentCount = zones.reduce(
    (sum, z) => sum + Object.values(z.metrics).filter((m) => m.alerts.length).length, 0
  );
  box.innerHTML =
    `<span>${zones.length} ZONES REPORTING</span>` +
    `<span class="${incidentCount ? "hot" : ""}">${incidentCount} ACTIVE INCIDENTS</span>`;
}

function paintIncidentBanner(zones) {
  const box = document.getElementById("incident-banner");
  const incidents = [];
  for (const zone of zones) {
    for (const [metric, reading] of Object.entries(zone.metrics)) {
      for (const key of reading.alerts) {
        incidents.push({ zone_id: zone.zone_id, metric, key });
      }
    }
  }
  if (incidents.length === 0) {
    box.className = "incident-banner clear";
    box.innerHTML = "No active incidents across monitored zones";
    return;
  }
  box.className = "incident-banner hot";
  box.innerHTML = incidents
    .map((i) => `${zoneDot(i.metric)}${i.zone_id.toUpperCase()}: ${describeIncident(i.key)}`)
    .join(" &nbsp;&middot;&nbsp; ");
}

function metricTileHtml(metric, reading) {
  const meta = METRIC_META[metric];
  if (!reading) {
    return `<div class="zone-metric empty">${zoneDot(metric)}${meta.label}<span class="zm-value">&ndash;</span></div>`;
  }
  const flagged = reading.alerts.length > 0;
  const age = elapsedLabel(reading.window_end);
  const staleFlag = age > STALE_AFTER_SECONDS ? " (stale)" : "";
  return `
    <div class="zone-metric${flagged ? " flagged" : ""}">
      <div class="zm-label">${zoneDot(metric)}${meta.label}</div>
      <div class="zm-value">${reading.latest}<small>${meta.unit}</small></div>
      <div class="zm-range">${reading.min}&ndash;${reading.max} &middot; ${age}s ago${staleFlag}</div>
      ${flagged ? `<div class="zm-flag">${reading.alerts.map(describeIncident).join(", ")}</div>` : ""}
    </div>`;
}

function zoneCardHtml(zone) {
  const flaggedCount = Object.values(zone.metrics).filter((m) => m.alerts.length).length;
  return `
    <article class="zone-card${flaggedCount ? " flagged" : ""}">
      <div class="zone-head">
        <span class="zone-id">${zone.zone_id.toUpperCase()}</span>
        ${flaggedCount ? `<span class="zone-badge">${flaggedCount} incident${flaggedCount > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="zone-metrics">
        ${METRICS.map((m) => metricTileHtml(m, zone.metrics[m])).join("")}
      </div>
    </article>`;
}

function makeTrendChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { color: "#9aa5c3", boxWidth: 10, font: { size: 10 } } },
        tooltip: { enabled: true },
      },
      scales: {
        x: { ticks: { color: "#5b6584", maxTicksLimit: 5 }, grid: { color: "#1c2340" } },
        y: { ticks: { color: "#5b6584" }, grid: { color: "#1c2340" } },
      },
    },
  });
}

async function refreshTrend(metric) {
  const res = await fetch(API_BASE + `/api/readings?sensor_type=${metric}&limit=30`);
  const data = await res.json();
  const bySite = {};
  for (const item of data.items) (bySite[item.site_id] ||= []).push(item);
  const zoneIds = Object.keys(bySite).sort();
  if (!zoneIds.length) return;

  if (!trendCharts[metric]) {
    const canvas = document.querySelector(`canvas[data-metric="${metric}"]`);
    trendCharts[metric] = makeTrendChart(canvas);
  }
  const chart = trendCharts[metric];
  const labelSource = zoneIds.map((z) => bySite[z]).reduce((a, b) => (a.length >= b.length ? a : b));
  chart.data.labels = labelSource.map((i) => clockLabel(i.window_end));
  chart.data.datasets = zoneIds.map((zoneId, idx) => ({
    label: zoneId,
    data: bySite[zoneId].map((i) => i.avg),
    borderColor: ZONE_COLORS[idx % ZONE_COLORS.length],
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));
  chart.update();
}

async function refreshBoard() {
  try {
    const [zoneData, health, backend] = await Promise.all([
      fetch(API_BASE + "/api/zones").then((r) => r.json()),
      fetch(API_BASE + "/api/health").then((r) => r.json()),
      fetch(API_BASE + "/api/backend-stats").then((r) => r.json()),
    ]);

    const zones = zoneData.zones;
    paintCitySummary(zones);
    paintIncidentBanner(zones);
    document.getElementById("zone-grid").innerHTML = zones.map(zoneCardHtml).join("");
    await Promise.all(METRICS.map(refreshTrend));

    document.getElementById("relay-status").innerHTML =
      `<span class="hchip"><span class="hchip-k">edge relay</span><span class="hchip-v ${health.relay ? "up" : "down"}">${health.relay ? "ok" : "down"}</span></span>` +
      `<span class="hchip"><span class="hchip-k">queue</span><span class="hchip-v ${health.queue ? "up" : "down"}">${health.queue ? "ok" : "down"}${backend.queue ? ` (${backend.queue.waiting} pending)` : ""}</span></span>` +
      `<span class="hchip"><span class="hchip-k">lambda</span><span class="hchip-v ${health.lambda ? "up" : "down"}">${health.lambda ? "ok" : "down"}</span></span>` +
      `<span class="hchip"><span class="hchip-k">records archived</span><span class="hchip-v">${backend.items_in_table}</span></span>`;
  } catch (e) {
    // backend not ready yet; next poll retries
  }
}

refreshBoard();
setInterval(refreshBoard, 2500);
