// FPS probe: boots the game (ULTRA), auto-plays with god-mode, samples frame
// times for 12s and reports avg/min fps. Headless software rendering is a
// lower bound; real GPU will be faster.
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
function findBrowser() {
  const cands = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}
(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: 'new',
    args: ['--no-first-run', '--mute-audio', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:' + (process.argv[2] || '8642') + '/index.html', { waitUntil: 'networkidle2' });
  await page.waitForFunction('!!window.SR_READY', { timeout: 45000 });
  await page.evaluate(() => { window.Game.newRun(); window.Game.invuln = 99999; window.Game.chaserGap = 40; });
  await new Promise(r => setTimeout(r, 1500));
  const stats = await page.evaluate(async () => {
    let last = performance.now();
    const deltas = [];
    const t0 = last;
    while (performance.now() - t0 < 12000) {
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now();
      deltas.push(now - last);
      last = now;
    }
    deltas.sort((a, b) => a - b);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return {
      frames: deltas.length,
      avgMs: +avg.toFixed(2),
      avgFps: +(1000 / avg).toFixed(1),
      p95Ms: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
      maxMs: +deltas[deltas.length - 1].toFixed(2),
      renderer: (() => {
        try {
          const gl = document.createElement('canvas').getContext('webgl2') ||
            document.createElement('canvas').getContext('webgl');
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'hidden';
        } catch (e) { return '?'; }
      })()
    };
  });
  console.log(JSON.stringify(stats, null, 2));
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
