// Water scene with deterministic seed that has ocean near spawn.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  // find a seed with ocean close to origin using node-side gen? do it in-page via worldgen module
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await new Promise(r => setTimeout(r, 300));
  // set seed directly before creating
  await page.evaluate(() => { document.getElementById('seedInput').value = 'ocean-79'; });
  await page.evaluate(() => document.getElementById('btnCreate').click());
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => window.game && window.game.state === 'playing');
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const found = await page.evaluate(async () => {
    const g = window.game;
    const genMod = window.__req('./worldgen.js');
    const gen = genMod.makeGen(g.seedStr);
    for (let r = 24; r < 900; r += 16) {
      await new Promise(res => setTimeout(res, 0));
      for (let a = 0; a < 24; a++) {
        const x = Math.floor(g.player.pos.x + Math.cos(a / 24 * 6.283) * r);
        const z = Math.floor(g.player.pos.z + Math.sin(a / 24 * 6.283) * r);
        const info = gen.columnInfo(x, z);
        if (info.height < 42 && info.height > 22) {
          g.world.update(x, z);
          await new Promise(r2 => setTimeout(r2, 350));
          for (let t = 0; t < 20; t++) {
            const c = g.world.chunks.get((x >> 4) + ',' + (z >> 4));
            if (c && c.state === 'ready') break;
            await new Promise(r2 => setTimeout(r2, 250));
          }
          const y = g.world.surfaceY(x, z);
          const idAt = g.world.getBlock(x, y, z);
          if (idAt === 9 || idAt === 8 || idAt === 18) {
            g.player.pos = { x: x + 0.5, y: y - 1.4, z: z + 0.5 };
            g.player.vel = { x: 0, y: 0, z: 0 };
            return { x, y, z, idAt };
          }
        }
      }
    }
    return null;
  });
  console.log('ocean:', JSON.stringify(found));
  if (found) {
    await new Promise(r => setTimeout(r, 1200));
    await page.evaluate(() => { window.game.timeOfDay = 0.45; });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: 'screenshots/s_water_swim.png' });
    console.log('water swim shot saved');
    await page.evaluate(() => {
      window.game.player.pos.y -= 1.6;
      window.game.player.pitch = 0.3;
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: 'screenshots/s_underwater.png' });
    console.log('underwater shot saved');
  } else console.log('no ocean found for this seed');
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
