/* Headless smoke test: run the GRAYLINE night loop in Node with stubs */
const path = require('node:path');
const fs = require('node:fs');

global.window = global;
global.G = {};
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }
};

const J = p => require(path.join(__dirname, '..', 'js', p));
J('util.js'); J('audio.js'); J('world.js'); J('entities.js'); J('game.js');

G.ui = new Proxy({}, { get: () => () => {} });

let failures = 0;
const fail = msg => { failures++; console.error('FAIL:', msg); };
const ok = msg => console.log('ok:', msg);

try {
  const g = G.game;

  g.night = 1;
  g.resetRuntime();
  g.mode = 'night';
  ok('resetRuntime + begin night');

  let won = false, lost = false, breachKind = null;
  const origBreach = g.breach.bind(g);
  g.breach = k => { lost = true; breachKind = k; g.mode = 'jumpscare'; };
  const origWin = g.winNight.bind(g);
  g.winNight = () => { won = true; g.mode = 'win'; };

  // passivity: idle run should reach 6AM without dying (no threats spawned interaction? threats DO spawn & attack open doors!)
  // So instead verify full sim survives with smart-ish policy:
  g.stalkers.forEach(s => { s.spawnAt = 99999; }); // silence threats first
  let t = 0;
  while (t < 310 && !won && !lost) { g.update(1 / 30); t += 1 / 30; }
  if (!won) fail('idle-with-no-threats did not reach 6AM (clock=' + g.clock.toFixed(1) + ', power=' + g.power.toFixed(1) + ')');
  else ok('clock reaches 6AM, power left ' + g.power.toFixed(1) + '%');

  // --- threat AI: foreman walks to LDOOR ---
  g.resetRuntime();
  g.mode = 'night';
  g.stalkers.forEach(s => { s.spawnAt = 99999; });
  const f0 = g.stalkers.find(s => s.kind === 'foreman');
  f0.spawnAt = -1;
  let reached = false, guard = 0;
  while (!reached && guard < 60000) {
    g.update(1 / 30);
    guard++;
    const f = g.stalkers.find(s => s.kind === 'foreman');
    if (f.mode === 'entry') reached = true;
    if (g.mode !== 'night') break;
  }
  if (!reached) fail('foreman never reached LDOOR (mode=' + g.mode + ')');
  else ok('foreman reaches west door; grace ticking');

  // close door -> should block & retreat eventually
  const f = g.stalkers.find(s => s.kind === 'foreman');
  g.doors.L = true;
  let retreated = false; guard = 0;
  while (!retreated && guard < 20000 && g.mode === 'night') {
    g.update(1 / 30);
    guard++;
    if (f.mode === 'roam' && f.node !== 'LDOOR') retreated = true;
  }
  if (!retreated) fail('closing door did not repel foreman (mode=' + f.mode + ' node=' + f.node + ')');
  else ok('closed door repels foreman, blocks=' + g.stats.blocks);

  // open door again -> he may come back and breach
  g.doors.L = false;
  let breached = null; guard = 0;
  while (!breached && guard < 120000 && g.mode === 'night') {
    g.update(1 / 30);
    guard++;
    if (f.mode === 'entry' && f.graceT <= 0) breached = 'grace-expired';
  }
  if (!breached) fail('open door never led to breach');
  else ok('open door leads to breach (' + breached + ')');

  // --- wick freeze rule ---
  g.resetRuntime();
  g.mode = 'night';
  const w = g.wick;
  w.spawnAt = -1; w.update(1 / 30, g);
  if (w.mode === 'dormant') fail('wick did not spawn on forced timer');
  w.node = 'atrium'; w.mode = 'roam'; w.moveT = 0.01; w.cool = 0;
  g.stalkers[0].spawnAt = 99999; g.stalkers[1].spawnAt = 99999;
  g.camsUp = true; g.curCam = 'atrium';
  Object.keys(g.sig).forEach(k => { g.sig[k].base = 0.9; g.sig[k].sp = 0; g.sig[k].ph = 0; g.sig[k].ph2 = 0; });
  const nodeBefore = w.node;
  for (let i = 0; i < 120; i++) g.update(1 / 30);
  if (w.node !== nodeBefore) fail('wick moved while watched');
  else ok('wick frozen while observed on its cam');
  g.camsUp = false;
  let moved = false;
  for (let i = 0; i < 300 && !moved; i++) { g.update(1 / 30); if (w.node !== nodeBefore || w.mode === 'entry') moved = true; }
  if (!moved) fail('wick never moves when unwatched');
  else ok('wick advances when unwatched');

  // --- blackout flow ---
  g.resetRuntime();
  g.mode = 'night';
  G.game.stalkers.forEach(s => { s.spawnAt = 99999; });
  G.game.power = 0.001;
  g.update(0.05);
  if (!g.blackout) fail('power 0 did not trigger blackout');
  else ok('blackout triggers at 0 power');
  let doomFired = false; guard = 0;
  while (!doomFired && guard < 5000) { g.update(0.05); guard++; if (g.mode === 'jumpscare') doomFired = true; }
  if (!doomFired) fail('blackout doom timer never fired');
  else ok('blackout doom fires jumpscare after ~' + (guard * 0.05).toFixed(1) + 's');

  // --- win path via real clock ---
  g.resetRuntime();
  g.mode = 'night';
  won = false;
  g.winNight = origWin;
  g.breach = origBreach;
  g.clock = 299.8;
  guard = 0;
  while (g.mode === 'night' && guard < 5000) { g.update(0.05); guard++; }
  if (g.mode !== 'win') fail('did not win after skipping to 6AM (mode=' + g.mode + ')');
  else ok('natural win at 6AM; saved progress night=' + (parseInt(localStorage.getItem('grayline_night'), 10)));

  console.log(failures ? ('\n' + failures + ' FAILURES') : '\nALL SIM CHECKS PASSED');
  process.exit(failures ? 1 : 0);
} catch (e) {
  console.error('EXCEPTION:', e.stack);
  process.exit(2);
}
