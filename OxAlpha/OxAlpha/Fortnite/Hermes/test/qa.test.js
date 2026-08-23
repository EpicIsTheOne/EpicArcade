// ISLEBREAK headless QA: boots the real game in headless Chrome (SwiftShader),
// plays via the exposed QA hooks, screenshots every stage, reports JSON.
// Run: node test/qa.test.js [--full] (full = play to Victory/Defeat)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'qa', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const BASE = 'http://127.0.0.1:8420/';
const FULL = process.argv.includes('--full');
const results = { steps: [], errors: [], warnings: [], shots: [], fps: null, final: null };

function step(name, ok, detail = '') {
  results.steps.push({ name, ok, detail });
  console.log(`${ok ? '  ok -' : '  FAIL -'} ${name}${detail ? ' :: ' + detail : ''}`);
  return ok;
}

async function shot(page, name) {
  const f = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: f });
  results.shots.push(name + '.png');
  return f;
}

async function safeEval(page, fn, ...args) {
  try { return await page.evaluate(fn, ...args); }
  catch (e) { results.errors.push('EVAL-CRASH: ' + e.message); return null; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launchChrome() {
  return chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox', '--no-sandbox', '--window-size=640,360',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage', '--disable-software-rasterizer-vsync',
    ],
  });
}

