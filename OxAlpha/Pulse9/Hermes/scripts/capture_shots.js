/* Capture screenshots of PULSE-9 workspaces via CDP */
'use strict';
const fs = require('fs');
const path = require('path');

const CDP_PORT = process.argv[2] || '9224';
const OUT_DIR = path.join(__dirname, '..', 'tests', 'shots');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
async function shot(ws, name) {
  const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('saved', name + '.png');
}

(async () => {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?url=about:blank`, { method: 'PUT' });
  const tab = await r.json();
  const ws = await wsConnect(tab.webSocketDebuggerUrl);
  await send(ws, 'Page.enable'); await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
  await send(ws, 'Page.navigate', { url: 'http://127.0.0.1:8734/' });
  for (let i = 0; i < 30; i++) {
    await new Promise(r2 => setTimeout(r2, 400));
    try { const rr = await send(ws, 'Runtime.evaluate', { expression: '!!(window.P9App && document.querySelector(".rack-row"))', returnByValue: true }); if (rr.result.value === true) break; } catch (e) {}
  }
  await new Promise(r2 => setTimeout(r2, 800));

  // ensure the DEMO is loaded (previous runs may have autosaved an empty project)
  await send(ws, 'Runtime.evaluate', { expression: `localStorage.removeItem('pulse9.autosave.v1'); P9App.loadProjectData(P9.createDemo()); P9App._history.clear(); P9App.commit('initial');`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 600));

  // 1. default view
  await shot(ws, '01_default');

  // 2. playing state (pattern mode)
  await send(ws, 'Runtime.evaluate', { expression: `P9App.ensureCtx(); P9App.project.playMode='pattern'; P9App.transport.play();`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 1200));
  await shot(ws, '02_playing_pattern');
  await send(ws, 'Runtime.evaluate', { expression: `P9App.transport.stop();` });

  // 3. song mode playing
  await send(ws, 'Runtime.evaluate', { expression: `P9App.project.playMode='song'; document.getElementById('mode-song').click(); P9App.transport.play();`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 1500));
  await shot(ws, '03_playing_song');
  await send(ws, 'Runtime.evaluate', { expression: `P9App.transport.stop();` });

  // 4. instrument editor open
  await send(ws, 'Runtime.evaluate', { expression: `P9Instrument.show(P9App.project.channels.find(c=>c.type==='synth').id);`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 300));
  await shot(ws, '04_instrument_editor');
  await send(ws, 'Runtime.evaluate', { expression: `P9Instrument.hide();` });

  // 5. FX editor open
  await send(ws, 'Runtime.evaluate', { expression: `P9Fx.show(5, 0);`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 300));
  await shot(ws, '05_fx_editor');

  // 6. help modal
  await send(ws, 'Runtime.evaluate', { expression: `document.getElementById('btn-help').click();`, returnByValue: true });
  await new Promise(r2 => setTimeout(r2, 300));
  await shot(ws, '06_help');
  await send(ws, 'Runtime.evaluate', { expression: `document.querySelector('#modal-btns .modal-btn').click();` });

  // 7. empty project state
  await send(ws, 'Runtime.evaluate', {
    expression: `P9Fx.hide(); P9App.loadProjectData({format:'pulse9.project',version:P9.VERSION,name:'Empty Test',channels:[],patterns:[],clips:[],automation:[]});`,
    returnByValue: true,
  });
  await new Promise(r2 => setTimeout(r2, 600));
  await shot(ws, '07_empty_project');

  console.log('done');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
