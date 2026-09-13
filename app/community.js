'use strict';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const { createThumbnails, decodeUpload } = require('./community-thumbnails');

const PREFIX = '/api/community/v1';
const DAY = 86_400_000;
const MAX_BODY = 2 * 1024 * 1024;
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const PROJECT_FIELDS = ['name', 'url', 'description', 'prompt', 'models', 'harness', 'tags', 'thumbnailUrl', 'thumbnailData', 'sourceUrl', 'remixOf', 'visibility'];
const uuid = () => crypto.randomUUID();
const secret = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const iso = () => new Date().toISOString();

class APIError extends Error {
  constructor(status, message, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}
function check(condition, message, status = 400, code) {
  if (!condition) throw new APIError(status, message, code);
}
function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
  return true;
}
function text(value, name, max, required = false) {
  if (value === undefined || value === null) { check(!required, `${name} is required`); return ''; }
  check(typeof value === 'string' && value.length <= max, `${name} must be text of at most ${max} characters`);
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), `${name} contains control characters`);
  const result = value.trim();
  check(!required || result.length > 0, `${name} is required`);
  return result;
}
function fields(body, allowed) {
  check(body && typeof body === 'object' && !Array.isArray(body), 'Expected a JSON object');
  check(Object.keys(body).every(key => allowed.includes(key)), 'Unknown or read-only field');
}
function list(value, name, maxItems, maxLength) {
  if (value === undefined) return [];
  check(Array.isArray(value) && value.length <= maxItems, `${name} must contain at most ${maxItems} items`);
  return [...new Set(value.map(v => {
    const item = text(v, name, maxLength, true);
    check(/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]*$/.test(item), `${name} contains an invalid identifier`);
    return name === 'tags' ? item.toLowerCase() : item;
  }))];
}
function publicUrl(value, name, image = false, required = false) {
  const raw = text(value, name, 2048, required);
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new APIError(400, `${name} must be an absolute public HTTP(S) URL`); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  check(['http:', 'https:'].includes(url.protocol) && (!image || url.protocol === 'https:'), `${name} requires ${image ? 'HTTPS' : 'HTTP(S)'}`);
  check(!url.username && !url.password && !/[\s\u0000-\u001f]/.test(raw), `${name} cannot contain credentials or whitespace`);
  // Preview fetching independently resolves and pins public IPs for every resource.
  check(host.includes('.') && !net.isIP(host.replace(/^\[|\]$/g, '')) && !host.includes(':') &&
    !/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host) &&
    /^[a-z0-9.-]+$/.test(host), `${name} must use a public DNS hostname`);
  return url.href;
}
function password(value) {
  check(typeof value === 'string' && value.length >= 15 && Buffer.byteLength(value) <= 256,
    'Password must contain at least 15 characters and at most 256 bytes');
  return value;
}
function derive(value, salt, options = PASSWORD_OPTIONS) {
  return new Promise((resolve, reject) => crypto.scrypt(value, salt, 32, options,
    (error, result) => error ? reject(error) : resolve(result)));
}
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  return `s2$${salt.toString('base64')}$${(await derive(value, salt)).toString('base64')}`;
}
async function passwordMatches(value, encoded) {
  const parts = String(encoded || '').split('$');
  const modern = parts[0] === 's2';
  const salt = Buffer.from(parts[modern ? 1 : 0] || '', 'base64');
  const expected = Buffer.from(parts[modern ? 2 : 1] || '', 'base64');
  const actual = await derive(value, salt.length ? salt : Buffer.alloc(16), modern ? PASSWORD_OPTIONS : { maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
async function readBody(req) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY) { req.resume(); throw new APIError(413, 'Request body is too large', 'body_too_large'); }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    check(bytes <= MAX_BODY, 'Request body is too large', 413, 'body_too_large');
    chunks.push(chunk);
  }
  if (!bytes) return {};
  check(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''), 'Use Content-Type: application/json', 415);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new APIError(400, 'Invalid JSON'); }
  check(body && typeof body === 'object' && !Array.isArray(body), 'Expected a JSON object');
  return body;
}

