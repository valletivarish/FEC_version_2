(function () {
  "use strict";

  var board = document.getElementById("board");
  var rawBase = board.getAttribute("data-api-base") || "";
  var API = rawBase && rawBase.indexOf("__API_BASE__") !== 0 ? rawBase.replace(/\/$/, "") : "";

  var SIGNALS = [
    { key: "dc_load_amps", label: "DC load", unit: "A" },
    { key: "battery_charge_pct", label: "Battery", unit: "%" },
    { key: "genset_fuel_pct", label: "Genset", unit: "%" },
    { key: "cabinet_temp_c", label: "Cabinet", unit: "°C" },
    { key: "rf_utilization_pct", label: "RF load", unit: "%" }
  ];

  var SOURCE_LABEL = { on_grid: "On grid", on_battery: "On battery", on_genset: "On genset", degraded: "Degraded" };
  var ALERT_LABEL = {
    battery_critical: "Battery critical",
    battery_low: "Battery low",
    refuel_required: "Refuel required",
    thermal_alarm: "Cabinet over-temp",
    overcurrent: "DC overcurrent",
    capacity_saturation: "RF saturation"
  };
  var CRIT = { battery_critical: 1, thermal_alarm: 1, overcurrent: 1, refuel_required: 1 };

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function fmtAutonomy(min) {
    if (min == null) return "—";
    if (min >= 1440) return "24h+";
    if (min < 60) return min + "m";
    return Math.floor(min / 60) + "h " + (min % 60) + "m";
  }

  function trendOf(series) {
    if (!series || series.length < 2) return "steady";
    var d = series[series.length - 1] - series[0];
    if (d > 1.5) return "rising";
    if (d < -1.5) return "falling";
    return "steady";
  }
  var ARROW = { rising: "▲", falling: "▼", steady: "→" };

  function fillColor(pct) {
    if (pct < 15) return "var(--degraded)";
    if (pct < 40) return "var(--battery)";
    return "var(--grid)";
  }

  function tank(label, sig) {
    if (!sig) return "";
    var pct = Math.max(0, Math.min(100, sig.last));
    return '<div class="tank"><div class="row"><span>' + label + '</span><span class="val">' +
      sig.last.toFixed(1) + '%</span></div><div class="track"><div class="fill" style="width:' +
      pct + '%;background:' + fillColor(pct) + '"></div></div></div>';
  }

  function signalCell(meta, sig) {
    if (!sig) return '<div class="sig"><div class="k">' + meta.label + '</div><div class="v">—</div></div>';
    var t = trendOf(sig.series);
    return '<div class="sig"><div class="k">' + meta.label + '</div><div class="v">' +
      sig.last.toFixed(1) + '<span class="u"> ' + meta.unit + '</span>' +
      '<span class="trend ' + t + '">' + ARROW[t] + '</span></div></div>';
  }

  function alertsBlock(list) {
    if (!list || list.length === 0) return '<div class="alerts"><span class="clear">no active alarms</span></div>';
    var seen = {};
    var chips = list.filter(function (a) {
      if (seen[a.key]) return false; seen[a.key] = 1; return true;
    }).map(function (a) {
      var cls = CRIT[a.key] ? "chip crit" : "chip";
      return '<span class="' + cls + '">' + esc(ALERT_LABEL[a.key] || a.key) + "</span>";
    });
    return '<div class="alerts">' + chips.join("") + "</div>";
  }

  function siteCard(site) {
    var s = site.signals || {};
    var cells = SIGNALS.map(function (m) { return signalCell(m, s[m.key]); }).join("");
    return '<article class="site">' +
      '<div class="site-head"><span class="name">' + esc(site.site_id.replace("-", " ")) + '</span>' +
      '<span class="pill ' + site.source + '">' + (SOURCE_LABEL[site.source] || site.source) + "</span></div>" +
      '<div class="autonomy"><span class="big">' + fmtAutonomy(site.autonomy_minutes) +
      '</span><span class="cap">battery runtime at ' + site.load_amps.toFixed(1) + ' A load</span></div>' +
      '<div class="tanks">' + tank("Battery charge", s.battery_charge_pct) + tank("Genset fuel", s.genset_fuel_pct) + "</div>" +
      '<canvas class="spark"></canvas>' +
      '<div class="signals">' + cells + "</div>" +
      alertsBlock(site.active_alerts) +
      "</article>";
  }

  function drawSpark(canvas, series) {
    if (!series || series.length < 2) return;
    var ratio = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * ratio; canvas.height = h * ratio;
    var ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
    var span = max - min || 1;
    var x = function (i) { return (i / (series.length - 1)) * (w - 2) + 1; };
    var y = function (v) { return h - 3 - ((v - min) / span) * (h - 6); };
    ctx.beginPath();
    ctx.moveTo(x(0), y(series[0]));
    for (var i = 1; i < series.length; i++) ctx.lineTo(x(i), y(series[i]));
    ctx.strokeStyle = "#4a90e2";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(x(series.length - 1), h);
    ctx.lineTo(x(0), h);
    ctx.closePath();
    ctx.fillStyle = "rgba(74,144,226,0.10)";
    ctx.fill();
  }

  function renderSites(payload) {
    var sites = payload.sites || [];
    document.getElementById("sites").innerHTML = sites.map(siteCard).join("");
    var canvases = document.querySelectorAll(".spark");
    sites.forEach(function (site, idx) {
      var bat = site.signals && site.signals.battery_charge_pct;
      if (canvases[idx] && bat) drawSpark(canvases[idx], bat.series);
    });
    var r = payload.rollup || {};
    document.getElementById("banner").innerHTML =
      "<strong>" + (r.sites || 0) + "</strong> sites &middot; <strong>" + (r.on_battery || 0) +
      "</strong> on battery &middot; <strong>" + (r.alerting || 0) + "</strong> alerting &middot; worst autonomy <strong>" +
      fmtAutonomy(r.worst_autonomy_minutes) + "</strong>";
  }

  function renderHealth(h) {
    var order = [["gateway", "gateway"], ["queue", "queue"], ["lambda", "lambda"], ["pipeline", "pipeline"]];
    document.getElementById("health").innerHTML = order.map(function (p) {
      var state = h[p[0]] === "up" ? "up" : "down";
      return '<span class="hpill ' + state + '"><span class="dot"></span>' + p[1] + "</span>";
    }).join("");
  }

  function renderStats(s) {
    document.getElementById("stats").innerHTML =
      "queue <strong>" + (s.queue_depth == null ? "—" : s.queue_depth) + "</strong> &middot; stored <strong>" +
      (s.stored_windows || 0) + "</strong> windows &middot; freshest <strong>" +
      (s.freshest_age_seconds == null ? "—" : s.freshest_age_seconds + "s") + "</strong> ago";
  }

  function get(path) { return fetch(API + path).then(function (r) { return r.json(); }); }

  function tick() {
    get("/api/sites").then(renderSites).catch(function () {
      document.getElementById("banner").textContent = "gateway unreachable";
    });
    get("/api/health").then(renderHealth).catch(function () {});
    get("/api/backend-stats").then(renderStats).catch(function () {});
  }

  tick();
  setInterval(tick, 5000);
})();
