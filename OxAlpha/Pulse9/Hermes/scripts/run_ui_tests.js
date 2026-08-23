/* PULSE-9 UI interaction test driver (fresh tab, per-test isolation) */
'use strict';
const fs = require('fs');
const path = require('path');

const CDP_PORT = process.argv[2] || '9223';
const OUT = process.argv[3] || path.join(__dirname, '..', 'tests', 'ui_results.json');
const APP_URL = 'http://127.0.0.1:8734/';
const TIMEOUT_MS = 60000;

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('WS connect failed')));
  });
}
let msgId = 0;
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result); }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + ms + 'ms')), ms))]);
}
async function evalJs(ws, expression, awaitPromise, timeoutMs) {
  const p = send(ws, 'Runtime.evaluate', { expression, awaitPromise: !!awaitPromise, returnByValue: true, userGesture: true });
  return timeoutMs ? withTimeout(p, timeoutMs) : p;
}

(async () => {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?url=about:blank`, { method: 'PUT' });
  const tab = await r.json();
  const ws = await wsConnect(tab.webSocketDebuggerUrl);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.navigate', { url: APP_URL });

  // wait for app boot
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(res => setTimeout(res, 400));
    try {
      const rr = await evalJs(ws, `!!(window.P9 && window.P9App && document.querySelector('.rack-row'))`, false, 3000);
      if (rr.result.value === true) { ready = true; break; }
    } catch (e) {}
  }
  if (!ready) { console.error('app not ready'); process.exit(1); }

  // give UI modules a moment (rack rows exist -> refreshAll done)
  await new Promise(res => setTimeout(res, 500));

  await evalJs(ws, `fetch('/tests/ui_tests.js').then(r => r.text()).then(src => { (0, eval)(src); });`, true, 15000);
  const namesRes = await evalJs(ws, `JSON.stringify(Object.keys(window.P9_UI_TESTS.tests))`, false, 5000);
  const names = JSON.parse(namesRes.result.value);

  const results = { startedAt: new Date().toISOString(), tests: {} };
  let p = 0, f = 0;
  for (const name of names) {
    process.stdout.write('  ' + name + ' ... ');
    try {
      const rr = await evalJs(ws, `(async () => {
        try { return { ok: true, val: await window.P9_UI_TESTS.tests[${JSON.stringify(name)}]() }; }
        catch (e) { return { ok: false, err: String(e && e.stack || e).slice(0, 400) }; }
      })()`, true, TIMEOUT_MS);
      const payload = rr.result.value;
      const val = payload.ok ? payload.val : { pass: false, error: payload.err };
      if (!payload.ok) console.log('(caught in page)');
      results.tests[name] = val;
      if (val && val.pass) { p++; console.log('✓ ' + JSON.stringify(val).slice(0, 130)); }
      else { f++; console.log('✗ ' + JSON.stringify(val).slice(0, 300)); }
    } catch (e) {
      f++;
      results.tests[name] = { pass: false, error: String(e.message || e).slice(0, 280) };
      console.log('✗ ERROR ' + String(e.message || e).slice(0, 220));
    }
  }
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`\nUI: ${p} passed, ${f} failed`);
  ws.close();
  process.exit(f > 0 ? 2 : 0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
