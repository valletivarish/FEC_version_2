const SENSOR_TYPES = ["crane_load_kg", "container_stack_height", "wind_speed_knots", "berth_occupancy_pct", "reefer_temp_c"];

const METRIC_LABELS = {
  crane_load_kg: "Crane Load",
  container_stack_height: "Container Stack Height",
  wind_speed_knots: "Wind Speed",
  berth_occupancy_pct: "Berth Occupancy",
  reefer_temp_c: "Reefer Temperature",
};

const ALERT_LABELS = {
  crane_overload_risk: "Crane overload risk",
  high_wind_crane_halt: "High wind crane halt",
  berth_congestion_warning: "Berth congestion warning",
  reefer_temp_breach: "Reefer temperature breach",
};

// Axis bounds -- the range each reading's <meter> is drawn against, not a
// decision threshold. Real alert thresholds come from /api/thresholds.
const AXIS_RANGE = {
  crane_load_kg: { lo: 0, hi: 40000 },
  container_stack_height: { lo: 0, hi: 8 },
  wind_speed_knots: { lo: 0, hi: 60 },
  berth_occupancy_pct: { lo: 0, hi: 100 },
  reefer_temp_c: { lo: -25, hi: 10 },
};

const TREND_COLORS = { "berth-a": "#c85a12", "berth-b": "#3fae6a" };
let craneChart = null;

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

function renderReadingRows(containerId, berth) {
  const container = document.getElementById(containerId);
  if (!berth) {
    container.innerHTML = SENSOR_TYPES.map((t) => readingRow(t, null)).join("");
    return;
  }
  container.innerHTML = SENSOR_TYPES.map((sensorType) => readingRow(sensorType, berth.metrics[sensorType])).join("");
}

// Primary structural view: a plain inline text status line, e.g.
// "Crane: Nominal | Wind: Safe | Reefer: Nominal | Occupancy: 45%".
// Colour is applied only to an individual segment's VALUE span when that
// segment is active -- never a background/tile colour on the whole line.
function renderStatusLine(elId, berthLabel, berth) {
  const el = document.getElementById(elId);
  const segments = berth && berth.status_line ? berth.status_line : [
    { label: "Crane", value: "No Data", active: false },
    { label: "Wind", value: "No Data", active: false },
    { label: "Reefer", value: "No Data", active: false },
    { label: "Occupancy", value: "--%", active: false },
  ];
  const body = segments
    .map((s) => `<span class="seg-label">${s.label}:</span> <span class="seg-value${s.active ? " active" : ""}">${s.value}</span>`)
    .join('<span class="sep">|</span>');
  el.innerHTML = `<span class="berth-label">${berthLabel}</span>${body}`;
}

function renderAlertBanner(berths) {
  const banner = document.getElementById("alert-banner");
  const active = [];
  for (const berth of berths) {
    for (const segment of berth.status_line || []) {
      if (segment.active) active.push(`${berth.site_id}: ${segment.label} ${segment.value}`);
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
  const res = await fetch(`/api/readings?sensor_type=${sensorType}&limit=20`);
  return res.json();
}

function renderCraneTrend(items) {
  const canvas = document.getElementById("trend-crane");
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

  if (craneChart) {
    craneChart.data.labels = labels.length ? labels : [0];
    craneChart.data.datasets = datasets;
    craneChart.update();
    return;
  }

  craneChart = new Chart(canvas, {
    type: "line",
    data: { labels: labels.length ? labels : [0], datasets },
    options: {
      animation: false,
      responsive: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: "#a9c3d3" } } },
      scales: {
        x: { display: false },
        y: { display: true, ticks: { font: { size: 10 }, color: "#a9c3d3" }, grid: { color: "#326f92" } },
      },
    },
  });
}

async function tick() {
  try {
    const [berthsResp, health, backendStats] = await Promise.all([
      fetch("/api/berths").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const berths = berthsResp.berths || [];
    const berthA = berths.find((b) => b.site_id === "berth-a");
    const berthB = berths.find((b) => b.site_id === "berth-b");

    renderStatusLine("status-berth-a", "Berth A", berthA);
    renderStatusLine("status-berth-b", "Berth B", berthB);
    renderReadingRows("berth-a-rows", berthA);
    renderReadingRows("berth-b-rows", berthB);
    renderAlertBanner(berths);
    renderHealth(health);
    renderBackendStats(backendStats);

    const craneTrend = await fetchTrend("crane_load_kg");
    renderCraneTrend(craneTrend.items || []);
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

tick();
setInterval(tick, 2500);
