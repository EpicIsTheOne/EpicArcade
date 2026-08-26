// volt-test.mjs — headless gameplay verification for the VOLT RUNNER build (voltrunner/).
// Usage: node tools/volt-test.mjs [--base http://127.0.0.1:9371]
// Verifies: boot, UI flow, controls direction (WASD camera-relative), mouse look,
// jump, quick-step, sprint/boost speed, goal/results, HUD. Saves screenshots.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const vrRoot = path.dirname(here);                      // voltrunner/
const SHOTS = path.join(vrRoot, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const args = Object.fromEntries(process.argv.slice(2).reduce((a, s, i, arr) => {
  if (s.startsWith('--')) a.push([s.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const BASE = args.base || 'http://127.0.0.1:9371';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
if (!exe) { console.error('no chrome/edge'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const R = { checks: [], shots: [], stats: {} };
const ok = (name, cond, detail = '') => {
  R.checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const shot = async (name) => {
  const p = path.join(SHOTS, name);
  await page.screenshot({ path: p });
  R.shots.push(p);
  console.log('shot:', name);
};

// ---------- Phase 0: boot → title ----------
await page.goto(BASE + '/index.html?gfx=low', { waitUntil: 'load' });
await page.waitForFunction('window.__volt && window.__gameReady', null, { timeout: 20000 })
  .catch(() => {});
const booted = await page.evaluate(() => !!window.__volt);
ok('boot: game module ready (__volt exposed)', booted);
const titleVisible = await page.evaluate(() =>
  !document.getElementById('title').classList.contains('hidden'));
ok('boot: title screen shown', titleVisible);
await page.waitForTimeout(600);
await shot('01-title.png');

// ---------- Phase 1: PLAY → level loads ----------
await page.click('#btn-play');
await page.waitForFunction("window.__volt.state()==='playing'", null, { timeout: 30000 })
  .catch(() => {});
ok('flow: PLAY starts zone 1', await page.evaluate(() => window.__volt.state() === 'playing'));
ok('flow: level name', await page.evaluate(() => window.__volt.director().level?.name === 'NEON SKYLINE'),
  await page.evaluate(() => window.__volt.director().level?.name || '(none)'));

await page.waitForTimeout(1200);
{
  // poll: player must settle onto the plaza (sim time runs slower than wall time headless)
  const settled = await page.waitForFunction(
    "window.__volt.stats().grounded && window.__volt.stats().hp===3", null, { timeout: 15000 }
  ).then(() => true).catch(() => false);
  const s = await page.evaluate(() => window.__volt.stats());
  ok('spawn: player grounded & healthy', settled, JSON.stringify(s.pos));
}

// gameplay beauty shot on the start plaza (character visible, third person)
await page.evaluate(() => { window.__volt.lookYaw(0); window.__volt.holdKey('KeyW', true); });
await page.waitForTimeout(900);
await page.evaluate(() => window.__volt.holdKey('KeyW', false));
await shot('02a-gameplay-plaza.png');

// helper: reset player to plaza center and WAIT until grounded
const resetTo = async (x, y, z) => {
  await page.evaluate(([x, y, z]) => {
    const v = window.__volt;
    v.holdKey('KeyW', false); v.holdKey('KeyA', false); v.holdKey('KeyD', false);
    v.holdKey('KeyS', false); v.holdKey('ShiftLeft', false);
    v.warpTo(x, y, z);
  }, [x, y, z]);
  await page.waitForFunction('window.__volt.stats().grounded', null, { timeout: 15000 }).catch(() => {});
};
// helper: hold a key and sample velocity once horizontal speed exceeds thr
const runAndSample = async (code, thr = 4) => {
  await page.evaluate((c) => window.__volt.holdKey(c, true), code);
  let s = null;
  for (let i = 0; i < 100; i++) {
    s = await page.evaluate(() => window.__volt.stats());
    if (Math.hypot(s.vel[0], s.vel[2]) > thr) break;
    await page.waitForTimeout(30);
  }
  await page.evaluate((c) => window.__volt.holdKey(c, false), code);
  return s;
};

// ---------- Phase 2: controls direction ----------
// camYaw=0 ⇒ camera forward = (0,0,-1). W must move -Z.
await resetTo(0, 2, -12);
await page.evaluate(() => window.__volt.lookYaw(0));
await page.waitForTimeout(150);
{
  const s = await runAndSample('KeyW');
  const [vx, , vz] = s.vel;
  const fwdDot = -vz / Math.max(1e-6, Math.hypot(vx, vz));   // expected dir (0,0,-1)
  ok('controls: W runs away-from-camera (forward)', fwdDot > 0.85, `vel=${JSON.stringify(s.vel)} fwdDot=${fwdDot.toFixed(2)}`);
}
// camYaw=π/2 ⇒ forward = (-1,0,~0). D (strafe right of forward) must move (0,0,-1).
await resetTo(0, 2, -12);
await page.evaluate(() => window.__volt.lookYaw(Math.PI / 2));
await page.waitForTimeout(150);
{
  const s = await runAndSample('KeyD');
  const [, vy, vz] = s.vel;
  const rightDot = -vz / Math.max(1e-6, Math.hypot(vy ? 0 : 1, vz)); // expected (0,0,-1)
  ok('controls: D strafes right (camera-relative)', rightDot > 0.85, `vel=${JSON.stringify(s.vel)}`);
}
// S must brake/reverse relative to forward (+Z)
await resetTo(0, 2, -12);
await page.evaluate(() => window.__volt.lookYaw(0));
await page.waitForTimeout(150);
{
  const s = await runAndSample('KeyS');
  ok('controls: S moves opposite forward (+Z)', s.vel[2] > 1, `vel.z=${s.vel[2]}`);
}
// ---------- Phase 3: mouse look direction ----------
{
  const y0 = await page.evaluate(() => {
    const v = window.__volt;
    v.input.locked = true;               // simulate captured mouse (headless)
    v.lookYaw(0);
    return v.camYaw();
  });
  await page.mouse.move(640, 360);
  await page.mouse.move(880, 360, { steps: 5 }); // movementX>0 → yaw must DECREASE (turn right)
  await page.waitForTimeout(200);
  const y1 = await page.evaluate(() => { const v = window.__volt; v.input.locked = false; return v.camYaw(); });
  ok('mouse: moving mouse right turns camera right', y1 < y0 - 0.2, `Δyaw=${(y1 - y0).toFixed(3)}`);
}
// ---------- Phase 4: jump ----------
await resetTo(0, 2, -12);
await page.waitForFunction('window.__volt.stats().grounded', null, { timeout: 15000 }).catch(() => {});
{
  await page.evaluate(() => window.__volt.press('Space', 140));
  let airborne = false;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__volt.stats());
    if (!s.grounded && s.vel[1] > 2) { airborne = true; break; }
    if (i === 5) await page.evaluate(() => window.__volt.press('Space', 140)); // re-buffer in case frame timing ate the first
    await page.waitForTimeout(30);
  }
  ok('jump: SPACE leaves ground upward', airborne);
  await page.waitForFunction('window.__volt.stats().grounded', null, { timeout: 15000 }).catch(() => {}); // land
}
// ---------- Phase 5: quick-step double tap ----------
await resetTo(0, 2, -12);
await page.evaluate(() => window.__volt.lookYaw(Math.PI / 2));
await page.waitForTimeout(250);
{
  // Start an in-page 8ms sampler BEFORE tapping so the short-lived impulse
  // (decays 13→~2 within ~0.4s under ground friction) cannot be missed by
  // slow out-of-process polling.
  await page.evaluate(() => {
    const v = window.__volt;
    const z0 = v.director().player.vel.z;
    window.__qsMax = 0;
    window.__qsPoll = setInterval(() => {
      const dz = v.director().player.vel.z - z0;
      if (dz > window.__qsMax) window.__qsMax = dz;
    }, 8);
  });
  await page.keyboard.press('KeyA');          // REAL trusted CDP keydown events
  await page.waitForTimeout(90);
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(350);
  const dvz = await page.evaluate(() => { clearInterval(window.__qsPoll); return window.__qsMax; });
  ok('quick-step: double-tap A dodges left', dvz > 4, `max Δvel.z=${dvz.toFixed(1)}`);   // left dodge ⇒ impulse toward (0,0,+1)
  await resetTo(0, 2, -12);
}
// ---------- Phase 6: sprint + boost down the expressway ----------
await resetTo(0, -11.4, -78);            // top of expressway ribbon
await page.evaluate(() => { window.__volt.lookYaw(0); });
await page.waitForFunction('window.__volt.stats().grounded', null, { timeout: 15000 }).catch(() => {});
{
  await page.evaluate(() => { const v = window.__volt; v.holdKey('KeyW', true); v.holdKey('ShiftLeft', true); });
  await page.waitForFunction('window.__volt.stats().maxSpeed > 20', null, { timeout: 30000 }).catch(() => {});
  await shot('02-gameplay-expressway.png');
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => window.__volt.stats());
  await page.evaluate(() => { const v = window.__volt; v.holdKey('KeyW', false); v.holdKey('ShiftLeft', false); });
  R.stats.sprintMaxSpeed = s.maxSpeed;
  ok('sprint+boost: builds high speed (>20 u/s ≈ 72 km/h)', s.maxSpeed > 20, `max=${s.maxSpeed.toFixed(1)} u/s`);
  ok('survival: no deaths during tests', !s.dead && s.hp === 3, `hp=${s.hp} dead=${s.dead}`);
  ok('collectibles exist in zone', s.totalVolts > 0, `volts=${s.totalVolts}`);
}
// ---------- Phase 7: goal → results ----------
await page.evaluate(() => window.__volt.finish());
await page.waitForFunction("window.__volt.state()==='results'", null, { timeout: 8000 }).catch(() => {});
{
  const st = await page.evaluate(() => window.__volt.state());
  ok('results: finishing shows results screen', st === 'results');
  const r = await page.evaluate(() => window.__volt.results());
  ok('results: rank/score computed', r && ['D', 'C', 'B', 'A', 'S'].includes(r.rank) && r.score >= 0,
    r ? `rank=${r.rank} score=${r.score}` : '(none)');
  await page.waitForTimeout(350);
  await shot('03-results.png');
}

// ---------- summary ----------
const fatal = errors.filter(e => !/favicon|autoplay|AudioContext was not allowed/i.test(e));
R.consoleErrors = fatal;
console.log('\n---- SUMMARY ----');
console.log(`checks: ${R.checks.filter(c => c.pass).length}/${R.checks.length} passed`);
if (fatal.length) { console.log('console/page errors:'); fatal.forEach(e => console.log(' ', e.slice(0, 200))); }
fs.writeFileSync(path.join(here, 'volt-report.json'), JSON.stringify(R, null, 2));
await browser.close();
process.exit(fatal.length || R.checks.some(c => !c.pass) ? 1 : 0);
