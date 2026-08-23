// Compare: importScripts-loaded worldgen gen output inside browser worker.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      const src = `
        try {
          importScripts(
            'http://127.0.0.1:8477/src/shared/util.js',
            'http://127.0.0.1:8477/src/shared/noise.js',
            'http://127.0.0.1:8477/src/shared/blocks.js',
            'http://127.0.0.1:8477/src/shared/atlas_meta.js',
            'http://127.0.0.1:8477/src/gen/worldgen.js'
          );
          const b = new Uint8Array(16*16*128);
          self.WORLDGEN_MOD.generateChunk('zz-trace-99', 3, 4, b);
          let nz = 0; for (const v of b) if (v) nz++;
          self.postMessage({ nz });
        } catch (e) { self.postMessage({ err: e.message }); }
      `;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = (ev) => resolve(ev.data);
      w.onerror = (e) => resolve({ onerror: e.message + ' @' + e.lineno });
    });
  });
  console.log('IMPORTSCRIPTS GEN:', JSON.stringify(result));
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