async function main() {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => {
    if (m.type() === 'error') results.errors.push(m.text());
    if (m.type() === 'warning') results.warnings.push(m.text());
  });
  page.on('pageerror', (e) => results.errors.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('favicon')) results.errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  console.log('[qa] loading', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // poll for boot completion (world build can take a while under SwiftShader)
  let hasGame = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    hasGame = await page.evaluate(() => !!window.__game && !!window.__game.scene && !!window.__game.bots);
    if (hasGame) break;
  }
  step('game booted, world built', hasGame);
  if (!hasGame) {
    await shot(page, '00-boot-fail');
    await browser.close();
    fs.writeFileSync(path.join(ROOT, 'qa', 'results.json'), JSON.stringify(results, null, 2));
    process.exit(1);
  }
  await shot(page, '01-lobby');

  // stats about the built world
  const worldStats = await page.evaluate(() => {
    const g = window.__game;
    let meshes = 0, tris = 0;
    g.scene.traverse(o => {
      if (o.isMesh) {
        meshes++;
        const geo = o.geometry;
        tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      }
    });
    return { meshes: Math.round(meshes), tris: Math.round(tris), chests: g.loot.chests.length, static: g.physics.static.length };
  });
  step('world stats', true, JSON.stringify(worldStats));

  // ---- start match ----
  await page.click('#btnPlay');
  await sleep(2500);
  const st1 = await page.evaluate(() => ({ state: window.__game.matchState, mode: window.__game.player.mode }));
  step('match started, on barge', st1.state === 'dropping' && st1.mode === 'bus', JSON.stringify(st1));
  await shot(page, '02-barge');

  // ---- ride the barge toward the island, then jump ----
  await shot(page, '02-barge');
  let jumped = false;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const px = await page.evaluate(() => Math.round(window.__game.player.pos.x));
    if (px > -1000) { await page.evaluate(() => { window.__game.qaJump(); }); jumped = true; break; }
  }
  if (!jumped) { await page.evaluate(() => { window.__game.qaJump(); }); jumped = true; }
  step('jumped from barge', jumped);
  // steer the whole drop toward Amber Crossroads (island center)
  await page.evaluate(() => window.__game.qaSteerTo(-80, -80));
  for (let i = 0; i < 170; i++) {
    await sleep(1000);
    const m = await page.evaluate(() => ({ mode: window.__game.player.mode, y: Math.round(window.__game.player.pos.y), x: Math.round(window.__game.player.pos.x), z: Math.round(window.__game.player.pos.z) }));
    if (i === 2) await shot(page, '03-skydive');
    if (i === 10) await shot(page, '04-glide');
    if (m.mode === 'ground') { step('landed', true, JSON.stringify(m)); break; }
    if (i === 169) step('landed', false, JSON.stringify(m));
  }
  await page.evaluate(() => { window.__game.qaHoldKey('KeyW', false); });
  await shot(page, '05-landed');

  if (FULL) {
    // ---- full autopilot match ----
    await page.evaluate(() => window.__game.qaAutopilot(true));
    let lastAlive = 999, lastShot = 0;
    const t0 = Date.now();
    let ended = null;
    while (Date.now() - t0 < 1000 * 60 * 14) {
      await sleep(2000);
      const s = await page.evaluate(() => ({
        state: window.__game.matchState,
        alive: window.__game.qaAliveCount(),
        mode: window.__game.player.mode,
        p: window.__game.qaPlayerSummary(),
        fps: window.__game.qaFps(),
      }));
      results.fps = s.fps;
      if (s.alive !== lastAlive) { console.log(`[qa] t=${Math.round((Date.now()-t0)/1000)}s alive=${s.alive} hp=${s.p.hp} mode=${s.mode}`); lastAlive = s.alive; }
      if (Date.now() - lastShot > 25000) {
        await shot(page, `10-match-${Math.round((Date.now()-t0)/1000)}s`);
        lastShot = Date.now();
      }
      if (s.state === 'over') { ended = s; break; }
    }
    if (ended) {
      const victory = await page.evaluate(() => document.querySelector('#endTitle').textContent.includes('VICTORY'));
      results.final = { victory, alive: ended.alive, player: ended.p };
      step('match completed', true, victory ? 'VICTORY' : `eliminated, ${ended.alive} left, placed #${ended.p.place}`);
      await shot(page, victory ? '90-victory' : '91-defeat');
      // restart regression: Play Again must begin a fresh match
      await page.click('#btnPlayAgain');
      await sleep(4000);
      const st = await page.evaluate(() => ({ state: window.__game.matchState, mode: window.__game.player.mode }));
      step('play again -> new match', st.state === 'dropping' && st.mode === 'bus', JSON.stringify(st));
      await shot(page, '92-restarted');
    } else {
      step('match completed', false, 'timeout 14min');
    }
  } else {
    // short smoke: fire weapon, build wall, harvest a tree
    await page.evaluate(() => {
      const g = window.__game;
      g.qaGiveWeapon('raptor-ar');
      g.qaTeleport(-80, -80);
    });
    await page.evaluate(() => { window.__game.qaFireDown(true); });
    await sleep(1500);
    await page.evaluate(() => { window.__game.qaFireDown(false); });
    const fired = await page.evaluate(() => window.__game.qaShotCount() > 0);
    step('weapon fired', fired);
    await page.evaluate(() => { window.__game.qaBuildMode('wall'); window.__game.qaFireDown(true); });
    await sleep(600);
    await page.evaluate(() => { window.__game.qaFireDown(false); });
    const built = await page.evaluate(() => {
      const g = window.__game;
      const n = g.builds.pieces.size;
      g.player.buildMode = null;
      return n > 0;
    });
    step('wall placed', built);
    const harvested = await page.evaluate(() => {
      const g = window.__game;
      const t = (g.vegSpots && g.vegSpots.trees || [])[0];
      if (!t) return 'no-tree';
      g.qaTeleport(t[0] + 1.6, t[2] + 1.6);
      const p = g.player;
      const before = g.inv.mats.wood;
      for (let i = 0; i < 16; i++) {
        const dx = t[0] - p.pos.x, dz = t[2] - p.pos.z, dy = (t[1] + 1.0) - (p.pos.y + 1.55);
        const dl = Math.hypot(dx, dy, dz) || 1;
        p.camRig.yaw = Math.atan2(-dx / dl, -dz / dl);
        p.camRig.pitch = Math.asin(dy / dl);
        g.combat.pickaxeHit(p);
      }
      return g.inv.mats.wood > before ? 'yes' : `no(${before})`;
    });
    step('harvesting grants mats', harvested === true || harvested === 'yes', String(harvested));
    await shot(page, '06-smoke-actions');
  }

  await browser.close();
  const fails = results.steps.filter(s => !s.ok).length;
  console.log(`\n[qa] done: ${results.steps.length - fails}/${results.steps.length} passed, ${results.errors.length} console errors`);
  fs.writeFileSync(path.join(ROOT, 'qa', 'results.json'), JSON.stringify(results, null, 2));
  process.exit(fails || results.errors.length ? 1 : 0);
}

main().catch(e => { console.error('[qa] fatal:', e); process.exit(1); });
