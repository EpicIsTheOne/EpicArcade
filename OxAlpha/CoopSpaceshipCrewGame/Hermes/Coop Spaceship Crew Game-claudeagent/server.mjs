/*
 * ORION RUN — co-op spaceship crew game
 * Authoritative multiplayer server (platform-loaded module).
 *
 * Contract: ESM, Node builtins only, no listen(), no spawned processes.
 * Default export: { maxSockets, tickMs, create(ctx) -> { open, message, close, tick, stop } }
 *
 * Endpoint slug (must match arcade.json): coop-spaceship-crew-game
 */

const TICK_MS = 100;
const DT = TICK_MS / 1000;
const MAX_PLAYERS = 4;
const SECTORS = 5;

/* ------------------------------------------------------------------ */
/* Shared ship map — KEEP IN SYNC with js/world.js on the client      */
/* ------------------------------------------------------------------ */
const TILE = 32;
const MAPW = 36, MAPH = 20;

// [x0,y0,x1,y1] inclusive tile rects
const ROOMS = [
  { id: 'bridge',  name: 'Bridge',       r: [27, 7, 33, 12], hue: 205 },
  { id: 'weapons', name: 'Weapon Bay',   r: [21, 2, 26, 6],  hue: 0 },
  { id: 'shields', name: 'Shield Bay',   r: [21, 13, 26, 17], hue: 190 },
  { id: 'eng',     name: 'Engineering',  r: [3, 7, 10, 12],  hue: 35 },
  { id: 'eroom',   name: 'Engine Room',  r: [3, 14, 10, 17], hue: 35 },
  { id: 'life',    name: 'Life Support', r: [14, 13, 19, 17], hue: 120 },
  { id: 'med',     name: 'Medbay',       r: [13, 2, 17, 6],  hue: 320 },
];
const HALLS = [
  [10, 9, 27, 10],  // spine
  [14, 6, 15, 8],   // medbay link
  [22, 6, 23, 8],   // weapons link
  [22, 11, 23, 12], // shield link
  [15, 11, 16, 12], // life link
  [7, 11, 8, 13],   // engineering <-> engine room
];

const CONSOLES = {
  helm:    { x: 32.5, y: 9.5, label: 'Helm' },
  weapons: { x: 22.5, y: 3.5, label: 'Weapons' },
  shields: { x: 25.5, y: 15.5, label: 'Shields' },
  power:   { x: 4.5, y: 8.5, label: 'Power Grid' },
};

// Repairable machinery nodes
const NODES = {
  engines: { x: 6.5,  y: 15.5, sys: 'engines' },
  shields: { x: 24.5, y: 16.5, sys: 'shields' },
  weapons: { x: 24.5, y: 3.5,  sys: 'weapons' },
  life:    { x: 17.5, y: 15.5, sys: 'life' },
  aux:     { x: 12.0, y: 9.5,  sys: 'aux' },
  reactor: { x: 6.5,  y: 10.5, sys: 'reactor' },
};

const MEDBEDS = [[14, 3], [16, 3]];
const SYS_IDS = ['engines', 'shields', 'weapons', 'life', 'aux'];
const SYS_NAMES = { engines: 'Engines', shields: 'Shields', weapons: 'Weapons', life: 'Life Support', aux: 'Auxiliary', reactor: 'Reactor' };

function walkTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return false;
  for (const rm of ROOMS) {
    const r = rm.r;
    if (tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]) return true;
  }
  for (const h of HALLS) {
    if (tx >= h[0] && tx <= h[2] && ty >= h[1] && ty <= h[3]) return true;
  }
  return false;
}
// Precompute walkable set + fire-spread adjacency
const WALK_SET = new Set();
for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) if (walkTile(x, y)) WALK_SET.add(y * MAPW + x);
const ADJ = new Map();
for (const k of WALK_SET) {
  const x = k % MAPW, y = (k / MAPW) | 0;
  const n = [];
  if (WALK_SET.has(k - MAPW)) n.push(k - MAPW);
  if (WALK_SET.has(k + MAPW)) n.push(k + MAPW);
  if (WALK_SET.has(k - 1)) n.push(k - 1);
  if (WALK_SET.has(k + 1)) n.push(k + 1);
  ADJ.set(k, n);
}
const WALK_LIST = [...WALK_SET];
function roomOf(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (const rm of ROOMS) {
    const r = rm.r;
    if (tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]) return rm.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let rngSeedCounter = 1;
function makeRng(seed) {
  let s = seed >>> 0 || (rngSeedCounter++ * 2654435761) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(existing) {
  for (let tries = 0; tries < 50; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!existing.has(c)) return c;
  }
  return 'R' + String(Date.now() % 10000);
}
const COLORS = ['#ff5f56', '#4fc3ff', '#ffd166', '#7dffa8'];
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/* ------------------------------------------------------------------ */
/* Simulation                                                         */
/* ------------------------------------------------------------------ */

function freshState(seed) {
  const st = {
    tm: 0,
    phase: 'play',           // play | over
    win: false,
    sector: 1,
    hull: 100,
    o2: 100,
    jump: { charge: 0, ready: false, active: false, t: 0, autoT: 0 },
    ship: { x: 0, vx: 0 },   // x = lateral lane offset (-1.7..1.7), px = *600
    reactor: { hp: 100, surge: false, surgeT: 0 },
    pow: { engines: 2, shields: 2, weapons: 2, life: 1, aux: 1 },
    cap: 8,
    sys: {},
    sh: [100, 100, 100, 100], // facings: 0 front,1 top,2 bottom,3 rear
    rf: -1,                   // shield facing reinforced by shields station
    shHitTm: [0, 0, 0, 0],
    fires: {},                // tileKey -> remaining burn hp
    brch: [],                 // array of tileKeys
    foes: [],
    rocks: [],
    shots: [],
    dir: { q: [], t: 0, cleared: false, announcedJump: false },
    stats: { kills: 0, firesOut: 0, repairs: 0, jumps: 0, breachesSealed: 0 },
    nextId: 1,
  };
  for (const id of SYS_IDS) st.sys[id] = { hp: 100 };
  void seed;
  return st;
}

function capacity(st) {
  const base = 8 * clamp(st.reactor.hp / 100, 0.25, 1);
  const surgeMul = st.reactor.surge ? 0.45 : 1;
  return Math.max(3, Math.round(base * surgeMul));
}

// Trim allocations when capacity drops
function enforceCap(st) {
  let total = 0;
  for (const id of SYS_IDS) total += st.pow[id];
  let cap = capacity(st);
  st.cap = cap;
  while (total > cap) {
    let maxId = null, maxV = -1;
    for (const id of SYS_IDS) if (st.pow[id] > maxV) { maxV = st.pow[id]; maxId = id; }
    if (!maxId || maxV <= 0) break;
    st.pow[maxId]--; total--;
  }
}

function sysEff(st, id) {
  const hp = st.sys[id].hp;
  const hpF = hp > 50 ? 1 : hp > 25 ? 0.5 : 0;
  return (st.pow[id] / 3) * hpF;
}

function sectorName(n) {
  return ['The Shallows', 'The Toll Booth', 'Debris Field', 'The Ambush', 'Final Sprint'][n - 1] || 'Deep Void';
}

function buildDirector(room) {
  const st = room.st;
  const rng = room.rng;
  const q = [];
  const push = (at, fn) => q.push({ at, fn });
  const s = st.sector;

  // Asteroid waves for everyone; density scales
  const rocks = s === 1 ? 3 : s === 2 ? 2 : s === 3 ? 7 : s === 4 ? 3 : 6;
  const rockSpan = s === 3 ? 55 : 40;
  for (let i = 0; i < rocks; i++) {
    push(6 + (rockSpan * i) / Math.max(1, rocks), () => spawnRockWave(room, s));
  }

  if (s === 1) {
    push(18, () => { ignite(room, pickRoomTile(room, 'eroom')); ev(room, 'alert', 'Fire in the Engine Room!'); ev(room, 'sfx', 'alarm'); });
    push(40, () => ev(room, 'log', 'Scanners clear. Keep an eye on the hull.', 'good'));
  } else if (s === 2) {
    push(12, () => { spawnFoe(room); ev(room, 'alert', 'Hostile fighter approaching!'); ev(room, 'sfx', 'alarm'); });
    push(34, () => { ignite(room, pickRandomWalkTile(room)); ev(room, 'alert', 'Electrical fire reported!'); ev(room, 'sfx', 'alarm'); });
    push(48, () => spawnFoe(room));
  } else if (s === 3) {
    push(14, () => { reactorSurge(room); });
    push(30, () => { ignite(room, pickRoomTile(room, 'eng')); ev(room, 'alert', 'Fire in Engineering!'); ev(room, 'sfx', 'alarm'); });
    push(44, () => { breach(room); ev(room, 'alert', 'Hull breach! Seal it!'); ev(room, 'sfx', 'alarm'); });
    push(58, () => { ignite(room, pickRandomWalkTile(room)); });
  } else if (s === 4) {
    push(8,  () => { spawnFoe(room); ev(room, 'alert', 'Ambush! Fighters on the scope!'); ev(room, 'sfx', 'alarm'); });
    push(20, () => spawnFoe(room));
    push(30, () => { reactorSurge(room); });
    push(42, () => { ignite(room, pickRoomTile(room, 'shields')); ev(room, 'alert', 'Shield Bay on fire!'); ev(room, 'sfx', 'alarm'); });
    push(52, () => { breach(room); ev(room, 'alert', 'Hull breach! Seal it!'); ev(room, 'sfx', 'alarm'); });
    push(64, () => spawnFoe(room));
  } else if (s === 5) {
    push(6,  () => { spawnFoe(room); spawnFoe(room); ev(room, 'alert', 'Multiple hostiles — final stand!'); ev(room, 'sfx', 'alarm'); });
    push(22, () => spawnRockWave(room, 5));
    push(30, () => { breach(room); });
    push(38, () => { ignite(room, pickRandomWalkTile(room)); });
    push(46, () => spawnFoe(room));
    push(58, () => { reactorSurge(room); });
  }
  q.sort((a, b) => a.at - b.at);
  st.dir.q = q;
  st.dir.t = 0;
  st.dir.cleared = false;
  st.dir.announcedJump = false;
  ev(room, 'log', `Entering Sector ${s} — ${sectorName(s)}.`, 'info');
  ev(room, 'sfx', 'jump');
}

function pickRandomWalkTile(room) {
  const st = room.st;
  for (let i = 0; i < 30; i++) {
    const k = WALK_LIST[(room.rng() * WALK_LIST.length) | 0];
    if (!(k in st.fires)) return k;
  }
  return WALK_LIST[0];
}
function pickRoomTile(room, roomId) {
  const rm = ROOMS.find(r => r.id === roomId);
  const r = rm.r;
  for (let i = 0; i < 30; i++) {
    const tx = r[0] + ((room.rng() * (r[2] - r[0] + 1)) | 0);
    const ty = r[1] + ((room.rng() * (r[3] - r[1] + 1)) | 0);
    const k = ty * MAPW + tx;
    if (WALK_SET.has(k)) return k;
  }
  return r[1] * MAPW + r[0];
}

function ignite(room, k) {
  const st = room.st;
  if (Object.keys(st.fires).length >= 14) return;
  st.fires[k] = { hp: 7 };
}
function breach(room) {
  const st = room.st;
  if (st.brch.length >= 5) return;
  const k = pickRandomWalkTile(room);
  if (!st.brch.includes(k)) st.brch.push(k);
}
function reactorSurge(room) {
  const st = room.st;
  if (st.reactor.surge) return;
  st.reactor.surge = true;
  st.reactor.surgeT = 12;
  enforceCap(st);
  ev(room, 'alert', 'REACTOR SURGE — stabilize at the reactor!');
  ev(room, 'sfx', 'alarm');
  room.shake = Math.max(room.shake || 0, 6);
}

function spawnRockWave(room, s) {
  const st = room.st;
  const n = 1 + ((room.rng() * (s >= 3 ? 3 : 2)) | 0);
  for (let i = 0; i < n; i++) {
    st.rocks.push({
      id: st.nextId++,
      x: -900 + room.rng() * 1800,
      y: -1500 - room.rng() * 700,
      vy: 200 + room.rng() * 90 + s * 14,
      vx: (room.rng() - 0.5) * 60,
      r: 26 + room.rng() * 40,
      rot: room.rng() * 6.28,
      vr: (room.rng() - 0.5) * 2,
      dmg: 7 + room.rng() * 6,
    });
  }
}

function spawnFoe(room) {
  const st = room.st;
  if (st.foes.length >= 3) return;
  const side = room.rng() < 0.5 ? -1 : 1;
  st.foes.push({
    id: st.nextId++,
    cls: 'fighter',
    x: side > 0 ? 1250 : -1250,
    y: -500 + room.rng() * 1000,
    vx: 0, vy: 0,
    hp: 30 + st.sector * 6,
    mhp: 30 + st.sector * 6,
    cd: 2.5 + room.rng() * 2,
    tel: 0,
    side,
  });
  ev(room, 'log', 'Enemy fighter on intercept course.', 'bad');
}

function fireShot(room, x, y, vx, vy, team, dmg) {
  const st = room.st;
  st.shots.push({ id: st.nextId++, x, y, vx, vy, team, dmg, life: 4 });
  if (st.shots.length > 60) st.shots.splice(0, st.shots.length - 60);
}

function ev(room, kind, a, b) {
  room.evq.push({ kind, a, b });
  if (room.evq.length > 30) room.evq.shift();
}

function damageHull(room, dmg, impactX) {
  const st = room.st;
  if (st.phase !== 'play') return;
  st.hull -= dmg;
  room.shake = Math.max(room.shake || 0, Math.min(10, 3 + dmg * 0.4));
  ev(room, 'sfx', 'hit');
  const r = room.rng();
  if (r < 0.30 && st.brch.length < 5) {
    breach(room); ev(room, 'alert', 'Hull breach!');
  }
  if (room.rng() < 0.22) {
    ignite(room, pickRandomWalkTile(room)); ev(room, 'alert', 'Fire aboard!');
    ev(room, 'sfx', 'alarm');
  }
  if (st.hull <= 0) endGame(room, false, 'The ship was destroyed.');
  void impactX;
}

function endGame(room, win, reason) {
  const st = room.st;
  if (st.phase === 'over') return;
  st.phase = 'over';
  st.win = win;
  room.overTm = 0;
  ev(room, 'end', { win, reason, stats: st.stats, sectors: SECTORS });
  ev(room, 'sfx', win ? 'win' : 'lose');
}

/* ---------------------------- main tick ---------------------------- */

function tickRoom(room, now) {
  const st = room.st;
  const dt = DT;

  // Lobby rooms: nothing to simulate
  if (room.phase === 'lobby') return;

  // Pause while every human is disconnected (awaiting rejoin)
  const anyConnected = [...room.players.values()].some(p => p.connected);
  if (!anyConnected) { room.paused = true; return; }
  room.paused = false;

  if (st.phase === 'over') { room.overTm = (room.overTm || 0) + dt; return; }

  st.tm += dt;

  /* ---- director ---- */
  const dir = st.dir;
  dir.t += dt;
  while (dir.q.length && dir.q[0].at <= dir.t) dir.q.shift().fn(room);

  /* ---- jump sequencing ---- */
  const threats =
    st.foes.length + st.rocks.filter(r => r.y < 520).length +
    Object.keys(st.fires).length + st.brch.length +
    (dir.q.length ? 1 : 0);
  if (!dir.cleared && dir.q.length === 0 && threats === 0 && !st.jump.active) {
    dir.cleared = true;
    st.jump.ready = false;
    st.jump.charge = 0;
    ev(room, 'alert', `Sector ${st.sector} clear — jump drive charging`);
    ev(room, 'sfx', 'ready');
  }
  if (dir.cleared && !st.jump.active) {
    const rate = 0.09 * (0.55 + 0.75 * sysEff(st, 'engines'));
    st.jump.charge = Math.min(1, st.jump.charge + rate * dt);
    if (st.jump.charge >= 1 && !st.jump.ready) {
      st.jump.ready = true;
      st.jump.autoT = 12;
      ev(room, 'alert', 'JUMP READY — pilot: hold position & jump!');
      ev(room, 'sfx', 'ready');
    }
    if (st.jump.ready) {
      st.jump.autoT -= dt;
      if (st.jump.autoT <= 0) startJump(room);
    }
  }
  if (st.jump.active) {
    st.jump.t -= dt;
    if (st.jump.t <= 0) finishJump(room);
  }

  /* ---- power / systems ---- */
  enforceCap(st);
  if (st.reactor.surge) {
    st.reactor.surgeT -= dt;
    if (st.reactor.surgeT <= 0) {
      st.reactor.surge = false;
      st.reactor.hp = Math.max(10, st.reactor.hp - 8);
      enforceCap(st);
      ev(room, 'log', 'Reactor surge subsided (took damage).', 'bad');
    }
  }

  /* ---- fires ---- */
  let fireCount = 0;
  for (const k of Object.keys(st.fires)) {
    const f = st.fires[k];
    f.hp -= dt * (0.12); // natural decay is slow; mostly needs crew
    fireCount++;
    const tx = (+k) % MAPW, ty = (+k / MAPW) | 0;
    // burn system nodes in this tile's room
    for (const nid in NODES) {
      const n = NODES[nid];
      if (Math.abs(n.x - (tx + 0.5)) < 1.2 && Math.abs(n.y - (ty + 0.5)) < 1.2) {
        if (nid === 'reactor') st.reactor.hp = Math.max(0, st.reactor.hp - dt * 1.6);
        else st.sys[n.sys].hp = Math.max(0, st.sys[n.sys].hp - dt * 2.2);
      }
    }
    // hurt crew standing in fire
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
      if (ptx === tx && pty === ty && !(p.chan && p.chan.kind === 'extinguish')) {
        p.hp -= dt * 7;
        if (p.hp <= 0) knockOut(room, p, 'burned');
      }
    }
    if (f.hp <= 0) {
      delete st.fires[k];
      st.stats.firesOut++;
      ev(room, 'log', 'Fire extinguished.', 'good');
    }
  }
  // spread
  if (fireCount > 0 && (st.tm % 4) < dt) {
    const keys = Object.keys(st.fires);
    const k = keys[(room.rng() * keys.length) | 0];
    if (k !== undefined && room.rng() < 0.45 && Object.keys(st.fires).length < 14) {
      const adj = ADJ.get(+k) || [];
      if (adj.length) {
        const nk = adj[(room.rng() * adj.length) | 0];
        if (!(nk in st.fires)) st.fires[nk] = { hp: 7 };
      }
    }
  }

  /* ---- breaches / oxygen ---- */
  const drain = st.brch.length * 0.55 + fireCount * 0.06;
  const regen = 2.2 * (0.25 + sysEff(st, 'life'));
  st.o2 = clamp(st.o2 + (regen - drain) * dt, 0, 100);
  if (st.o2 < 22) {
    for (const p of room.players.values()) {
      if (!p.connected || p.down) continue;
      p.hp -= dt * (22 - st.o2) * 0.055;
      if (p.hp <= 0) knockOut(room, p, 'suffocated');
    }
    if (st.o2 <= 0.5 && (st.tm % 5) < dt) ev(room, 'alert', 'OXYGEN CRITICAL');
  }

  /* ---- shields regen ---- */
  const anyShieldOfficer = room.st ? [...room.players.values()].some(p => p.connected && !p.down && p.station === 'shields') : false;
  if (!anyShieldOfficer) st.rf = -1;
  for (let i = 0; i < 4; i++) {
    if (st.tm - st.shHitTm[i] > 3 && st.sys.shields.hp > 0) {
      const boost = i === st.rf ? 2 : 1;
      st.sh[i] = Math.min(100, st.sh[i] + dt * 6 * boost * (0.3 + sysEff(st, 'shields')) * (anyShieldOfficer ? 1.35 : 1));
    }
  }

  /* ---- crew regen / down recovery ---- */
  for (const p of room.players.values()) {
    if (!p.connected) continue;
    if (p.down) {
      p.downT -= dt;
      if (p.downT <= 0 && st.o2 > 25) {
        p.down = false; p.hp = 35;
        ev(room, 'log', `${p.name} is back on their feet.`, 'good');
      }
    } else {
      const r = roomOf(p.x, p.y);
      if (r === 'med' && st.o2 > 40) p.hp = Math.min(100, p.hp + dt * 3.5);
      else if (st.o2 > 50) p.hp = Math.min(100, p.hp + dt * 0.6);
    }
  }

  /* ---- channels (extinguish / repair / seal / stabilize / revive) ---- */
  tickChannels(room, dt);

  /* ---- rocks ---- */
  const shipPx = st.ship.x * 600;
  for (let i = st.rocks.length - 1; i >= 0; i--) {
    const rk = st.rocks[i];
    rk.y += rk.vy * dt; rk.x += rk.vx * dt; rk.rot += rk.vr * dt;
    if (rk.y > 380 && rk.y < 480 && !rk.hitDone) {
      if (Math.abs(rk.x - shipPx) < rk.r + 300) {
        rk.hitDone = true;
        damageHull(room, rk.dmg, rk.x);
        ev(room, 'shake', 8);
      }
    }
    if (rk.y > 1700) st.rocks.splice(i, 1);
  }

  /* ---- foes AI ---- */
  for (const foe of st.foes) {
    // orbit at range
    const wantX = 820 * foe.side;
    const wantY = Math.sin(st.tm * 0.5 + foe.id) * 420;
    foe.x += (wantX - foe.x) * dt * 0.8;
    foe.y += (wantY - foe.y) * dt * 1.1;
    foe.cd -= dt;
    if (foe.tel > 0) {
      foe.tel -= dt;
      if (foe.tel <= 0) {
        // volley
        const shotsN = st.sector >= 4 ? 3 : 2;
        for (let i = 0; i < shotsN; i++) {
          const sx = foe.x, sy = foe.y + (i - (shotsN - 1) / 2) * 40;
          const dx = -sx, dy = -sy + (room.rng() - 0.5) * 160;
          const l = Math.hypot(dx, dy) || 1;
          fireShot(room, sx, sy, (dx / l) * 560, (dy / l) * 560, 'them', 5 + st.sector);
        }
        ev(room, 'sfx', 'eshot');
      }
    } else if (foe.cd <= 0 && st.phase === 'play' && !st.jump.active) {
      foe.cd = 4.6 - st.sector * 0.25 + room.rng();
      foe.tel = 0.85;
      ev(room, 'log', 'Enemy weapons charging!', 'warn');
    }
  }

  /* ---- our shots ---- */
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0) { st.shots.splice(i, 1); continue; }
    if (s.team === 'us') {
      let hit = false;
      for (const foe of st.foes) {
        if (dist(s.x, s.y, foe.x, foe.y) < 46) {
          foe.hp -= s.dmg; hit = true;
          ev(room, 'sfx', 'thit');
          break;
        }
      }
      if (hit) st.shots.splice(i, 1);
    } else {
      if (Math.abs(s.x) < 620 && Math.abs(s.y) < 360) {
        st.shots.splice(i, 1);
        const facing = s.vx < 0 ? 0 : (s.vy < 0 ? 1 : (s.vy > 0 ? 2 : 3));
        takeHit(room, facing, s.dmg);
      }
    }
  }

  // dead foes
  for (let i = st.foes.length - 1; i >= 0; i--) {
    if (st.foes[i].hp <= 0) {
      st.foes.splice(i, 1);
      st.stats.kills++;
      ev(room, 'log', 'Hostile destroyed!', 'good');
      ev(room, 'sfx', 'boom');
    }
  }

  /* ---- ship steering physics (helm input applied via actions) ---- */
  st.ship.x += st.ship.vx * dt;
  st.ship.vx *= Math.pow(0.06, dt); // damp
  st.ship.x = clamp(st.ship.x, -1.55, 1.55);

  /* ---- loss checks ---- */
  const alive = [...room.players.values()].filter(p => p.connected);
  if (alive.length && alive.every(p => p.down)) {
    room.allDownT = (room.allDownT || 0) + dt;
    if (room.allDownT > 6) endGame(room, false, 'Entire crew incapacitated.');
  } else room.allDownT = 0;
}

