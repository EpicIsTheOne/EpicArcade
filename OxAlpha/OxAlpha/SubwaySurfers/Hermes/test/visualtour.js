// Visual QA tour (deterministic): teleports into each biome, forces a tunnel,
// exercises every powerup/board/stumble/crash state, captures ULTRA shots.
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
function findBrowser() {
  const cands = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = process.argv[2] || '8642';
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: 'new',
    args: ['--no-first-run', '--mute-audio', '--window-size=1600,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('!!window.SR_READY', { timeout: 45000 });
  await sleep(1200);
  async function snap(name) { await page.screenshot({ path: path.join(SHOTS, name) }); console.log('shot:', name); }
  const S = () => page.evaluate(() => ({
    state: window.Game.state, dist: Math.floor(window.Game.dist || 0),
    speed: +(window.Game.speed || 0).toFixed(1),
    biome: (() => { const c = window.Game.chunkMap[window.Game.curChunk]; return c ? c.biome.id : '?'; })(),
    y: +(window.Game.y || 0).toFixed(1), board: !!window.Game.boardActive
  }));
  // simple dodge loop for N ms (keeps player alive while we shoot)
  async function dodge(msTotal) {
    const until = Date.now() + msTotal;
    while (Date.now() < until) {
      await page.evaluate(() => {
        const g = window.Game;
        if (g.state !== 'running') return;
        let threat = null;
        for (let k = g.curChunk; k <= g.curChunk + 2 && !threat; k++) {
          const c = g.chunkMap[k]; if (!c) continue;
          for (const col of c.colliders) {
            let d, act = col.action;
            if (act === 'train') { d = -(col.z + col.hz + c.startZ); act = 'lane'; }
            else d = -(col.z + c.startZ);
            if (d > -2 && d < 55 && Math.abs(col.x - g.x) < 1.6) if (!threat || d < threat.d) threat = { d, action: act };
          }
        }
        if (!threat) { g.invuln = 0.6; } // light protection so the tour never dies
        if (threat) {
          if (threat.action === 'jump' && threat.d < 9) window.Game.QA.pressKey('KeyW');
          else if (threat.action === 'roll' && threat.d < 9) window.Game.QA.pressKey('KeyS');
          else if (threat.action === 'lane' && threat.d < 13) {
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
                  if (Math.abs(col.x - lx) < 1.2 && wz > -70 && wz < 4) { blocked = true; break; }
                }
              }
              if (!blocked) opts.push(ln);
            }
            if (opts.length) window.Game.QA.pressKey(opts[0] < g.lane ? 'KeyA' : 'KeyD');
          }
        }
      });
      await sleep(280);
    }
  }

  await page.screenshot({ path: path.join(SHOTS, 'v01_menu.png') }); console.log('shot: v01_menu.png');
  await page.evaluate(() => window.Game.newRun());
  await sleep(1400);
  await snap('v02_start.png');

  // each biome via teleport (chunk index chosen by scanning seeds at runtime)
  const biomes = ['city', 'station', 'maintenance', 'bridge', 'greenbelt'];
  for (const b of biomes) {
    // find a chunk index whose biome matches; try up to 400 chunks ahead in a temp map
    const chunkIdx = await page.evaluate((want) => {
      const rng = window.RngLib;
      for (let ci = 4; ci < 8000; ci++) {
        const r = rng.hash2(ci >> 2, 77, 12345);
        const idx = Math.floor(r * 5);
        if (window.Chunks.BIOMES[idx].id === want) return ci;
      }
      return -1;
    }, b);
    if (chunkIdx < 0) continue;
    await page.evaluate(ci => window.Game.teleportQA(ci * window.CFG.CHUNK_LEN + 10), chunkIdx);
    // if a crash happened mid-tour, restart the run and re-teleport
    let s = await S();
    if (s.state !== 'running') {
      await page.evaluate(() => { window.Game.newRun(); });
      await sleep(400);
      await page.evaluate(ci2 => window.Game.teleportQA(ci2 * window.CFG.CHUNK_LEN + 10), chunkIdx);
    }
    await dodge(1200);
    s = await S();
    if (s.state !== 'running') { console.log(b, '-> still dying, retry once'); await page.evaluate(() => window.Game.newRun()); await sleep(300); await page.evaluate(ci2 => window.Game.teleportQA(ci2 * window.CFG.CHUNK_LEN + 10), chunkIdx); await dodge(800); s = await S(); }
    console.log(b, '->', JSON.stringify(s));
    await snap('v10_biome_' + b + '.png');
  }

  // tunnel: regenerate next chunk as forced tunnel via seed manipulation is
  // complex; instead scan for natural tunnels far out and teleport near one.
  const tunIdx = await page.evaluate(() => {
    // replicate chunk RNG to find a tunnel chunk quickly: brute force via hash
    for (let ci = 3; ci < 3000; ci++) {
      const r = window.RngLib.hash2(ci * 7919 ^ 0x9e37, 13, 777);
      if (r < 0.16) return ci;
    }
    return 40;
  });
  // force approach: temporarily patch generator flag through a fresh chunk spawn
  await page.evaluate(() => {
    // monkey-patch: force tunnel on the very next unspawned chunk
    const origGen = window.Chunks.generate;
    window.Chunks.generate = function (idx, seed, mats, scene, diff) {
      return origGen(idx, seed, mats, scene, diff, idx % 3 === 0);
    };
    window.__restoreGen = origGen;
  });
  await page.evaluate(() => window.Game.teleportQA(window.Game.travel + 30));
  await sleep(100);
  await page.evaluate(() => { if (window.__restoreGen) { window.Chunks.generate = window.__restoreGen; } });
  await dodge(1500);
  const inTun = await page.evaluate(() => {
    const c = window.Game.chunkMap[window.Game.curChunk];
    return !!(c && c.tunnel);
  });
  console.log('tunnel reached:', inTun);
  await snap('v11_tunnel.png');

  // high-speed boost + multiplier (showcase: keep player invulnerable + far from chaser)
  await page.evaluate(() => {
    window.Game.newRun();
    window.Game.invuln = 9999;
    window.Game.chaserGap = 30;
    window.Game.teleportQA(1200);
  });
  await sleep(400);
  await page.evaluate(() => { window.Game.powerupQA('boost'); window.Game.powerupQA('multiplier'); });
  await dodge(1200);
  await snap('v12_highspeed_boost.png');

  // jetpack
  await page.evaluate(() => { window.Game.powerupQA('jetpack'); });
  await sleep(1300);
  await snap('v13_jetpack.png');
  await page.evaluate(() => window.Game.powerups.endNow('jetpack'));
  await sleep(600);

  // hoverboard (fresh showcase run so the board can't be broken by pre-existing contact)
  await page.evaluate(() => { window.Game.newRun(); window.Game.invuln = 9999; window.Game.chaserGap = 30; });
  await sleep(300);
  await page.evaluate(() => { window.Game.boardQA(); });
  await sleep(700);
  await snap('v14_hoverboard.png');

  // magnet
  await page.evaluate(() => { window.Game.powerupQA('magnet'); });
  await dodge(900);
  await snap('v15_magnet.png');

  // stumble & chaser close-up: clean run, stumble on open track, then restore
  await page.evaluate(() => { window.Game.newRun(); window.Game.invuln = 9999; window.Game.chaserGap = 6; });
  await sleep(500);
  await page.evaluate(() => { window.Game.stumbleQA(); });
  await sleep(250);
  await snap('v16_stumble_chaser.png');
  await page.evaluate(() => { window.Game.chaserGap = 30; });
  await sleep(1000);

  // crash / game over UI
  await page.evaluate(() => { if (window.Game.state === 'running') window.Game.crashQA(); });
  await sleep(900);
  await snap('v17_gameover.png');

  // shop + missions UI
  await page.evaluate(() => { const b = document.querySelector('#over #btnMenu'); b && b.click(); });
  await sleep(400);
  await page.evaluate(() => window.Shop.open());
  await sleep(500);
  await snap('v18_shop.png');
  await page.evaluate(() => document.getElementById('btnShopClose').click());
  await sleep(200);
  await page.evaluate(() => document.getElementById('btnMissions').click());
  await sleep(400);
  await snap('v19_missions.png');

  console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
  await browser.close();
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
