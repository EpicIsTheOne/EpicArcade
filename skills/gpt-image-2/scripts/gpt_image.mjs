#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

const USAGE = `Usage: node gpt_image.mjs [options] "<prompt>"
       node gpt_image.mjs queue <command> [options]

Generate images with GPT Image (gpt-image-2) through ChatGPT/Codex OAuth,
no OpenAI API key required. Safe to run from multiple agents concurrently.

Direct generation:
  node gpt_image.mjs -o out.png "a lighthouse in a storm"
  node gpt_image.mjs --n 10 --quality low -o sheet.png "sprite variants"
  node gpt_image.mjs --ref input.png -o edited.png "make it nighttime"

Options:
  -o, --out <path>        Output file (default unique generated-<ts>-<pid>-<rand>.png)
  --out-dir <dir>         Default folder when -o omitted
  -n, --count <num>       Generate N images (sequential, paced, continues past failures)
  --ref <path>            Reference image, repeatable up to 4
  --model <name>          Image model          (env GPT_IMAGE_MODEL, default gpt-image-2)
  --chat-model <name>     Chat model driving the tool (env GPT_IMAGE_CHAT_MODEL, default gpt-5.5)
  --size <WxH>            Image size           (env GPT_IMAGE_SIZE, default 1024x1024)
  --quality <q>           low | medium | high  (env GPT_IMAGE_QUALITY, default high)
  --delay-ms <ms>         Min global spacing between upstream requests (default 1500)
  --timeout <seconds>     Per-request abort threshold (default 300)
  --fail-fast             Stop an -n batch on first failure
  --api-key <key>         Force OpenAI API key path (env OPENAI_API_KEY)
  --auth-path <path>      Codex auth.json location (default ~/.codex/auth.json)
  --base-url <url>        Codex backend base URL override
  --status                Print resolved auth provider and exit
  --json                  Machine-readable JSON on stdout
  -h, --help              Show this help

Queue (persistent, multi-agent safe, survives crashes):
  node gpt_image.mjs queue add [--ref r.png] [-o out.png] "prompt words"
  node gpt_image.mjs queue list [--json]
  node gpt_image.mjs queue status [--json]
  node gpt_image.mjs queue run [--parallel 2] [--detach] [--retry-failed]
  node gpt_image.mjs queue stop
  node gpt_image.mjs queue remove --id <id>
  node gpt_image.mjs queue clear [--all]

Exit codes: 0 all succeeded, 1 total failure/usage, 2 partial success (-n batches).`;

const EXIT_OK = 0, EXIT_FAIL = 1, EXIT_PARTIAL = 2;

