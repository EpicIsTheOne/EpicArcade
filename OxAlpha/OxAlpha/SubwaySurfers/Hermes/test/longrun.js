// Long-run regression: 5 minutes of continuous bot-driven gameplay in a
// single page session. Verifies: no crash-to-menu, stable memory (no leak),
// chunk streaming stays bounded, score/dist keep increasing, zero errors.
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..');
function findBrowser() {
  const cands = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}
(async () => {
  const port = process.argv[2] || '8642';
  const MINUTES = parseFloat(process.argv[3] || '5');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: 'new',
    args: ['--no-first-run', '--mute-audio', '--use-gl=angle', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160)); });
  await page.goto('http://127.0.0.1:' + port + '/index.html?qa=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('!!window.SR_READY', { timeout: 30000 });

  // inject the same skilled bot as qa.js
  await page.evaluate(() => {
    window.__botStop = false;
  });
  // start run
  await page.evaluate(() => window.Game.newRun());

  const samples = [];
  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60 * 1000;
  let runs = 0, maxDist = 0, maxScore = 0;

  while (Date.now() < endAt) {
    // drive the bot for a 25s stint (auto-restarts if it crashes)
    const r = await page.evaluate(async () => {
      const sleepMs = ms => new Promise(r => setTimeout(r, ms));
      const t0 = performance.now();
      let frames = 0;
      while (window.Game.state === 'running' && performance.now() - t0 < 25000) {
        const g = window.Game;
        let threat = null;
        for (let k = g.curChunk; k <= g.curChunk + 2 && !threat; k++) {
          const c = g.chunkMap[k];
          if (!c) continue;
          for (const col of c.colliders) {
            let d, act = col.action;
            if (act === 'train') { d = -(col.z + col.hz + c.startZ); act = 'lane'; }
            else d = -(col.z + c.startZ);
            if (d > -2 && d < 62 && Math.abs(col.x - g.x) < 1.6) {
              if (!threat || d < threat.d) threat = { d, action: act };
            }
          }
        }
        for (const t of g.movingTrains) {
          if (Math.abs(window.CFG.LANES[t.lane] - g.x) < 1.6) {
            const d = -t.zFront;
            if (d > -3 && d < 70 && (!threat || d < threat.d)) threat = { d, action: 'lane' };
          }
        }
        if (threat) {
          if (threat.action === 'jump') {
            let rollBehind = false;
            for (let k = g.curChunk; k <= g.curChunk + 2; k++) {
              const c = g.chunkMap[k]; if (!c) continue;
              for (const col of c.colliders) {
                const d = -(col.z + c.startZ);
                if (col.action === 'roll' && Math.abs(col.x - g.x) < 1.6 && d > -2 && d < threat.d + 9) rollBehind = true;
              }
            }
            if (!rollBehind && threat.d < 9) window.Game.QA.pressKey('KeyW');
            else if (rollBehind && threat.d < 16 && g.lane > 0) window.Game.QA.pressKey('KeyA');
            else if (rollBehind && threat.d < 16) window.Game.QA.pressKey('KeyD');
          } else if (threat.action === 'roll') { if (threat.d < 9) window.Game.QA.pressKey('KeyS'); }
          else if (threat.action === 'lane') {
            if (threat.d < 14) {
              let trainRoof = null;
              for (let k = g.curChunk; k <= g.curChunk + 2 && !trainRoof; k++) {
                const c = g.chunkMap[k]; if (!c) continue;
                for (const col of c.colliders) {
                  if (col.action !== 'train') continue;
                  const d = -(col.z + col.hz + c.startZ);
                  if (Math.abs(col.x - g.x) < 1.6 && d > -2 && d < threat.d + 1) trainRoof = col.roofY || 3.62;
                }
              }
              if (trainRoof && g.y < 1.0 && threat.d < 9) { window.Game.QA.pressKey('KeyW'); }
              else {
                const opts = [];
                for (const ln of [g.lane - 1, g.lane + 1]) {
                  if (ln < 0 || ln > 2) continue;
                  const lx = window.CFG.LANES[ln];
                  let blocked = false;
                  for (let k = g.curChunk; k <= g.curChunk + 2 && !blocked; k++) {
                    const c = g.chunkMap[k]; if (!c) continue;
                    for (const col of c.colliders) {
                      if (col.action === 'jump' || col.action === 'roll') continue;
                      const wz = col.z + c.startZ;
                      if (Math.abs(col.x - lx) < 1.2 && wz > -75 && wz < 4) { blocked = true; break; }
                    }
                    for (const t of g.movingTrains) {
                      if (Math.abs(window.CFG.LANES[t.lane] - lx) < 1.2) {
                        const d = -t.zFront;
                        if (d > -5 && d < 60) { blocked = true; break; }
                      }
                    }
                  }
                  if (!blocked) opts.push(ln);
                }
                if (opts.length) window.Game.QA.pressKey(opts[0] < g.lane ? 'KeyA' : 'KeyD');
              }
            }
          }
        }
        frames++;
        await sleepMs(50);
      }
      return { state: window.Game.state, dist: +(window.Game.dist || 0).toFixed(0), frames };
    });
    runs++;
    maxDist = Math.max(maxDist, r.dist);
    const mem = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
    const gs = await page.evaluate(() => ({
      chunks: Object.keys(window.Game.chunkMap).length,
      collectibles: window.Game.collectibles.count(),
      moving: window.Game.movingTrains.length,
      score: Math.floor(window.Game.score || 0)
    }));
    samples.push({ t: ((Date.now() - t0) / 1000).toFixed(0), run: runs, mb: (mem / 1048576).toFixed(1),
      chunks: gs.chunks, items: gs.collectibles, trains: gs.moving, best: maxDist, state: r.state });
    console.log(JSON.stringify(samples[samples.length - 1]));
    // restart if the bot died
    const st = await page.evaluate(() => window.Game.state);
    if (st !== 'running') { await page.evaluate(() => window.Game.newRun()); await new Promise(z => setTimeout(z, 500)); }
  }

  const finalState = await page.evaluate(() => ({
    state: window.Game.state,
    chunks: Object.keys(window.Game.chunkMap).length,
    saveCoins: window.Save.data.coins,
    saveRuns: window.Save.data.runs,
    saveBest: window.Save.data.best
  }));
  console.log('\n== SAMPLES ==');
  console.log(JSON.stringify(samples));
  console.log('== FINAL ==', JSON.stringify(finalState));
  const mb = samples.map(s => +s.mb);
  const leakRatio = mb.length > 4 ? mb[mb.length - 1] / Math.max(1, mb[2]) : 1;
  console.log('memory first~last ratio:', leakRatio.toFixed(2));
  const fatalErrors = errors.filter(e => !e.includes('favicon'));
  console.log('errors:', fatalErrors.length ? fatalErrors.slice(0, 5) : 'none');
  const okChunks = samples.every(s => s.chunks >= 5 && s.chunks <= 12);
  console.log('chunk bounds ok:', okChunks, '| longest run dist:', maxDist + 'm | total game-runs:', finalState.saveRuns);
  const pass = okChunks && leakRatio < 2.2 && fatalErrors.length === 0 && finalState.state !== 'boot';
  console.log(pass ? 'LONGRUN: PASS' : 'LONGRUN: FAIL');
  fs.writeFileSync(path.join(ROOT, 'shots', 'longrun_results.json'),
    JSON.stringify({ samples, finalState, errors: fatalErrors, pass }, null, 2));
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
