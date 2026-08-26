// Granular render isolation probe.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = dirname(fileURLToPath(import.meta.url)) + '/..';
const { port } = JSON.parse(readFileSync(join(RUN, 'rhythm-run01-server.json'), 'utf8'));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[err]', String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

// Step 1: bare offline ctx render
let r = await page.evaluate(async () => {
  const t0 = performance.now();
  const ctx = new OfflineAudioContext(2, 44100 * 5, 44100);
  const buf = await ctx.startRendering();
  return { ok: true, ms: Math.round(performance.now() - t0), len: buf.duration };
}).catch(e => ({ error: String(e) }));
console.log('bare-ctx:', JSON.stringify(r));

// Step 2: one kick drum pattern graph
r = await page.evaluate(async () => {
  const t0 = performance.now();
  const SR = 44100;
  const ctx = new OfflineAudioContext(2, SR * 10, SR);
  for (let i = 0; i < 20; i++) {
    const t0n = i * 0.5;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t0n);
    o.frequency.exponentialRampToValueAtTime(44, t0n + 0.09);
    g.gain.setValueAtTime(0.9, t0n);
    g.gain.exponentialRampToValueAtTime(1e-4, t0n + 0.24);
    o.connect(g); g.connect(ctx.destination); o.start(t0n); o.stop(t0n + 0.26);
  }
  await ctx.startRendering();
  return { ok: true, ms: Math.round(performance.now() - t0) };
}).catch(e => ({ error: String(e) }));
console.log('kicks:', JSON.stringify(r));

// Step 3: full event schedule but tiny context length (does scheduling itself hang?)
r = await page.evaluate(async () => {
  const sd = await import('./js/song-data.js');
  const { events } = sd.composeSong();
  return { events: events.length };
});
console.log('events:', JSON.stringify(r));

await browser.close();
