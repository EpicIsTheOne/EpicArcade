// Dump atlas alpha stats per tile to find transparent terrain tiles.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  const res = await page.evaluate(() => {
    const c = window.__atlasCanvas;
    if (!c) return { err: 'no atlas canvas global' };
    const ctx = c.getContext('2d');
    const out = {};
    for (let i = 0; i < c.width / 16; i++) {
      const d = ctx.getImageData(i * 16, 0, 16, 16).data;
      let opaque = 0;
      for (let p = 3; p < d.length; p += 4) if (d[p] > 200) opaque++;
      // find which tile name this is
    }
    // simpler: report overall rows 0-1 tiles (stone dirt grass grass_side cobble planks logs)
    const names = ['stone','dirt','grass_top','grass_side','cobblestone','planks','log_side','log_top'];
    const stats = {};
    names.forEach((n, i) => {
      const d = ctx.getImageData(i * 16, 0, 16, 16).data;
      let opq = 0;
      for (let p = 3; p < d.length; p += 4) if (d[p] > 200) opq++;
      stats[n] = opq + '/256';
    });
    return { size: c.width + 'x' + c.height, stats };
  });
  console.log(JSON.stringify(res));
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
