/* PULSE-9 audio test runner v3: fresh tab per test (isolation), full battery summary */
'use strict';
const fs = require('fs');
const path = require('path');

const CDP_PORT = process.argv[2] || '9223';
const OUT = process.argv[3] || path.join(__dirname, '..', 'tests', 'audio_results.json');
const APP_URL = 'http://127.0.0.1:8734/';
const TEST_TIMEOUT_MS = 150000;

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
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        if (m.error) reject(new Error(method + ': ' + JSON.stringify(m.error)));
        else resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function withTimeout(p, ms, label) {
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT ' + ms + 'ms: ' + (label || ''))), ms));
  return Promise.race([p, t]);
}
async function evalJs(ws, expression, awaitPromise, timeoutMs) {
  const p = send(ws, 'Runtime.evaluate', {
    expression, awaitPromise: !!awaitPromise, returnByValue: true, userGesture: true,
  });
  return timeoutMs ? withTimeout(p, timeoutMs, 'eval') : p;
}

async function newTab() {
  // This Chrome ignores ?url= on /json/new — always open about:blank then navigate via CDP.
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?url=about:blank`, { method: 'PUT' });
  const tab = await r.json();
  const ws = await wsConnect(tab.webSocketDebuggerUrl);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Page.navigate', { url: APP_URL });
  return { tab, ws };
}
async function closeTab(targetId) {
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${targetId}`); } catch (e) {}
}

async function waitForApp(tws, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 12000);
  while (Date.now() < deadline) {
    const r = await evalJs(tws, `!!(window.P9 && window.P9App)`, false, 3000);
    if (r.result && r.result.value === true) return true;
    await new Promise(res => setTimeout(res, 400));
  }
  return false;
}

(async () => {
  // discover test names from a bootstrap tab
  const boot = await newTab();
  const ws = boot.ws;
  if (!(await waitForApp(ws))) throw new Error('app never became ready');
  await evalJs(ws, `fetch('/tests/audio_tests.js').then(r => r.text()).then(src => { (0, eval)(src); });`, true, 15000);
  const namesRes = await evalJs(ws, `JSON.stringify(Object.keys(window.P9_AUDIO_TESTS.tests))`, false, 5000);
  const names = JSON.parse(namesRes.result.value);
  console.log('tests:', names.length);
  ws.close();
  await closeTab(boot.tab.id);

  const results = { startedAt: new Date().toISOString(), ua: 'HeadlessChrome', tests: {} };
  const consoleErrors = [];
  let p = 0, f = 0;
  for (const name of names) {
    process.stdout.write('  ' + name + ' ... ');
    let tab = null, tws = null;
    try {
      const t = await newTab();
      tab = t.tab; tws = t.ws;
      tws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data);
        if (m.method === 'Runtime.exceptionThrown') {
          consoleErrors.push(name + ': ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.description || '').slice(0, 200));
        }
      });
      await send(tws, 'Runtime.enable');
      if (!(await waitForApp(tws))) throw new Error('app not ready in test tab');
      await evalJs(tws, `fetch('/tests/audio_tests.js').then(r => r.text()).then(src => { (0, eval)(src); });`, true, 15000);
      const r = await evalJs(tws, `window.P9_AUDIO_TESTS.tests[${JSON.stringify(name)}]()`, true, TEST_TIMEOUT_MS);
      if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.exception && r.exceptionDetails.description || r.exceptionDetails.text).slice(0, 250));
      const val = r.result.value;
      results.tests[name] = val;
      if (val && val.pass) { p++; console.log('✓ ' + JSON.stringify(val).slice(0, 130)); }
      else { f++; console.log('✗ ' + JSON.stringify(val).slice(0, 230)); }
      tws.close();
    } catch (e) {
      f++;
      results.tests[name] = { pass: false, error: String(e.message || e).slice(0, 300) };
      console.log('✗ ERROR ' + String(e.message || e).slice(0, 200));
    }
    if (tab) await closeTab(tab.id);
  }
  results.finishedAt = new Date().toISOString();
  results.consoleErrors = consoleErrors;
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`\nAUDIO: ${p} passed, ${f} failed, ${consoleErrors.length} page exceptions`);
  if (consoleErrors.length) console.log('exceptions:\n' + consoleErrors.slice(0, 6).join('\n'));
  process.exit(f > 0 ? 2 : 0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
