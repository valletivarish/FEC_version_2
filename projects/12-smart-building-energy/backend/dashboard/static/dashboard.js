const POLL_INTERVAL_MS = 2500;

const SENSOR_META = {
  energy_consumption_kw: { label: "Energy", lo: 2, hi: 80 },
  co2_ppm: { label: "CO2", lo: 350, hi: 1500 },
  occupancy_count: { label: "Occupancy", lo: 0, hi: 120 },
  hvac_temp_c: { label: "HVAC Temp", lo: 14, hi: 30 },
  water_usage_lpm: { label: "Water Usage", lo: 0, hi: 40 },
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

function renderFloorCard(floor) {
  const grade = floor.efficiency_grade;
  const gradeClass = grade ? `grade-${grade}` : "grade-pending";
  const gradeLetter = grade || "--";
  const scoreText = typeof floor.efficiency_score === "number" ? `${floor.efficiency_score.toFixed(1)} / 100` : "pending";

  let updated = "no windows yet";
  for (const sensorType of SENSOR_ORDER) {
    const reading = floor.readings[sensorType];
    if (reading && reading.window_end) {
      updated = new Date(reading.window_end).toLocaleTimeString();
      break;
    }
  }

  const rows = SENSOR_ORDER.map((sensorType) => renderReadingRow(sensorType, floor.readings[sensorType])).join("");

  return `
    <article class="floor-card">
      <div class="floor-card-head">
        <div>
          <h3 class="floor-name">${floor.site_id}</h3>
          <p class="floor-updated">latest window: ${updated}</p>
        </div>
        <div class="grade-badge ${gradeClass}">
          <span class="grade-letter">${gradeLetter}</span>
          <span class="grade-score">${scoreText}</span>
        </div>
      </div>
      ${renderAlertTags(floor.readings)}
      <div class="reading-rows">${rows}</div>
    </article>`;
}

async function refreshFloors() {
  const resp = await fetch("/api/floors");
  const body = await resp.json();
  document.getElementById("floor-grid").innerHTML = body.floors.map(renderFloorCard).join("");
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
  const [floor1, floor2] = await Promise.all([
    fetch("/api/readings?sensor_type=energy_consumption_kw&site_id=floor-1&limit=20").then((r) => r.json()),
    fetch("/api/readings?sensor_type=energy_consumption_kw&site_id=floor-2&limit=20").then((r) => r.json()),
  ]);

  const labels = floor1.items.map((item) => new Date(item.window_end).toLocaleTimeString());
  const data1 = floor1.items.map((item) => item.avg);
  const data2 = floor2.items.map((item) => item.avg);

  if (!trendChart) {
    const ctx = document.getElementById("energy-trend-chart").getContext("2d");
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "floor-1 (kW)", data: data1, borderColor: "#1f7a4d", backgroundColor: "transparent", tension: 0.25 },
          { label: "floor-2 (kW)", data: data2, borderColor: "#7fb69a", backgroundColor: "transparent", tension: 0.25 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { position: "bottom" } },
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
    await Promise.all([refreshFloors(), refreshHealth(), refreshBackendStats(), refreshTrendChart()]);
    await loadRulesOnce();
  } catch (err) {
    console.error("dashboard poll failed", err);
  }
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
