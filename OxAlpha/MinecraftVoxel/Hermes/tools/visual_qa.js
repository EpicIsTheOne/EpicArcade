// Visual QA: boot the real game in headless Chrome, click through UI,
// capture screenshots at multiple states, report console errors.
// Usage: node tools/visual_qa.js [scenario]
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const URL = 'http://127.0.0.1:8477/';
const SHOTS = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900', '--mute-audio'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type()[0] + ':' + m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 300)));
  page.on('requestfailed', r => errors.push('REQFAIL ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP' + r.status() + ' ' + r.url()); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SHOTS, 'v01_title.png') });

  // create new world (survival default)
  await new Promise(r => setTimeout(r, 800));
  const bootState = await page.evaluate(() => ({
    qaErrors: window.__qaErrors || [],
    hasGame: !!window.game,
    titleVisible: document.getElementById('titleScreen') && document.getElementById('titleScreen').classList.contains('on'),
    btnPlayRect: (document.getElementById('btnPlay') || {}).rect || null,
  }));
  console.log('[qa] boot state', JSON.stringify(bootState).slice(0, 600));
  await page.screenshot({ path: path.join(SHOTS, 'v01b_precheck.png') });
  const hasPlay = await page.$('#btnPlay');
  if (!hasPlay) throw new Error('no #btnPlay — title screen broken');
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(SHOTS, 'v02_newworld.png') });
  await page.evaluate(() => document.getElementById('btnCreate').click());
  console.log('[qa] clicked Generate World; waiting for spawn...');
  // wait for game state playing
  let ok = false;
  for (let i = 0; i < 60; i++) {
    ok = await page.evaluate(() => window.game && window.game.state === 'playing');
    if (ok) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('[qa] state=playing:', ok);
  if (!ok) {
    const errs = await page.evaluate(() => window.__qaErrors || []);
    console.log('QA_ERRORS:', errs.slice(0, 6));
    console.log('CONSOLE:', errors.slice(0, 6));
    await browser.close();
    process.exit(2);
  }
  await new Promise(r => setTimeout(r, 6000)); // let chunks stream
  await page.screenshot({ path: path.join(SHOTS, 'v03_spawn_day.png') });

  const stats = await page.evaluate(() => {
    const g = window.game;
    return {
      fps: g.fpsShown,
      chunks: g.world.chunks.size,
      pos: g.player.pos,
      biome: g.currentBiomeName ? g.currentBiomeName() : '?',
      drawCalls: g.renderer.info.render.calls,
      tris: g.renderer.info.render.triangles,
    };
  });
  console.log('[qa] stats', JSON.stringify(stats));

  // look around & walk forward a bit
  await page.evaluate(() => { window.game.input.keys['KeyW'] = true; });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { window.game.input.keys['KeyW'] = false; window.game.player.yaw += Math.PI / 3; });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SHOTS, 'v04_explore.png') });

  // night
  await page.evaluate(() => { window.game.timeOfDay = 0.02; });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SHOTS, 'v05_night.png') });
  // sunset
  await page.evaluate(() => { window.game.timeOfDay = 0.74; });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SHOTS, 'v06_sunset.png') });
  // noon restore
  await page.evaluate(() => { window.game.timeOfDay = 0.4; });

  // underwater check: teleport into ocean if any (scan for water column nearby)
  const uw = await page.evaluate(async () => {
    const g = window.game;
    for (let r = 8; r < 220; r += 8) {
      for (let a = 0; a < 12; a++) {
        const x = Math.floor(g.player.pos.x + Math.cos(a / 12 * 6.28) * r);
        const z = Math.floor(g.player.pos.z + Math.sin(a / 12 * 6.28) * r);
        const y = g.world.surfaceY(x, z);
        if (y > 0 && y < 44 && g.world.getBlock(x, y, z) === 9) {
          g.player.pos = { x: x + 0.5, y: y - 1.5, z: z + 0.5 };
          return true;
        }
      }
    }
    return false;
  });
  if (uw) {
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SHOTS, '07_underwater.png') });
  } else console.log('[qa] no ocean found nearby; skip underwater shot');

  // cave shot: dig straight down then look
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player.pos;
    for (let dy = 1; dy <= 30; dy++) g.world.setBlock(Math.floor(p.x), Math.floor(p.y) - dy, Math.floor(p.z), 0);
    g.player.pos = { x: p.x, y: p.y - 24, z: p.z };
    g.player.pitch = -0.5;
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(SHOTS, '08_underground.png') });

  console.log('[qa] errors during run:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('  ERR:', e));
  const stacks = await page.evaluate(() => (window.__qaErrors || []).slice(0, 5));
  stacks.forEach(e => console.log('  QAERR:', e));
  await browser.close();
  console.log('VISUAL_QA_DONE');
}

main().catch(e => { console.error('QA_CRASH', e); process.exit(1); });
