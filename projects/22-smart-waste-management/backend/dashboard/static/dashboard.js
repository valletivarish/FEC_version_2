const SENSOR_TYPES = ["fill_level_pct", "internal_temp_c", "gas_level_ppm", "bin_weight_kg", "lid_open_count"];

const METRIC_LABELS = {
  fill_level_pct: "Fill Level",
  internal_temp_c: "Internal Temp",
  gas_level_ppm: "Gas Level",
  bin_weight_kg: "Bin Weight",
  lid_open_count: "Lid Open Events",
};

const ALERT_LABELS = {
  collection_needed: "Collection needed",
  fire_risk_warning: "Fire risk warning",
  odor_gas_exceedance: "Odor / gas exceedance",
  tamper_suspected: "Tamper suspected",
};

const DISTRICT_LABELS = { "district-a": "District A", "district-b": "District B" };

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from fog/alerts.js.
const AXIS_RANGE = {
  fill_level_pct: { lo: 0, hi: 100 },
  internal_temp_c: { lo: 10, hi: 70 },
  gas_level_ppm: { lo: 0, hi: 1000 },
  bin_weight_kg: { lo: 0, hi: 500 },
  lid_open_count: { lo: 0, hi: 20 },
};

const TREND_COLORS = { "district-a": "#22a294", "district-b": "#e0794f" };
let trendChart = null;

function districtLabel(siteId) {
  return DISTRICT_LABELS[siteId] || siteId;
}

function alertText(alerts) {
  return alerts.map((a) => ALERT_LABELS[a.key || a] || a.key || a).join(", ");
}

// Primary view: a plain sorted worklist -- one row per bin, already sorted
// by the backend (buildPriorityList) by fill_level_pct descending. Rendered
// as-is, in the order the API returns it, rather than re-grouped by site.
function renderPriorityList(bins) {
  const body = document.getElementById("priority-body");
  body.innerHTML = bins
    .map((bin, index) => {
      const flagged = bin.alerts && bin.alerts.length > 0;
      const fill = bin.fill_level_pct;
      const { lo, hi } = AXIS_RANGE.fill_level_pct;
      const fillCell = fill
        ? `<span class="fill-value">${fill.latest}<span class="unit">%</span></span>
           <meter class="priority-meter${flagged ? " danger" : ""}" min="${lo}" max="${hi}" value="${fill.latest}"></meter>`
        : `<span class="fill-value">&ndash;&ndash;</span>`;
      const statusBadge = flagged
        ? `<span class="status-badge-list">${bin.alerts.map((a) => `<span class="status-badge alert">${ALERT_LABELS[a.key] || a.key}</span>`).join("")}</span>`
        : `<span class="status-badge">Compliant</span>`;
      return `<tr class="${flagged ? "urgent" : ""}">
        <td><span class="bin-name">${districtLabel(bin.site_id)}</span><span class="bin-rank">Priority #${index + 1}</span></td>
        <td class="fill-cell">${fillCell}</td>
        <td>${statusBadge}</td>
      </tr>`;
    })
    .join("");
}

function readingRow(sensorType, metric) {
  const label = METRIC_LABELS[sensorType];
  if (!metric) {
    return `<div class="reading-row"><span class="reading-label">${label}</span><span class="reading-body">&ndash;&ndash;</span></div>`;
  }
  const flagged = metric.alerts && metric.alerts.length > 0;
  const { lo, hi } = AXIS_RANGE[sensorType];
  return `<div class="reading-row">
    <span class="reading-label">${label}${flagged ? ` &mdash; ${alertText(metric.alerts.map((k) => ({ key: k })))}` : ""}</span>
    <span class="reading-body">
      <span class="reading-value">${metric.latest}<span class="unit">${metric.unit}</span></span>
      <meter class="${flagged ? "danger" : ""}" min="${lo}" max="${hi}" value="${metric.latest}"></meter>
    </span>
  </div>`;
}

// Secondary section: per-district cards, all 5 raw readings as rows with
// native <meter> bars -- demoted beneath the priority list, which is the
// primary structural view for this dashboard.
function renderDistrictGrid(districts) {
  const grid = document.getElementById("district-grid");
  grid.innerHTML = districts
    .map((district) => {
      const rows = SENSOR_TYPES.map((sensorType) => readingRow(sensorType, district.metrics[sensorType])).join("");
      const statusBadge = district.compliant
        ? `<span class="status-badge">Compliant</span>`
        : `<span class="status-badge alert">${district.alerts.length} alert(s)</span>`;
      return `<div class="district-card">
        <h3>${districtLabel(district.site_id)}</h3>
        <div class="district-status">${statusBadge}</div>
        ${rows}
      </div>`;
    })
    .join("");
}

function renderAlertBanner(districts) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const district of districts) {
    for (const alert of district.alerts || []) {
      active.push(`${districtLabel(district.site_id)}: ${ALERT_LABELS[alert.key] || alert.key}`);
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

function renderTrendChart(items) {
  const canvas = document.getElementById("trend-fill_level_pct");
  if (!canvas) return;

  const bySite = {};
  for (const item of items) {
    (bySite[item.site_id] = bySite[item.site_id] || []).push(item);
  }

  const labels = Object.values(bySite)[0] ? Object.values(bySite)[0].map((_, i) => i) : [0];
  const datasets = Object.entries(bySite).map(([siteId, points]) => ({
    label: districtLabel(siteId),
    data: points.map((p) => p.avg),
    borderColor: TREND_COLORS[siteId] || "#999",
    backgroundColor: "transparent",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
  }));

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets = datasets;
    trendChart.update();
    return;
  }

  trendChart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#9db0ac" } } },
      scales: {
        x: { display: false },
        y: { display: true, min: 0, max: 100, ticks: { font: { size: 10 }, color: "#9db0ac" }, grid: { color: "#3a4245" } },
      },
    },
  });
}

async function tick() {
  try {
    const [priority, districtsResp, health, backendStats, trend] = await Promise.all([
      fetch("/api/priority").then((r) => r.json()),
      fetch("/api/districts").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
      fetch("/api/readings?sensor_type=fill_level_pct&limit=20").then((r) => r.json()),
    ]);

    const districts = districtsResp.districts || [];
    renderPriorityList(priority.bins || []);
    renderDistrictGrid(districts);
    renderAlertBanner(districts);
    renderHealth(health);
    renderBackendStats(backendStats);
    renderTrendChart(trend.items || []);
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

tick();
setInterval(tick, 2500);
