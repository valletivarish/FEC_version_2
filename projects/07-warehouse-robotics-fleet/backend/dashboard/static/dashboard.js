const METRIC_LABELS = {
  battery_level_pct: "Battery",
  payload_kg: "Payload",
  motor_temp_c: "Motor Temp",
  position_drift_cm: "Nav Drift",
  task_queue_depth: "Task Queue",
};

const ALERT_LABELS = {
  battery_critical: "Battery critical",
  motor_overheat: "Motor overheat",
  navigation_drift: "Navigation drift",
  fleet_backlog: "Fleet backlog",
};

const STALE_AFTER_SECONDS = 30;
const sparklines = {};
let selectedRowKey = null;

// Read once from a <link rel="api-base"> tag's href, sed-substituted at S3 upload time.
// Falls back to same-origin ("") for local dev, where the href is left as __API_BASE__.
const API_BASE = (() => {
  const link = document.querySelector('link[rel="api-base"]');
  const raw = link ? link.getAttribute("href") : "";
  return !raw || raw.includes("__API_BASE__") ? "" : raw.replace(/\/$/, "");
})();

function rowKey(row) {
  return `${row.sensor_type}::${row.site_id}`;
}

function secondsAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function metricLabel(sensorType) {
  return METRIC_LABELS[sensorType] || sensorType;
}

function renderCounters(rows, backendStats) {
  const robots = new Set(rows.map((r) => r.site_id));
  const flagged = rows.filter((r) => r.alerts && r.alerts.length).length;
  const box = document.getElementById("hud-counters");
  box.innerHTML =
    `<span>ZONES <strong>${robots.size}</strong></span>` +
    `<span>METRICS TRACKED <strong>${rows.length}</strong></span>` +
    `<span class="${flagged ? "flag" : ""}">FLAGGED <strong>${flagged}</strong></span>` +
    `<span>RECORDS <strong>${backendStats.items_in_table ?? 0}</strong></span>`;
}

function renderBanner(rows) {
  const banner = document.getElementById("hud-banner");
  const flagged = rows.filter((r) => r.alerts && r.alerts.length);
  if (flagged.length === 0) {
    banner.className = "hud-banner nominal";
    banner.textContent = "FLEET NOMINAL";
    return;
  }
  banner.className = "hud-banner alert";
  const names = flagged.map((r) => `${r.site_id}/${metricLabel(r.sensor_type)}`).join(", ");
  banner.textContent = `${flagged.length} ALERT(S) ACTIVE — ${names}`;
}

function ledClass(row, ageSeconds) {
  if (ageSeconds > STALE_AFTER_SECONDS * 2) return "dead";
  if (row.alerts && row.alerts.length) return "warn";
  return "";
}

function sortRoster(rows) {
  return [...rows].sort((a, b) => {
    const aFlagged = a.alerts && a.alerts.length ? 1 : 0;
    const bFlagged = b.alerts && b.alerts.length ? 1 : 0;
    if (aFlagged !== bFlagged) return bFlagged - aFlagged;
    if (a.site_id !== b.site_id) return a.site_id.localeCompare(b.site_id);
    return a.sensor_type.localeCompare(b.sensor_type);
  });
}

function pickSelected(rows) {
  if (selectedRowKey) {
    const match = rows.find((r) => rowKey(r) === selectedRowKey);
    if (match) return match;
  }
  const flagged = rows.find((r) => r.alerts && r.alerts.length);
  return flagged || rows[0] || null;
}

function buildSparkline(canvas, trail) {
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: trail.map((_, i) => i),
      datasets: [{ data: trail, borderColor: "#ff8a1e", borderWidth: 1.5, pointRadius: 0, tension: 0.35 }],
    },
    options: {
      animation: false,
      responsive: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { fill: false } },
    },
  });
}

