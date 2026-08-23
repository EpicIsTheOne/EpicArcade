// Headless gameplay QA (puppeteer-core + Edge/Chrome, --headless=new).
// Verifies: boot, menu, controls DIRECTION LAW, jump/roll, collisions,
// powerup pickup, crash->gameover->restart, persistence.
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

function findBrowser() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('no browser found');
}

(async () => {
  const args = process.argv.slice(2);
  const QA_URL = 'http://127.0.0.1:' + (args[0] || '8642') + '/index.html?qa=1';
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-first-run', '--disable-extensions', '--mute-audio', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const results = [];
  function check(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
    return cond;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const S = () => page.evaluate(() => ({
    state: window.Game.state, x: +(window.Game.x || 0).toFixed(3), lane: window.Game.lane === undefined ? 1 : window.Game.lane,
    y: +(window.Game.y || 0).toFixed(2), vy: +(window.Game.vy || 0).toFixed(2), onGround: !!window.Game.onGround,
    rolling: window.Game.rollT > 0, speed: +(window.Game.speed || 0).toFixed(1),
    score: Math.floor(window.Game.score || 0), dist: +(window.Game.dist || 0).toFixed(0),
    coins: window.Game.runCoins || 0, anim: window.Game.animState, travel: +(window.Game.travel || 0).toFixed(1),
    chunks: Object.keys(window.Game.chunkMap || {}).length,
    movingTrains: window.Game.movingTrains ? window.Game.movingTrains.length : 0,
    collectibles: window.Game.collectibles.count(),
    chaserGap: +(window.Game.chaserGap || 0).toFixed(1), boardActive: !!window.Game.boardActive,
    powers: Object.keys(window.Game.powerups.active).filter(k => window.Game.powerups.remaining(k) > 0)
  }));
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOTS, name) });
  }
  // Bot driver (serialized into the page by puppeteer)
  async function botRun() {
    const sleepMs = ms => new Promise(r => setTimeout(r, ms));
    let frames = 0;
    const t0 = performance.now();
    while (window.Game.state === 'running' && performance.now() - t0 < 25000) {
      const g = window.Game;
      let threat = null;
      for (let k = g.curChunk; k <= g.curChunk + 2 && !threat; k++) {
        const c = g.chunkMap[k];
        if (!c) continue;
        for (const col of c.colliders) {
          let d, act = col.action;
          if (act === 'train') { d = -(col.z + col.hz + c.startZ); act = 'lane'; }
          else d = -(col.z + c.startZ);
          if (d > -2 && d < 62 && Math.abs(col.x - g.x) < 1.6) {
            if (!threat || d < threat.d) threat = { d, action: act };
          }
        }
      }
      for (const t of g.movingTrains) {
        if (Math.abs(window.CFG.LANES[t.lane] - g.x) < 1.6) {
          const d = -t.zFront;
          if (d > -3 && d < 70 && (!threat || d < threat.d)) threat = { d, action: 'lane' };
        }
      }
      if (threat) {
        if (threat.action === 'jump') {
          let rollBehind = false;
          for (let k = g.curChunk; k <= g.curChunk + 2; k++) {
            const c = g.chunkMap[k]; if (!c) continue;
            for (const col of c.colliders) {
              const d = -(col.z + c.startZ);
              if (col.action === 'roll' && Math.abs(col.x - g.x) < 1.6 && d > -2 && d < threat.d + 9) rollBehind = true;
            }
          }
          if (!rollBehind && threat.d < 9) window.Game.QA.pressKey('KeyW');
          else if (rollBehind && threat.d < 16 && g.lane > 0) window.Game.QA.pressKey('KeyA');
          else if (rollBehind && threat.d < 16) window.Game.QA.pressKey('KeyD');
        }
        else if (threat.action === 'roll') { if (threat.d < 9) window.Game.QA.pressKey('KeyS'); }
        else if (threat.action === 'lane') {
          if (threat.d < 14) {
            // Option A: it's a train we can land on and our feet are low enough -> climb
            let trainRoof = null;
            for (let k = g.curChunk; k <= g.curChunk + 2 && !trainRoof; k++) {
              const c = g.chunkMap[k]; if (!c) continue;
              for (const col of c.colliders) {
                if (col.action !== 'train') continue;
                const d = -(col.z + col.hz + c.startZ);
                if (Math.abs(col.x - g.x) < 1.6 && d > -2 && d < threat.d + 1) trainRoof = col.roofY || 3.62;
              }
            }
            if (trainRoof && g.y < 1.0 && threat.d < 9) { window.Game.QA.pressKey('KeyW'); }
            else {
            const opts = [];
            for (const ln of [g.lane - 1, g.lane + 1]) {
              if (ln < 0 || ln > 2) continue;
              const lx = window.CFG.LANES[ln];
              let blocked = false;
              for (let k = g.curChunk; k <= g.curChunk + 2 && !blocked; k++) {
                const c = g.chunkMap[k]; if (!c) continue;
                for (const col of c.colliders) {
                  if (col.action === 'jump' || col.action === 'roll') continue;
                  const wz = col.z + c.startZ;
                  if (Math.abs(col.x - lx) < 1.2 && wz > -75 && wz < 4) { blocked = true; break; }
                }
                for (const t of g.movingTrains) {
                  if (Math.abs(window.CFG.LANES[t.lane] - lx) < 1.2) {
                    const d = -t.zFront;
                    if (d > -5 && d < 60) { blocked = true; break; }
                  }
                }
              }
              if (!blocked) opts.push(ln);
            }
            if (opts.length) window.Game.QA.pressKey(opts[0] < g.lane ? 'KeyA' : 'KeyD');
            }
          }
        }
      }
      frames++;
      await sleepMs(50);
    }
    return { frames, dist: +window.Game.dist.toFixed(0), state: window.Game.state,
             coins: window.Game.runCoins, powersSeen: window.Game.pwCollected,
             jumps: window.Game.jumpCount, rolls: window.Game.rollCount,
             nearMisses: window.Game.nearMisses };
  }

  // ---- boot ----
  await page.goto(QA_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('!!window.SR_READY', { timeout: 30000 });
  const st0 = await S();
  check('boot: no page errors so far', errors.length === 0, errors.join(' | ').slice(0, 200));
  check('boot: reaches menu', st0.state === 'menu', 'state=' + st0.state);
  check('boot: chunks generated', st0.chunks >= 5, 'chunks=' + st0.chunks);
  await sleep(700);
  await shot('qa_01_menu.png');

  // ---- start run ----
  await page.evaluate(() => window.Game.newRun());
  await sleep(400);
  let st = await S();
  check('run: starts running', st.state === 'running', 'state=' + st.state);
  check('run: starts center lane', st.lane === 1 && Math.abs(st.x) < 0.05, 'lane=' + st.lane + ' x=' + st.x);
  check('run: input enabled in-run', await page.evaluate(() => window.Input.isEnabled()));
  await sleep(700);
  st = await S();
  check('run: forward motion', st.dist > 0 && st.travel > 0, 'dist=' + st.dist);

  // ---- CONTROL DIRECTION LAW (player made invulnerable so random traffic
  // can't kill the deterministic input tests) ----
  await page.evaluate(() => { window.Game.invuln = 9999; });
  const settle = ms => sleep(ms);
  // A => LEFT
  await page.evaluate(() => window.Game.QA.pressKey('KeyA'));
  await settle(450); st = await S();
  check('controls: KeyA moves LEFT', st.x < -1.5 && st.lane === 0, 'x=' + st.x + ' lane=' + st.lane);
  // D => RIGHT
  await page.evaluate(() => window.Game.QA.pressKey('KeyD'));
  await settle(500); st = await S();
  check('controls: KeyD moves RIGHT (back to center)', Math.abs(st.x) < 0.4 && st.lane === 1, 'x=' + st.x + ' lane=' + st.lane);
  // D again => far right
  await page.evaluate(() => window.Game.QA.pressKey('KeyD'));
  await settle(450); st = await S();
  check('controls: KeyD moves RIGHT again', st.x > 1.5 && st.lane === 2, 'x=' + st.x + ' lane=' + st.lane);
  // ArrowLeft => LEFT
  await page.evaluate(() => window.Game.QA.pressKey('ArrowLeft'));
  await settle(500); st = await S();
  check('controls: ArrowLeft moves LEFT', Math.abs(st.x) < 0.4 && st.lane === 1, 'x=' + st.x + ' lane=' + st.lane);
  // ArrowRight => RIGHT
  await page.evaluate(() => window.Game.QA.pressKey('ArrowRight'));
  await settle(450); st = await S();
  check('controls: ArrowRight moves RIGHT', st.x > 1.5 && st.lane === 2, 'x=' + st.x + ' lane=' + st.lane);
  // rapid alternating A/D/A/D — final must be deterministic
  for (const k of ['KeyA', 'KeyD', 'KeyA']) {
    await page.evaluate(kk => window.Game.QA.pressKey(kk), k);
    await settle(140);
  }
  await settle(600); st = await S();
  check('controls: rapid alternation deterministic (ends center)', st.lane === 1, 'lane=' + st.lane + ' x=' + st.x);
  // wall clamp: D at right edge stays lane 2, never wraps
  await page.evaluate(() => window.Game.QA.pressKey('KeyD'));
  await page.evaluate(() => window.Game.QA.pressKey('KeyD'));
  await settle(650); st = await S();
  check('controls: right wall clamps (no wrap)', st.lane === 2 && st.x > 2.8, 'lane=' + st.lane + ' x=' + st.x);
  await page.evaluate(() => window.Game.QA.pressKey('KeyA'));
  await page.evaluate(() => window.Game.QA.pressKey('KeyA'));
  await settle(700); st = await S();
  check('controls: left wall clamps', st.lane === 0, 'lane=' + st.lane);
  await page.evaluate(() => window.Game.QA.pressKey('KeyD'));
  await settle(500);

  // ---- JUMP (W) ----
  await page.evaluate(() => window.Game.QA.pressKey('KeyW'));
  await sleep(240); st = await S();
  check('jump: KeyW gives upward motion', st.y > 0.5 || st.vy > 2, 'y=' + st.y + ' vy=' + st.vy + ' anim=' + st.anim);
  await sleep(1100); st = await S();
  check('jump: lands back on ground', st.onGround && st.y < 0.15, 'y=' + st.y + ' ground=' + st.onGround);
  // Space and ArrowUp also jump
  await page.evaluate(() => window.Game.QA.pressKey('Space'));
  await sleep(220); st = await S();
  check('jump: SPACE jumps', st.y > 0.3 || st.vy > 2, 'y=' + st.y);
  await sleep(1000);
  await page.evaluate(() => window.Game.QA.pressKey('ArrowUp'));
  await sleep(220); st = await S();
  check('jump: ArrowUp jumps', st.y > 0.3 || st.vy > 2, 'y=' + st.y);
  await sleep(1100);

  // ---- ROLL (S / ArrowDown) ----
  await page.evaluate(() => window.Game.QA.pressKey('KeyS'));
  await sleep(160); st = await S();
  check('roll: KeyS slides', st.rolling || st.anim === 'roll', 'anim=' + st.anim + ' rolling=' + st.rolling);
  await sleep(800);
  await page.evaluate(() => window.Game.QA.pressKey('ArrowDown'));
  await sleep(150); st = await S();
  check('roll: ArrowDown slides', st.rolling || st.anim === 'roll', 'anim=' + st.anim);
  await sleep(900);
  await shot('qa_02_running.png');

  // ---- pause/resume + controls recovery ----
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' })); });
  await sleep(250); st = await S();
  check('pause: P pauses', st.state === 'paused', 'state=' + st.state);
  check('pause: input disabled while paused', !(await page.evaluate(() => window.Input.isEnabled())));
  const xBeforePause = st.x;
  await page.evaluate(() => window.Game.QA.pressKey('KeyA')); // should NOT move while paused
  await sleep(300); st = await S();
  check('pause: keys do not move player', Math.abs(st.x - xBeforePause) < 0.01, 'dx=' + (st.x - xBeforePause).toFixed(3));
  await page.evaluate(() => window.Game.resume());
  await sleep(300); st = await S();
  check('resume: input re-enabled & running', st.state === 'running' && (await page.evaluate(() => window.Input.isEnabled())));

  // ---- sustained auto-play survival (bot avoids obstacles AND trains, chases coins) ----
  await page.evaluate(() => { window.Game.invuln = 0; }); // bot plays fair
  let survived = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.evaluate(() => { if (window.Game.state !== 'running' && window.Game.state !== 'paused') window.Game.newRun(); else { window.Game.newRun(); } });
    survived = await page.evaluate(botRun);
    if (survived.state === 'running') break;
    console.log('  (bot attempt ' + attempt + ' ended at ' + survived.dist + 'm, retrying)');
  }
  st = await S();
  check('autoplay: survived 25s bot run', survived.state === 'running' && survived.dist > 250,
    JSON.stringify(survived).slice(0, 180));
  check('autoplay: scored points', st.score > 300, 'score=' + st.score);
  check('autoplay: collected coins', survived.coins >= 10, 'coins=' + survived.coins);
  check('autoplay: streaming healthy', st.chunks >= 5 && st.chunks <= 12, 'chunks=' + st.chunks);
  await shot('qa_03_after_bot.png');

  // ---- powerup grant + HUD proof ----
  await page.evaluate(() => { window.Game.powerupQA('magnet'); });
  await sleep(300); st = await S();
  check('powerup: magnet activates', st.powers.indexOf('magnet') >= 0, 'powers=' + JSON.stringify(st.powers));
  await page.evaluate(() => { window.Game.powerupQA('jetpack'); });
  await sleep(400); st = await S();
  check('powerup: jetpack lifts player', st.y > 3, 'y=' + st.y);
  await page.evaluate(() => { window.Game.powerups.endNow('magnet'); window.Game.powerups.endNow('jetpack'); });
  await sleep(600);

  // ---- hoverboard (deterministic: pause first so traffic can't interfere) ----
  await page.evaluate(() => { window.Game.pause(); });
  await page.evaluate(() => { window.Game.boardQA(); });
  await sleep(250); st = await S();
  check('board: activates & visible', st.boardActive === true && st.state === 'paused',
    'active=' + st.boardActive + ' state=' + st.state);
  await page.evaluate(() => window.Game.resume());
  await sleep(250);

  // ---- stumble -> chaser gains ground ----
  const gapBefore = st.chaserGap;
  await page.evaluate(() => { window.Game.stumbleQA(); });
  await sleep(300); st = await S();
  check('stumble: chaser closes in', st.chaserGap < gapBefore, gapBefore + ' -> ' + st.chaserGap);

  // ---- force a crash to test game-over path (via QA hook) ----
  await page.evaluate(() => { window.Game.crashQA(); });
  await sleep(500); st = await S();
  check('crash: game over screen', st.state === 'over', 'state=' + st.state);
  await shot('qa_04_gameover.png');

  // ---- restart works ----
  await page.evaluate(() => window.Game.newRun());
  await sleep(400); st = await S();
  check('restart: fresh run', st.state === 'running' && st.dist < 40 && st.score < 100, 'dist=' + st.dist + ' score=' + st.score);

  // ---- persistence ----
  const savedCoins = await page.evaluate(() => window.Save.data.coins);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction('!!window.SR_READY', { timeout: 30000 });
  const savedCoins2 = await page.evaluate(() => window.Save.data.coins);
  check('save: coins persist across reload', savedCoins2 === savedCoins, savedCoins + ' -> ' + savedCoins2);
  check('save: best recorded', await page.evaluate(() => window.Save.data.best > 0));

  const fatal = errors.filter(e => !e.includes('favicon'));
  check('final: zero page errors', fatal.length === 0, fatal.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
  const fails = results.filter(r => !r.pass);
  console.log('\n== RESULT: ' + (results.length - fails.length) + '/' + results.length + ' checks passed ==');
  fs.writeFileSync(path.join(SHOTS, 'qa_results.json'), JSON.stringify({ results, fatalErrors: fatal }, null, 2));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