function takeHit(room, facing, dmg) {
  const st = room.st;
  st.shHitTm[facing] = st.tm;
  if (facing === st.rf) dmg *= 0.5;
  if (st.sh[facing] > 0 && st.sys.shields.hp > 0) {
    st.sh[facing] -= dmg * 1.4;
    if (st.sh[facing] < 0) {
      damageHull(room, -st.sh[facing] * 0.7);
      st.sh[facing] = 0;
    } else {
      ev(room, 'sfx', 'shieldhit');
    }
  } else {
    damageHull(room, dmg);
  }
}

function knockOut(room, p) {
  if (p.down) return;
  p.down = true;
  p.downT = 28;
  p.chan = null;
  if (p.station) releaseStation(room, p);
  ev(room, 'log', `${p.name} is down! Drag them to Medbay or hold E nearby to revive.`, 'bad');
  ev(room, 'sfx', 'down');
}

function startJump(room) {
  const st = room.st;
  st.jump.active = true;
  st.jump.t = 3.2;
  st.jump.ready = false;
  ev(room, 'sfx', 'jump');
  ev(room, 'shake', 5);
  ev(room, 'log', 'Jumping…', 'info');
}

function finishJump(room) {
  const st = room.st;
  st.jump.active = false;
  st.jump.charge = 0;
  st.stats.jumps++;
  st.rocks.length = 0;
  st.shots.length = 0;
  st.foes.length = 0;
  st.hull = Math.min(100, st.hull + 4);
  if (st.sector >= SECTORS) {
    endGame(room, true, 'Delivered the cargo to Orion Gate.');
    return;
  }
  st.sector++;
  st.dir.cleared = false;
  buildDirector(room);
}