function createCommunity(opts = {}) {
  const dir = opts.dataDir || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'Ephix', 'community');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'community.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const version = get('PRAGMA user_version').user_version;
  if (version > 4) { db.close(); throw new Error('Community database is newer than this server'); }
  transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, display_name TEXT,
        password TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'member');
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf TEXT NOT NULL, expires INTEGER NOT NULL, scope TEXT NOT NULL DEFAULT 'full');
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, harness TEXT, created_at TEXT NOT NULL,
        revoked_at TEXT, expires_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL, url TEXT NOT NULL, prompt TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', models TEXT NOT NULL DEFAULT '[]',
        harness TEXT, tags TEXT NOT NULL DEFAULT '[]', thumbnail_url TEXT, source_url TEXT,
        remix_of TEXT REFERENCES projects(id) ON DELETE SET NULL, visibility TEXT NOT NULL DEFAULT 'public',
        publication_method TEXT NOT NULL, publication_harness TEXT, featured INTEGER NOT NULL DEFAULT 0,
        moderation TEXT NOT NULL DEFAULT 'active', likes INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS likes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(user_id,project_id));
      CREATE TABLE IF NOT EXISTS view_events (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, viewer_key TEXT NOT NULL,
        day TEXT NOT NULL, PRIMARY KEY(project_id,viewer_key,day));
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS moderation_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
        target_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publication_keys (user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, body_hash TEXT NOT NULL,
        PRIMARY KEY(user_id,key));
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id), parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
        body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comment_reports (
        id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL,
        actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE, message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sanctions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, reason TEXT NOT NULL,
        actor_id TEXT, created_at TEXT NOT NULL, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1,
        lifted_at TEXT, lifted_by TEXT, lift_reason TEXT);
      CREATE TABLE IF NOT EXISTS appeals (
        id TEXT PRIMARY KEY, sanction_id TEXT NOT NULL REFERENCES sanctions(id), user_id TEXT NOT NULL REFERENCES users(id),
        message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL,
        decided_at TEXT, decided_by TEXT, decision_reason TEXT);
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at TEXT);
      CREATE INDEX IF NOT EXISTS project_discovery ON projects(visibility,moderation,created_at);
      CREATE INDEX IF NOT EXISTS project_owner ON projects(user_id,created_at);
      CREATE INDEX IF NOT EXISTS report_queue ON reports(status,created_at);
      CREATE INDEX IF NOT EXISTS comment_threads ON comments(project_id,parent_id,created_at);
      CREATE INDEX IF NOT EXISTS comment_report_queue ON comment_reports(status,created_at);
      CREATE INDEX IF NOT EXISTS notification_inbox ON notifications(user_id,read_at,created_at);
      CREATE INDEX IF NOT EXISTS sanction_state ON sanctions(user_id,active,expires_at);
      CREATE INDEX IF NOT EXISTS appeal_queue ON appeals(status,created_at);
    `);
    if (!all('PRAGMA table_info(tokens)').some(c => c.name === 'expires_at')) db.exec('ALTER TABLE tokens ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
    if (!all('PRAGMA table_info(likes)').some(c => c.name === 'created_at')) db.exec("ALTER TABLE likes ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    if (version === 1) {
      // Prototype sessions were stored in clear. Invalidate them during upgrade;
      // account password/recovery and project data are preserved.
      db.exec('DELETE FROM sessions');
      run('UPDATE tokens SET expires_at=? WHERE expires_at=0', Date.now() + 90 * DAY);
    }
    if (version <= 2 && !all('PRAGMA table_info(projects)').some(c => c.name === 'prompt')) db.exec("ALTER TABLE projects ADD COLUMN prompt TEXT NOT NULL DEFAULT ''");
    if (!all('PRAGMA table_info(users)').some(c => c.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
    if (!all('PRAGMA table_info(sessions)').some(c => c.name === 'scope')) db.exec("ALTER TABLE sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'");
    if (version <= 3) {
      const legacyActor = 'system:migration';
      for (const user of all('SELECT id FROM users WHERE disabled=1')) {
        run('INSERT OR IGNORE INTO sanctions (id,user_id,kind,reason,actor_id,created_at,active) VALUES(?,?,?,?,?,?,1)',
          'legacy-' + user.id, user.id, 'ban', 'Legacy disabled account', legacyActor, iso());
      }
    }
    run('INSERT OR IGNORE INTO settings VALUES(?,?)', 'privacy_key', secret());
    db.exec('PRAGMA user_version=4');
  });
  const privacyKey = get("SELECT value FROM settings WHERE key='privacy_key'").value;
  const digest = value => crypto.createHmac('sha256', privacyKey).update(value).digest('hex');
  const adminIds = new Set((opts.adminIds || String(process.env.COMMUNITY_ADMIN_IDS || '').split(',')).map(x => x.trim()).filter(Boolean));
  const cookieName = opts.secureCookies ? '__Host-eb_session' : 'eb_session';
  let passwordJobs = 0, lastCleanup = 0;
  const publicUser = account => account ? { id: account.id, username: account.username, displayName: account.display_name, createdAt: account.created_at } : null;
  const accountById = id => get('SELECT * FROM users WHERE id=?', id);
  const roleOf = account => account ? (adminIds.has(account.id) ? 'admin' : account.role || 'member') : 'member';
  const roleRank = role => ({ member: 0, moderator: 1, admin: 2 })[role] ?? 0;
  const isAdmin = actor => !!actor && roleOf(actor.user) === 'admin';
  const isStaff = actor => !!actor && roleRank(roleOf(actor.user)) >= 1;
  const activeSanction = userId => get(`SELECT * FROM sanctions WHERE user_id=? AND active=1
    AND (kind='ban' OR expires_at IS NULL OR expires_at>?) ORDER BY CASE kind WHEN 'ban' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`, userId, iso());
  const isBanned = userId => !!get("SELECT 1 FROM sanctions WHERE user_id=? AND active=1 AND kind='ban'", userId);
  const unreadCount = userId => get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', userId).n;
  function accountView(account) {
    const sanction = activeSanction(account.id);
    return { ...publicUser(account), role: roleOf(account), isAdmin: roleOf(account) === 'admin', isModerator: roleRank(roleOf(account)) >= 1,
      sanction: sanction ? { id: sanction.id, kind: sanction.kind, reason: sanction.reason, expiresAt: sanction.expires_at } : null,
      unreadNotifications: unreadCount(account.id) };
  }
  function clientIP(req) {
    if (opts.trustProxy) {
      // Only enable behind a firewall-restricted, trusted reverse proxy. It
      // appends the connection address at the right end of X-Forwarded-For.
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
      if (net.isIP(forwarded)) return forwarded;
    }
    return req.socket.remoteAddress || 'unknown';
  }
  function rate(bucket, maximum, interval) {
    const key = digest(bucket), now = Date.now();
    const current = get('SELECT * FROM limits WHERE bucket=?', key);
    if (current && current.reset_at > now && current.hits >= maximum) {
      const error = new APIError(429, 'Too many requests. Please try again later.', 'rate_limited');
      error.retryAfter = Math.ceil((current.reset_at - now) / 1000); throw error;
    }
    run(`INSERT INTO limits VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET
      hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`, key, 1, now + interval, now, now);
  }
  function authenticate(req) {
    const bearer = String(req.headers.authorization || '');
    const cookies = String(req.headers.cookie || '').split(';').map(c => c.trim()).filter(c => c.startsWith(cookieName + '='));
    check(cookies.length <= 1, 'Ambiguous session cookie', 401, 'unauthorized');
    if (bearer) {
      check(!cookies.length && /^Bearer [A-Za-z0-9_-]+$/i.test(bearer), 'Use one authentication method', 401, 'unauthorized');
      const token = get('SELECT * FROM tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?', hash(bearer.slice(7)), Date.now());
      const user = token && accountById(token.user_id);
      check(user && !user.disabled && !activeSanction(user.id), 'Token is invalid, expired, revoked, or restricted', 401, 'unauthorized');
      return { user, method: 'agent', token };
    }
    if (!cookies.length) return null;
    const value = cookies[0].slice(cookieName.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const session = get('SELECT * FROM sessions WHERE id=? AND expires>?', hash(value), Date.now());
    const user = session && accountById(session.user_id);
    if (!user || user.disabled && session.scope !== 'appeal') return null;
    const effectiveSession = session.scope === 'appeal' && !activeSanction(user.id) ? { ...session, scope: 'full' } : session;
    return { user, method: 'manual', session: effectiveSession };
  }
  function requireAuth(actor) { check(actor, 'Sign in to continue', 401, 'unauthorized'); }
  function requireWrite(actor) {
    requireAuth(actor);
    check(actor.method !== 'manual' || actor.session.scope === 'full', 'This account is restricted to appeals', 403, 'sanctioned');
    const sanction = activeSanction(actor.user.id);
    check(!sanction, sanction?.kind === 'timeout' ? 'This account is timed out' : 'This account is banned', 403, 'sanctioned');
  }
  function csrf(req, actor) {
    requireAuth(actor);
    if (actor.method === 'agent') return;
    check(req.headers.origin === opts.origin && req.headers['x-csrf-token'] === actor.session.csrf,
      'Session security check failed. Refresh and try again.', 403, 'csrf');
  }
  function cookie(value, expire = false) {
    return `${cookieName}=${value}; Max-Age=${expire ? 0 : 30 * 86400}; HttpOnly; SameSite=Lax; Path=/${opts.secureCookies ? '; Secure' : ''}`;
  }
  function login(res, account, recoveryCode, scope = 'full') {
    const value = secret(), csrfToken = secret();
    run('INSERT INTO sessions (id,user_id,csrf,expires,scope) VALUES(?,?,?,?,?)', hash(value), account.id, csrfToken, Date.now() + 30 * DAY, scope);
    return json(res, 200, { user: accountView(account), csrfToken,
      ...(recoveryCode ? { recoveryCode } : {}) }, { 'Set-Cookie': cookie(value) });
  }
  const thumbnails = createThumbnails(db, { enabled: opts.autoPreview !== false && process.env.COMMUNITY_AUTO_PREVIEW !== '0', renderer: opts.previewRenderer });
  function project(id) { return get('SELECT * FROM projects WHERE id=? OR slug=?', id, id); }
  function owner(p, actor) { return !!actor && p.user_id === actor.user.id; }
  function visible(p, actor, direct = false) {
    if (!p || accountById(p.user_id)?.disabled || isBanned(p.user_id)) return false;
    if (owner(p, actor) || isStaff(actor)) return direct || p.visibility === 'public' && p.moderation === 'active';
    return p.moderation === 'active' && (p.visibility === 'public' || direct && p.visibility === 'unlisted');
  }
  function projectRow(p, actor) {
    const source = p.remix_of && project(p.remix_of);
    const safeRemix = source && source.visibility === 'public' && source.moderation === 'active' && !accountById(source.user_id)?.disabled;
    return { id: p.id, slug: p.slug, name: p.name, url: p.url, prompt: p.prompt || '', description: p.description, models: JSON.parse(p.models),
      harness: p.harness, tags: JSON.parse(p.tags), thumbnailUrl: p.thumbnail_url, ...thumbnails.info(p), sourceUrl: p.source_url,
      remixOf: safeRemix ? source.id : null, visibility: p.visibility, creator: publicUser(accountById(p.user_id)),
      publication: { method: p.publication_method, harness: p.publication_harness },
      featured: !!p.featured, moderation: p.moderation, likes: p.likes, views: p.views,
      liked: !!(actor && get('SELECT 1 FROM likes WHERE user_id=? AND project_id=?', actor.user.id, p.id)),
      createdAt: p.created_at, updatedAt: p.updated_at };
  }
  function validateProject(body, prior) {
    fields(body, PROJECT_FIELDS);
    let thumbnailData;
    try { thumbnailData = decodeUpload(body.thumbnailData); } catch (error) { throw new APIError(400, error.message); }
    check(!thumbnailData || !body.thumbnailUrl, 'Choose an uploaded image or a thumbnail URL');
    const base = prior ? { name: prior.name, url: prior.url, prompt: prior.prompt || '', description: prior.description, models: JSON.parse(prior.models),
      harness: prior.harness, tags: JSON.parse(prior.tags), thumbnailUrl: prior.thumbnail_url, sourceUrl: prior.source_url,
      remixOf: prior.remix_of, visibility: prior.visibility } : {};
    const value = { ...base, ...body };
    const visibility = value.visibility === undefined ? 'public' : value.visibility;
    check(['public', 'unlisted'].includes(visibility), 'visibility must be public or unlisted');
    const remixOf = text(value.remixOf, 'remixOf', 80) || null;
    if (remixOf) {
      const original = project(remixOf);
      check(original && original.id !== prior?.id && original.visibility === 'public' && original.moderation === 'active' &&
        !accountById(original.user_id)?.disabled, 'Remix source must be an available public project');
      let cursor = original, depth = 0;
      while (cursor?.remix_of && depth++ < 50) {
        check(cursor.remix_of !== prior?.id, 'Remix relationships cannot form a cycle'); cursor = project(cursor.remix_of);
      }
      check(depth < 50, 'Remix chain is too deep');
    }
    return { name: text(value.name, 'name', 140, true), url: publicUrl(value.url, 'url', false, true),
      prompt: text(value.prompt, 'prompt', 20000), description: text(value.description, 'description', 4000), models: list(value.models, 'models', 8, 120),
      harness: text(value.harness, 'harness', 40) || null, tags: list(value.tags, 'tags', 8, 32),
      thumbnailUrl: thumbnailData ? null : publicUrl(value.thumbnailUrl, 'thumbnailUrl', true), thumbnailData, sourceUrl: publicUrl(value.sourceUrl, 'sourceUrl'),
      remixOf: remixOf ? project(remixOf).id : null, visibility };
  }
  function pagination(url) {
    const read = (name, fallback, max) => {
      const raw = url.searchParams.get(name);
      if (raw === null) return fallback;
      check(/^\d+$/.test(raw) && Number(raw) <= max, `${name} must be an integer between 0 and ${max}`);
      return Number(raw);
    };
    const limit = read('limit', 24, 100); check(limit > 0, 'limit must be at least 1');
    return { limit, offset: read('offset', 0, 1_000_000) };
  }
  function projects(url, actor) {
    const mine = url.searchParams.get('mine') === '1';
    if (mine) requireAuth(actor);
    const conditions = ['u.disabled=0'], args = [];
    if (mine) { conditions.push('p.user_id=?'); args.push(actor.user.id); }
    else conditions.push("p.visibility='public'", "p.moderation='active'");
    const creator = text(url.searchParams.get('creator'), 'creator', 40);
    if (creator) { conditions.push('u.username=?'); args.push(creator); }
    const search = text(url.searchParams.get('search'), 'search', 100).toLowerCase();
    if (search) {
      conditions.push('(instr(lower(p.name),?)>0 OR instr(lower(p.description),?)>0 OR instr(lower(u.username),?)>0 OR instr(lower(u.display_name),?)>0 OR EXISTS(SELECT 1 FROM json_each(p.tags) WHERE instr(lower(value),?)>0))');
      args.push(search, search, search, search, search);
    }
    const models = url.searchParams.get('models');
    for (const model of models ? list(models.split(','), 'models', 8, 120) : []) {
      conditions.push('EXISTS(SELECT 1 FROM json_each(p.models) WHERE value=? COLLATE NOCASE)'); args.push(model);
    }
    const tag = text(url.searchParams.get('tag'), 'tag', 32), harness = text(url.searchParams.get('harness'), 'harness', 40);
    if (tag) { conditions.push('EXISTS(SELECT 1 FROM json_each(p.tags) WHERE value=? COLLATE NOCASE)'); args.push(tag); }
    if (harness) { conditions.push('p.harness=? COLLATE NOCASE'); args.push(harness); }
    const sort = url.searchParams.get('sort') || 'new';
    check(['new', 'trending', 'featured'].includes(sort), 'Unknown project sort');
    if (sort === 'featured') conditions.push('p.featured=1');
    const from = `FROM projects p JOIN users u ON u.id=p.user_id WHERE ${conditions.join(' AND ')}`;
    const total = get(`SELECT COUNT(*) n ${from}`, ...args).n;
    // Only recent engagement contributes. Every fresh project receives a small
    // prior, so zero-engagement work still gets exposure. Editing never resets age.
    const order = sort === 'trending' ? `(
      4*(SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.created_at>=datetime('now','-14 days')) +
      0.5*min(200,(SELECT COUNT(*) FROM view_events v WHERE v.project_id=p.id AND v.day>=date('now','-7 days'))) + 2
      ) / pow(2+max(0,julianday('now')-julianday(p.created_at)),0.8) DESC, p.created_at DESC, p.id DESC` : 'p.created_at DESC,p.id DESC';
    const { limit, offset } = pagination(url);
    return { projects: all(`SELECT p.* ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, offset).map(p => projectRow(p, actor)), total };
  }
  function audit(actor, action, target, details) {
    run('INSERT INTO moderation_log VALUES(?,?,?,?,?,?)', uuid(), actor.user.id, action, target, JSON.stringify(details), iso());
  }
  function notifyUser(userId, type, actorId, projectId, commentId, message) {
    if (!userId || userId === actorId) return;
    run('INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?,?)', uuid(), userId, type, actorId || null, projectId || null,
      commentId || null, text(message, 'message', 300, true), null, iso());
  }
  function canTarget(actor, target, roleChange = false) {
    check(target, 'Account not found', 404, 'not_found');
    check(target.id !== actor.user.id, 'You cannot target your own account', 403, 'forbidden');
    check(!adminIds.has(target.id), 'Bootstrap administrators are protected', 403, 'forbidden');
    if (!roleChange) check(roleRank(roleOf(target)) < roleRank(roleOf(actor.user)), 'Staff may only sanction lower roles', 403, 'forbidden');
  }
  function comment(id) { return get('SELECT * FROM comments WHERE id=?', id); }
  function commentRow(c, actor) {
    const author = accountById(c.user_id), banned = isBanned(c.user_id), staff = isStaff(actor);
    const status = banned ? 'banned' : c.status;
    const readable = status === 'active' || staff;
    return { id: c.id, projectId: c.project_id, parentId: c.parent_id, author: publicUser(author),
      body: readable ? c.body : null, status, replyCount: get('SELECT COUNT(*) n FROM comments WHERE parent_id=?', c.id).n,
      edited: c.updated_at !== c.created_at, createdAt: c.created_at, updatedAt: c.updated_at,
      capabilities: { edit: !!actor && c.user_id === actor.user.id && c.status === 'active' && !activeSanction(actor.user.id),
        delete: !!actor && c.user_id === actor.user.id && c.status === 'active' && !activeSanction(actor.user.id),
        report: !!actor && c.user_id !== actor.user.id && c.status === 'active' && !activeSanction(actor.user.id),
        ownerModerate: !!actor && project(c.project_id)?.user_id === actor.user.id && c.user_id !== actor.user.id && !activeSanction(actor.user.id),
        staffModerate: staff } };
  }
  async function dispatch(req, res, url) {
    const method = req.method;
    check(['GET', 'POST', 'PATCH', 'DELETE'].includes(method), 'Method not allowed', 405, 'method');
    const route = decodeURIComponent(url.pathname.slice(PREFIX.length)).replace(/\/$/, '') || '/';
    const ip = clientIP(req);
    let actor = authenticate(req);
    const mutation = method !== 'GET';
    if (mutation) {
      check(!req.headers.origin || req.headers.origin === opts.origin, 'Origin rejected', 403, 'origin_rejected');
      rate('write-ip:' + ip, 180, 60_000);
      if (actor) rate('write-account:' + actor.user.id, 120, 60_000);
    } else rate('read:' + ip, 600, 60_000);
    const action = route.match(/^\/projects\/([^/]+)\/(like|view|report)$/);
    if (action) check(method === 'POST', 'Action requires POST', 405, 'method');
    const publicMutation = ['/auth/register', '/auth/login', '/auth/recover', '/auth/reset-password'].includes(route) || action?.[2] === 'view';
    if (mutation && !publicMutation) csrf(req, actor);
    const body = mutation ? await readBody(req) : {};
    if (mutation) {
      actor = authenticate(req);
      if (!publicMutation) csrf(req, actor);
    }
    const appealAllowed = route === '/auth/logout' || route === '/auth/me' || route === '/appeals/mine';
    if (actor?.session?.scope === 'appeal' && !publicMutation) check(appealAllowed, 'This session is restricted to appeals', 403, 'sanctioned');
    if (mutation && !publicMutation && !appealAllowed) requireWrite(actor);

    if (route === '/catalog' && method === 'GET') {
      const base = opts.getCatalog ? await opts.getCatalog() : { models: [], tags: [], harnesses: [] };
      return json(res, 200, base);
    }
    if (['/auth/register', '/auth/login', '/auth/recover'].includes(route) && method === 'POST') {
      fields(body, route === '/auth/register' ? ['username', 'password', 'displayName'] : route === '/auth/login' ? ['username', 'password'] : ['username', 'password', 'recoveryCode']);
      const username = text(body.username, 'username', 40, true).toLowerCase();
      check(/^[a-z0-9][a-z0-9_-]{2,39}$/.test(username), 'Username must be 3–40 letters, numbers, underscores or hyphens');
      const pw = password(body.password);
      rate('auth-ip:' + ip, 30, 15 * 60_000);
      rate('auth-user:' + username, 15, 15 * 60_000);
      check(passwordJobs < 4, 'Sign-in service is busy. Please retry shortly.', 503, 'busy');
      passwordJobs++;
      try {
        const account = get('SELECT * FROM users WHERE username=?', username);
        if (route === '/auth/register') {
          rate('register:' + ip, 10, DAY);
          check(!account, 'Username is already in use', 409, 'conflict');
          const uid = uuid(), recoveryCode = secret(), encoded = await passwordHash(pw);
          // Check uniqueness again after asynchronous KDF to handle parallel registration.
          check(!get('SELECT 1 FROM users WHERE username=?', username), 'Username is already in use', 409, 'conflict');
          run('INSERT INTO users (id,username,display_name,password,recovery_hash,created_at,disabled,role) VALUES(?,?,?,?,?,?,0,?)', uid, username, text(body.displayName, 'displayName', 80) || username, encoded, hash(recoveryCode), iso(), 'member');
          return login(res, accountById(uid), recoveryCode);
        }
        if (route === '/auth/login') {
          const matches = await passwordMatches(pw, account?.password || 's2$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
          const current = account && accountById(account.id);
          check(current && current.password === account.password && matches, 'Invalid credentials', 401, 'unauthorized');
          const sanction = activeSanction(current.id);
          check(!current.disabled || sanction?.kind === 'ban', 'Invalid credentials', 401, 'unauthorized');
          return login(res, current, null, sanction?.kind === 'ban' ? 'appeal' : 'full');
        }
        const code = text(body.recoveryCode, 'recoveryCode', 100, true);
        check(account && !account.disabled && hash(code) === account.recovery_hash, 'Invalid recovery details', 401, 'unauthorized');
        const encoded = await passwordHash(pw), recoveryCode = secret();
        transaction(() => {
          // A recovery code is one-use even with concurrent requests.
          const current = accountById(account.id);
          check(current && !current.disabled && current.recovery_hash === hash(code), 'Recovery code has already been used or account is disabled', 401, 'unauthorized');
          run('UPDATE users SET password=?,recovery_hash=? WHERE id=?', encoded, hash(recoveryCode), account.id);
          run('DELETE FROM sessions WHERE user_id=?', account.id);
          run('UPDATE tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', iso(), account.id);
        });
        return json(res, 200, { ok: true, recoveryCode }, { 'Set-Cookie': cookie('', true) });
      } finally { passwordJobs--; }
    }
    if (route === '/auth/reset-password' && method === 'POST') {
      fields(body, ['token', 'password']);
      const token = text(body.token, 'token', 200, true), pw = password(body.password);
      rate('reset-ip:' + ip, 20, 60 * 60_000);
      const record = get('SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?', hash(token), Date.now());
      check(record, 'Reset link is invalid or expired', 401, 'unauthorized');
      check(passwordJobs < 4, 'Password service is busy. Please retry shortly.', 503, 'busy');
      passwordJobs++;
      try {
        const encoded = await passwordHash(pw), recoveryCode = secret();
        transaction(() => {
          const current = get('SELECT * FROM password_reset_tokens WHERE id=? AND used_at IS NULL AND expires_at>?', record.id, Date.now());
          check(current, 'Reset link has already been used or expired', 401, 'unauthorized');
          run('UPDATE users SET password=?,recovery_hash=? WHERE id=?', encoded, hash(recoveryCode), record.user_id);
          run('UPDATE password_reset_tokens SET used_at=? WHERE id=?', iso(), record.id);
          run('DELETE FROM sessions WHERE user_id=?', record.user_id);
          run('UPDATE tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', iso(), record.user_id);
        });
        return json(res, 200, { ok: true, recoveryCode }, { 'Set-Cookie': cookie('', true) });
      } finally { passwordJobs--; }
    }
    if (route === '/auth/me' && method === 'GET') return json(res, 200, {
      user: actor ? accountView(actor.user) : null, csrfToken: actor?.session?.csrf || null
    });
    if (route === '/auth/logout' && method === 'POST') {
      fields(body, []);
      if (actor.session) run('DELETE FROM sessions WHERE id=?', actor.session.id);
      if (actor.token) run('UPDATE tokens SET revoked_at=? WHERE id=?', iso(), actor.token.id);
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', true) });
    }
    if (route === '/tokens') {
      requireAuth(actor);
      if (method === 'GET') return json(res, 200, { tokens: all('SELECT id,label,harness,created_at AS createdAt,expires_at AS expiresAt FROM tokens WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC', actor.user.id) });
      if (method === 'POST') {
        fields(body, ['label', 'harness']);
        check(get('SELECT COUNT(*) n FROM tokens WHERE user_id=? AND revoked_at IS NULL AND expires_at>?', actor.user.id, Date.now()).n < 25, 'Revoke an unused token before creating another', 409);
        const token = 'ebt_' + secret(), id = uuid(), expiresAt = Date.now() + 90 * DAY;
        run('INSERT INTO tokens VALUES(?,?,?,?,?,?,NULL,?)', id, actor.user.id, text(body.label, 'label', 80) || 'Agent', hash(token), text(body.harness, 'harness', 40) || null, iso(), expiresAt);
        return json(res, 201, { token, id, expiresAt });
      }
    }
    let match = route.match(/^\/tokens\/([^/]+)$/);
    if (match && method === 'DELETE') {
      requireAuth(actor);
      check(get('SELECT 1 FROM tokens WHERE id=? AND user_id=?', match[1], actor.user.id), 'Token not found', 404, 'not_found');
      run('UPDATE tokens SET revoked_at=? WHERE id=?', iso(), match[1]);
      return json(res, 200, { ok: true });
    }
    if (route === '/projects' && method === 'GET') return json(res, 200, projects(url, actor));
    if (route === '/projects' && method === 'POST') {
      const p = validateProject(body), id = uuid(), time = iso();
      const key = text(req.headers['idempotency-key'], 'Idempotency-Key', 128);
      const fingerprint = hash(JSON.stringify(p));
      if (key) {
        const previous = get('SELECT * FROM publication_keys WHERE user_id=? AND key=?', actor.user.id, key);
        if (previous) {
          check(previous.body_hash === fingerprint, 'Idempotency key was already used for a different payload', 409, 'conflict');
          return json(res, 200, { project: projectRow(project(previous.project_id), actor) });
        }
      }
      rate('publish:' + actor.user.id, 30, DAY);
      const slug = (p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'project') + '-' + id.slice(0, 8);
      transaction(() => {
        run('INSERT INTO projects (id,slug,user_id,name,url,prompt,description,models,harness,tags,thumbnail_url,source_url,remix_of,visibility,publication_method,publication_harness,featured,moderation,likes,views,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, slug, actor.user.id, p.name, p.url, p.prompt, p.description,
          JSON.stringify(p.models), p.harness, JSON.stringify(p.tags), p.thumbnailUrl, p.sourceUrl, p.remixOf, p.visibility,
          actor.method, actor.method === 'agent' ? actor.token.harness : null, 0, 'active', 0, 0, time, time);
        if (key) run('INSERT INTO publication_keys VALUES(?,?,?,?)', actor.user.id, key, id, fingerprint);
        thumbnails.update(project(id), p.thumbnailData);
      });
      return json(res, 201, { project: projectRow(project(id), actor) });
    }
    match = route.match(/^\/projects\/([^/]+)\/thumbnail$/);
    if (match && method === 'GET') {
      const p = project(match[1]);
      check(visible(p, actor, true), 'Project not found', 404, 'not_found');
      const image = await thumbnails.image(p);
      check(visible(project(p.id), authenticate(req), true), 'Project not found', 404, 'not_found');
      if (!image) { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return true; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': image.length,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(Buffer.from(image)); return true;
    }
    match = route.match(/^\/projects\/([^/]+)$/);
    if (match) {
      const p = project(match[1]);
      check(visible(p, actor, true), 'Project not found', 404, 'not_found');
      if (method === 'GET') return json(res, 200, { project: projectRow(p, actor) });
      check(owner(p, actor), 'Only the creator can change this project', 403, 'forbidden');
      if (method === 'DELETE') {
        transaction(() => {
          run('UPDATE projects SET remix_of=NULL WHERE remix_of=?', p.id);
          run('DELETE FROM reports WHERE project_id=?', p.id); // also supports v1 FK schema
          run('DELETE FROM projects WHERE id=?', p.id);
        });
        return json(res, 200, { ok: true });
      }
      if (method === 'PATCH') {
        const v = validateProject(body, p);
        run('UPDATE projects SET name=?,url=?,prompt=?,description=?,models=?,harness=?,tags=?,thumbnail_url=?,source_url=?,remix_of=?,visibility=?,updated_at=? WHERE id=?',
          v.name, v.url, v.prompt, v.description, JSON.stringify(v.models), v.harness, JSON.stringify(v.tags), v.thumbnailUrl, v.sourceUrl, v.remixOf, v.visibility, iso(), p.id);
        thumbnails.update(project(p.id), v.thumbnailData);
        return json(res, 200, { project: projectRow(project(p.id), actor) });
      }
    }
    if (action) {
      const p = project(action[1]);
      check(visible(p, actor, true) && p.moderation === 'active', 'Project not found', 404, 'not_found');
      if (action[2] === 'view') {
        fields(body, []);
        const key = digest(actor ? 'user:' + actor.user.id : 'ip:' + ip), day = iso().slice(0, 10);
        transaction(() => {
          const inserted = run('INSERT OR IGNORE INTO view_events VALUES(?,?,?)', p.id, key, day).changes;
          if (inserted) run('UPDATE projects SET views=views+1 WHERE id=?', p.id);
        });
        return json(res, 200, { views: project(p.id).views });
      }
      if (action[2] === 'like') {
        fields(body, []);
        const liked = transaction(() => {
          const previous = get('SELECT 1 FROM likes WHERE user_id=? AND project_id=?', actor.user.id, p.id);
          if (previous) run('DELETE FROM likes WHERE user_id=? AND project_id=?', actor.user.id, p.id);
          else run('INSERT INTO likes VALUES(?,?,?)', actor.user.id, p.id, iso());
          run('UPDATE projects SET likes=(SELECT COUNT(*) FROM likes WHERE project_id=?) WHERE id=?', p.id, p.id);
          return !previous;
        });
        return json(res, 200, { liked, likes: project(p.id).likes });
      }
      fields(body, ['reason']);
      rate('report:' + actor.user.id, 10, DAY);
      const reason = text(body.reason, 'reason', 500, true);
      const prior = get("SELECT id FROM reports WHERE project_id=? AND user_id=? AND status='open'", p.id, actor.user.id);
      const id = prior?.id || uuid();
      if (!prior) run('INSERT INTO reports VALUES(?,?,?,?,?,?)', id, p.id, actor.user.id, reason, 'open', iso());
      return json(res, prior ? 200 : 201, { ok: true, id });
    }
    match = route.match(/^\/projects\/([^/]+)\/comments$/);
    if (match) {
      const p = project(match[1]);
      check(visible(p, actor, true), 'Project not found', 404, 'not_found');
      if (method === 'GET') {
        const { limit, offset } = pagination(url);
        const total = get('SELECT COUNT(*) n FROM comments WHERE project_id=? AND parent_id IS NULL', p.id).n;
        const items = all('SELECT * FROM comments WHERE project_id=? AND parent_id IS NULL ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?', p.id, limit, offset);
        return json(res, 200, { comments: items.map(c => commentRow(c, actor)), total });
      }
      if (method === 'POST') {
        fields(body, ['body', 'parentId']);
        rate('comment-window:' + actor.user.id, 10, 10 * 60_000);
        rate('comment-day:' + actor.user.id, 100, DAY);
        const parentId = text(body.parentId, 'parentId', 80) || null;
        let parent = null;
        if (parentId) {
          parent = comment(parentId);
          check(parent && parent.project_id === p.id, 'Reply parent not found', 404, 'not_found');
          check(!parent.parent_id, 'Replies may only be one level deep');
          check(parent.status !== 'moderator_removed', 'This discussion is closed');
        }
        const id = uuid(), time = iso(), value = text(body.body, 'body', 2000, true);
        run('INSERT INTO comments VALUES(?,?,?,?,?,?,?,?)', id, p.id, actor.user.id, parentId, value, 'active', time, time);
        if (parent) notifyUser(parent.user_id, 'reply', actor.user.id, p.id, id, `${actor.user.display_name || actor.user.username} replied to your comment.`);
        else notifyUser(p.user_id, 'project_comment', actor.user.id, p.id, id, `${actor.user.display_name || actor.user.username} commented on ${p.name}.`);
        return json(res, 201, { comment: commentRow(comment(id), actor) });
      }
    }
    match = route.match(/^\/comments\/([^/]+)\/replies$/);
    if (match && method === 'GET') {
      const parent = comment(match[1]);
      check(parent && !parent.parent_id && visible(project(parent.project_id), actor, true), 'Comment not found', 404, 'not_found');
      const { limit, offset } = pagination(url);
      const total = get('SELECT COUNT(*) n FROM comments WHERE parent_id=?', parent.id).n;
      return json(res, 200, { comments: all('SELECT * FROM comments WHERE parent_id=? ORDER BY created_at,id LIMIT ? OFFSET ?', parent.id, limit, offset).map(c => commentRow(c, actor)), total });
    }
    match = route.match(/^\/comments\/([^/]+)$/);
    if (match && ['PATCH', 'DELETE'].includes(method)) {
      const c = comment(match[1]);
      check(c && visible(project(c.project_id), actor, true), 'Comment not found', 404, 'not_found');
      check(c.user_id === actor.user.id, 'Only the author can change this comment', 403, 'forbidden');
      check(c.status === 'active', 'This comment can no longer be changed', 409, 'conflict');
      if (method === 'DELETE') {
        fields(body, []); run("UPDATE comments SET status='author_deleted',updated_at=? WHERE id=?", iso(), c.id);
        return json(res, 200, { comment: commentRow(comment(c.id), actor) });
      }
      fields(body, ['body']);
      run('UPDATE comments SET body=?,updated_at=? WHERE id=?', text(body.body, 'body', 2000, true), iso(), c.id);
      return json(res, 200, { comment: commentRow(comment(c.id), actor) });
    }
    match = route.match(/^\/comments\/([^/]+)\/report$/);
    if (match && method === 'POST') {
      const c = comment(match[1]);
      check(c && c.status === 'active' && c.user_id !== actor.user.id && visible(project(c.project_id), actor, true), 'Comment not found', 404, 'not_found');
      fields(body, ['reason']); rate('report:' + actor.user.id, 10, DAY);
      const reason = text(body.reason, 'reason', 500, true);
      const prior = get("SELECT id FROM comment_reports WHERE comment_id=? AND user_id=? AND status='open'", c.id, actor.user.id);
      const id = prior?.id || uuid();
      if (!prior) run('INSERT INTO comment_reports VALUES(?,?,?,?,?,?)', id, c.id, actor.user.id, reason, 'open', iso());
      return json(res, prior ? 200 : 201, { ok: true, id });
    }
    match = route.match(/^\/projects\/([^/]+)\/comments\/([^/]+)\/moderation$/);
    if (match && method === 'PATCH') {
      const p = project(match[1]), c = comment(match[2]);
      check(p && c && c.project_id === p.id && p.user_id === actor.user.id, 'Comment not found', 404, 'not_found');
      fields(body, ['hidden']); check(typeof body.hidden === 'boolean', 'hidden must be boolean');
      check(c.status !== 'moderator_removed' && c.status !== 'author_deleted', 'Staff or author state cannot be overridden', 409, 'conflict');
      run('UPDATE comments SET status=?,updated_at=? WHERE id=?', body.hidden ? 'owner_hidden' : 'active', iso(), c.id);
      notifyUser(c.user_id, 'content_moderated', actor.user.id, p.id, c.id, body.hidden ? `Your comment on ${p.name} was hidden by the project owner.` : `Your comment on ${p.name} was restored.`);
      return json(res, 200, { comment: commentRow(comment(c.id), actor) });
    }
    if (route === '/notifications' && method === 'GET') {
      requireAuth(actor); const { limit, offset } = pagination(url);
      const total = get('SELECT COUNT(*) n FROM notifications WHERE user_id=?', actor.user.id).n;
      const rows = all(`SELECT n.*,u.username actor_username,u.display_name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
        WHERE n.user_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT ? OFFSET ?`, actor.user.id, limit, offset);
      return json(res, 200, { notifications: rows.map(n => ({ id: n.id, type: n.type, actor: n.actor_id ? { id: n.actor_id, username: n.actor_username, displayName: n.actor_name } : null,
        projectId: n.project_id, commentId: n.comment_id, message: n.message, readAt: n.read_at, createdAt: n.created_at })), total, unread: unreadCount(actor.user.id) });
    }
    match = route.match(/^\/notifications\/([^/]+)$/);
    if (match && method === 'PATCH') {
      fields(body, ['read']); check(body.read === true, 'read must be true');
      check(run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?', iso(), match[1], actor.user.id).changes, 'Notification not found', 404, 'not_found');
      return json(res, 200, { ok: true, unread: unreadCount(actor.user.id) });
    }
    if (route === '/notifications/read-all' && method === 'POST') {
      fields(body, []); run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', iso(), actor.user.id);
      return json(res, 200, { ok: true, unread: 0 });
    }
    if (route === '/appeals/mine') {
      requireAuth(actor);
      if (method === 'GET') return json(res, 200, { appeals: all(`SELECT a.id,a.sanction_id AS sanctionId,a.message,a.status,a.created_at AS createdAt,
        a.decided_at AS decidedAt,a.decision_reason AS decisionReason,s.kind,s.reason,s.expires_at AS expiresAt
        FROM appeals a JOIN sanctions s ON s.id=a.sanction_id WHERE a.user_id=? ORDER BY a.created_at DESC`, actor.user.id) });
      if (method === 'POST') {
        fields(body, ['message']);
        const sanction = activeSanction(actor.user.id); check(sanction, 'There is no active sanction to appeal', 409, 'conflict');
        check(!get("SELECT 1 FROM appeals WHERE sanction_id=? AND status='open'", sanction.id), 'An appeal is already open', 409, 'conflict');
        const id = uuid(); run('INSERT INTO appeals (id,sanction_id,user_id,message,status,created_at) VALUES(?,?,?,?,?,?)', id, sanction.id, actor.user.id, text(body.message, 'message', 2000, true), 'open', iso());
        return json(res, 201, { ok: true, id });
      }
    }
    match = route.match(/^\/creators\/([^/]+)$/);
    if (match && method === 'GET') {
      const creator = get('SELECT * FROM users WHERE username=? AND disabled=0', match[1]);
      check(creator, 'Creator not found', 404, 'not_found');
      const where = "FROM projects WHERE user_id=? AND visibility='public' AND moderation='active'";
      const stats = get(`SELECT COUNT(*) projects, COALESCE(SUM(likes),0) likes, COALESCE(SUM(views),0) views ${where}`, creator.id);
      const items = all(`SELECT * ${where} ORDER BY created_at DESC LIMIT 100`, creator.id);
      const common = field => all(`SELECT j.value id, COUNT(*) count FROM projects p,json_each(p.${field}) j WHERE p.user_id=? AND p.visibility='public' AND p.moderation='active' GROUP BY j.value ORDER BY count DESC LIMIT 8`, creator.id);
      return json(res, 200, { creator: publicUser(creator), stats, models: common('models'), tags: common('tags'), projects: items.map(p => projectRow(p, actor)) });
    }
    if (route.startsWith('/admin/')) {
      check(isStaff(actor), 'Staff access required', 403, 'forbidden');
      if (route === '/admin/reports' && method === 'GET') {
        const { limit, offset } = pagination(url);
        return json(res, 200, { reports: all(`SELECT r.id,r.project_id AS projectId,r.user_id AS reporterId,r.reason,r.status,r.created_at AS createdAt,
          p.name AS projectName,p.user_id AS creatorId,p.moderation FROM reports r JOIN projects p ON p.id=r.project_id
          WHERE r.status='open' ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, limit, offset) });
      }
      match = route.match(/^\/admin\/reports\/([^/]+)$/);
      if (match && method === 'PATCH') {
        fields(body, ['status', 'reason']); check(['open', 'resolved'].includes(body.status), 'status must be open or resolved');
        const reason = text(body.reason, 'reason', 500, true);
        const report = get('SELECT * FROM reports WHERE id=?', match[1]); check(report, 'Report not found', 404);
        transaction(() => { run('UPDATE reports SET status=? WHERE id=?', body.status, match[1]); audit(actor, 'report', match[1], { from: report.status, to: body.status, reason }); });
        return json(res, 200, { ok: true });
      }
      match = route.match(/^\/admin\/projects\/([^/]+)$/);
      if (match && method === 'PATCH') {
        fields(body, ['featured', 'moderation', 'reason']);
        check(body.featured === undefined || typeof body.featured === 'boolean', 'featured must be boolean');
        if (body.featured !== undefined) check(isAdmin(actor), 'Only administrators can feature projects', 403, 'forbidden');
        check(body.moderation === undefined || ['active', 'hidden'].includes(body.moderation), 'Invalid moderation state');
        const reason = body.moderation === undefined ? text(body.reason, 'reason', 500) : text(body.reason, 'reason', 500, true);
        const p = project(match[1]); check(p, 'Project not found', 404, 'not_found');
        const nextFeatured = body.featured === undefined ? p.featured : Number(body.featured), nextModeration = body.moderation || p.moderation;
        transaction(() => { run('UPDATE projects SET featured=?,moderation=?,updated_at=? WHERE id=?', nextFeatured, nextModeration, iso(), p.id); audit(actor, 'project', p.id, { featured: { from: !!p.featured, to: !!nextFeatured }, moderation: { from: p.moderation, to: nextModeration }, reason }); });
        if (body.moderation !== undefined) notifyUser(p.user_id, 'content_moderated', actor.user.id, p.id, null, body.moderation === 'hidden' ? `Your project ${p.name} was hidden by Community staff.` : `Your project ${p.name} was restored by Community staff.`);
        return json(res, 200, { project: projectRow(project(p.id), actor) });
      }
      if (route === '/admin/comment-reports' && method === 'GET') {
        const { limit, offset } = pagination(url);
        return json(res, 200, { reports: all(`SELECT r.id,r.comment_id AS commentId,r.user_id AS reporterId,r.reason,r.status,r.created_at AS createdAt,
          c.project_id AS projectId,c.user_id AS authorId,c.body,c.status AS commentStatus,p.name AS projectName
          FROM comment_reports r JOIN comments c ON c.id=r.comment_id JOIN projects p ON p.id=c.project_id
          WHERE r.status='open' ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, limit, offset) });
      }
      match = route.match(/^\/admin\/comment-reports\/([^/]+)$/);
      if (match && method === 'PATCH') {
        fields(body, ['status', 'reason']); check(['open', 'resolved'].includes(body.status), 'status must be open or resolved');
        const reason = text(body.reason, 'reason', 500, true);
        const report = get('SELECT * FROM comment_reports WHERE id=?', match[1]); check(report, 'Report not found', 404, 'not_found');
        transaction(() => { run('UPDATE comment_reports SET status=? WHERE id=?', body.status, match[1]); audit(actor, 'comment_report', match[1], { from: report.status, to: body.status, reason }); });
        return json(res, 200, { ok: true });
      }
      match = route.match(/^\/admin\/comments\/([^/]+)$/);
      if (match && method === 'PATCH') {
        fields(body, ['status', 'reason']); check(['active', 'moderator_removed'].includes(body.status), 'Invalid comment moderation state');
        const reason = text(body.reason, 'reason', 500, true), c = comment(match[1]); check(c, 'Comment not found', 404, 'not_found');
        check(c.status !== 'author_deleted', 'Author-deleted comments cannot be restored', 409, 'conflict');
        transaction(() => { run('UPDATE comments SET status=?,updated_at=? WHERE id=?', body.status, iso(), c.id); audit(actor, 'comment', c.id, { from: c.status, to: body.status, reason }); });
        notifyUser(c.user_id, 'content_moderated', actor.user.id, c.project_id, c.id, body.status === 'moderator_removed' ? 'Your comment was removed by Community staff.' : 'Your comment was restored by Community staff.');
        return json(res, 200, { comment: commentRow(comment(c.id), actor) });
      }
      if (route === '/admin/accounts' && method === 'GET') {
        const query = text(url.searchParams.get('search'), 'search', 80).toLowerCase(), { limit, offset } = pagination(url);
        const pattern = `%${query}%`;
        const rows = all(`SELECT * FROM users WHERE ?='' OR lower(username) LIKE ? OR lower(display_name) LIKE ? OR lower(id) LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, query, pattern, pattern, pattern, limit, offset);
        return json(res, 200, { accounts: rows.map(u => ({ ...accountView(u), bootstrapAdmin: adminIds.has(u.id) })) });
      }
      match = route.match(/^\/admin\/accounts\/([^/]+)\/role$/);
      if (match && method === 'PATCH') {
        check(isAdmin(actor), 'Administrator access required', 403, 'forbidden');
        fields(body, ['role', 'reason']); check(['member', 'moderator', 'admin'].includes(body.role), 'Invalid role');
        const target = accountById(match[1]); canTarget(actor, target, true); const reason = text(body.reason, 'reason', 500, true);
        if (roleOf(target) === 'admin' && body.role !== 'admin') {
          const databaseAdmins = get("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").n;
          check(adminIds.size > 0 || databaseAdmins > 1, 'The final active administrator cannot be demoted', 409, 'conflict');
        }
        transaction(() => { run('UPDATE users SET role=? WHERE id=?', body.role, target.id); audit(actor, 'role', target.id, { from: roleOf(target), to: body.role, reason }); });
        notifyUser(target.id, 'role_changed', actor.user.id, null, null, `Your Community role is now ${body.role}.`);
        return json(res, 200, { account: accountView(accountById(target.id)) });
      }
      match = route.match(/^\/admin\/accounts\/([^/]+)\/(kick|timeout|ban|unban)$/);
      if (match && method === 'POST') {
        const target = accountById(match[1]); canTarget(actor, target); const operation = match[2];
        fields(body, operation === 'timeout' ? ['reason', 'expiresAt'] : ['reason']);
        const reason = text(body.reason, 'reason', 500, true), now = iso();
        let expiresAt = null;
        if (operation === 'timeout') {
          const time = Date.parse(body.expiresAt); check(Number.isFinite(time) && time > Date.now() && time <= Date.now() + 365 * DAY, 'Timeout expiry must be within the next year');
          expiresAt = new Date(time).toISOString();
        }
        const previousSanction = activeSanction(target.id);
        check(!(operation === 'timeout' && previousSanction?.kind === 'ban'), 'Lift the active ban before applying a timeout', 409, 'conflict');
        transaction(() => {
          if (operation === 'kick') {
            run('DELETE FROM sessions WHERE user_id=?', target.id); run('UPDATE tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, target.id);
          } else if (operation === 'unban') {
            run("UPDATE sanctions SET active=0,lifted_at=?,lifted_by=?,lift_reason=? WHERE user_id=? AND active=1", now, actor.user.id, reason, target.id);
            run('UPDATE users SET disabled=0 WHERE id=?', target.id);
          } else {
            const id = uuid(); run("UPDATE sanctions SET active=0,lifted_at=?,lifted_by=?,lift_reason='Replaced by newer sanction' WHERE user_id=? AND active=1", now, actor.user.id, target.id);
            run('INSERT INTO sanctions (id,user_id,kind,reason,actor_id,created_at,expires_at,active) VALUES(?,?,?,?,?,?,?,1)', id, target.id, operation, reason, actor.user.id, now, expiresAt);
            if (operation === 'ban') {
              run('UPDATE users SET disabled=1 WHERE id=?', target.id);
              run('DELETE FROM sessions WHERE user_id=?', target.id);
              run('UPDATE tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, target.id);
            }
          }
          audit(actor, operation, target.id, { from: previousSanction ? { kind: previousSanction.kind, expiresAt: previousSanction.expires_at } : null, to: operation === 'unban' || operation === 'kick' ? null : { kind: operation, expiresAt }, reason });
        });
        notifyUser(target.id, 'sanction', actor.user.id, null, null, operation === 'unban' ? 'Your Community ban or timeout was lifted.' : operation === 'kick' ? 'You were signed out of Community by staff.' : `Your Community account received a ${operation}.`);
        return json(res, 200, { ok: true, account: accountView(accountById(target.id)) });
      }
      match = route.match(/^\/admin\/accounts\/([^/]+)\/password-reset$/);
      if (match && method === 'POST') {
        check(isAdmin(actor), 'Administrator access required', 403, 'forbidden');
        const target = accountById(match[1]); canTarget(actor, target); fields(body, ['reason']); const reason = text(body.reason, 'reason', 500, true);
        const token = secret(), id = uuid(), createdAt = iso();
        transaction(() => { run('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL', createdAt, target.id);
          run('INSERT INTO password_reset_tokens VALUES(?,?,?,?,?,?,NULL)', id, target.id, hash(token), actor.user.id, createdAt, Date.now() + 60 * 60_000);
          audit(actor, 'password_reset_issued', target.id, { reason, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }); });
        notifyUser(target.id, 'password_reset_issued', actor.user.id, null, null, 'A Community administrator issued a password-reset link for your account.');
        return json(res, 201, { resetUrl: `${opts.origin}/Community/reset-password#token=${token}`, expiresAt: Date.now() + 60 * 60_000 });
      }
      if (route === '/admin/appeals' && method === 'GET') {
        check(isAdmin(actor), 'Administrator access required', 403, 'forbidden');
        const { limit, offset } = pagination(url);
        return json(res, 200, { appeals: all(`SELECT a.id,a.sanction_id AS sanctionId,a.user_id AS userId,a.message,a.status,a.created_at AS createdAt,
          s.kind,s.reason,s.expires_at AS expiresAt,u.username,u.display_name AS displayName FROM appeals a JOIN sanctions s ON s.id=a.sanction_id JOIN users u ON u.id=a.user_id
          WHERE a.status='open' ORDER BY a.created_at LIMIT ? OFFSET ?`, limit, offset) });
      }
      match = route.match(/^\/admin\/appeals\/([^/]+)$/);
      if (match && method === 'PATCH') {
        check(isAdmin(actor), 'Administrator access required', 403, 'forbidden');
        fields(body, ['status', 'reason']); check(['approved', 'denied'].includes(body.status), 'status must be approved or denied');
        const reason = text(body.reason, 'reason', 500, true), appeal = get("SELECT * FROM appeals WHERE id=? AND status='open'", match[1]); check(appeal, 'Open appeal not found', 404, 'not_found');
        const target = accountById(appeal.user_id); canTarget(actor, target); const time = iso();
        transaction(() => {
          run('UPDATE appeals SET status=?,decided_at=?,decided_by=?,decision_reason=? WHERE id=?', body.status, time, actor.user.id, reason, appeal.id);
          if (body.status === 'approved') { run('UPDATE sanctions SET active=0,lifted_at=?,lifted_by=?,lift_reason=? WHERE id=?', time, actor.user.id, reason, appeal.sanction_id); run('UPDATE users SET disabled=0 WHERE id=?', target.id); }
          audit(actor, 'appeal', appeal.id, { from: 'open', to: body.status, reason });
        });
        notifyUser(target.id, 'appeal_decided', actor.user.id, null, null, `Your Community appeal was ${body.status}.`);
        return json(res, 200, { ok: true });
      }
      if (route === '/admin/audit' && method === 'GET') {
        check(isAdmin(actor), 'Administrator access required', 403, 'forbidden'); const { limit, offset } = pagination(url);
        return json(res, 200, { entries: all('SELECT id,actor_id AS actorId,action,target_id AS targetId,details,created_at AS createdAt FROM moderation_log ORDER BY created_at DESC LIMIT ? OFFSET ?', limit, offset).map(row => ({ ...row, details: JSON.parse(row.details) })) });
      }
    }
    throw new APIError(404, 'Route not found', 'not_found');
  }
  async function handle(req, res, url) {
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return false;
    try {
      if (Date.now() - lastCleanup > 60_000) {
        lastCleanup = Date.now();
        run('DELETE FROM limits WHERE reset_at<?', Date.now());
        run('DELETE FROM sessions WHERE expires<?', Date.now());
        run('DELETE FROM view_events WHERE day<?', new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10));
        run("UPDATE sanctions SET active=0,lifted_at=COALESCE(lifted_at,?),lift_reason=COALESCE(lift_reason,'Expired') WHERE active=1 AND kind='timeout' AND expires_at<=?", iso(), iso());
        run("UPDATE appeals SET status='expired',decided_at=? WHERE status='open' AND sanction_id IN (SELECT id FROM sanctions WHERE active=0 AND lift_reason='Expired')", iso());
        run('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at<?', new Date(Date.now() - 90 * DAY).toISOString());
        run('DELETE FROM password_reset_tokens WHERE expires_at<? OR used_at IS NOT NULL', Date.now() - DAY);
      }
      return await dispatch(req, res, url);
    } catch (error) {
      const status = error instanceof APIError ? error.status : error instanceof URIError ? 400 : 500;
      return json(res, status, { error: status === 500 ? 'Community request failed' : error.message,
        code: error.code && error instanceof APIError ? error.code : status === 500 ? 'internal_error' : 'invalid_request' },
      error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    }
  }
  return { handle, close: () => { thumbnails.close(); db.close(); }, db };
}
module.exports = { createCommunity };