function renderRoster(rows) {
  const tbody = document.getElementById("roster-body");
  const ordered = sortRoster(rows);

  // The whole tbody is rebuilt below, which detaches every existing <canvas>.
  // Any chart bound to those detached nodes must go with them, or update()
  // calls after this point resolve against elements the DOM no longer shows.
  for (const key of Object.keys(sparklines)) {
    sparklines[key].destroy();
    delete sparklines[key];
  }

  tbody.innerHTML = ordered
    .map((row) => {
      const age = secondsAgo(row.window_end);
      const key = rowKey(row);
      const flagged = row.alerts && row.alerts.length > 0;
      const stale = age > STALE_AFTER_SECONDS;
      return `<tr data-key="${key}" class="${stale ? "stale" : ""} ${key === selectedRowKey ? "selected" : ""}">
        <td class="col-led"><span class="led ${ledClass(row, age)}"></span></td>
        <td><span class="robot-id">${row.site_id}</span></td>
        <td class="metric-label">${metricLabel(row.sensor_type)}</td>
        <td><span class="metric-value ${flagged ? "flagged" : ""}">${row.latest}</span><span class="metric-unit">${row.unit}</span></td>
        <td class="spark-cell"><canvas data-key="${key}" width="90" height="24"></canvas></td>
        <td class="range-cell">${row.min}&ndash;${row.max}</td>
        <td class="age-cell">${age}s</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      selectedRowKey = tr.dataset.key;
      renderRoster(rows);
      renderDetail(rows);
    });
  });

  for (const row of ordered) {
    const key = rowKey(row);
    const canvas = tbody.querySelector(`canvas[data-key="${CSS.escape(key)}"]`);
    if (!canvas) continue;
    sparklines[key] = buildSparkline(canvas, row.trail);
  }
}

function renderDetail(rows) {
  const subject = pickSelected(rows);
  const subjectLabel = document.getElementById("detail-subject");
  const grid = document.getElementById("detail-grid");

  if (!subject) {
    subjectLabel.textContent = "";
    grid.innerHTML = `<div class="detail-empty">No telemetry yet.</div>`;
    return;
  }

  const zoneMetrics = rows.filter((r) => r.site_id === subject.site_id);
  subjectLabel.textContent = `ROBOT ${subject.site_id.toUpperCase()}`;

  grid.innerHTML = zoneMetrics
    .map((m) => {
      const flagged = m.alerts && m.alerts.length > 0;
      const tags = flagged ? m.alerts.map((a) => ALERT_LABELS[a] || a).join(", ") : "";
      return `<div class="detail-metric">
        <div class="detail-metric-name"><span>${metricLabel(m.sensor_type).toUpperCase()}</span>${flagged ? `<span class="flag-tag">${tags}</span>` : ""}</div>
        <div class="detail-metric-value">${m.latest}<span class="unit">${m.unit}</span></div>
        <div class="detail-metric-range">avg ${m.avg} &middot; range ${m.min}&ndash;${m.max} &middot; n=${m.count}</div>
      </div>`;
    })
    .join("");
}

function renderFooter(health, backendStats) {
  const footer = document.getElementById("hud-footer");
  const cls = (ok) => (ok ? "up" : "down");
  const queueInfo = backendStats.queue ? `${backendStats.queue.waiting} waiting / ${backendStats.queue.in_flight} in-flight` : "unknown";
  footer.innerHTML =
    `<span class="${cls(health.gateway)}">gateway: ${health.gateway ? "online" : "offline"}</span>` +
    `<span class="${cls(health.queue)}">queue: ${health.queue ? "reachable" : "unreachable"} (${queueInfo})</span>` +
    `<span class="${cls(health.lambda)}">lambda: ${health.lambda ? "deployed" : "not found"}</span>` +
    `<span class="${cls(health.pipeline)}">pipeline: ${health.pipeline ? "flowing" : "stalled"}</span>` +
    `<span>freshest window: ${health.freshest_age_seconds != null ? health.freshest_age_seconds.toFixed(1) + "s ago" : "n/a"}</span>`;
}

async function tick() {
  try {
    const [fleet, health, backendStats] = await Promise.all([
      fetch(`${API_BASE}/api/fleet`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const rows = fleet.rows || [];
    renderCounters(rows, backendStats);
    renderBanner(rows);
    renderRoster(rows);
    renderDetail(rows);
    renderFooter(health, backendStats);
  } catch (e) {
    // backend not ready yet; next tick retries
  }
}

tick();
setInterval(tick, 2500);
