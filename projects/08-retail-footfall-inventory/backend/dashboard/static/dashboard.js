const SENSOR_TYPES = ["footfall_count", "shelf_stock_pct", "fridge_temp_c", "queue_length", "energy_draw_kw"];

const METRIC_LABELS = {
  footfall_count: "Footfall",
  shelf_stock_pct: "Shelf Stock",
  fridge_temp_c: "Fridge Temp",
  queue_length: "Queue Length",
  energy_draw_kw: "Energy Draw",
};

const ALERT_LABELS = {
  restock_needed: "Restock needed",
  cold_chain_risk: "Cold chain risk",
  checkout_congestion: "Checkout congestion",
  capacity_warning: "Capacity warning",
};

const TREND_COLORS = { "store-1": "#7ac70c", "store-2": "#e8590c" };
const trendCharts = {};

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function metricUnit(stores, sensorType) {
  for (const store of stores) {
    const m = store.metrics[sensorType];
    if (m) return m.unit;
  }
  return "";
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The primary view: four glanceable KPI tiles computed live from the
 * per-store aggregate data, not fetched as a pre-shaped payload -- this is
 * the "metrics computed into KPI tiles first" structural axis for this
 * dashboard, distinct from every sibling's sensor-card/gauge/table/roster
 * primary view.
 */
function computeKpis(stores) {
  let totalFootfall = 0;
  let understocked = 0;
  let queueSum = 0;
  let queueCount = 0;
  let energySum = 0;
  let energyCount = 0;

  for (const store of stores) {
    const footfall = store.metrics.footfall_count;
    if (footfall) totalFootfall += footfall.latest;

    const stock = store.metrics.shelf_stock_pct;
    if (stock && stock.alerts && stock.alerts.includes("restock_needed")) understocked += 1;

    const queue = store.metrics.queue_length;
    if (queue) { queueSum += queue.avg; queueCount += 1; }

    const energy = store.metrics.energy_draw_kw;
    if (energy) { energySum += energy.avg; energyCount += 1; }
  }

  return {
    totalFootfall: round(totalFootfall, 2),
    understocked,
    avgQueue: queueCount ? round(queueSum / queueCount, 2) : null,
    totalEnergy: energyCount ? round(energySum, 2) : null,
  };
}

function renderKpis(stores) {
  const kpis = computeKpis(stores);
  const grid = document.getElementById("kpi-grid");

  const tiles = [
    {
      label: "Total footfall (live)",
      value: kpis.totalFootfall,
      unit: "visitors",
      flagged: false,
      sub: `${stores.length} store(s) reporting`,
    },
    {
      label: "Stores understocked",
      value: kpis.understocked,
      unit: "",
      flagged: kpis.understocked > 0,
      sub: kpis.understocked > 0 ? "shelf stock below 15% avg" : "all stores stocked",
    },
    {
      label: "Avg queue length",
      value: kpis.avgQueue ?? "--",
      unit: "people",
      flagged: kpis.avgQueue != null && kpis.avgQueue > 12,
      sub: kpis.avgQueue != null && kpis.avgQueue > 12 ? "checkout congestion risk" : "checkout flowing",
    },
    {
      label: "Total energy draw",
      value: kpis.totalEnergy ?? "--",
      unit: "kW",
      flagged: false,
      sub: "across all reporting stores",
    },
  ];

  grid.innerHTML = tiles
    .map(
      (t) => `<div class="kpi-tile ${t.flagged ? "flagged" : ""}">
        <div class="kpi-label">${t.label}</div>
        <div class="kpi-value">${t.value}<span class="unit">${t.unit}</span></div>
        <div class="kpi-sub ${t.flagged ? "flagged" : ""}">${t.sub}</div>
      </div>`
    )
    .join("");
}

function renderAlertBanner(stores) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const store of stores) {
    for (const sensorType of SENSOR_TYPES) {
      const m = store.metrics[sensorType];
      if (m && m.alerts && m.alerts.length) {
        for (const alert of m.alerts) active.push(`${store.site_id}: ${ALERT_LABELS[alert] || alert}`);
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

function renderStoreCards(stores) {
  const grid = document.getElementById("store-grid");
  grid.innerHTML = stores
    .map((store) => {
      let alertCount = 0;
      const rows = SENSOR_TYPES.map((sensorType) => {
        const m = store.metrics[sensorType];
        if (!m) return `<tr><td class="metric-name">${metricLabel(sensorType)}</td><td colspan="2">no data yet</td></tr>`;
        const flagged = m.alerts && m.alerts.length > 0;
        if (flagged) alertCount += m.alerts.length;
        const tag = flagged ? `<div class="metric-alert-tag">${m.alerts.map((a) => ALERT_LABELS[a] || a).join(", ")}</div>` : "";
        return `<tr>
          <td class="metric-name">${metricLabel(sensorType)}</td>
          <td><span class="metric-reading ${flagged ? "flagged" : ""}">${m.latest}</span> ${m.unit}${tag}</td>
          <td class="metric-range">avg ${m.avg} &middot; ${m.min}&ndash;${m.max}</td>
        </tr>`;
      }).join("");

      return `<div class="store-card">
        <div class="store-card-head">
          <h3>${store.site_id}</h3>
          <span class="store-alert-count ${alertCount ? "active" : ""}">${alertCount ? alertCount + " alert(s)" : "nominal"}</span>
        </div>
        <div class="metric-scroll">
          <table class="metric-table">
            <thead><tr><th>Metric</th><th>Latest</th><th>Window</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join("");
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
  const res = await fetch(`/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function renderTrendChart(sensorType, items) {
  const canvasId = `trend-${sensorType}`;
  let canvas = document.getElementById(canvasId);
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
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: { x: { display: false }, y: { display: true, ticks: { font: { size: 10 } } } },
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
    const [storesResp, health, backendStats] = await Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const stores = storesResp.stores || [];
    renderKpis(stores);
    renderAlertBanner(stores);
    renderStoreCards(stores);
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
