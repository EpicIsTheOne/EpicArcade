// Probe the REAL /src/gen/worker.js with full error surface.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      const out = {};
      const w = new Worker('/src/gen/worker.js');
      w.onerror = (e) => { out.onerror = (e.message || 'unknown') + ' @' + (e.filename || '') + ':' + (e.lineno || ''); resolve(out); };
      w.onmessage = (ev) => {
        if (ev.data.type === 'ready') { out.ready = true; w.postMessage({ type: 'gen', cx: 0, cz: 0 }); }
        else if (ev.data.type === 'chunk') {
          const b = ev.data.blocks;
          let nz = 0; for (const v of b) if (v) nz++;
          out.chunkNonzero = nz; resolve(out);
        } else if (ev.data.type === 'error') { out.workerErr = (ev.data.msg || '').slice(0, 400); resolve(out); }
      };
      w.postMessage({ type: 'init', seed: 'probe-seed-123' });
      setTimeout(() => { out.timeout = true; resolve(out); }, 12000);
    });
  });
  console.log('RESULT:', JSON.stringify(result));
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