function envOr(name, fallback) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}
function cleanToken(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function normPath(p) { return String(p).replace(/\//g, '\\'); }
function shortId() { return randomUUID().replace(/-/gu, '').slice(0, 10); }

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

function dataDir() {
  return envOr('GPT_IMAGE_DATA_DIR', join(homedir(), '.local', 'share', 'gpt-image-skill'));
}
const queueFilePath = () => join(dataDir(), 'queue.json');
const paceFilePath = () => join(dataDir(), 'pace.json');
const runnerPidPath = () => join(dataDir(), 'runner.pid');

function numberedOut(out, outDir, i, total) {
  const width = String(total).length;
  const nn = String(i).padStart(width, '0');
  if (out) {
    const d = dirname(out), e = extname(out), b = basename(out, e);
    return resolve(join(d, `${b}-${nn}${e || '.png'}`));
  }
  const dir = outDir ? resolve(outDir) : process.cwd();
  return resolve(join(dir, `generated-${Date.now()}-${process.pid}-${nn}-${shortId().slice(0, 4)}.png`));
}

function defaultOutPath(outDir) {
  const dir = outDir ? resolve(outDir) : process.cwd();
  return resolve(join(dir, `generated-${Date.now()}-${process.pid}-${shortId().slice(0, 4)}.png`));
}

async function acquireLock(file, staleMs, waitMs = 8000) {
  await mkdir(dirname(file), { recursive: true });
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await writeFile(file, JSON.stringify({ token, pid: process.pid, at: Date.now() }), { flag: 'wx' });
      return token;
    } catch {
      let owner = null;
      try { owner = JSON.parse(await readFile(file, 'utf8')); } catch {}
      const stale = !owner || typeof owner.at !== 'number' || Date.now() - owner.at > staleMs;
      if (stale) {
        try { await unlink(file); } catch {}
        continue;
      }
      if (Date.now() >= deadline) return null;
      await sleep(40 + Math.floor(Math.random() * 90));
    }
  }
}

async function releaseLock(file, token) {
  if (!token) return;
  try {
    const cur = JSON.parse(await readFile(file, 'utf8'));
    if (cur?.token === token) await unlink(file);
  } catch {}
}

async function mutateQueue(fn) {
  const lockFile = `${queueFilePath()}.lock`;
  const token = await acquireLock(lockFile, 20000, 15000);
  const q = await readQueue();
  const result = await fn(q);
  await writeQueue(q);
  await releaseLock(lockFile, token);
  return result;
}

async function readQueue() {
  try {
    const raw = await readFile(queueFilePath(), 'utf8');
    const q = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!Array.isArray(q.items)) q.items = [];
    return q;
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeQueue(q) {
  await mkdir(dirname(queueFilePath()), { recursive: true });
  const tmp = `${queueFilePath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(q, null, 2));
  await rename(tmp, queueFilePath());
}

async function pace(opts) {
  const gap = Math.max(0, Math.floor(opts.delayMs ?? 0));
  if (!gap) return;
  const f = paceFilePath();
  const lockFile = `${f}.lock`;
  const token = await acquireLock(lockFile, 25000, 45000);
  try {
    let last = 0;
    try { last = JSON.parse(await readFile(f, 'utf8'))?.last ?? 0; } catch {}
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      await mkdir(dirname(f), { recursive: true });
      await writeFile(f, JSON.stringify({ last: Date.now() }));
    } catch {}
  } finally {
    await releaseLock(lockFile, token);
  }
}

async function readCodexAuth(path) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
}

async function resolveAuth(opts) {
  const apiKey = cleanToken(opts.apiKey);
  if (apiKey) return { provider: 'openai-api-key', token: apiKey };
  const auth = await readCodexAuth(opts.authPath);
  const codexApiKey = cleanToken(auth?.OPENAI_API_KEY);
  if (codexApiKey) return { provider: 'openai-api-key', token: codexApiKey };
  const accessToken = cleanToken(auth?.tokens?.access_token);
  if (accessToken) return { provider: 'codex-oauth', token: accessToken };
  return undefined;
}

function chatGptAccountId(accessToken) {
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return undefined;
    const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=');
    const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
    return decoded?.['https://api.openai.com/auth']?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

function codexHeaders(accessToken) {
  const headers = {
    'User-Agent': 'codex_cli_rs/0.0.0',
    originator: 'codex_cli_rs'
  };
  const accountId = chatGptAccountId(accessToken);
  if (accountId) headers['ChatGPT-Account-ID'] = accountId;
  return headers;
}

async function generateWithCodexOAuth(opts, prompt, token) {
  await pace(opts);
  const content = [{ type: 'input_text', text: prompt }];
  for (const ref of opts.refs.slice(0, 4)) {
    const buffer = await readFile(ref);
    content.push({
      type: 'input_image',
      image_url: `data:image/png;base64,${buffer.toString('base64')}`
    });
  }

  const response = await fetch(`${opts.baseUrl}/responses`, {
    method: 'POST',
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: {
      ...codexHeaders(token),
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: opts.chatModel,
      store: false,
      instructions: 'You are an assistant that must fulfill image generation requests by using the image_generation tool when provided.',
      input: [{ type: 'message', role: 'user', content }],
      tools: [{
        type: 'image_generation',
        model: opts.model,
        size: opts.size,
        quality: opts.quality,
        output_format: 'png',
        background: 'opaque',
        partial_images: 1
      }],
      tool_choice: {
        type: 'allowed_tools',
        mode: 'required',
        tools: [{ type: 'image_generation' }]
      },
      stream: true
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`ChatGPT Codex backend failed (${response.status}): ${raw.slice(0, 800) || response.statusText}`);
  }
  const base64 = extractCodexImageBase64(raw);
  if (!base64) throw new Error('Request completed but the stream contained no image_generation result. Check plan entitlement or rephrase the prompt.');
  return base64;
}

function parseSseJson(rawSse) {
  const payloads = [];
  let eventName = '';
  let dataLines = [];
  const flush = () => {
    const raw = dataLines.join('\n').trim();
    dataLines = [];
    if (!raw || raw === '[DONE]') { eventName = ''; return; }
    try {
      const parsed = JSON.parse(raw);
      if (eventName && typeof parsed.type !== 'string') parsed.type = eventName;
      payloads.push(parsed);
    } catch {}
    eventName = '';
  };
  for (const line of rawSse.split(/\r?\n/u)) {
    if (line === '') flush();
    else if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  flush();
  return payloads;
}

function findCodexImageBase64(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCodexImageBase64(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  if (value.type === 'image_generation_call' && typeof value.result === 'string' && value.result) return value.result;
  if (typeof value.partial_image_b64 === 'string' && value.partial_image_b64) return value.partial_image_b64;
  for (const child of Object.values(value)) {
    const found = findCodexImageBase64(child);
    if (found) return found;
  }
  return undefined;
}

function extractCodexImageBase64(rawSse) {
  let latest;
  for (const event of parseSseJson(rawSse)) {
    const found = findCodexImageBase64(event);
    if (found) latest = found;
  }
  return latest;
}

function upstreamMessage(payload, fallback) {
  const parts = [
    payload?.error?.message, payload?.error?.code, payload?.error?.type, payload?.message
  ].filter((p) => typeof p === 'string');
  return parts.length > 0 ? parts.join(' ') : fallback;
}

async function generateWithApiKey(opts, prompt, token) {
  if (opts.refs.length > 0) {
    await pace(opts);
    let attempt = await postImageEdit(opts, prompt, token, 'image[]');
    if (!attempt.response.ok && attempt.response.status === 400) {
      await pace(opts);
      attempt = await postImageEdit(opts, prompt, token, 'image');
    }
    if (!attempt.response.ok) {
      throw new Error(`OpenAI images/edits failed (${attempt.response.status}): ${upstreamMessage(attempt.payload, attempt.response.statusText)}`);
    }
    const b64 = attempt.payload?.data?.[0]?.b64_json;
    if (typeof b64 !== 'string' || !b64) throw new Error('OpenAI images/edits returned no b64_json.');
    return b64;
  }

  await pace(opts);
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      prompt,
      size: opts.size,
      quality: opts.quality,
      n: 1,
      response_format: 'b64_json'
    })
  });
  let payload;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    throw new Error(`OpenAI images/generations failed (${response.status}): ${upstreamMessage(payload, response.statusText)}`);
  }
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) throw new Error('OpenAI images/generations returned no b64_json.');
  return b64;
}

async function postImageEdit(opts, prompt, token, imageFieldName) {
  const form = new FormData();
  form.set('model', opts.model);
  form.set('prompt', prompt);
  form.set('size', opts.size);
  form.set('quality', opts.quality);
  form.set('n', '1');
  form.set('response_format', 'b64_json');
  for (const ref of opts.refs.slice(0, 4)) {
    const buffer = await readFile(ref);
    form.append(imageFieldName, new Blob([buffer], { type: 'image/png' }), 'reference.png');
  }
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  let payload;
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

function baseOpts(flags) {
  return {
    prompt: '',
    out: '',
    outDir: '',
    n: 1,
    refs: [],
    model: envOr('GPT_IMAGE_MODEL', 'gpt-image-2'),
    chatModel: envOr('GPT_IMAGE_CHAT_MODEL', 'gpt-5.5'),
    size: envOr('GPT_IMAGE_SIZE', '1024x1024'),
    quality: envOr('GPT_IMAGE_QUALITY', 'high'),
    delayMs: 1500,
    apiKey: process.env.OPENAI_API_KEY || '',
    authPath: envOr('CODEX_AUTH_PATH', join(homedir(), '.codex', 'auth.json')),
    baseUrl: envOr('GPT_IMAGE_BASE_URL', 'https://chatgpt.com/backend-api/codex').replace(/\/+$/u, ''),
    timeoutSec: 300,
    timeoutMs: 300_000,
    parallel: 1,
    detach: false,
    retryFailed: false,
    failFast: false,
    force: false,
    all: false,
    id: '',
    json: false,
    status: false,
    help: false
  };
}

function finalizeTimeouts(o) {
  if (!Number.isFinite(o.timeoutMs) || o.timeoutMs <= 0) o.timeoutMs = Math.round((o.timeoutSec || 300) * 1000);
}

function makeItem(base, prompt, overrides = {}) {
  return {
    id: shortId(),
    prompt,
    refs: [...(base.refs ?? [])],
    out: overrides.out ?? '',
    outDir: base.outDir ?? '',
    size: base.size,
    quality: base.quality,
    model: base.model,
    chatModel: base.chatModel,
    status: 'pending',
    error: undefined,
    path: undefined,
    bytes: undefined,
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: undefined,
    finishedAt: undefined,
    runnerPid: undefined
  };
}

async function queueAdd(f) {
  const prompt = f.prompt.trim();
  if (!prompt) { console.error('error: queue add needs a prompt'); process.exit(EXIT_FAIL); }
  for (const ref of f.refs) {
    if (!existsSync(ref)) { console.error(`error: reference image not found: ${ref}`); process.exit(EXIT_FAIL); }
  }
  const added = await mutateQueue((q) => {
    const items = [];
    for (let i = 1; i <= f.n; i++) {
      const item = makeItem(f, prompt, {
        out: f.n > 1 && f.out ? String(numberedOut(resolve(f.out), f.outDir, i, f.n)) : (f.out ? resolve(f.out) : '')
      });
      q.items.push(item);
      items.push({ id: item.id, status: item.status });
    }
    return items;
  });
  if (f.json) console.log(JSON.stringify({ ok: true, added }));
  else for (const a of added) console.log(a.id);
}

async function queueList(f) {
  const q = await readQueue();
  if (f.json) { console.log(JSON.stringify({ ok: true, items: q.items })); return; }
  for (const it of q.items) {
    const tail = it.status === 'done' ? ` -> ${it.path}` : it.status === 'failed' ? ` ! ${it.error ?? ''}` : '';
    console.log(`${it.id}  ${it.status.padEnd(8)} ${it.prompt.slice(0, 60)}${tail}`);
  }
  console.error(`[gpt-image] ${q.items.length} job(s) in queue at ${queueFilePath()}`);
}

async function queueStatus(f) {
  const q = await readQueue();
  const counts = { pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
  let runnerPid;
  try { runnerPid = JSON.parse(await readFile(runnerPidPath(), 'utf8'))?.pid; } catch {}
  for (const it of q.items) counts[it.status] = (counts[it.status] ?? 0) + 1;
  const running = q.items
    .filter((it) => it.status === 'running')
    .map((it) => ({ id: it.id, pid: it.runnerPid, alive: isAlive(it.runnerPid), startedAt: it.startedAt, prompt: it.prompt }));
  const payload = {
    ok: true,
    queueFile: queueFilePath(),
    runnerPid: runnerPid ?? null,
    runnerAlive: isAlive(runnerPid),
    counts,
    running
  };
  if (f.json) console.log(JSON.stringify(payload));
  else {
    console.log(`pending=${counts.pending} running=${counts.running} done=${counts.done} failed=${counts.failed} cancelled=${counts.cancelled}`);
    for (const r of running) console.log(`RUNNING ${r.id} pid=${r.pid} alive=${r.alive} :: ${r.prompt.slice(0, 50)}`);
  }
}

async function queueStop(f) {
  const pids = new Set();
  try { const p = JSON.parse(await readFile(runnerPidPath(), 'utf8'))?.pid; if (p) pids.add(p); } catch {}
  const q = await readQueue();
  for (const it of q.items) if (it.status === 'running' && it.runnerPid) pids.add(it.runnerPid);
  const killed = [];
  for (const p of pids) {
    if (p === process.pid || !isAlive(p)) continue;
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(p, 'SIGTERM');
      killed.push(p);
    } catch {}
  }
  if (f.json) console.log(JSON.stringify({ ok: true, killed }));
  else console.log(killed.length ? `stopped runner(s): ${killed.join(', ')}` : 'no live runner found');
}

async function queueRemove(f) {
  if (!f.id) { console.error('error: queue remove requires --id <jobId>'); process.exit(EXIT_FAIL); }
  const removed = await mutateQueue((q) => {
    const before = q.items.length;
    q.items = q.items.filter((it) => it.id !== f.id);
    return before - q.items.length;
  });
  if (f.json) console.log(JSON.stringify({ ok: removed > 0, removed }));
  else console.log(removed > 0 ? `removed ${f.id}` : `no such job: ${f.id}`);
}

async function queueClear(f) {
  const removed = await mutateQueue((q) => {
    const keep = f.all ? [] : q.items.filter((it) => it.status === 'pending' || it.status === 'running');
    const n = q.items.length - keep.length;
    q.items = keep;
    return n;
  });
  if (f.json) console.log(JSON.stringify({ ok: true, removed }));
  else console.log(`removed ${removed} finished job(s)`);
}

async function claimNext(opts) {
  return mutateQueue((q) => {
    for (const it of q.items) {
      if (it.status !== 'running') continue;
      const mine = it.runnerPid === process.pid;
      const alive = isAlive(it.runnerPid);
      const expired = it.startedAt && Date.now() - Date.parse(it.startedAt) > opts.timeoutMs * 2 + 120000;
      if (!mine && (!alive || expired)) {
        it.status = 'pending';
        it.runnerPid = undefined;
        it.startedAt = undefined;
        it.note = 'requeued after stale runner';
      }
    }
    const next = q.items.find((it) => it.status === 'pending');
    if (!next) return undefined;
    next.status = 'running';
    next.runnerPid = process.pid;
    next.startedAt = new Date().toISOString();
    return { ...next };
  });
}

async function runItem(item, opts, auth) {
  const eff = {
    ...opts,
    refs: item.refs ?? [],
    model: item.model || opts.model,
    chatModel: item.chatModel || opts.chatModel,
    size: item.size || opts.size,
    quality: item.quality || opts.quality,
    timeoutMs: opts.timeoutMs
  };
  const outPath = item.out
    ? resolve(item.out)
    : numberedOut('', item.outDir || opts.outDir, item.attempts + 1, 1);
  const finish = (patch) => mutateQueue((q) => {
    const target = q.items.find((it) => it.id === item.id);
    if (!target) return;
    Object.assign(target, patch, { attempts: (target.attempts ?? 0) + 1 });
  });

  try {
    const b64 = auth.provider === 'codex-oauth'
      ? await generateWithCodexOAuth(eff, item.prompt, auth.token)
      : await generateWithApiKey(eff, item.prompt, auth.token);
    const buffer = Buffer.from(b64, 'base64');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
    await finish({ status: 'done', path: normPath(outPath), bytes: buffer.byteLength, error: undefined, finishedAt: new Date().toISOString() });
    console.error(`[gpt-image] done ${item.id} -> ${outPath}`);
    return true;
  } catch (e) {
    const msg = e?.name === 'TimeoutError' ? `Timed out after ${Math.round(opts.timeoutMs / 1000)}s` : String(e?.message ?? e);
    await finish({ status: 'failed', error: msg, finishedAt: new Date().toISOString() });
    console.error(`[gpt-image] FAILED ${item.id}: ${msg}`);
    return false;
  }
}

async function cmdRun(f) {
  if (f.detach && !process.env.GPT_IMAGE_QUEUE_RUNNER) {
    const args = [SELF.replace(/\\/gu, '/'), 'queue', 'run', '--parallel', String(f.parallel), '--delay-ms', String(f.delayMs), '--timeout', String(f.timeoutSec)];
    if (f.retryFailed) args.push('--retry-failed');
    if (f.force) args.push('--force');
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env, GPT_IMAGE_QUEUE_RUNNER: '1' }
    });
    child.unref();
    await mkdir(dirname(runnerPidPath()), { recursive: true });
    await writeFile(runnerPidPath(), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
    if (f.json) console.log(JSON.stringify({ ok: true, detached: true, pid: child.pid }));
    else console.log(`runner started in background (pid ${child.pid}); poll with: node gpt_image.mjs queue status`);
    return;
  }

  const auth = await resolveAuth(f);
  if (!auth) {
    if (f.json) console.log(JSON.stringify({ ok: false, error: 'no credentials' }));
    else console.error('error: no credentials found (run `codex login` or pass --api-key)');
    process.exit(EXIT_FAIL);
  }

  if (f.retryFailed) {
    await mutateQueue((q) => {
      for (const it of q.items) {
        if (it.status === 'failed' || it.status === 'cancelled') {
          it.status = 'pending';
          it.runnerPid = undefined;
          it.error = undefined;
        }
      }
    });
  }

  let ok = 0, failed = 0;
  const worker = async () => {
    for (;;) {
      const item = await claimNext(f);
      if (!item) return;
      const success = await runItem(item, f, auth);
      if (success) ok++; else failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.floor(f.parallel)) }, worker));

  const payload = { ok: failed === 0, processed: ok + failed, succeeded: ok, failed };
  if (f.json) console.log(JSON.stringify(payload));
  else console.log(`queue run complete: ${ok} succeeded, ${failed} failed`);
  process.exit(failed === 0 ? EXIT_OK : ok > 0 ? EXIT_PARTIAL : EXIT_FAIL);
}

function parseFlags(tokens) {
  const f = baseOpts();
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const next = () => tokens[++i];
    switch (a) {
      case '-o': case '--out': f.out = next(); break;
      case '--out-dir': f.outDir = next(); break;
      case '-n': case '--n': case '--count': f.n = Math.max(1, Math.min(50, Math.floor(Number(next()) || 1))); break;
      case '--ref': f.refs.push(resolve(next())); break;
      case '--model': f.model = next(); break;
      case '--chat-model': f.chatModel = next(); break;
      case '--size': f.size = next(); break;
      case '--quality': f.quality = next(); break;
      case '--delay-ms': f.delayMs = Math.max(0, Number(next()) || 0); break;
      case '--timeout': f.timeoutSec = Number(next()) || 300; finalizeTimeouts(f); break;
      case '--parallel': f.parallel = Math.max(1, Math.min(8, Math.floor(Number(next()) || 1))); break;
      case '--api-key': f.apiKey = next(); break;
      case '--auth-path': f.authPath = next(); break;
      case '--base-url': f.baseUrl = String(next()).replace(/\/+$/u, ''); break;
      case '--id': f.id = next(); break;
      case '--detach': f.detach = true; break;
      case '--retry-failed': f.retryFailed = true; break;
      case '--fail-fast': f.failFast = true; break;
      case '--force': f.force = true; break;
      case '--all': f.all = true; break;
      case '--status': f.status = true; break;
      case '--json': f.json = true; break;
      case '-h': case '--help': f.help = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
        positional.push(a);
    }
  }
  finalizeTimeouts(f);
  return { f, positional };
}

async function cmdQueue(rest) {
  const sub = rest[0];
  const { f, positional } = parseFlags(rest.slice(1));
  f.prompt = positional.join(' ').trim();
  switch (sub) {
    case 'add': return queueAdd(f);
    case 'list': return queueList(f);
    case 'status': return queueStatus(f);
    case 'run': return cmdRun(f);
    case 'stop': return queueStop(f);
    case 'remove': return queueRemove(f);
    case 'clear': return queueClear(f);
    default:
      console.error(`error: unknown queue command: ${sub ?? '(none)'}`);
      console.error(USAGE);
      process.exit(EXIT_FAIL);
  }
}

function timeoutMsg(e, opts) {
  return e?.name === 'TimeoutError'
    ? `Timed out after ${Math.round(opts.timeoutMs / 1000)}s.`
    : String(e?.message ?? e);
}

function failOut(json, message) {
  if (json) console.log(JSON.stringify({ ok: false, error: message }));
  console.error(`error: ${message}`);
  process.exit(EXIT_FAIL);
}

function emitResult(payload, json) {
  console.log(json ? JSON.stringify(payload) : String(payload.path));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'queue') {
    if (argv.length === 1) { console.log(USAGE); process.exit(EXIT_FAIL); }
    await cmdQueue(argv.slice(1));
    process.exit(EXIT_OK);
  }

  let opts, positional;
  try {
    ({ f: opts, positional } = parseFlags(argv));
  } catch (e) {
    console.error(String(e?.message ?? e));
    console.error(USAGE);
    process.exit(EXIT_FAIL);
  }
  opts.prompt = positional.join(' ').trim();

  if (opts.help || (!opts.prompt && !opts.status)) {
    console.log(USAGE);
    process.exit(opts.help ? EXIT_OK : EXIT_FAIL);
  }

  const auth = await resolveAuth(opts);
  if (!auth) {
    failOut(opts.json, `No credentials found. Sign in once with \`codex login\` so ${opts.authPath} exists, or pass --api-key.`);
  }
  if (opts.status) {
    const info = { ok: true, provider: auth.provider, model: opts.model, size: opts.size, quality: opts.quality, authPath: opts.authPath };
    console.log(opts.json ? JSON.stringify(info) : `${auth.provider} (${opts.authPath})`);
    process.exit(EXIT_OK);
  }
  for (const ref of opts.refs) {
    if (!existsSync(ref)) failOut(opts.json, `Reference image not found: ${ref}`);
  }

  console.error(`[gpt-image] provider=${auth.provider} model=${opts.model} size=${opts.size} quality=${opts.quality} n=${opts.n}`);

  const generateOne = () => auth.provider === 'codex-oauth'
    ? generateWithCodexOAuth(opts, opts.prompt, auth.token)
    : generateWithApiKey(opts, opts.prompt, auth.token);

  const saveOne = async (b64, outPath) => {
    const buffer = Buffer.from(b64, 'base64');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
    return buffer.byteLength;
  };

  if (opts.n === 1) {
    const outPath = opts.out ? resolve(opts.out) : resolve(defaultOutPath(opts.outDir));
    let b64;
    try { b64 = await generateOne(); }
    catch (e) { failOut(opts.json, timeoutMsg(e, opts)); }
    let bytes;
    try { bytes = await saveOne(b64, outPath); }
    catch (e) { failOut(opts.json, `Could not write output file: ${e?.message ?? e}`); }
    emitResult({
      ok: true,
      path: normPath(outPath),
      bytes,
      provider: auth.provider,
      model: opts.model,
      size: opts.size,
      quality: opts.quality,
      references: opts.refs
    }, opts.json);
    process.exit(EXIT_OK);
  }

  const results = [];
  for (let i = 1; i <= opts.n; i++) {
    const outPath = numberedOut(opts.out ? resolve(opts.out) : '', opts.outDir, i, opts.n);
    try {
      const b64 = await generateOne();
      const bytes = await saveOne(b64, outPath);
      results.push({ index: i, ok: true, path: normPath(outPath), bytes });
      console.error(`[gpt-image] ${i}/${opts.n} saved ${outPath}`);
    } catch (e) {
      const msg = timeoutMsg(e, opts);
      results.push({ index: i, ok: false, error: msg });
      console.error(`[gpt-image] ${i}/${opts.n} FAILED: ${msg}`);
      if (opts.failFast) break;
    }
  }
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  if (opts.json) console.log(JSON.stringify({ ok: failed === 0, requested: opts.n, attempted: results.length, succeeded, failed, results }));
  else for (const r of results) if (r.ok) console.log(r.path);
  console.error(`[gpt-image] batch complete: ${succeeded}/${results.length} succeeded, ${failed} failed`);
  process.exit(failed === 0 ? EXIT_OK : succeeded > 0 ? EXIT_PARTIAL : EXIT_FAIL);
}

main().catch((e) => {
  console.error(`error: ${e?.stack ?? e}`);
  process.exit(EXIT_FAIL);
});