/* ------------------------- channels/actions ------------------------ */

function chanTargetPos(kind, target) {
  if (kind === 'extinguish') { const tx = (+target) % MAPW, ty = (+target / MAPW) | 0; return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
  if (kind === 'seal') { const tx = (+target) % MAPW, ty = (+target / MAPW) | 0; return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
  if (kind === 'repair') { const n = NODES[target]; return n ? { x: n.x * TILE, y: n.y * TILE } : null; }
  if (kind === 'stabilize') { const n = NODES.reactor; return { x: n.x * TILE, y: n.y * TILE }; }
  if (kind === 'revive') return target; // {x,y} of downed ally
  return null;
}

function tickChannels(room, dt) {
  const st = room.st;
  for (const p of room.players.values()) {
    const ch = p.chan;
    if (!ch || !p.connected || p.down) continue;
    const pos = chanTargetPos(ch.kind, ch.target);
    if (!pos) { p.chan = null; continue; }
    // validate proximity
    if (dist(p.x, p.y, pos.x, pos.y) > TILE * 1.9) { p.chan = null; continue; }
    // validate still relevant
    if (ch.kind === 'extinguish' && !st.fires[ch.target]) { p.chan = null; continue; }
    if (ch.kind === 'seal' && !st.brch.includes(ch.target)) { p.chan = null; continue; }
    if (ch.kind === 'revive' && !(ch.pRef && ch.pRef.down)) { p.chan = null; continue; }

    if (ch.kind === 'extinguish') {
      const f = st.fires[ch.target];
      f.hp -= dt * (2.6 + 0.9 * st.pow.aux);
      // small o2 cost
      st.o2 = Math.max(0, st.o2 - dt * 0.15);
    } else if (ch.kind === 'seal') {
      const i = st.brch.indexOf(ch.target);
      ch.prog = (ch.prog || 0) + dt * (0.5 + 0.22 * st.pow.aux) * (st.o2 > 15 ? 1 : 0.5);
      if (ch.prog >= 1) {
        st.brch.splice(i, 1);
        st.stats.breachesSealed++;
        ev(room, 'log', 'Breach sealed.', 'good');
        ev(room, 'sfx', 'fix');
        p.chan = null;
      }
    } else if (ch.kind === 'repair') {
      const tgt = ch.target === 'reactor' ? st.reactor : st.sys[ch.target === 'aux' ? 'aux' : ch.target];
      if (!tgt) { p.chan = null; continue; }
      const before = tgt.hp;
      tgt.hp = Math.min(100, tgt.hp + dt * (4.5 + 1.6 * st.pow.aux));
      if (before < 100 && tgt.hp >= 100) {
        st.stats.repairs++;
        ev(room, 'log', `${SYS_NAMES[ch.target]} fully repaired.`, 'good');
        ev(room, 'sfx', 'fix');
      }
    } else if (ch.kind === 'stabilize') {
      ch.prog = (ch.prog || 0) + dt / 2.6;
      if (ch.prog >= 1) {
        st.reactor.surge = false;
        st.reactor.surgeT = 0;
        enforceCap(st);
        ev(room, 'log', 'Reactor stabilized. Nice work!', 'good');
        ev(room, 'sfx', 'fix');
        p.chan = null;
      }
    } else if (ch.kind === 'revive') {
      ch.prog = (ch.prog || 0) + dt / 2.6;
      if (ch.prog >= 1) {
        ch.pRef.down = false;
        ch.pRef.hp = 40;
        ev(room, 'log', `${ch.pRef.name} revived!`, 'good');
        ev(room, 'sfx', 'fix');
        p.chan = null;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rooms & connections                                                */
/* ------------------------------------------------------------------ */

function makePlayer(ws, msg) {
  const ci = Number.isInteger(msg.ci) ? clamp(msg.ci, 0, 3) : (Math.random() * 4) | 0;
  const nm = String(msg.name || '').replace(/[^\w \-'.]/g, '').slice(0, 14) || 'Crew';
  return {
    pid: String(msg.pid || ('anon-' + Math.random().toString(36).slice(2))).slice(0, 40),
    id: null,
    ws,
    name: nm,
    ci,
    x: 8 * TILE, y: 10 * TILE,
    fx: 1, fy: 0,
    hp: 100, down: false, downT: 0,
    station: null,
    chan: null,
    ready: false,
    connected: true,
    emote: null, emoteT: 0,
    helmIn: { kx: 0, ky: 0 },
    lastMsgT: Date.now(),
  };
}

function broadcast(room, obj, exceptWs) {
  const data = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws && p.ws !== exceptWs && p.connected) {
      try { p.ws.send(data); } catch { /* ignore */ }
    }
  }
}

function lobbyPayload(room) {
  const players = [];
  for (const p of room.players.values()) {
    players.push({ pid: p.pid, name: p.name, ci: p.ci, ready: p.ready, connected: p.connected });
  }
  return { t: 'lobby', code: room.code, hostPid: room.hostPid, phase: room.phase, players };
}

function snapshotFor(room) {
  const st = room.st;
  const players = [];
  for (const p of room.players.values()) {
    players.push({
      pid: p.pid, name: p.name, ci: p.ci,
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      fx: p.fx, fy: p.fy, hp: Math.round(p.hp), down: p.down,
      station: p.station, chan: p.chan ? p.chan.kind : null,
      emote: p.emote, connected: p.connected,
    });
  }
  const out = {
    tm: Math.round(st.tm * 100) / 100,
    phase: st.phase, win: st.win,
    sector: st.sector, sectors: SECTORS, sectorName: sectorName(st.sector),
    hull: Math.round(st.hull * 10) / 10, o2: Math.round(st.o2 * 10) / 10,
    jump: { c: Math.round(st.jump.charge * 100) / 100, ready: st.jump.ready, active: st.jump.active, autoT: Math.round((st.jump.autoT || 0) * 10) / 10 },
    ship: { x: Math.round(st.ship.x * 1000) / 1000 },
    reactor: { hp: Math.round(st.reactor.hp), surge: st.reactor.surge, surgeT: Math.round(st.reactor.surgeT * 10) / 10 },
    pow: st.pow, cap: st.cap, rf: st.rf,
    sys: {}, sh: st.sh.map(v => Math.round(v)),
    fires: st.fires,
    brch: st.brch,
    cleared: st.dir.cleared,
    stats: st.stats,
  };
  for (const id of SYS_IDS) out.sys[id] = { hp: Math.round(st.sys[id].hp) };
  out.foes = st.foes.map(f => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), hp: Math.round(f.hp), mhp: f.mhp, tel: f.tel > 0 }));
  out.rocks = st.rocks.map(r => ({ id: r.id, x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.r), rot: Math.round(r.rot * 100) / 100 }));
  out.shots = st.shots.map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), team: s.team }));
  out.players = players;
  out.hostPid = room.hostPid;
  out.code = room.code;
  return out;
}

