// Direct browser-worker probe: load the real worker, send gen, await reply.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      let out = {};
      try {
        const w = new Worker('/src/gen/worker.js');
        w.onerror = (e) => { out.error = (e.message || 'unknown') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''); resolve(out); };
        w.onmessage = (ev) => {
          out.got = ev.data.type;
          if (ev.data.type === 'chunk') { out.nonzero = ev.data.blocks.some(v => v > 0); resolve(out); }
          else if (ev.data.type === 'error') { out.workerErr = ev.data.msg && ev.data.msg.slice(0, 300); resolve(out); }
          else if (ev.data.type === 'ready') { w.postMessage({ type: 'gen', cx: 0, cz: 0 }); }
        };
        w.postMessage({ type: 'init', seed: 'probe' });
        setTimeout(() => { out.timeout = true; resolve(out); }, 12000);
      } catch (e) { out.throw = String(e); resolve(out); }
    });
  });
  console.log('WORKER PROBE RESULT:', JSON.stringify(result));
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
