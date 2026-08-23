// Visual sweep: capture every required scene for inspection.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
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
  await new Promise(r => setTimeout(r, 2500));

  const shot = async (name) => {
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: `screenshots/s_${name}.png` });
    console.log('shot', name);
  };

  // noon
  await page.evaluate(() => { window.game.timeOfDay = 0.5; });
  await shot('noon');
  // sunrise
  await page.evaluate(() => { window.game.timeOfDay = 0.26; });
  await shot('sunrise');
  // sunset
  await page.evaluate(() => { window.game.timeOfDay = 0.735; });
  await shot('sunset');
  // night with torch
  const nightTorch = await page.evaluate(async () => {
    const g = window.game;
    g.timeOfDay = 0.02;
    // place torches around player
    const p = g.player.pos;
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    const y = g.world.surfaceY(bx, bz);
    g.world.setBlock(bx + 2, y + 1, bz, 22);
    g.world.setBlock(bx - 2, y + 1, bz, 22);
    return true;
  });
  void nightTorch;
  await shot('night_torches');
  // rain
  await page.evaluate(() => {
    window.game.weather.state = 'rain'; window.game.weather.timer = 999; window.game.weather.intensity = 1;
    window.game.timeOfDay = 0.4;
  });
  await shot('rain');

  // find water
  const foundWater = await page.evaluate(async () => {
    const g = window.game;
    for (let r = 16; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(g.player.pos.x + Math.cos(a / 16 * 6.283) * r);
        const z = Math.floor(g.player.pos.z + Math.sin(a / 16 * 6.283) * r);
        const y = g.world.surfaceY(x, z);
        if (y > 2 && y < 44 && g.world.getBlock(x, y, z) === 9) {
          // wait until chunk is ready
          for (let t = 0; t < 40; t++) {
            const c = g.world.chunks.get((x >> 4) + ',' + (z >> 4));
            if (c && c.state === 'ready') break;
            g.world.update(x, z);
            await new Promise(r2 => setTimeout(r2, 200));
          }
          g.player.pos = { x: x + 0.5, y: y - 1.8, z: z + 0.5 };
          g.player.vel = { x: 0, y: 0, z: 0 };
          return true;
        }
      }
    }
    return false;
  });
  console.log('water found:', foundWater);
  if (foundWater) {
    await page.evaluate(() => { window.game.weather.state = 'clear'; window.game.weather.intensity = 0; window.game.timeOfDay = 0.5; });
    await shot('underwater');
  }

  // cave: dig down & light with torch
  await page.evaluate(async () => {
    const g = window.game;
    const p = g.player.pos;
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    const sy = g.world.surfaceY(bx, bz);
    for (let dy = 1; dy <= 28; dy++) g.world.setBlock(bx, sy - dy, bz, 0);
    for (let dy = 24; dy <= 27; dy++) g.world.setBlock(bx + 1, sy - dy, bz, 22); // torch line down
    g.player.pos = { x: bx + 0.5, y: sy - 23, z: bz + 0.5 };
    g.player.vel = { x: 0, y: 0, z: 0 };
    g.player.pitch = -0.3;
    g.timeOfDay = 0.5;
  });
  await new Promise(r => setTimeout(r, 1200));
  await shot('cave_torchlight');

  // desert biome teleport
  const desert = await page.evaluate(async () => {
    const g = window.game;
    for (let r = 32; r < 640; r += 16) {
      for (let a = 0; a < 20; a++) {
        const x = Math.floor(g.player.pos.x + Math.cos(a / 20 * 6.283) * r);
        const z = Math.floor(g.player.pos.z + Math.sin(a / 20 * 6.283) * r);
        try {
          const info = window.__req('./worldgen.js').makeGen(g.seedStr).columnInfo(x, z);
          if (info.biome === 2) {
            for (let t = 0; t < 50; t++) {
              g.world.update(x, z);
              const c = g.world.chunks.get((x >> 4) + ',' + (z >> 4));
              if (c && c.state === 'ready') break;
              await new Promise(r2 => setTimeout(r2, 200));
            }
            const y = g.world.surfaceY(x, z);
            if (y > 40) {
              g.player.pos = { x: x + 0.5, y: y + 2, z: z + 0.5 };
              g.player.vel = { x: 0, y: 0, z: 0 };
              return true;
            }
          }
        } catch (e) { void e; }
      }
    }
    return false;
  });
  console.log('desert found:', desert);
  if (desert) await shot('desert');

  console.log('VISUAL SWEEP DONE');
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
