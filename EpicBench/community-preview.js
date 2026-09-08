'use strict';
// Browser requests are fulfilled through a DNS-pinned HTTP client. The browser
// itself has a dead proxy, so missed routes cannot reach the host/network.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const { fork } = require('node:child_process');

function publicAddress(address) {
  if (net.isIP(address) !== 4) return false; // IPv4 only; fail closed for IPv6-only sites.
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b) ||
    a === 198 && [18, 19, 51].includes(b) || a === 203 && b === 0);
}
async function pinnedGet(raw, resolver = dns.lookup) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port && !['80', '443'].includes(url.port)) throw new Error('Unsupported preview URL');
  const records = await resolver(url.hostname, { all: true, family: 4 });
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('Private preview destination');
  const address = records[0].address;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      agent: false, lookup: (_host, options, callback) => callback(null, options.all ? [{ address, family: 4 }] : address, 4),
      headers: { 'User-Agent': 'Mozilla/5.0 EpicBenchPreview/1.0', 'Accept': '*/*', 'Accept-Encoding': 'identity' }
    }, response => {
      let size = 0; const chunks = [];
      response.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) request.destroy(new Error('Preview resource too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        const headers = {};
        for (const key of ['content-type', 'location', 'content-encoding', 'access-control-allow-origin'])
          if (typeof response.headers[key] === 'string') headers[key] = response.headers[key];
        resolve({ status: response.statusCode, headers, body: Buffer.concat(chunks) });
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Preview resource timeout')), 8000);
    request.on('close', () => clearTimeout(timer)); request.on('error', reject);
  });
}
async function capture(url, control = {}) {
  const { chromium } = require(process.env.COMMUNITY_PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: process.platform !== 'win32',
    ...(process.env.COMMUNITY_CHROME_PATH ? { executablePath: process.env.COMMUNITY_CHROME_PATH } : {}),
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
  try {
    control.browser = browser;
    if (control.stopped) throw new Error('Preview stopped');
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', acceptDownloads: false });
    await context.routeWebSocket('**/*', socket => socket.close());
    let requests = 0, bytes = 0;
    await context.route('**/*', async route => {
      try {
        if (++requests > 100 || bytes > 24 * 1024 * 1024 || route.request().method() !== 'GET') return await route.abort();
        const response = await pinnedGet(route.request().url()); bytes += response.body.length;
        await route.fulfill(response);
      } catch { await route.abort().catch(() => {}); }
    });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 });
    if (!response || response.status() >= 400) throw new Error('Preview page unavailable');
    await page.waitForTimeout(2000);
    return await page.screenshot({ type: 'jpeg', quality: 78, fullPage: false, timeout: 5000 });
  } finally { await browser.close(); }
}
function createRenderer() {
  let stopped = false, active = null;
  const queue = [];
  function next() {
    if (stopped || active || !queue.length) return;
    const job = queue.shift();
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'PLAYWRIGHT_BROWSERS_PATH', 'COMMUNITY_CHROME_PATH', 'COMMUNITY_PLAYWRIGHT_MODULE'])
      if (process.env[key]) env[key] = process.env[key];
    const identity = {};
    if (process.platform !== 'win32' && process.env.COMMUNITY_PREVIEW_UID) {
      identity.uid = Number(process.env.COMMUNITY_PREVIEW_UID);
      identity.gid = Number(process.env.COMMUNITY_PREVIEW_GID || process.env.COMMUNITY_PREVIEW_UID);
      env.HOME = '/home/node';
    }
    const child = fork(__filename, [], { env, ...identity, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    active = child;
    let result = null;
    const timer = setTimeout(() => { if (child.connected) child.send({ stop: true }); }, 28000);
    child.on('message', message => { if (message.image) result = Buffer.from(message.image, 'base64'); });
    child.on('error', () => {});
    child.on('exit', () => { clearTimeout(timer); active = null; result ? job.resolve(result) : job.reject(new Error('Preview unavailable')); next(); });
    child.send({ url: job.url });
  }
  return {
    render(url) { return new Promise((resolve, reject) => { if (stopped || queue.length >= 12) return reject(new Error('Preview queue busy')); queue.push({ url, resolve, reject }); next(); }); },
    close() { stopped = true; queue.splice(0).forEach(job => job.reject(new Error('Preview stopped'))); if (active?.connected) active.send({ stop: true }); }
  };
}
if (require.main === module) {
  const control = {};
  process.on('message', async message => {
    if (message.stop) { control.stopped = true; await control.browser?.close().catch(() => {}); return; }
    try { const image = await capture(message.url, control); if (process.connected) process.send({ image: image.toString('base64') }); }
    catch {} finally { if (process.connected) process.disconnect(); }
  });
  process.on('disconnect', () => { control.stopped = true; control.browser?.close().catch(() => {}); process.exitCode = 0; });
}
module.exports = { publicAddress, pinnedGet, capture, createRenderer };
