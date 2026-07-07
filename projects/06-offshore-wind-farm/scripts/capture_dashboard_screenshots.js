// Captures real rendered screenshots of the live dashboard at desktop and
// mobile viewport widths, using headless Chromium (Playwright) driven from
// the same host/network namespace as the running docker-compose stack.
// Run with the stack already up:
//   cd scripts && npm install && node capture_dashboard_screenshots.js
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:8085/";
const OUT_DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, "..", "docs");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function captureViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(DASHBOARD_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".turbine-tile", { timeout: 15000 });
  await page.waitForTimeout(2000); // let the chart finish drawing

  const outPath = path.join(OUT_DIR, `dashboard-${name}.png`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });

  const tileCount = await page.locator(".turbine-tile").count();
  await page.close();

  return { name, viewport, outPath, tileCount, consoleErrors };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      results.push(await captureViewport(browser, name, viewport));
    }
  } finally {
    await browser.close();
  }

  let failed = false;
  for (const r of results) {
    console.log(`${r.name} (${r.viewport.width}x${r.viewport.height}): ${r.outPath}`);
    console.log(`  turbine tiles rendered: ${r.tileCount}`);
    if (r.consoleErrors.length) {
      failed = true;
      console.log(`  console errors: ${JSON.stringify(r.consoleErrors)}`);
    } else {
      console.log("  console errors: none");
    }
    if (r.tileCount < 1) failed = true;
  }

  if (failed) {
    console.error("FAILED: console errors or missing turbine tiles at one or more viewports");
    process.exit(1);
  }
  console.log("OK: dashboard rendered cleanly at all configured viewports");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
