// index.html sets window.API_BASE from an inline <script> block, sed-
// substituted at S3 upload time. Treat a still-unreplaced placeholder
// (anything wrapped in double underscores) the same as "not set" so local
// dev, which never runs the substitution, falls back to same-origin.
const API_BASE = (() => {
  const raw = window.API_BASE || "";
  return /^__.*__$/.test(raw) ? "" : raw;
})();

const METRIC_META = {
  wind_speed_ms:        { label: "Wind Speed",       unit: "m/s" },
  blade_vibration_mm:   { label: "Blade Vibration",  unit: "mm" },
  generator_temp_c:     { label: "Generator Temp",   unit: "C" },
  power_output_kw:      { label: "Power Output",     unit: "kW" },
  gearbox_pressure_bar: { label: "Gearbox Pressure", unit: "bar" },
};

const METRIC_ORDER = ["wind_speed_ms", "blade_vibration_mm", "generator_temp_c", "power_output_kw", "gearbox_pressure_bar"];

const ALERT_TEXT = {
  structural_risk: "Structural risk",
  generator_overheat: "Generator overheat",
  high_wind_shutdown_risk: "High wind shutdown risk",
  lubrication_fault: "Lubrication fault",
};

const TURBINE_COLORS = { "turbine-1": "#5fc2d1", "turbine-2": "#e8a23d" };

let powerTrendChart = null;

function describeAlert(key) {
  return ALERT_TEXT[key] || key.replace(/_/g, " ");
}

function metricCellHtml(sensorType, reading) {
  const meta = METRIC_META[sensorType];
  if (!reading) {
    return `<div class="metric-cell"><div class="metric-label">${meta.label}</div><div class="metric-value">&ndash;</div></div>`;
  }
  const flagged = reading.alerts && reading.alerts.length > 0;
  return `
    <div class="metric-cell${flagged ? " flagged" : ""}">
      <div class="metric-label">${meta.label}</div>
      <div class="metric-value">${reading.latest}<small>${meta.unit}</small></div>
      <div class="metric-range">${reading.min}&ndash;${reading.max} avg ${reading.avg}</div>
      ${flagged ? `<div class="metric-flag">${reading.alerts.map(describeAlert).join(", ")}</div>` : ""}
    </div>`;
}

function turbineTileHtml(tile) {
  const flagged = tile.alerts.length > 0;
  const hasData = Object.keys(tile.metrics).length > 0;
  return `
    <article class="turbine-tile${flagged ? " flagged" : ""}">
      <div class="tile-nameplate">
        <span class="tile-id"><span class="beacon ${flagged ? "alert" : "ok"}"></span>${tile.site_id}</span>
        <span class="tile-status${flagged ? " alert" : ""}">${flagged ? tile.alerts.map((a) => describeAlert(a.key)).join(", ") : "nominal"}</span>
      </div>
      ${hasData
        ? `<div class="metric-grid">${METRIC_ORDER.map((m) => metricCellHtml(m, tile.metrics[m])).join("")}</div>`
        : `<div class="tile-empty">awaiting telemetry</div>`}
    </article>`;
}

function paintFleetReadout(tiles, backendStats) {
  const flaggedCount = tiles.reduce((sum, t) => sum + t.alerts.length, 0);
  const box = document.getElementById("fleet-readout");
  box.innerHTML = `
    <div><dt>Turbines</dt><dd>${tiles.length}</dd></div>
    <div><dt>Active Alerts</dt><dd>${flaggedCount}</dd></div>
    <div><dt>Records Archived</dt><dd>${backendStats.items_in_table}</dd></div>`;
}

function paintAlertStrip(tiles) {
  const strip = document.getElementById("alert-strip");
  const flagged = [];
  for (const tile of tiles) {
    for (const alert of tile.alerts) flagged.push(`${tile.site_id}: ${describeAlert(alert.key)}`);
  }
  if (flagged.length === 0) {
    strip.className = "alert-strip calm";
    strip.textContent = "All turbines within normal operating envelope";
    return;
  }
  strip.className = "alert-strip hot";
  strip.textContent = flagged.join("   |   ");
}

function paintPipelineFooter(health) {
  const footer = document.getElementById("pipeline-footer");
  const item = (label, ok) => `<span class="${ok ? "" : "down"}">${label}: ${ok ? "up" : "down"}</span>`;
  footer.innerHTML = [
    item("fog gateway", health.fog_gateway),
    item("queue", health.queue),
    item("lambda", health.lambda),
    item("pipeline", health.pipeline),
    `<span>freshest window: ${health.freshest_age_seconds === null ? "n/a" : health.freshest_age_seconds.toFixed(1) + "s ago"}</span>`,
  ].join("");
}

function ensurePowerTrendChart() {
  if (powerTrendChart) return powerTrendChart;
  const ctx = document.getElementById("power-trend-chart");
  powerTrendChart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#a9c2d6", font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#a9c2d6", font: { size: 10 } }, grid: { color: "#23496d" } },
        y: { ticks: { color: "#a9c2d6", font: { size: 10 } }, grid: { color: "#23496d" }, title: { display: true, text: "kW", color: "#a9c2d6" } },
      },
    },
  });
  return powerTrendChart;
}

async function refreshPowerTrend(siteIds) {
  const chart = ensurePowerTrendChart();
  const series = await Promise.all(siteIds.map(async (siteId) => {
    const res = await fetch(`${API_BASE}/api/readings?sensor_type=power_output_kw&site_id=${siteId}&limit=30`);
    const data = await res.json();
    return { siteId, items: data.items };
  }));

  const longest = series.reduce((a, b) => (a.items.length > b.items.length ? a : b), series[0]);
  chart.data.labels = longest.items.map((i) => new Date(i.window_end).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }));
  chart.data.datasets = series.map((s) => ({
    label: s.siteId,
    data: s.items.map((i) => i.avg),
    borderColor: TURBINE_COLORS[s.siteId] || "#5fc2d1",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));
  chart.update();
}

async function poll() {
  try {
    const [gridData, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/farm-grid`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const tiles = gridData.tiles;
    paintFleetReadout(tiles, backendStats);
    paintAlertStrip(tiles);
    document.getElementById("farm-grid").innerHTML = tiles.map(turbineTileHtml).join("");
    paintPipelineFooter(health);
    await refreshPowerTrend(tiles.map((t) => t.site_id));
  } catch (err) {
    // backend not ready yet; next poll retries
  }
}

poll();
setInterval(poll, 2500);