function fullState(room, you) {
  return {
    t: 'welcome',
    you: you.pid,
    mapMeta: { TILE, MAPW, MAPH },
    sectorsTotal: SECTORS,
    colors: COLORS,
    st: snapshotFor(room),
  };
}

function releaseStation(room, p) {
  if (p.station) { p.station = null; }
  if (p.chan) p.chan = null;
  void room;
}

function trySetStation(room, p, stationId) {
  if (room.phase !== 'play') return;
  if (stationId === null) { releaseStation(room, p); return; }
  const con = CONSOLES[stationId];
  if (!con) return;
  if (dist(p.x, p.y, con.x * TILE, con.y * TILE) > TILE * 2.1) return;
  for (const other of room.players.values()) {
    if (other !== p && other.station === stationId && other.connected && !other.down) return;
  }
  p.station = stationId;
  p.chan = null;
  evTo(room, p, 'sfx', 'console');
}

function evTo(room, p, kind, a, b) {
  try { p.ws.send(JSON.stringify({ t: 'ev', list: [{ kind, a, b }] })); } catch { }
}

/* ------------------------------------------------------------------ */
/* Module export                                                      */
/* ------------------------------------------------------------------ */

export default {
  maxSockets: 64,
  tickMs: TICK_MS,

  create(_ctx) {
    const rooms = new Map();     // code -> room
    const wsRoom = new Map();    // ws.id -> room

    function getOrCreateRoom(codeRaw) {
      const code = String(codeRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!code) return null;
      let room = rooms.get(code);
      if (!room) {
        room = {
          code,
          phase: 'lobby',
          hostPid: null,
          players: new Map(),
          st: null,
          rng: makeRng((Math.random() * 0xffffffff) >>> 0),
          evq: [],
          shake: 0,
          emptySince: Date.now(),
          lastSnap: 0,
        };
        rooms.set(code, room);
      }
      return room;
    }

    function joinRoom(ws, meta, codeRaw) {
      const room = getOrCreateRoom(codeRaw);
      if (!room) { send(ws, { t: 'err', code: 'badcode', msg: 'Enter a 4-character crew code.' }); return; }

      // Reconnect: same pid already in room?
      let p = room.players.get(meta.pid);
      if (p) {
        if (p.connected && p.ws && p.ws !== ws && p.ws.readyState !== 3) {
          send(ws, { t: 'err', code: 'dup', msg: 'This crew slot is already connected.' });
          return;
        }
        // restore slot
        p.ws = ws; p.connected = true; p.name = meta.name || p.name; p.ci = meta.ci ?? p.ci;
        p.lastMsgT = Date.now();
      } else {
        if (room.players.size >= MAX_PLAYERS) {
          send(ws, { t: 'err', code: 'full', msg: 'Crew is full (4 max).' });
          return;
        }
        p = makePlayer(ws, meta);
        room.players.set(p.pid, p);
      }
      if (!room.hostPid) room.hostPid = p.pid;
      wsRoom.set(wsId(ws), room);

      if (room.phase === 'lobby') {
        send(ws, {
          t: 'welcome', you: p.pid,
          mapMeta: { TILE, MAPW, MAPH },
          sectorsTotal: SECTORS,
          colors: COLORS,
          st: null,
        });
        broadcast(room, lobbyPayload(room), ws);
        send(ws, lobbyPayload(room));
      } else {
        send(ws, fullState(room, p));
        evTo(room, p, 'log', `${p.name} reconnected.`, 'good');
      }
      log(`room ${room.code}: ${p.name} joined (${room.players.size} crew)`);
    }

    function leave(ws) {
      const room = wsRoom.get(wsId(ws));
      if (!room) return;
      wsRoom.delete(wsId(ws));
      const me = [...room.players.values()].find(p => p.ws === ws);
      if (!me) return;
      me.connected = false;
      me.ready = false;
      releaseStation(room, me);
      if (room.phase === 'lobby') {
        // drop lobby leavers quickly unless room has others
        broadcast(room, lobbyPayload(room));
      } else {
        broadcast(room, { t: 'ev', list: [{ kind: 'log', a: `${me.name} lost signal (can reconnect).`, b: 'warn' }] });
      }
      log(`room ${room.code}: ${me.name} disconnected`);
    }

    function startGame(room, by) {
      if (room.hostPid !== by.pid) { evTo(room, by, 'log', 'Only the captain can launch.', 'warn'); return; }
      if (room.phase !== 'lobby') return;
      for (const p of room.players.values()) {
        if (!p.ready && p.connected) { evTo(room, by, 'log', 'Not everyone is ready.', 'warn'); return; }
      }
      room.phase = 'play';
      room.st = freshState(0);
      room.wTarget = null;
      room.overTm = 0;
      let i = 0;
      for (const p of room.players.values()) {
        p.x = (8 + i * 1.5) * TILE; p.y = 10 * TILE;
        p.hp = 100; p.down = false; p.station = null; p.chan = null; p.ready = true;
        i++;
      }
      buildDirector(room);
      broadcast(room, { t: 'start', st: snapshotFor(room) });
      log(`room ${room.code}: mission started (${room.players.size} crew)`);
    }

    function handleMessage(ws, m) {
      const room = wsRoom.get(wsId(ws));
      const meta = wsMeta.get(wsId(ws));
      switch (m.t) {
        case 'hello': {
          wsMeta.set(wsId(ws), {
            pid: String(m.pid || 'anon').slice(0, 40),
            name: String(m.name || '').replace(/[^\w \-'.]/g, '').slice(0, 14),
            ci: Number.isInteger(m.ci) ? clamp(m.ci, 0, 3) : 0,
            solo: !!m.solo,
          });
          send(ws, { t: 'hi' });
          break;
        }
        case 'join': {
          if (!meta) { send(ws, { t: 'err', code: 'nohello', msg: 'Handshake missing.' }); return; }
          joinRoom(ws, meta, m.room);
          break;
        }
        default: {
          if (!room) return;
          const me = [...room.players.values()].find(p => p.ws === ws);
          if (!me) return;
          me.lastMsgT = Date.now();
          switch (m.t) {
            case 'ready': {
              if (room.phase !== 'lobby') return;
              me.ready = !!m.v;
              broadcast(room, lobbyPayload(room));
              break;
            }
            case 'start': startGame(room, me); break;
            case 'move': {
              if (typeof m.x !== 'number' || typeof m.y !== 'number') return;
              let nx = clamp(m.x, 0, MAPW * TILE), ny = clamp(m.y, 0, MAPH * TILE);
              if (!walkTile(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
                // keep last valid position
                nx = me.x; ny = me.y;
              }
              me.x = nx; me.y = ny;
              if (Number.isFinite(m.fx)) me.fx = clamp(m.fx, -1, 1);
              if (Number.isFinite(m.fy)) me.fy = clamp(m.fy, -1, 1);
              break;
            }
            case 'station': trySetStation(room, me, m.id === undefined ? null : m.id); break;
            case 'chan': {
              if (room.phase !== 'play') return;
              if (!m.kind) { me.chan = null; break; }
              const kinds = ['extinguish', 'seal', 'repair', 'stabilize', 'revive'];
              if (!kinds.includes(m.kind)) return;
              if (me.station) break; // can't channel while manning a console
              me.chan = { kind: m.kind, target: m.target, prog: 0, pRef: m.pRef || null };
              break;
            }
            case 'helm': {
              if (me.station !== 'helm') return;
              const st = room.st;
              me.helmIn.kx = clamp(+m.kx || 0, -1, 1);
              me.helmIn.ky = clamp(+m.ky || 0, -1, 1);
              const agility = 260 * (0.4 + 1.1 * sysEff(st, 'engines'));
              st.ship.vx += me.helmIn.kx * agility * DT * 3;
              void me.helmIn.ky;
              break;
            }
            case 'jump': {
              if (me.station !== 'helm') return;
              const st = room.st;
              if (st.jump.ready && !st.jump.active) startJump(room);
              break;
            }
            case 'power': {
              if (me.station !== 'power') return;
              const st = room.st;
              const id = m.sys;
              if (!SYS_IDS.includes(id)) return;
              const d = m.d > 0 ? 1 : -1;
              const nv = clamp(st.pow[id] + d, 0, 4);
              const othersTotal = SYS_IDS.reduce((a, k) => a + (k === id ? 0 : st.pow[k]), 0);
              if (nv + othersTotal <= st.cap) st.pow[id] = nv;
              break;
            }
            case 'reinforce': {
              if (me.station !== 'shields') return;
              const st = room.st;
              st.rf = Number.isInteger(m.f) && m.f >= 0 && m.f < 4 ? m.f : -1;
              break;
            }
            case 'target': {
              if (me.station !== 'weapons') return;
              room.wTarget = Number.isInteger(m.eid) ? m.eid : null;
              break;
            }
            case 'fire': {
              if (me.station !== 'weapons') return;
              const st = room.st;
              if (st.phase !== 'play' || st.jump.active) return;
              if ((me.fireCd || 0) > st.tm) return;
              const eff = sysEff(st, 'weapons');
              if (eff <= 0.02) { evTo(room, me, 'log', 'Weapons offline — check power & damage!', 'warn'); return; }
              me.fireCd = st.tm + Math.max(0.45, 1.5 - eff * 0.42);
              // find target
              let foe = null;
              if (room.wTarget != null) foe = st.foes.find(f => f.id === room.wTarget);
              if (!foe && st.foes.length) foe = st.foes.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b));
              const n = NODES.weapons;
              const ox = (n.x - 18) * TILE, oy = (n.y - 10) * TILE; // rel to ship center (18,10)
              if (foe) {
                const dx = foe.x - ox, dy = foe.y - oy;
                const l = Math.hypot(dx, dy) || 1;
                fireShot(room, ox, oy, (dx / l) * 900, (dy / l) * 900, 'us', 7 + 4 * eff);
              } else {
                fireShot(room, ox, oy, 900, 0, 'us', 7 + 4 * eff);
              }
              ev(room, 'sfx', 'laser');
              break;
            }
            case 'emote': {
              const idx = clamp(m.i | 0, 0, 7);
              me.emote = idx; me.emoteT = st_now() + 2.6;
              broadcast(room, { t: 'ev', list: [{ kind: 'emote', a: me.pid, b: idx }] });
              break;
            }
          }
        }
      }
    }

    const wsMeta = new Map(); // wsId -> meta
    const wsIds = new WeakMap();
    let nextWsId = 1;
    function wsId(ws) {
      if (!wsIds.has(ws)) wsIds.set(ws, ws.__bid || (ws.__bid = 'w' + nextWsId++));
      return wsIds.get(ws);
    }
    function st_now() { return Date.now() / 1000; }
    function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { } }
    function log(...a) { try { (_ctx && _ctx.log ? _ctx.log : console.log)('[orion]', ...a); } catch { } }

    let lastTick = Date.now();

    return {
      open(ws) {
        wsId(ws);
        try { ws.send(JSON.stringify({ t: 'hello' })); } catch { }
      },
      message(ws, obj) {
        let m = obj;
        if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return; } }
        if (!m || typeof m !== 'object') return;
        handleMessage(ws, m);
      },
      close(ws) { leave(ws); },
      tick() {
        const now = Date.now();
        let dtReal = (now - lastTick) / 1000;
        lastTick = now;
        if (dtReal > 0.5) dtReal = 0.5;

        // GC empty rooms
        for (const [code, room] of rooms) {
          const empty = [...room.players.values()].every(p => !p.connected) || room.players.size === 0;
          if (empty) {
            if (!room.emptySince) room.emptySince = now;
            if (now - room.emptySince > 120000) rooms.delete(code);
          } else room.emptySince = 0;
        }

        for (const room of rooms.values()) {
          room.evq = room.evq || [];
          if (room.phase === 'lobby') {
            // drop stale lobby players (disconnected > 60s)
            for (const [pid, p] of room.players) {
              if (!p.connected && now - (p.lastMsgT || 0) > 60000) room.players.delete(pid);
            }
            continue;
          }
          tickRoom(room, now);
          if (room.evq.length) {
            broadcast(room, { t: 'ev', list: room.evq.splice(0, room.evq.length) });
          }
          // snapshots at ~10Hz (accumulating pace, tolerant of tick jitter/load)
          if (!room.lastSnap) room.lastSnap = now;
          if (now - room.lastSnap >= TICK_MS) {
            room.lastSnap = Math.max(room.lastSnap + TICK_MS, now - 4 * TICK_MS);
            broadcast(room, { t: 'snap', st: snapshotFor(room) });
          }
          // auto-return-to-lobby 25s after game over
          if (room.st && room.st.phase === 'over') {
            room.overTm += 0;
            if ((room.overTm || 0) > 25) {
              room.phase = 'lobby';
              room.st = null;
              for (const p of room.players.values()) { p.ready = false; p.station = null; p.chan = null; p.down = false; p.hp = 100; }
              broadcast(room, lobbyPayload(room));
            }
          }
        }
        void dtReal;
      },
      stop() {
        rooms.clear();
        wsRoom.clear();
        wsMeta.clear();
      },
    };
  },
};
