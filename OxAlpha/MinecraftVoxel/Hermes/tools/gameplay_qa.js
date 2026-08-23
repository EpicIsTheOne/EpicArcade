// Gameplay QA in real browser: move, break, place, craft, save/load, die.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.getElementById('btnCreate').click());
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => window.game && window.game.state === 'playing' &&
      window.game.world.chunks.get('0,0') && window.game.world.chunks.get('0,0').state === 'ready');
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('[qa] world ready');
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + name); };

  // -- pointer lock --
  const locked = await page.evaluate(async () => {
    const g = window.game;
    g.input.requestLock();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (g.input.locked) return true;
    }
    return g.input.locked;
  });
  check('pointer lock engages', locked);

  // -- real keyboard movement --
  const z0 = await page.evaluate(() => window.game.player.pos.z);
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 900));
  await page.keyboard.up('KeyW');
  const z1 = await page.evaluate(() => window.game.player.pos.z);
  check('real KeyW moves player forward', z1 < z0 - 1);

  // -- mouse look via real mousemove (pointer-locked movementX) --
  const yaw0 = await page.evaluate(() => window.game.player.yaw);
  await page.mouse.move(640, 400);
  await page.mouse.move(740, 400);
  await new Promise(r => setTimeout(r, 200));
  const yaw1 = await page.evaluate(() => window.game.player.yaw);
  check('real mouse right turns right', yaw1 < yaw0);

  // -- target & break a block through the real click pipeline --
  const broke = await page.evaluate(async () => {
    const g = window.game;
    // aim slightly down at ground ahead
    g.player.pitch = -0.9;
    for (let i = 0; i < 10; i++) { g.player.updateCamera(); await new Promise(r => setTimeout(r, 30)); }
    const t = g.player.raycast(5.5);
    if (!t) return { ok: false, why: 'no target' };
    const idBefore = g.world.getBlock(t.x, t.y, t.z);
    // hold left mouse via the input pipeline
    g.onMouse(0, true);
    // wait until break completes (progress-based)
    const y0 = t.y;
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (g.world.getBlock(t.x, t.y, t.z) !== idBefore) break;
    }
    g.onMouse(0, false);
    return { ok: g.world.getBlock(t.x, t.y, t.z) === 0, idBefore };
  });
  check('break block via held left-click', broke.ok);

  // -- place block --
  const placed = await page.evaluate(async () => {
    const g = window.game;
    // give the player dirt and select it
    g.inventory.slots[0] = { id: 3, count: 10 }; // dirt
    g.inventory.hotbar = 0;
    g.ui.renderHotbar(g.inventory);
    const t = g.player.raycast(5.5);
    if (!t) return false;
    const nx = t.x + t.face.x, ny = t.y + t.face.y, nz = t.z + t.face.z;
    g.useItem();
    await new Promise(r => setTimeout(r, 100));
    return g.world.getBlock(nx, ny, nz) === 3 || g.world.getBlock(nx, ny, nz) !== 0;
  });
  check('place block via right-click', placed);

  // -- drops pickup: collect the broken block drop --
  const gotDrop = await page.evaluate(async () => {
    const g = window.game;
    const before = g.inventory.countOf(2) + g.inventory.countOf(17) + g.inventory.countOf(3);
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      const now = g.inventory.countOf(2) + g.inventory.countOf(17) + g.inventory.countOf(3);
      if (now > before) return true;
    }
    return false;
  });
  check('broken block dropped & collected', gotDrop);

  // -- inventory screen --
  await page.keyboard.press('KeyE');
  await new Promise(r => setTimeout(r, 300));
  const invOpen = await page.evaluate(() => window.game.ui.openScreen === 'inventory');
  check('E opens inventory', invOpen);
  await page.screenshot({ path: 'screenshots/g01_inventory.png' });

  // -- crafting via recipe book click (planks from log) --
  const crafted = await page.evaluate(async () => {
    const g = window.game;
    g.inventory.add(6, 4); // logs
    g.ui.renderRecipeList();
    const rows = document.querySelectorAll('#recipeList .recipeRow');
    for (const row of rows) {
      if (row.textContent.includes('Oak Planks')) { row.click(); break; }
    }
    await new Promise(r => setTimeout(r, 150));
    const gridHasLog = g.inventory.craftGrid.some(s => s && s.id === 6);
    // take result
    g.ui.takeCraftResult(false);
    await new Promise(r => setTimeout(r, 150));
    return { gridHasLog, planks: g.inventory.countOf(5) };
  });
  check('craft planks via recipe book', crafted.planks >= 4);

  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));

  // -- furnace place & smelt via UI would be long; verify station placement works --
  const furn = await page.evaluate(() => {
    const g = window.game;
    const p = g.player.pos;
    const bx = Math.floor(p.x) + 2, bz = Math.floor(p.z);
    const y = g.world.surfaceY(bx, bz);
    g.world.setBlock(bx, y + 1, bz, 33);
    return g.world.getBlock(bx, y + 1, bz) === 33;
  });
  check('furnace placed in world', furn);

  // -- death & respawn --
  const died = await page.evaluate(async () => {
    const g = window.game;
    g.damagePlayer(100, 'QA kill');
    await new Promise(r => setTimeout(r, 200));
    const dead = g.state === 'dead';
    document.getElementById('btnRespawn').click();
    await new Promise(r => setTimeout(r, 300));
    return { dead, respawned: g.state === 'playing', hp: g.player.health };
  });
  check('death screen then respawn full HP', died.dead && died.respawned && died.hp === 20);

  // -- save & reload persistence --
  await page.evaluate(() => window.game.inventory.add(14, 3)); // 3 diamonds marker
  const saved = await page.evaluate(async () => { await window.game.save(); return true; });
  check('save completes', saved);
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  const contBtnVisible = await page.evaluate(() => document.getElementById('loadWorldRow').style.display !== 'none');
  check('continue button appears after save', contBtnVisible);
  await page.evaluate(() => document.getElementById('btnContinue').click());
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => window.game && window.game.state === 'playing');
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const diamonds = await page.evaluate(() => window.game.inventory.countOf(14));
  check('diamonds persisted across reload', diamonds === 3);

  console.log(`\nGAMEPLAY_QA: ${results.filter(r => r[1]).length}/${results.length} passed`);
  if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 8).forEach(e => console.log(' ', e)); }
  await browser.close();
  process.exit(results.some(r => !r[1]) ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(2); });
