// Worker probe: run the real /src/gen/worker.js in a real Node worker_threads
// Worker with importScripts shim, send gen+lightmesh, report what comes back.
'use strict';
const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const workerSrc = `
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const ROOT = ${JSON.stringify(path.join(ROOT))};
// emulate browser worker env
const loaded = {};
self = {};
global.self = self;
self.importScripts = (...urls) => {
  for (const u of urls) {
    const p = path.join(ROOT, 'public', u.replace(/^\\//, ''));
    const code = fs.readFileSync(p, 'utf8');
    try { new Function(code)(); } catch (e) { throw new Error('importScripts failed for ' + u + ': ' + e.message); }
  }
};
self.postMessage = (m) => parentPort.postMessage(m);
// load worker.js body but replace its self.onmessage capture:
const wcode = fs.readFileSync(path.join(ROOT, 'src/gen/worker.js'), 'utf8');
// worker.js references require(...) for Node path — but our REQ shim uses self.* globals set by importScripts.
// The Node require path inside worker.js would fail under worker_threads? No: require exists. But it would load
// modules via real require — that's FINE and matches Node behavior. However importScripts path also runs.
// Simplest: run worker.js with real require (its Node branch).
try {
  const Module = require('module');
  const wmod = new Module(path.join(ROOT, 'src/gen/worker.js'));
  wmod.filename = path.join(ROOT, 'src/gen/worker.js');
  wmod.paths = Module._nodeModulePaths(path.join(ROOT, 'src/gen'));
  try { wmod._compile(wcode, wmod.filename); } catch (e) {
    parentPort.postMessage({ type: 'error', msg: 'worker boot: ' + e.message });
  }
} catch (e) {
  parentPort.postMessage({ type: 'error', msg: 'worker boot: ' + e.message + ' | ' + String(e.stack).split('\\n')[1] });
}
parentPort.on('message', (m) => {
  if (self.onmessage) self.onmessage({ data: m });
});
`;

if (!isMainThread) {
  eval(workerSrc);
  return;
}

const w = new Worker(workerSrc, { eval: true });
w.on('message', (m) => {
  console.log('MSG from worker:', m.type, m.cx !== undefined ? `(${m.cx},${m.cz})` : '', m.msg ? m.msg.slice(0, 200) : '');
  if (m.type === 'ready') {
    w.postMessage({ type: 'gen', cx: 0, cz: 0 });
  } else if (m.type === 'chunk') {
    console.log('chunk blocks len:', m.blocks && m.blocks.length, 'nonzero:', m.blocks && m.blocks.some(v => v > 0));
    w.postMessage({ type: 'lightmesh', cx: 0, cz: 0 });
  } else if (m.type === 'lightmesh') {
    console.log('solid:', !!m.solid, 'cutout:', !!m.cutout, 'trans:', !!m.trans, 'sky len:', m.sky && m.sky.length);
    process.exit(0);
  } else if (m.type === 'error') {
    process.exit(1);
  }
});
w.on('error', (e) => { console.error('WORKER THREAD ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT waiting for worker'); process.exit(2); }, 20000);
