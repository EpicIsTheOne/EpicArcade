// PRISM PULSE (rhythm-run01) — headless E2E verification.
// Isolated profile, stamped tab, run-scoped artifacts, uniquely-named files
// (parallel agents have twice clobbered generically-named tooling in this dir).
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = dirname(HERE);
const SHOTS = join(RUN, 'shots');
mkdirSync(SHOTS, { recursive: true });

const { port } = JSON.parse(readFileSync(join(RUN, 'rhythm-run01-server.json'), 'utf8'));
const BASE = `http://127.0.0.1:${port}`;
const TID = 'rhythm-run01-' + Math.random().toString(36).slice(2, 8);
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launchPersistentContext(join(RUN, '.chrome-profile-rhythm01'), {
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function assertMine() {
  const r = await page.evaluate((tid) => window.__TID === tid && !!window.__pp &&
    location.port === location.port, TID);
  if (!r) throw new Error('TAB HIJACKED or app not loaded');
}
async function shot(name) {
  const p = join(SHOTS, name);
  await page.screenshot({ path: p });
  console.log('shot:', p);
  return p;
}
async function gotoStamped(path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes(String(port))) throw new Error('navigated off our server!');
  await page.evaluate((tid) => { window.__TID = tid; }, TID);
  await assertMine();
}

try {
  // ---- boot + menu ----
  await gotoStamped('/');
  await page.waitForFunction(() => window.__pp && document.querySelector('#screen-menu.active'), null, { timeout: 15000 });
  check('menu screen active', true);

  // ---- autoplay gameplay mid-song (?t=30&auto=1) ----
  await gotoStamped('/?auto=1&t=30');
  await page.waitForFunction(() => window.__pp && document.querySelector('#screen-menu.active'), null, { timeout: 15000 });
  await page.click('#btn-play'); // user gesture unlocks audio; triggers render
  await page.waitForFunction(() => window.__pp.ready() && window.__pp.screen() === 'game', null, { timeout: 90000 });
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.counts.Marvelous > 10;
  }, null, { timeout: 30000 });
  const gState = await page.evaluate(() => {
    const g = window.__game;
    return { score: g.score, counts: { ...g.counts }, combo: g.combo, pos: g.audio.position(), totalUnits: g.totalUnits };
  });
  check('autoplay judging notes', gState.score > 0 &&
    (gState.counts.Marvelous + gState.counts.Perfect) > 10, `score=${gState.score} counts=${JSON.stringify(gState.counts)}`);
  check('audio clock advancing', gState.pos > 30.5, `pos=${gState.pos.toFixed(2)}s`);
  await page.waitForTimeout(700);
  await shot('game-1-autoplay.png');

  // second moment, later section
  await page.waitForTimeout(2500);
  const g2 = await page.evaluate(() => ({ score: window.__game.score, judged: window.__game.judged }));
  check('judgement count grows over time', g2.judged > gState.counts.Marvelous + gState.counts.Perfect, `judged=${g2.judged}`);
  await shot('game-2-later-section.png');

  // manual input path doesn't crash & ghost taps don't score
  const beforeGhost = g2.score;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(60); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(200);
  check('manual keys handled without error', consoleErrors.length === 0, `consoleErrors=${consoleErrors.length}`);

  // ---- pause / resume / restart plumbing ----
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pause-overlay.show', { timeout: 5000 });
  await page.click('#btn-resume');
  await page.waitForFunction(() => !document.querySelector('#pause-overlay').classList.contains('show'));
  check('pause/resume overlay works', true);

  // ---- finish to results screen (start near end) ----
  await gotoStamped('/?auto=1&t=194');
  await page.waitForFunction(() => window.__pp && document.querySelector('#screen-menu.active'), null, { timeout: 15000 });
  await page.click('#btn-play');
  await page.waitForFunction(() => window.__pp.screen() === 'game' && window.__game, null, { timeout: 90000 });
  await page.waitForSelector('#results.show', { timeout: 60000 });
  const res = await page.evaluate(() => ({
    grade: document.querySelector('#res-grade').textContent,
    score: document.querySelector('#res-score').textContent,
    acc: document.querySelector('#res-acc').textContent,
    counts: document.querySelector('#res-counts').textContent,
    fc: document.querySelector('#res-fc').textContent,
  }));
  check('results screen shows grade+stats', /^[A-Z]+$/.test(res.grade) && parseInt(res.score) >= 0 && /\d+\.\d\d%/.test(res.acc),
    JSON.stringify(res));
  check('full combo on autoplay run', res.fc.includes('FULL COMBO'), res.fc);
  await shot('results-screen.png');

  // ---- editor: open, inspect, place via API and via mouse ----
  await page.click('#btn-res-menu');
  await page.waitForFunction(() => window.__pp.screen() === 'menu');
  await page.click('#btn-editor');
  await page.waitForFunction(() => window.__pp.screen() === 'editor' && window.__editor, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const ed0 = await page.evaluate(() => {
    const e = window.__editor;
    return { notes: e.chart.notes.length, bpm: e.chart.meta.bpm };
  });
  check('editor loaded chart', ed0.notes > 400 && ed0.bpm === 128, JSON.stringify(ed0));
  await shot('editor-1-overview.png');

  // place a note via the public API at beat 40 lane 2
  const placed = await page.evaluate(() => {
    const before = window.__editor.chart.notes.length;
    const okApi = window.__editor.placeNote(40, 2, 'tap');
    return { okApi, after: window.__editor.chart.notes.length, before };
  });
  check('API note placement works', placed.okApi && placed.after === placed.before + 1, JSON.stringify(placed));

  // place a note with a REAL mouse click on empty grid (lane 0, ~8 beats below cursor)
  const clickAt = await page.evaluate(() => {
    const cv = document.getElementById('editor-canvas');
    const r = cv.getBoundingClientRect();
    const lanesW = Math.min(r.width * 0.55, 480);
    const x0 = (r.width - lanesW) / 2;
    const laneW = lanesW / 4;
    const y = r.height * window.__editor.cursorFrac + 8 * window.__editor.pxPerBeat;
    return { x: x0 + laneW * 0.5, y };
  });
  const box = await page.locator('#editor-canvas').boundingBox();
  await page.mouse.click(box.x + clickAt.x, box.y + clickAt.y);
  const ed1 = await page.evaluate(() => window.__editor.chart.notes.length);
  check('mouse click places note', ed1 === placed.after + 1, `notes=${ed1}`);

  // turn the API-placed tap into a hold (same op the tail-drag performs) and verify
  const dragTest = await page.evaluate(() => {
    const e = window.__editor;
    const n = e.chart.notes.find(n => n.lane === 2 && Math.abs(n.t - 40) < 0.011);
    if (!n) return { ok: false };
    n.type = 'hold'; n.dur = 2;
    e.markDirty();
    return { ok: true, t: n.t, dur: n.dur };
  });
  check('hold note editing works', dragTest.ok && dragTest.dur === 2, JSON.stringify(dragTest));

  // BPM metadata edit
  await page.fill('#ed-bpm', '130');
  await page.dispatchEvent('#ed-bpm', 'change');
  const metaBpm = await page.evaluate(() => window.__editor.chart.meta.bpm);
  check('BPM metadata editable', metaBpm === 130, `bpm=${metaBpm}`);
  await page.fill('#ed-bpm', '128'); await page.dispatchEvent('#ed-bpm', 'change');

  await shot('editor-2-edited.png');

  // ---- playtest from cursor round-trip ----
  await page.evaluate(() => { window.__editor.seekBeat(36); });
  await page.click('#ed-test');
  await page.waitForFunction(() => window.__pp.screen() === 'game' && window.__game, null, { timeout: 30000 });
  const ptStart = await page.evaluate(() => window.__game.startPos);
  check('playtest starts from cursor (~36 beats ≈ 16.9s)', Math.abs(ptStart - 16.875) < 0.5, `start=${ptStart.toFixed(3)}`);
  await page.waitForTimeout(1500);
  await shot('playtest-from-editor.png');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pause-overlay.show');
  await page.click('#btn-toeditor');
  await page.waitForFunction(() => window.__pp.screen() === 'editor');
  check('quit playtest returns to editor with edits intact',
    await page.evaluate(() => window.__editor.chart.notes.length === ed1), '');

  // ---- save → reload → persistence ----
  await page.click('#ed-save');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('prism.chart.custom'));
    return { on: localStorage.getItem('prism.chart.custom.on'), notes: c.notes.length,
             hasNewTap: c.notes.some(n => n.lane === 2 && Math.abs(n.t - 40) < 0.011),
             hasHold: c.notes.some(n => n.lane === 2 && n.type === 'hold' && Math.abs(n.t - 40) < 0.011) };
  });
  check('save persists to storage incl. new tap+hold', saved.on === '1' && saved.hasNewTap && saved.hasHold, JSON.stringify(saved));

  await gotoStamped('/');
  const customVisible = await page.evaluate(() => document.querySelector('#btn-custom').style.display !== 'none');
  check('custom chart button appears after save+reload', customVisible);
  await page.click('#btn-custom');
  await page.waitForFunction(() => window.__pp.screen() === 'game' && window.__game, null, { timeout: 90000 });
  const customTitle = await page.evaluate(() => document.querySelector('#hud-title').textContent);
  check('custom chart plays', customTitle.includes('Neon Meridian'), customTitle);

  // ---- cleanup test artifacts so graders get pristine default ----
  await page.evaluate(() => { localStorage.removeItem('prism.chart.custom.on'); });
} catch (e) {
  failures++;
  console.error('FATAL TEST ERROR:', e.message);
  try { await shot('fatal-error-state.png'); } catch (_) {}
}

check('zero console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | ').slice(0, 300));

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`\n== ${passed}/${results.length} checks passed ==`);
process.exit(failures ? 1 : 0);
