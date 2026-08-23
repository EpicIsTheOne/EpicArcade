// Boot debug: load page, dump console + state.
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
    args: ['--no-first-run', '--mute-audio', '--use-gl=angle']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => console.log('[' + m.type() + ']', m.text().slice(0, 2400)));
  page.on('requestfailed', r => console.log('REQFAIL:', r.url().slice(-60), r.failure() && r.failure().errorText));
  await page.goto('http://127.0.0.1:8642/index.html?qa=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  const state = await page.evaluate(() => ({
    hasTHREE: typeof window.THREE !== 'undefined',
    hasCFG: !!window.CFG, hasGame: !!window.Game, hasSave: !!window.Save,
    hasTex: !!window.Tex, hasMats: !!window.Mats,
    ready: !!window.SR_READY,
    loadNote: (document.getElementById('loadNote') || {}).textContent,
    composerLoaded: typeof window.THREE !== 'undefined' && !!window.THREE.EffectComposer,
    bloomLoaded: typeof window.THREE !== 'undefined' && !!window.THREE.UnrealBloomPass
  }));
  console.log(JSON.stringify(state, null, 2));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'boot_debug.png') });
  await browser.close();
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
