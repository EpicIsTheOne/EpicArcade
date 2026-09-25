import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const port = 4189;
const server = spawn(process.execPath, ["scripts/serve.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {
      await delay(100);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  assert.equal(await page.title(), "Lumen Threshold: Astra's Relay");
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.state), "title");
  await page.click("#play-button");
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.state), "full");
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.audioContext), "running");
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.audioEvents > 400), true);
  await page.keyboard.press("KeyP");
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.state), "paused");
  await page.keyboard.press("KeyP");
  assert.equal(await page.evaluate(() => window.__LUMEN_DEBUG__.state), "full");
  await page.screenshot({ path: "screenshots-browser-smoke.png" });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("browser smoke test passed");
} finally {
  server.kill();
}
