const POLL_INTERVAL_MS = 2500;

// occupied_spaces is rendered separately as the primary <progress> gauge;
// everything else here is secondary detail rendered as plain rows.
const SECONDARY_SENSOR_META = {
  entry_rate_per_min: { label: "Entry rate" },
  exit_rate_per_min: { label: "Exit rate" },
  avg_dwell_time_min: { label: "Avg dwell time" },
  gate_fault_events: { label: "Gate faults" },
};
const SECONDARY_ORDER = Object.keys(SECONDARY_SENSOR_META);

const STATUS_LABEL = {
  normal: "Normal",
  busy: "Busy",
  near_full: "Near Full",
  alert: "Alert",
  pending: "Pending",
};

function setDot(id, ok) {
  const el = document.getElementById(id);
  el.classList.remove("ok", "down");
  el.classList.add(ok ? "ok" : "down");
}

function formatNumber(value, digits) {
  return typeof value === "number" ? value.toFixed(digits) : "--";
}

function renderSecondaryRow(sensorType, reading) {
  const meta = SECONDARY_SENSOR_META[sensorType];
  if (!reading) {
    return `
      <div class="reading-row">
        <span class="reading-label">${meta.label}</span>
        <span class="reading-value no-data">no data</span>
      </div>`;
  }
  return `
    <div class="reading-row">
      <span class="reading-label">${meta.label}</span>
      <span class="reading-value">${formatNumber(reading.latest, 1)}<span class="unit">${reading.unit}</span></span>
    </div>`;
}

function renderAlertTags(readings) {
  const alerts = [];
  for (const sensorType of ["occupied_spaces", ...SECONDARY_ORDER]) {
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

function renderLotCard(lot) {
  const occupied = lot.readings.occupied_spaces;
  const occupiedValue = occupied ? occupied.latest : 0;
  const statusClass = `status-${lot.status}`;
  const statusLabel = STATUS_LABEL[lot.status] || lot.status;
  const pctText = typeof lot.occupancy_pct === "number" ? `${lot.occupancy_pct.toFixed(1)}%` : "pending";

  let updated = "no windows yet";
  if (occupied && occupied.window_end) {
    updated = new Date(occupied.window_end).toLocaleTimeString();
  }

  const rows = SECONDARY_ORDER.map((sensorType) => renderSecondaryRow(sensorType, lot.readings[sensorType])).join("");

  return `
    <article class="lot-card">
      <div class="lot-card-head">
        <div>
          <h3 class="lot-name">${lot.site_id}</h3>
          <p class="lot-updated">latest window: ${updated}</p>
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="capacity-block">
        <div class="capacity-figures">
          <span class="capacity-count">${occupiedValue} / ${lot.capacity}</span>
          <span class="capacity-pct">${pctText}</span>
        </div>
        <progress class="capacity-gauge" max="${lot.capacity}" value="${occupiedValue}"></progress>
      </div>
      ${renderAlertTags(lot.readings)}
      <div class="reading-rows">${rows}</div>
    </article>`;
}

async function refreshLots() {
  const resp = await fetch("/api/lots");
  const body = await resp.json();
  document.getElementById("lot-grid").innerHTML = body.lots.map(renderLotCard).join("");
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
  const [lotA, lotB] = await Promise.all([
    fetch("/api/readings?sensor_type=occupied_spaces&site_id=lot-a&limit=20").then((r) => r.json()),
    fetch("/api/readings?sensor_type=occupied_spaces&site_id=lot-b&limit=20").then((r) => r.json()),
  ]);

  const labels = lotA.items.map((item) => new Date(item.window_end).toLocaleTimeString());
  const dataA = lotA.items.map((item) => item.avg);
  const dataB = lotB.items.map((item) => item.avg);

  if (!trendChart) {
    const ctx = document.getElementById("occupancy-trend-chart").getContext("2d");
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "lot-a (occupied)", data: dataA, borderColor: "#a78bfa", backgroundColor: "transparent", tension: 0.25 },
          { label: "lot-b (occupied)", data: dataB, borderColor: "#f472b6", backgroundColor: "transparent", tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          y: { beginAtZero: true, max: 300, ticks: { color: "#a79fc2" }, grid: { color: "#322c46" } },
          x: { ticks: { color: "#a79fc2" }, grid: { color: "#322c46" } },
        },
        plugins: { legend: { position: "bottom", labels: { color: "#eee9f5" } } },
      },
    });
  } else {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = dataA;
    trendChart.data.datasets[1].data = dataB;
    trendChart.update("none");
  }
}

async function pollOnce() {
  try {
    await Promise.all([refreshLots(), refreshHealth(), refreshBackendStats(), refreshTrendChart()]);
    await loadRulesOnce();
  } catch (err) {
    console.error("dashboard poll failed", err);
  }
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
