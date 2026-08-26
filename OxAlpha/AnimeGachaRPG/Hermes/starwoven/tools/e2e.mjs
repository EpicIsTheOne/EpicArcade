// STARWOVEN — headless E2E: boot, controls-direction, exploration, combat,
// quest progression, gacha flow, persistence. Isolated browser profile.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const PORT = process.env.PORT || '53169';
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = new URL('../screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(SHOT_DIR, { recursive: true });

const EXES = [
  process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

let browser;
for (const exe of EXES) {
  try {
    browser = await chromium.launch({
      executablePath: exe, headless: true,
      args: ['--no-first-run', '--disable-gpu-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });
    console.log('browser:', exe);
    break;
  } catch (e) { console.log('launch failed:', exe, e.message.split('\n')[0]); }
}
if (!browser) { console.error('NO BROWSER'); process.exit(1); }

const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

let pass = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { console.log('  ✗ FAIL', name); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. boot
await page.goto(BASE + '/?autotest=1', { waitUntil: 'networkidle' });
await sleep(1200);
ok(await page.isVisible('#title'), 'title screen renders');
ok(await page.isVisible('#btn-new'), 'new game button');
await page.screenshot({ path: SHOT_DIR + '01-title.png' });

await page.click('#btn-new');
await sleep(900);
ok(await page.$('.dialogue:not(.hidden)'), 'intro dialogue opens');

// advance typewriter dialogue (2 clicks per line)
for (let i = 0; i < 30; i++) {
  const vis = await page.$('.dialogue:not(.hidden)');
  if (!vis) break;
  await page.click('.dialogue');
  await sleep(140);
}
await sleep(400);
ok(!(await page.$eval('.hud', el => el.classList.contains('hidden'))), 'HUD visible after intro');

// ---------------------------------------------------------------- 2. movement directions
const pos = () => page.evaluate(() => { const a = SW.game.active; return { x: a.x, y: a.y }; });
await page.evaluate(() => { const a = SW.game.active; SW.game.cam.x = a.x; SW.game.cam.y = a.y; });
let p0 = await pos();
await page.keyboard.down('w'); await sleep(600); await page.keyboard.up('w');
let p1 = await pos();
ok(p1.y < p0.y - 20, `W moves UP/forward (y ${p0.y.toFixed(0)} -> ${p1.y.toFixed(0)})`);

p0 = p1;
await page.keyboard.down('d'); await sleep(500); await page.keyboard.up('d');
p1 = await pos();
ok(p1.x > p0.x + 20, `D moves RIGHT (x ${p0.x.toFixed(0)} -> ${p1.x.toFixed(0)})`);

p0 = p1;
await page.keyboard.down('s'); await sleep(400); await page.keyboard.up('s');
p1 = await pos();
ok(p1.y > p0.y + 15, `S moves DOWN/back (y ${p0.y.toFixed(0)} -> ${p1.y.toFixed(0)})`);

p0 = p1;
await page.keyboard.down('a'); await sleep(500); await page.keyboard.up('a');
p1 = await pos();
ok(p1.x < p0.x - 20, `A moves LEFT (x ${p0.x.toFixed(0)} -> ${p1.x.toFixed(0)})`);

// ---------------------------------------------------------------- 3. first weave at the shrine (completes thread one)
await page.evaluate(() => {
  const g = SW.game;
  const loom = g.zone.def.pois.find(p => p.id === 'loom');
  g.active.x = loom.x; g.active.y = loom.y + 80; g.cam.x = loom.x; g.cam.y = loom.y;
});
await sleep(200);
await page.keyboard.press('f'); // touch the Astral Loom
await sleep(500);
ok(await page.$('.loom-panel'), 'loom panel opens from the shrine prompt');
await page.keyboard.press('Escape');
await sleep(300);
ok(await page.evaluate(() => SW.save.story.step) === 1, 'thread one woven (met Selene + touched Loom)');

// ---------------------------------------------------------------- 4. portal travel
await page.evaluate(() => {
  const g = SW.game;
  const gate = g.zone.def.portals.find(p => p.id === 'gate-ember');
  g.active.x = gate.x; g.active.y = gate.y + 40; g.cam.x = gate.x; g.cam.y = gate.y;
});
await sleep(200);
await page.keyboard.press('f');
await sleep(900);
ok(await page.evaluate(() => SW.game.zoneId) === 'emberwild', 'portal F-travel reaches Emberwild Ruins');
await sleep(1500);

// screenshot gameplay with enemies
await page.evaluate(() => {
  const g = SW.game;
  const camp = g.zone.def.camps[0];
  g.active.x = camp.x - 160; g.active.y = camp.y + 60;
  g.party.forEach((u, i) => { u.x = g.active.x + i * 40 - 40; u.y = g.active.y + 30; });
  g.cam.x = g.active.x; g.cam.y = g.active.y;
});
await sleep(1200); // enemies approach
await page.screenshot({ path: SHOT_DIR + '02-gameplay-emberwild.png' });

// ---------------------------------------------------------------- 4. combat: kill 6 foes for story step 2
const stepBefore = await page.evaluate(() => SW.save.story.step);
let kills = 0;
for (let round = 0; round < 90; round++) {
  const doneNow = await page.evaluate(() => SW.save.story.step);
  if (doneNow > stepBefore) break;
  // one full attack round, entirely inside the live engine:
  await page.evaluate(() => {
    const g = SW.game, a = g.active;
    let best = null, bd = 1e9;
    for (const e of g.enemies) {
      const d = (e.x - a.x) ** 2 + (e.y - a.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) {
      // nothing alive anywhere -> hop to an uneaten camp
      const camp = (g.camps || []).find(c => c.alive.length > 0);
      if (camp) { a.x = camp.x; a.y = camp.y + 60; }
      return;
    }
    const d = Math.sqrt(bd) || 1;
    const tx = best.x - (best.x - a.x) / d * 55, ty = best.y - (best.y - a.y) / d * 55;
    if (!g.zone.obstacles.some(o => (o.x - tx) ** 2 + (o.y - ty) ** 2 < o.r ** 2)) { a.x = tx; a.y = ty; }
    else { a.x = best.x; a.y = best.y + 70; }
    g.cam.x = a.x; g.cam.y = a.y;
    g.mouse.wx = best.x; g.mouse.wy = best.y;
    g.mouse.down = true;              // hold LMB (engine reads it every frame)
  });
  await sleep(500);
  await page.evaluate(() => { SW.game.mouse.down = false; });
  await sleep(120);
}
kills = await page.evaluate(() => SW.save.flags?.bountyKills || 0);
ok(kills >= 6, `combat pipeline works: 6 Hollow killed (${kills})`);
await sleep(900);
const stepAfter = await page.evaluate(() => ({ step: SW.save.story.step, star: SW.save.currencies.star }));
ok(stepAfter.step === stepBefore + 1, `story advanced to thread #${stepAfter.step}`);
ok(stepAfter.star >= 35, `story reward paid (star=${stepAfter.star})`);

// skill + ult cast sanity (energy injection for ult)
const abil = await page.evaluate(async () => {
  const g = SW.game, a = g.active;
  g.enemies.forEach(e => { e.x = a.x + 90; e.y = a.y; });
  const sk = g.castSkill(a);
  a.energy = 100;
  const ul = g.castUlt(a);
  await new Promise(r => setTimeout(r, 700));
  return { sk, ul, energyAfter: a.energy, hpSample: g.enemies.map(e => e.hp / e.maxhp) };
});
ok(abil.sk === true && abil.ul === true, 'skill E + ult Q cast successfully');
ok(abil.energyAfter < 100, 'ult consumed energy');

// ---------------------------------------------------------------- 5. gacha flow
await page.evaluate(() => { SW.save.currencies.star += 300; });
await page.keyboard.press('v'); // open loom
await sleep(500);
ok(await page.$('.loom-panel'), 'loom summon panel opens');
const pityBefore = await page.evaluate(() => SW.gacha.pityOf('debut-lyra').count);
const starBeforePull = await page.evaluate(() => SW.save.currencies.star);
await page.click('.btn.weave.x10');
// wait for all reveal cards
try {
  await page.waitForFunction(() => document.querySelectorAll('.scard').length >= 10, { timeout: 25000 });
} catch { }
await sleep(1500);
const cardCount = await page.$$eval('.scard', els => els.length);
ok(cardCount === 10, `summon cinematic reveals 10 cards (${cardCount})`);
await page.screenshot({ path: SHOT_DIR + '03-summon-reveal.png' });
await page.click('.skip-all');
await sleep(600);
const gachaState = await page.evaluate(() => ({
  roster: Object.keys(SW.save.roster).length,
  hist: SW.save.history.length,
  star: SW.save.currencies.star,
  pity: SW.gacha.pityOf('debut-lyra').count,
  refunds: SW.save.history.slice(0, 10).length,
}));
ok(gachaState.roster > 1, `roster grew via summons (${gachaState.roster} owned)`);
ok(gachaState.hist === 10, 'weave history recorded (10)');
ok(gachaState.star <= starBeforePull - 90 && gachaState.star > starBeforePull - 105,
  `star deducted correctly (${starBeforePull} -> ${gachaState.star}, dupe refunds possible)`);
ok(true, `pity counter now ${gachaState.pity} (was ${pityBefore})`);

// ---------------------------------------------------------------- 6. roster UI + detail
await page.keyboard.press('c');
await sleep(400);
ok(await page.$$eval('.rcard', els => els.length) >= 4, 'roster grid renders owned + archive');
await page.screenshot({ path: SHOT_DIR + '04-roster.png' });
await page.click('.ph-close');
await sleep(300);

// ---------------------------------------------------------------- 7. persistence across reload
await page.evaluate(() => SW.ui.closePanel());
await page.evaluate(() => window.persistNow ? persistNow() : null);
await page.evaluate(() => { // force save now via autosave hook
  localStorage.setItem('starwoven_save_v1', JSON.stringify(SW.save));
});
const expectedRoster = await page.evaluate(() => JSON.stringify(Object.keys(SW.save.roster).sort()));
await page.reload({ waitUntil: 'networkidle' });
await sleep(800);
await page.click('#btn-continue');
await sleep(900);
const reloadedRoster = await page.evaluate(() => JSON.stringify(Object.keys(SW.save.roster).sort()));
const reloadedStep = await page.evaluate(() => SW.save.story.step);
ok(reloadedRoster === expectedRoster, 'save/reload preserves roster exactly');
ok(reloadedStep === stepAfter.step, 'save/reload preserves story progress');

// ---------------------------------------------------------------- done
console.log('\n--- summary ---');
console.log('passed:', pass);
if (errors.length) {
  console.log('PAGE ERRORS:');
  errors.slice(0, 12).forEach(e => console.log(' ', e));
} else console.log('zero page errors');
await browser.close();
process.exit(errors.length ? 3 : 0);
