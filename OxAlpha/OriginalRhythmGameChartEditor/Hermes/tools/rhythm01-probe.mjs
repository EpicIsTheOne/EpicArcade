// PRISM PULSE (rhythm-run01) — focused renderer diagnosis.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = dirname(dirname(fileURLToPath(import.meta.url)));
const { port } = JSON.parse(readFileSync(join(RUN, 'rhythm-run01-server.json'), 'utf8'));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage();
page.on('console', m => console.log('[pg]', m.text()));
page.on('pageerror', e => console.log('[err]', String(e)));
page.on('unhandledrejection', e => console.log('[rej]', String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const log = [];
  const t0 = performance.now();
  const sd = await import('./js/song-data.js');
  const composed = sd.composeSong();
  log.push(`compose ok: ${composed.events.length} events @ ${Math.round(performance.now() - t0)}ms`);

  // Render ONLY the first N events of each kind to find the poison kind
  const SR = 44100;
  const kinds = ['drum', 'bass', 'pad', 'pluck', 'lead'];
  for (const kind of kinds) {
    const evs = composed.events.filter(e => e.kind === kind).slice(0, 40);
    const ta = performance.now();
    try {
      const ctx = new OfflineAudioContext(2, SR * 12, SR);
      const master = ctx.createGain(); master.connect(ctx.destination);
      const spb = 60 / 128;
      let n = 0;
      for (const e of evs) {
        const t0e = e.t * spb;
        // minimal voice per kind (same shapes as composer.js)
        if (kind === 'drum') {
          const buf = ctx.createBuffer(1, SR * 0.16 | 0, SR);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource(); src.buffer = buf;
          src.connect(master); src.start(t0e); n++;
        } else {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sawtooth';
          const hz = kind === 'lead' ? (e.hz || 440) : 110 * Math.pow(2, ((e.semi ?? e.chord?.[0] ?? 0)) / 12);
          o.frequency.value = hz;
          g.gain.setValueAtTime(0.2, t0e);
          g.gain.exponentialRampToValueAtTime(1e-4, t0e + Math.min(e.dur * spb, 1));
          o.connect(g); g.connect(master);
          o.start(t0e); o.stop(t0e + Math.min(e.dur * spb, 1) + 0.05);
          n++;
        }
      }
      await ctx.startRendering();
      log.push(`${kind}: ${n} voices ok @ ${Math.round(performance.now() - ta)}ms`);
    } catch (err) {
      log.push(`${kind}: ERROR ${err.message}`);
    }
  }

  // full render with hard timeout
  const tf = performance.now();
  try {
    const mod = await import('./js/composer.js');
    const p = mod.renderSong((f) => { if (Math.round(f * 10) % 5 === 0) console.log('[prog]', Math.round(f * 100) + '%'); });
    const res = await Promise.race([
      p.then(b => ({ done: true, dur: b.buffer.duration })),
      new Promise(r => setTimeout(() => r({ done: false }), 30000)),
    ]);
    log.push(`full render: ${JSON.stringify(res)} @ ${Math.round(performance.now() - tf)}ms`);
  } catch (err) {
    log.push(`full render threw: ${err.message} :: ${String(err.stack).split('\n')[1]}`);
  }
  return log;
});
console.log(out.join('\n'));
await browser.close();
