const READING_TYPES = ["storage_temperature", "humidity", "door_open_seconds", "shock_vibration", "co2_level"];

const READING_META = {
  storage_temperature: { label: "Storage Temp", unit: "C" },
  humidity:            { label: "Humidity",     unit: "%" },
  door_open_seconds:   { label: "Door Open",    unit: "s" },
  shock_vibration:     { label: "Shock",        unit: "g" },
  co2_level:           { label: "CO2",          unit: "ppm" },
};

const EXCEPTION_TEXT = {
  cold_chain_breach: "Cold chain breach",
  humidity_breach: "Humidity breach",
  door_open_alert: "Door open too long",
  impact_detected: "Impact detected",
  air_quality_warning: "CO2 elevated",
};

const STALE_AFTER_SECONDS = 30;
const tempTrendCharts = {};

function elapsedSeconds(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function clockStamp(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function describeException(key) {
  return EXCEPTION_TEXT[key] || key.replace(/_/g, " ");
}

function paintDepotSummary(containers) {
  const box = document.getElementById("depot-summary");
  const exceptionCount = containers.reduce(
    (sum, c) => sum + Object.values(c.readings).filter((r) => r.alerts.length).length, 0
  );
  box.innerHTML =
    `<span>${containers.length} CONTAINERS TRACKED</span>` +
    `<span class="${exceptionCount ? "hot" : ""}">${exceptionCount} OPEN EXCEPTIONS</span>`;
}

function paintExceptionStrip(containers) {
  const box = document.getElementById("exception-strip");
  const exceptions = [];
  for (const container of containers) {
    for (const [readingType, reading] of Object.entries(container.readings)) {
      for (const key of reading.alerts) {
        exceptions.push({ container_id: container.container_id, readingType, key });
      }
    }
  }
  if (exceptions.length === 0) {
    box.className = "exception-strip clear";
    box.innerHTML = "No open exceptions across tracked containers";
    return;
  }
  box.className = "exception-strip hot";
  box.innerHTML = exceptions
    .map((e) => `${e.container_id.toUpperCase()}: ${describeException(e.key)}`)
    .join(" &nbsp;&middot;&nbsp; ");
}

function readingCellHtml(readingType, reading) {
  const meta = READING_META[readingType];
  if (!reading) return `<td class="cell-empty">&ndash;</td>`;
  const flagged = reading.alerts.length > 0;
  return `<td class="${flagged ? "cell-flagged" : ""}">${reading.latest}<span class="cell-unit">${meta.unit}</span></td>`;
}

function manifestRowHtml(container) {
  const flaggedTypes = READING_TYPES.filter((t) => container.readings[t] && container.readings[t].alerts.length);
  const anyReading = Object.values(container.readings)[0];
  const age = anyReading ? elapsedSeconds(anyReading.window_end) : null;
  const staleClass = age !== null && age > STALE_AFTER_SECONDS ? " row-stale" : "";
  const statusHtml = flaggedTypes.length
    ? `<span class="status-badge status-exception">${flaggedTypes.length} exception${flaggedTypes.length > 1 ? "s" : ""}</span>`
    : `<span class="status-badge status-ok">OK</span>`;

  return `
    <tr class="${flaggedTypes.length ? "row-flagged" : ""}${staleClass}">
      <td class="cell-container">${container.container_id.toUpperCase()}</td>
      ${READING_TYPES.map((t) => readingCellHtml(t, container.readings[t])).join("")}
      <td>${statusHtml}</td>
      <td class="cell-age">${age !== null ? `${age}s ago` : "&ndash;"}</td>
    </tr>`;
}

function makeTempTrendChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: "#ff6a00", borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false }] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b8578", maxTicksLimit: 5 }, grid: { color: "#e2ddd2" } },
        y: { ticks: { color: "#8b8578" }, grid: { color: "#e2ddd2" } },
      },
    },
  });
}

function tempTrendTileSkeleton(containerId) {
  return `
    <div class="temp-tile" data-container="${containerId}">
      <div class="temp-tile-label">${containerId.toUpperCase()}</div>
      <canvas></canvas>
    </div>`;
}

async function refreshTempTrend(containerId) {
  const res = await fetch(`/api/readings?sensor_type=storage_temperature&site_id=${containerId}&limit=30`);
  const data = await res.json();
  if (!data.items.length) return;

  if (!tempTrendCharts[containerId]) {
    const canvas = document.querySelector(`.temp-tile[data-container="${containerId}"] canvas`);
    if (!canvas) return;
    tempTrendCharts[containerId] = makeTempTrendChart(canvas);
  }
  const chart = tempTrendCharts[containerId];
  chart.data.labels = data.items.map((i) => clockStamp(i.window_end));
  chart.data.datasets[0].data = data.items.map((i) => i.avg);
  chart.update();
}

async function syncManifest() {
  try {
    const [manifestData, health, backend] = await Promise.all([
      fetch("/api/manifest").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/backend-stats").then((r) => r.json()),
    ]);

    const containers = manifestData.containers;
    paintDepotSummary(containers);
    paintExceptionStrip(containers);

    document.getElementById("manifest-body").innerHTML = containers.map(manifestRowHtml).join("");

    const trendGrid = document.getElementById("temp-trend-grid");
    const knownContainers = Object.keys(tempTrendCharts);
    const currentIds = containers.map((c) => c.container_id);
    if (knownContainers.length !== currentIds.length || !currentIds.every((id) => knownContainers.includes(id))) {
      for (const key of Object.keys(tempTrendCharts)) {
        tempTrendCharts[key].destroy();
        delete tempTrendCharts[key];
      }
      trendGrid.innerHTML = currentIds.map(tempTrendTileSkeleton).join("");
    }
    await Promise.all(currentIds.map(refreshTempTrend));

    document.getElementById("depot-status").innerHTML =
      `<span>depot relay: ${health.depot ? "online" : "offline"}</span>` +
      `<span>queue: ${health.queue ? "reachable" : "unreachable"}${backend.queue ? ` (${backend.queue.waiting} pending)` : ""}</span>` +
      `<span>lambda: ${health.lambda ? "deployed" : "not found"}</span>` +
      `<span>records archived: ${backend.items_in_table}</span>`;
  } catch (e) {
    // backend not ready yet; next sync retries
  }
}

syncManifest();
setInterval(syncManifest, 2500);
