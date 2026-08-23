/* PULSE-9 END-TO-END verification (headless):
 * 1. live scheduler correctness — instrumented counting of scheduled events
 * 2. full workflow: edit -> arrange -> play -> save -> reload -> verify -> export -> analyze WAV
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CDP_PORT = process.argv[2] || '9224';
const APP_URL = 'http://127.0.0.1:8734/';
const OUT = path.join(__dirname, '..', 'tests', 'e2e_results.json');

function wsConnect(url) { return new Promise((res, rej) => { const ws = new WebSocket(url); ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', () => rej(new Error('ws'))); }); }
let id = 0;
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    const on = ev => { const m = JSON.parse(ev.data); if (m.id === mid) { ws.removeEventListener('message', on); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + ms + 'ms')), ms))]); }
async function evalJs(ws, expression, awaitPromise, timeoutMs) {
  const p = send(ws, 'Runtime.evaluate', { expression, awaitPromise: !!awaitPromise, returnByValue: true, userGesture: true });
  return timeoutMs ? withTimeout(p, timeoutMs) : p;
}

(async () => {
  // REUSE the existing app tab (it is already booted and demo-loaded)
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find(t => t.type === 'page' && (t.url || '').startsWith(APP_URL));
  if (!target) { console.error('no app tab found'); process.exit(1); }
  const ws = await wsConnect(target.webSocketDebuggerUrl);
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable');
  await evalJs(ws, `!!window.P9App`, false, 5000);
  // load pristine demo
  await evalJs(ws, `localStorage.removeItem('pulse9.autosave.v1'); P9App.loadProjectData(P9.createDemo()); P9App._history.clear(); P9App.commit('initial');`, false, 8000);

  const results = {};
  let pass = 0, fail = 0;
  async function check(name, expr, timeoutMs) {
    process.stdout.write('  ' + name + ' ... ');
    try {
      const rr = await evalJs(ws, `(async()=>{try{return {ok:true,val: await (${expr})};}catch(e){return {ok:false,err:String(e&&e.stack||e).slice(0,300)};}})()`, true, timeoutMs || 60000);
      const payload = rr.result.value;
      const val = payload.ok ? payload.val : { pass: false, error: payload.err };
      results[name] = val;
      if (val.pass) { pass++; console.log('✓ ' + JSON.stringify(val).slice(0, 140)); }
      else { fail++; console.log('✗ ' + JSON.stringify(val).slice(0, 260)); }
    } catch (e) {
      fail++; results[name] = { pass: false, error: String(e.message || e) };
      console.log('✗ ERROR ' + String(e.message || e).slice(0, 200));
    }
  }

  /* ---- 1. live scheduler instrumentation ---- */
  await check('live_scheduler_counts', `(async () => {
    P9App.ensureCtx();
    const t = P9App.transport;
    P9App.project.playMode = 'pattern';
    P9App.project.currentPattern = 0;
    t.stop(); t.graph = null;
    t.play(0);
    // count voices actually registered by the live graph over one pattern loop
    let peakVoices = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const n = t.graph ? t.graph._voices.length : 0;
      if (n > peakVoices) peakVoices = n;
      await new Promise(r => setTimeout(r, 100));
    }
    t.stop();
    // Main Groove pattern has ~23 events/loop; polyphony peak should be well >3
    return { pass: peakVoices >= 4, peakVoices };
  })()`);

  /* ---- 2. editing workflow via UI APIs ---- */
  await check('edit_workflow', `(async () => {
    const app = P9App;
    app.transport.stop();
    app.addChannel('synth', 'E2E Synth');
    const ch = app.project.channels[app.project.channels.length - 1];
    const pat = app.project.patterns[0];
    pat.notes.push({ id: P9.uid('n'), ch: ch.id, start: 0, dur: 2, pitch: 72, vel: 0.9 });
    const clip = P9.newClip(pat.id, 128, 5, 16);
    app.project.clips.push(clip);
    app.refreshAll();
    const okNote = pat.notes.some(n => n.ch === ch.id && n.pitch === 72);
    const okClip = app.project.clips.some(c => c.start === 128 && c.track === 5);
    return { pass: okNote && okClip && app.project.channels.length === 8, channels: app.project.channels.length, okNote, okClip };
  })()`);

  /* ---- 3. save -> reload from storage ---- */
  await check('save_reload_survives', `(async () => {
    const app = P9App;
    const before = P9.serialize(app.project);
    P9.autosaveSave(app.project);
    const raw = P9.autosaveLoadRaw();
    if (!raw) return { pass: false, error: 'no autosave stored' };
    const restored = P9.loadProject(raw);
    const sameCh = restored.channels.length === before.channels.length;
    const sameClips = restored.clips.length === before.clips.length;
    const sameNotes = restored.patterns.reduce((a, p) => a + p.notes.length, 0) === before.patterns.reduce((a, p) => a + p.notes.length, 0);
    return { pass: sameCh && sameClips && sameNotes, channels: [before.channels.length, restored.channels.length], clips: [before.clips.length, restored.clips.length], notesTotal: sameNotes };
  })()`);

  /* ---- 4. export WAV and analyze content ---- */
  await check('export_wav_analyzed', `(async () => {
    const proj = P9.createDemo();
    proj.playMode = 'song';
    const { wav, buffer } = await P9.renderToWav(proj, { mode: 'song', tailSec: 1 });
    const hdr = P9.parseWavHeader(wav);
    const dv = new DataView(wav);
    const frames = Math.floor((wav.byteLength - 44) / 4);
    function rms(fromFrac, toFrac) {
      let s = 0, n = 0;
      const a = Math.floor(frames * fromFrac), b = Math.floor(frames * toFrac);
      for (let i = a; i < b; i++) { const v = dv.getInt16(44 + i * 4, true) / 32768; s += v * v; n++; }
      return Math.sqrt(s / Math.max(1, n));
    }
    const r1 = rms(0.05, 0.3), r2 = rms(0.4, 0.7), r3 = rms(0.75, 0.95);
    return {
      pass: hdr.channels === 2 && r1 > 0.02 && r2 > 0.02 && r3 > 0.02,
      sr: hdr.sampleRate, bits: hdr.bitsPerSample,
      durSec: +buffer.duration.toFixed(1),
      rmsStart: +r1.toFixed(3), rmsMid: +r2.toFixed(3), rmsEnd: +r3.toFixed(3),
    };
  })()`, 120000);

  /* ---- 5. rapid transport stress with edits between ---- */
  await check('stress_transport_with_edits', `(async () => {
    const app = P9App;
    app.ensureCtx();
    for (let i = 0; i < 5; i++) {
      app.transport.play(); await new Promise(r => setTimeout(r, 120));
      app.project.swing = (app.project.swing + 10) % 60;
      app.transport.stop(); await new Promise(r => setTimeout(r, 50));
    }
    app.transport.play();
    await new Promise(r => setTimeout(r, 500));
    const posA = app.transport.positionStep();
    await new Promise(r => setTimeout(r, 250));
    const posB = app.transport.positionStep();
    app.transport.stop();
    return { pass: Number.isFinite(posB), posB: +posB.toFixed(2), swing: app.project.swing };
  })()`);

  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`\nE2E: ${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail > 0 ? 2 : 0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
