/* ============================================================
   THE CHORUS BELOW — authoritative co-op horror simulation
   ------------------------------------------------------------
   Environment-agnostic ESM (zero imports):
   - Loaded by the game platform as the multiplayer backend
     (default export: { maxSockets, tickMs, create(ctx) }).
   - Imported by the browser itself for shared map/constants and
     the solo mode (an in-memory socket pair drives create()).
   State is memory-only. Clients rejoin via persistent clientId.
   ============================================================ */

/* ---------------- shared constants ---------------- */

export const TILE = 32;
export const MAP_W = 46;
export const MAP_H = 33;

/* # wall  . floor  , grate  D door  = blast door */
export const MAP_ROWS = [
  "##############################################", // 0
  "#........#...........#.......................#", // 1
  "#........#...........#.......................#", // 2
  "#........#...........#....#....#....#....#...#", // 3
  "#........#...........#.......................#", // 4
  "#........#...........#.......................#", // 5
  "#........#...........#....#....#....#....#...#", // 6
  "#........#...........#.......................#", // 7
  "####D##########D#################D############", // 8
  "#............................................#", // 9
  "#...................,,,,,,,,.................#", // 10
  "#............................................#", // 11
  "######D#############......############D#######", // 12
  "#............#.................#.............#", // 13
  "#............#.................#.....#.......#", // 14
  "#............#....#........#...#.....#.......#", // 15
  "#............#.................#.....#.......#", // 16
  "#............D.................D.....#.......#", // 17
  "#............#.................#.............#", // 18
  "#............#....#........#...#.............#", // 19
  "#............#.................#.............#", // 20
  "#............#.................#.............#", // 21
  "#######D############......######D#############", // 22
  "#............................................#", // 23
  "#.............................,,,,,,,,.......#", // 24
  "#######D########################D#############", // 25
  "#..................#.........................#", // 26
  "#..................#.........................#", // 27
  "#..................#.........................#", // 28
  "#..................D.........................#", // 29
  "#..,,,,,,,,........#.........................#", // 30
  "#..................#.........................#", // 31
  "##############################################", // 32 -> blast door replaces (32,32)
];
// NOTE: row lengths are asserted at boot (assertMap below).

export const COLORS = ["#7fd4c1", "#e2b84c", "#c678dd", "#e2574c"];
export const COLOR_NAMES = ["ASH", "BRACK", "VELLA", "MOSS"];

export const PLAYER = {
  R: 0.34,            // collision radius (tiles)
  WALK: 4.1,          // tiles/sec
  SPRINT: 6.4,
  CROUCH: 2.1,
  CRAWL: 1.15,
};

export const MONSTER = {
  R: 0.42,
  PATROL: 2.9,
  INVESTIGATE: 4.1,
  HUNT: 5.55,
  RETREAT: 5.2,
  FRENZY_HUNT: 6.55,
  FRENZY_PATROL: 3.6,
  SIGHT: 8.5,
  SIGHT_DARK: 6.0,
  SIGHT_CROUCH_BONUS_REDUCTION: 2.0,
  FLASHLIGHT_BONUS: 2.5,
  FOV_DEG: 105,
  CATCH: 0.62,
  HEARING_MULT: 1.0,
};

export const RULES = {
  BLEEDOUT: 75,
  REVIVE_TIME: 4,
  REVIVE_INVULN: 2.5,
  INSERT_TIME: 2,
  SWITCH_TIME: 3,
  SWITCH_SOLO_RATE: 0.45,
  DISH_TIME: 6,
  DECODE_TIME: 5,
  DECODE_SOLO_TIME: 10,
  TRAP_DURATION: 25,
  LEVER_TIME: 2,
  EXTRACT_CHANNEL: 3,
  RECONNECT_GRACE: 120,
  MAX_PLAYERS: 4,
  COUNTDOWN: 3.2,
  NOISE_SPRINT: 7.5,
  NOISE_WALK: 3.4,
  NOISE_CROUCH: 1.0,
  NOISE_INTERACT_BIG: 12,
  NOISE_INTERACT_MED: 8,
};

export const EXTRACT_RECT = { x: 26, y: 27, w: 9, h: 3 };
export const BLAST_DOOR = { x: 32, y: 32 };

export const POIS = {
  spawn: { x: 31.5, y: 28.5 },
  breaker: { x: 7.5, y: 13.5 },
  switchA: { x: 2.5, y: 14.5 },
  switchB: { x: 2.5, y: 18.5 },
  lever: { x: 12.5, y: 21.5 },
  dishes: [
    { x: 2.5, y: 2.5 },   // storage NW
    { x: 43.5, y: 2.5 },  // chapel NE
    { x: 16.5, y: 30.5 }, // pump SE
  ],
  termA: { x: 43.5, y: 14.5 }, // crypt altar
  termB: { x: 2.5, y: 27.5 },  // pump NW
  fuseSpots: [
    { x: 2.5, y: 7.5 },   // storage SW
    { x: 19.5, y: 2.5 },  // dorm NE
    { x: 28.5, y: 6.5 },  // chapel nave
    { x: 43.5, y: 20.5 }, // crypt SE
    { x: 2.5, y: 21.5 },  // generator SW
  ],
  lockers: [
    { x: 8.5, y: 1.5 }, { x: 10.5, y: 7.5 }, { x: 44.5, y: 7.5 },
    { x: 13.5, y: 9.5 }, { x: 14.5, y: 13.5 }, { x: 32.5, y: 21.5 },
    { x: 18.5, y: 26.5 }, { x: 43.5, y: 26.5 },
  ],
  radio: { x: 33.5, y: 2.5 },
  notes: [
    { x: 5.5, y: 4.5, text: "MAINTENANCE LOG 9-12: Bus C keeps tripping. Pulled three scorched fuses from the array feed. Something chewed them." },
    { x: 15.5, y: 2.5, text: "Kova's cot. She wrote the same word on the frame forty times: LISTEN. Underlined twice." },
    { x: 30.5, y: 4.5, text: "Sermon draft, unfinished: 'And the choir sang in a frequency no throat could—' The rest is water damage." },
    { x: 5.5, y: 17.5, text: "Generator warning, stenciled: TWIN SWITCHES REQUIRE TWO OPERATORS. DO NOT OVERRIDE. (Someone scratched out DO NOT.)" },
    { x: 19.5, y: 16.5, text: "A chalk arrow points at the floor, where someone wrote: IT FOLLOWS SOUND. WALK. FOR GOD'S SAKE WALK." },
    { x: 40.5, y: 15.5, text: "Scratched into the crypt wall: WE PUT IT IN THE WALL TO KEEP IT QUIET. THE DRILLING ONLY MADE IT SING." },
    { x: 8.5, y: 29.5, text: "Pump duty roster. Every night past the third is blank. One entry: 'heard my own voice from the dish, calling me home.'" },
    { x: 36.5, y: 28.5, text: "EVAC PROTOCOL: airlock channels on manual. Both terminals must acknowledge before the door will drink the dark. Stay together." },
  ],
  patrol: [
    { x: 5, y: 4 }, { x: 15, y: 4 }, { x: 33, y: 4 }, { x: 6, y: 10 },
    { x: 24, y: 10 }, { x: 38, y: 10 }, { x: 7, y: 17 }, { x: 22, y: 17 },
    { x: 40, y: 17 }, { x: 7, y: 24 }, { x: 22, y: 24 }, { x: 38, y: 24 },
    { x: 9, y: 29 }, { x: 33, y: 28 },
  ],
  monsterSpawn: { x: 40.5, y: 20.5 },
};

const NOTE_INDEX = {};
POIS.notes.forEach((n, i) => { NOTE_INDEX[`${Math.floor(n.x)},${Math.floor(n.y)}`] = i; });

/* ---------------- tiny utils ---------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

export function tileAt(tx, ty) {
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return "#";
  if (ty === BLAST_DOOR.y && tx === BLAST_DOOR.x) return "=";
  return MAP_ROWS[ty][tx];
}
export function isSolidChar(ch) { return ch === "#" || ch === "=" || ch === "D"; }

/* circle-vs-tilemap collision (tiles param: fn(tx,ty)->char override for doors) */
export function collideMove(x, y, nx, ny, r, solidFn) {
  const tryAxis = (px, py) => {
    const minX = Math.floor(px - r), maxX = Math.floor(px + r);
    const minY = Math.floor(py - r), maxY = Math.floor(py + r);
    for (let ty = minY; ty <= maxY; ty++)
      for (let tx = minX; tx <= maxX; tx++) {
        if (!solidFn(tx, ty)) continue;
        const cx = Math.max(tx, Math.min(px, tx + 1));
        const cy = Math.max(ty, Math.min(py, ty + 1));
        if (dist2(px, py, cx, cy) < r * r) return false;
      }
    return true;
  };
  if (tryAxis(nx, y)) x = nx;
  if (tryAxis(x, ny)) y = ny;
  return { x, y };
}

function losClear(x0, y0, x1, y1, solidFn) {
  // supercover-ish DDA raycast in tile space
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1 - x0) : (x0 - tx)) * tDeltaX) : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1 - y0) : (y0 - ty)) * tDeltaY) : Infinity;
  let guard = 128;
  while (guard-- > 0) {
    if (tx === tx1 && ty === ty1) return true;
    if (solidFn(tx, ty) && !(tx === Math.floor(x0) && ty === Math.floor(y0))) return false;
    if (tMaxX < tMaxY) { tMaxX += tDeltaX; tx += stepX; } else { tMaxY += tDeltaY; ty += stepY; }
  }
  return false;
}

/* BFS pathfind on tile grid */
function findPath(solidFn, sx, sy, gx, gy) {
  sx |= 0; sy |= 0; gx |= 0; gy |= 0;
  if (solidFn(gx, gy)) return null;
  const key = (x, y) => y * MAP_W + x;
  const prev = new Map();
  const q = [[sx, sy]];
  prev.set(key(sx, sy), -1);
  let head = 0;
  while (head < q.length) {
    const [cx, cy] = q[head++];
    if (cx === gx && cy === gy) break;
    const neigh = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const k = key(nx, ny);
      if (prev.has(k) || solidFn(nx, ny)) continue;
      prev.set(k, key(cx, cy));
      q.push([nx, ny]);
    }
  }
  const gk = key(gx, gy);
  if (!prev.has(gk)) return null;
  const path = [];
  let cur = gk;
  while (cur !== -1) { path.push({ x: (cur % MAP_W) + 0.5, y: Math.floor(cur / MAP_W) + 0.5 }); cur = prev.get(cur); }
  path.reverse();
  path.shift();
  return path;
}

function assertMap() {
  if (MAP_ROWS.length !== MAP_H) throw new Error("MAP_ROWS height mismatch");
  MAP_ROWS.forEach((r, i) => { if (r.length !== MAP_W) throw new Error(`row ${i} width ${r.length}`); });
}
assertMap();

/* ============================================================
   GAME INSTANCE
   ============================================================ */

export function createGame(rngSeed) {
  const rng = mulberry32(rngSeed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : rngSeed);

  const world = {
    state: "lobby",           // lobby | countdown | playing | ended
    phase: null,              // power | signal | decode_done/trap | escape (during playing)
    time: 0,                  // seconds since instance creation
    startedAt: 0,
    endInfo: null,
    countdownEndsAt: 0,
    players: new Map(),       // playerId -> player
    sockets: new Map(),       // socketId -> playerId
    waitlist: [],             // socketIds waiting for a slot
    hostSid: null,
    doors: new Map(),         // "x,y" -> {x,y,open,locked,tempLockUntil}
    items: [],                // {id,type:'fuse',x,y}
    notesRead: {},            // pid -> Set of note idx (per player)
    monster: null,
    obj: null,
    noises: [],               // transient per-tick
    events: [],
    evId: 1,
    itemId: 1,
    stats: null,
  };

  /* ----- doors ----- */
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (tileAt(x, y) === "D") world.doors.set(`${x},${y}`, { x, y, open: false, locked: false });

  function doorSolidFn() {
    return (tx, ty) => {
      const ch = tileAt(tx, ty);
      if (ch === "D") {
        const d = world.doors.get(`${tx},${ty}`);
        return !(d && d.open && !isTempLocked(d));
      }
      return ch === "#" || ch === "=";
    };
  }
  function isTempLocked(d) { return d.locked; }

  /* ----- players ----- */
  let nextPid = 1;

  function makePlayer(pid, clientId, name) {
    return {
      pid, clientId, name,
      colorIdx: (pid - 1) % COLORS.length,
      x: POIS.spawn.x, y: POIS.spawn.y, aim: 0,
      crouch: false, sprint: false, flash: true,
      moving: false, speedCls: 0,
      inLocker: -1,
      downed: false, bleedout: 0, dead: false,
      revivedUntil: 0,
      carryingFuse: false,
      action: null,           // {kind, targetKey}
      ready: false,
      connected: true,
      disconnectedAt: 0,
      lastPos: { x: POIS.spawn.x, y: POIS.spawn.y, t: 0 },
      msgBudget: 60,
      readNotes: new Set(),
      radioCdUntil: 0,
    };
  }

  function aliveConscious() {
    return [...world.players.values()].filter(p => p.connected && !p.dead && !p.downed);
  }
  function crewCount() { return [...world.players.values()].filter(p => p.connected || world.time - p.disconnectedAt < 15).length; }

  /* ----- events ----- */
  function emit(type, data, x, y) {
    world.events.push({ id: world.evId++, type, x, y, data: data || {} });
    if (world.events.length > 200) world.events.splice(0, world.events.length - 200);
  }

  function noise(x, y, r, loud) {
    world.noises.push({ x, y, r: r * MONSTER.HEARING_MULT, loud });
  }

  /* ----- objectives state ----- */
  function freshObjectiveState(fuseCount) {
    return {
      fusesNeeded: fuseCount,
      fusesIn: 0,
      switchProg: 0,
      dishes: [0, 0, 0],
      decodeProg: 0,
      decoded: false,
      trap: null,             // {pid, doorKeys[], endsAt, released}
      blackoutUntil: 0,
      escapeStartedAt: 0,
      extractChan: 0,
    };
  }

  function placeFuses() {
    world.items.length = 0;
    const spots = POIS.fuseSpots.slice();
    const n = 3;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * spots.length);
      const s = spots.splice(idx, 1)[0];
      world.items.push({ id: world.itemId++, type: "fuse", x: s.x, y: s.y });
    }
  }

  /* ----- monster ----- */
  function spawnMonster() {
    world.monster = {
      x: POIS.monsterSpawn.x, y: POIS.monsterSpawn.y,
      state: "patrol",
      face: 0,
      path: null, pathi: 0,
      target: null,            // {x,y}
      huntPid: null,
      lastSeen: null,          // {x,y,t}
      loseAt: 0,
      stateUntil: 0,
      repathAt: 0,
      pauseUntil: 0,
      ripLocker: -1,
      pulseAt: 0,
      sawLockerEnter: {},      // pid -> time it saw them enter
    };
  }

  function monsterSolid() { return doorSolidFn(); }

  function monsterSetPath(tx, ty) {
    const m = world.monster;
    const p = findPath(monsterSolid(), m.x, m.y, tx, ty);
    if (p && p.length) { m.path = p; m.pathi = 0; return true; }
    m.path = null; return false;
  }

  function monsterPickPatrol() {
    const nodes = POIS.patrol;
    const n = nodes[Math.floor(rng() * nodes.length)];
    world.monster.target = { x: n.x + 0.5, y: n.y + 0.5 };
    monsterSetPath(n.x, n.y);
  }

  function playerVisibleTargets(m) {
    const res = [];
    for (const p of world.players.values()) {
      if (!p.connected || p.dead || p.downed || p.inLocker >= 0) continue;
      if (world.time < p.revivedUntil) continue;
      const d = dist(m.x, m.y, p.x, p.y);
      let range = world.phase === "escape" ? MONSTER.SIGHT : MONSTER.SIGHT_DARK;
      if (p.flash) range += MONSTER.FLASHLIGHT_BONUS;
      if (p.crouch) range -= MONSTER.SIGHT_CROUCH_BONUS_REDUCTION;
      range = Math.max(2.5, range);
      if (d > range) continue;
      // fov check unless very close
      if (d > 1.6) {
        const ang = Math.atan2(p.y - m.y, p.x - m.x);
        let da = Math.abs(((ang - m.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da > (MONSTER.FOV_DEG * Math.PI / 180) / 2) continue;
      }
      if (!losClear(m.x, m.y, p.x, p.y, monsterSolid())) continue;
      res.push({ p, d });
    }
    res.sort((a, b) => a.d - b.d);
    return res;
  }

  function monsterHear() {
    if (!world.noises.length) return null;
    let best = null;
    for (const nz of world.noises) {
      const d = dist(world.monster.x, world.monster.y, nz.x, nz.y);
      if (d <= nz.r) {
        const score = nz.loud ? nz.r * 2 : nz.r;
        if (!best || score > best.score) best = { x: nz.x, y: nz.y, score, d };
      }
    }
    return best;
  }

  function monsterDownPlayer(p, cause) {
    p.downed = true;
    p.bleedout = RULES.BLEEDOUT;
    p.action = null;
    if (p.carryingFuse) {
      p.carryingFuse = false;
      world.items.push({ id: world.itemId++, type: "fuse", x: p.x, y: p.y });
    }
    if (p.inLocker >= 0) p.inLocker = -1;
    const m = world.monster;
    emit("down", { pid: p.pid, name: p.name, cause }, p.x, p.y);
    if (m) {
      emit("screech", {}, m.x, m.y);
      world.stats.downs++;
      m.state = "retreat";
      m.stateUntil = world.time + 5.0;
      m.huntPid = null;
      const far = POIS.patrol.filter(n => dist(n.x, n.y, p.x, p.y) > 14);
      const pick = far.length ? far[Math.floor(rng() * far.length)] : POIS.patrol[0];
      m.target = { x: pick.x, y: pick.y };
      monsterSetPath(pick.x, pick.y);
    } else {
      world.stats.downs++;
    }
    checkAllDown();
  }

  function checkAllDown() {
    const act = [...world.players.values()].filter(p => p.connected);
    if (!act.length) return;
    const allLost = act.every(p => p.dead || p.downed);
    if (allLost && world.state === "playing") endGame(false, "The Chorus collected the whole crew.");
  }

  function tickMonster(dt) {
    const m = world.monster;
    if (!m) return;
    const frenzy = world.phase === "escape";

    // perception
    const vis = playerVisibleTargets(m);
    if (vis.length) {
      const v = vis[0];
      if (m.state !== "hunt" || m.huntPid !== v.p.pid) {
        if (m.state !== "hunt") { emit("spotted", { pid: v.p.pid }, m.x, m.y); }
        m.state = "hunt"; m.huntPid = v.p.pid;
      }
      m.lastSeen = { x: v.p.x, y: v.p.y, t: world.time };
      m.loseAt = world.time + 2.6;
    }

    const heard = (m.state !== "hunt") ? monsterHear() : null;

    switch (m.state) {
      case "patrol": {
        if (heard) {
          m.state = "investigate"; m.target = { x: heard.x, y: heard.y };
          monsterSetPath(Math.floor(heard.x), Math.floor(heard.y));
          break;
        }
        if (frenzy && world.time >= m.pulseAt) {
          m.pulseAt = world.time + 7;
          const ps = aliveConscious();
          if (ps.length) {
            const p = ps[Math.floor(rng() * ps.length)];
            m.state = "investigate";
            m.target = { x: p.x + (rng() * 4 - 2), y: p.y + (rng() * 4 - 2) };
            monsterSetPath(Math.floor(m.target.x), Math.floor(m.target.y));
            emit("pulse", {}, m.x, m.y);
            break;
          }
        }
        if (!m.path || m.pathi >= (m.path ? m.path.length : 0)) {
          if (world.time > m.pauseUntil) { monsterPickPatrol(); }
        }
        break;
      }
      case "investigate": {
        if (heard && dist(m.x, m.y, heard.x, heard.y) < 6) {
          m.target = { x: heard.x, y: heard.y };
          monsterSetPath(Math.floor(heard.x), Math.floor(heard.y));
        }
        if (!m.path || m.pathi >= m.path.length) {
          m.state = "patrol"; m.pauseUntil = world.time + 1 + rng() * 2;
        }
        break;
      }
      case "hunt": {
        const tp = world.players.get(m.huntPid);
        if (!tp || !tp.connected || tp.dead || tp.inLocker >= 0) {
          m.state = "investigate";
          if (m.lastSeen) monsterSetPath(Math.floor(m.lastSeen.x), Math.floor(m.lastSeen.y));
          m.huntPid = null;
          break;
        }
        if (vis.length) {
          m.lastSeen = { x: tp.x, y: tp.y, t: world.time };
          m.loseAt = world.time + 2.6;
        }
        // (re)path toward live position or last-seen
        const goal = vis.length ? tp : m.lastSeen;
        if (goal && (!m.path || m.pathi >= m.path.length || world.time >= m.repathAt)) {
          m.repathAt = world.time + 0.55;
          monsterSetPath(Math.floor(goal.x), Math.floor(goal.y));
        }
        if (!goal && !vis.length) { m.state = "patrol"; m.huntPid = null; break; }
        if (!vis.length && world.time > m.loseAt) {
          m.state = "investigate"; m.huntPid = null;
          emit("lost", {}, m.x, m.y);
        }
        // catch
        if (tp && !tp.downed && dist(m.x, m.y, tp.x, tp.y) < MONSTER.CATCH + PLAYER.R) {
          monsterDownPlayer(tp, "caught");
        }
        break;
      }
      case "retreat": {
        if (world.time >= m.stateUntil) { m.state = "patrol"; m.pauseUntil = world.time + 0.5; }
        break;
      }
    }

    // movement along path
    let speed =
      m.state === "hunt" ? (frenzy ? MONSTER.FRENZY_HUNT : MONSTER.HUNT) :
      m.state === "investigate" ? MONSTER.INVESTIGATE :
      m.state === "retreat" ? MONSTER.RETREAT :
      (frenzy ? MONSTER.FRENZY_PATROL : MONSTER.PATROL);

    if (m.path && m.pathi < m.path.length) {
      const wp = m.path[m.pathi];
      const d = dist(m.x, m.y, wp.x, wp.y);
      if (d < 0.15) { m.pathi++; }
      else {
        const vx = (wp.x - m.x) / d, vy = (wp.y - m.y) / d;
        const nx = m.x + vx * speed * dt, ny = m.y + vy * speed * dt;
        const res = collideMove(m.x, m.y, nx, ny, MONSTER.R, monsterSolid());
        m.face = Math.atan2(vy, vx);
        // slide along walls: if stuck, repath
        if (dist(res.x, res.y, m.x, m.y) < speed * dt * 0.15 && m.state !== "retreat") {
          if (m.target) monsterSetPath(Math.floor(m.target.x), Math.floor(m.target.y));
        }
        m.x = res.x; m.y = res.y;
      }
    } else if (m.state === "hunt" && m.huntPid != null) {
      const tp = world.players.get(m.huntPid);
      if (tp && vis.length) {
        // direct chase when close
        const d = dist(m.x, m.y, tp.x, tp.y);
        if (d > 0.01) {
          const vx = (tp.x - m.x) / d, vy = (tp.y - m.y) / d;
          const res = collideMove(m.x, m.y, m.x + vx * speed * dt, m.y + vy * speed * dt, MONSTER.R, monsterSolid());
          m.x = res.x; m.y = res.y; m.face = Math.atan2(vy, vx);
        }
      }
    } else {
      // idle: slowly scan the surroundings — it listens with its face
      m.face += Math.sin(world.time * 0.7 + m.x) * dt * 1.1;
    }
  }

  /* ----- interaction resolution ----- */

  function holdersOf(kind, key) {
    const arr = [];
    for (const p of world.players.values())
      if (p.connected && !p.dead && !p.downed && p.inLocker < 0 && p.action &&
          p.action.kind === kind && (key == null || p.action.key === key)) arr.push(p);
    return arr;
  }

  function nearObj(p, o, r) { return dist(p.x, p.y, o.x, o.y) <= (r || 1.7); }

  function validateAction(p) {
    const a = p.action;
    if (!a) return false;
    switch (a.kind) {
      case "insert": return p.carryingFuse && nearObj(p, POIS.breaker) && world.phase === "power";
      case "switchA": return world.phase === "power" && world.obj.fusesIn >= world.obj.fusesNeeded && nearObj(p, POIS.switchA);
      case "switchB": return world.phase === "power" && world.obj.fusesIn >= world.obj.fusesNeeded && nearObj(p, POIS.switchB);
      case "dish": return world.phase === "signal" && a.key >= 0 && a.key < 3 && nearObj(p, POIS.dishes[a.key]);
      case "termA": return world.phase === "signal" && world.obj.dishes.every(d => d >= 1) && nearObj(p, POIS.termA);
      case "termB": return world.phase === "signal" && world.obj.dishes.every(d => d >= 1) && nearObj(p, POIS.termB);
      case "revive": {
        const t = world.players.get(a.pid);
        const ok = t && t.downed && !t.dead && t.connected && dist(p.x, p.y, t.x, t.y) < 1.6;
        return ok;
      }
      case "lever": return !!world.obj.trap && !world.obj.trap.released && nearObj(p, POIS.lever);
      case "radio": return nearObj(p, POIS.radio) && world.time >= p.radioCdUntil;
      case "note": return a.note != null && dist(p.x, p.y, POIS.notes[a.note].x, POIS.notes[a.note].y) < 1.6;
      default: return false;
    }
  }

  function completeAction(p, a) {
    switch (a.kind) {
      case "insert": {
        p.carryingFuse = false;
        world.obj.fusesIn++;
        emit("fuse_in", { n: world.obj.fusesIn, need: world.obj.fusesNeeded }, p.x, p.y);
        noise(p.x, p.y, RULES.NOISE_INTERACT_MED, false);
        if (world.obj.fusesIn >= world.obj.fusesNeeded) {
          emit("obj", { text: "Fuses seated. Find a second operator — throw BOTH switches in the generator room." });
        }
        break;
      }
      case "dish": {
        world.obj.dishes[a.key] = 1;
        emit("dish_done", { key: a.key, left: world.obj.dishes.filter(d => !d).length }, POIS.dishes[a.key].x, POIS.dishes[a.key].y);
        if (world.obj.dishes.every(d => d >= 1))
          emit("obj", { text: "Array aligned. Decode at BOTH terminals — crypt altar and pump room. Simultaneously." });
        break;
      }
      case "lever": {
        world.obj.trap.released = true;
        for (const k of world.obj.trap.doorKeys) { const d = world.doors.get(k); if (d) d.locked = false; }
        emit("lever", {}, p.x, p.y);
        emit("obj", { text: "Release lever pulled. The way is open. MOVE." });
        break;
      }
      case "radio": {
        p.radioCdUntil = world.time + 20;
        noise(p.x, p.y, RULES.NOISE_INTERACT_MED, false);
        emit("radio_whisper", { pid: p.pid }, p.x, p.y);
        break;
      }
      case "note": {
        p.readNotes.add(a.note);
        emit("note_read", { pid: p.pid, note: a.note, text: POIS.notes[a.note].text }, p.x, p.y);
        break;
      }
    }
  }

  function tickActions(dt) {
    const o = world.obj;
    // individual timed actions
    for (const p of world.players.values()) {
      if (!p.action || !p.connected || p.dead || p.downed) continue;
      if (!validateAction(p)) { continue; }
      p.action.t += dt;
      const need = ({ insert: RULES.INSERT_TIME, dish: RULES.DISH_TIME, revive: RULES.REVIVE_TIME, lever: RULES.LEVER_TIME, radio: 1.2, note: 0.8 })[p.action.kind];
      if (need != null && p.action.t >= need) {
        const a = p.action;
        if (a.kind === "revive") {
          const t = world.players.get(a.pid);
          if (t) {
            t.downed = false; t.bleedout = 0; t.revivedUntil = world.time + RULES.REVIVE_INVULN;
            world.stats.revives++;
            emit("revived", { pid: t.pid, by: p.name }, t.x, t.y);
          }
          p.action = null;
        } else {
          completeAction(p, a);
          p.action = (a.kind === "dish" || a.kind === "note" || a.kind === "insert" || a.kind === "lever" || a.kind === "radio") ? null : p.action;
        }
      }
    }

    if (world.state !== "playing") return;

    // twin switches (phase power, fuses done)
    if (world.phase === "power" && o.fusesIn >= o.fusesNeeded) {
      const ha = holdersOf("switchA"), hb = holdersOf("switchB");
      const soloCrew = crewCount() === 1;
      let rate = 0;
      if (ha.length && hb.length && ha[0].pid !== hb[0].pid) rate = 1;
      else if (soloCrew && (ha.length || hb.length)) rate = RULES.SWITCH_SOLO_RATE;
      if (rate > 0) {
        const before = o.switchProg;
        o.switchProg += rate * dt;
        if (Math.floor(before * 2) !== Math.floor(o.switchProg * 2))
          noise(POIS.switchA.x, POIS.switchA.y, RULES.NOISE_INTERACT_MED, false);
        if (o.switchProg >= RULES.SWITCH_TIME) powerOn();
      }
    }

    // decode (phase signal, dishes done)
    if (world.phase === "signal" && o.dishes.every(d => d >= 1) && !o.decoded) {
      const ha = holdersOf("termA"), hb = holdersOf("termB");
      const soloCrew = crewCount() === 1;
      let rate = 0;
      if (ha.length && hb.length && ha[0].pid !== hb[0].pid) rate = 1 / RULES.DECODE_TIME;
      else if (soloCrew && (ha.length || hb.length)) rate = 1 / RULES.DECODE_SOLO_TIME;
      if (rate > 0) {
        const before = o.decodeProg;
        o.decodeProg = Math.min(1, o.decodeProg + rate * dt);
        if (Math.floor(before * 6) !== Math.floor(o.decodeProg * 6))
          noise((POIS.termA.x + POIS.termB.x) / 2, (POIS.termA.y + POIS.termB.y) / 2, RULES.NOISE_INTERACT_BIG, false);
        if (o.decodeProg >= 1) decodeDone();
      }
    }

    // trap expiry
    if (o.trap && !o.trap.released && world.time >= o.trap.endsAt) {
      o.trap.released = true;
      for (const k of o.trap.doorKeys) { const d = world.doors.get(k); if (d) d.locked = false; }
      emit("obj", { text: "The crushed doors grind back open." });
    }

    // blackout end handled client-side via timer event

    // escape win channel
    if (world.phase === "escape") {
      const inZone = aliveConscious().filter(p =>
        p.x >= EXTRACT_RECT.x && p.x <= EXTRACT_RECT.x + EXTRACT_RECT.w &&
        p.y >= EXTRACT_RECT.y && p.y <= EXTRACT_RECT.y + EXTRACT_RECT.h);
      const need = aliveConscious().length;
      if (inZone.length === need && need > 0) {
        o.extractChan += dt;
        if (o.extractChan >= RULES.EXTRACT_CHANNEL) endGame(true);
      } else {
        o.extractChan = Math.max(0, o.extractChan - dt * 1.5);
      }
    }
  }

  function powerOn() {
    world.phase = "signal";
    world.obj.switchProg = RULES.SWITCH_TIME;
    spawnMonster();
    emit("power_on", {});
    emit("obj", { text: "Power restored. Align the THREE dishes: storage, chapel, pump room. They scream when turned — expect company." });
    emit("monster_spawn", {}, world.monster.x, world.monster.y);
  }

  function decodeDone() {
    const o = world.obj;
    o.decoded = true;
    emit("decoded", {});
    // scripted blackout + trap
    o.blackoutUntil = world.time + 4.5;
    emit("blackout", { dur: 4.5 });
    setTimeoutLike(4.5, () => {
      // trap: lock the crypt around whoever is nearest to the crypt altar
      const ps = aliveConscious();
      if (ps.length) {
        let victim = ps[0];
        for (const p of ps) if (dist(p.x, p.y, POIS.termA.x, POIS.termA.y) < dist(victim.x, victim.y, POIS.termA.x, POIS.termA.y)) victim = p;
        const doorKeys = ["31,17", "38,12"];
        for (const k of doorKeys) {
          const d = world.doors.get(k);
          if (d) { d.open = false; d.locked = true; }
        }
        o.trap = { pid: victim.pid, name: victim.name, doorKeys, endsAt: world.time + RULES.TRAP_DURATION, released: false };
        emit("trapped", { pid: victim.pid, name: victim.name, dur: RULES.TRAP_DURATION }, victim.x, victim.y);
        emit("obj", { text: `${victim.name} IS SEALED IN THE CRYPT. Someone must pull the release lever — GENERATOR ROOM.` });
        // monster pressure: teleport near atrium center (audible arrival)
        const m = world.monster;
        if (m) {
          m.x = 22.5; m.y = 17.5; m.path = null; m.state = "investigate";
          m.target = { x: victim.x, y: victim.y };
          monsterSetPath(Math.floor(victim.x), Math.floor(victim.y));
          emit("screech", {}, m.x, m.y);
        }
        setTimeoutLike(6, () => startEscape());
      } else {
        startEscape();
      }
    });
    emit("obj", { text: "THE SIGNAL IS OUT. Something answered." });
  }

  function startEscape() {
    if (world.phase === "escape" || world.state !== "playing") return;
    world.phase = "escape";
    world.obj.escapeStartedAt = world.time;
    if (world.monster) { world.monster.pulseAt = world.time + 2; }
    emit("escape_start", {});
    emit("obj", { text: "BLAST DOOR CYCLING. GET TO THE AIRLOCK. IT KNOWS. RUN." });
  }

  /* deferred callbacks driven by world clock (works under both hosts) */
  const timers = [];
  function setTimeoutLike(delaySec, fn) { timers.push({ at: world.time + delaySec, fn }); }
  function tickTimers() {
    for (let i = timers.length - 1; i >= 0; i--)
      if (world.time >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.fn(); }
  }

  /* ----- game flow ----- */

  function beginCountdown() {
    world.state = "countdown";
    world.countdownEndsAt = world.time + RULES.COUNTDOWN;
    emit("countdown", { t: RULES.COUNTDOWN });
  }

  function beginRun() {
    world.state = "playing";
    world.startedAt = world.time;
    world.phase = "power";
    world.obj = freshObjectiveState(3);
    placeFuses();
    for (const d of world.doors.values()) { d.open = false; d.locked = false; }
    for (const p of world.players.values()) {
      p.x = POIS.spawn.x + (rng() * 3 - 1.5);
      p.y = POIS.spawn.y + (rng() * 2 - 1);
      p.downed = false; p.dead = false; p.bleedout = 0; p.carryingFuse = false;
      p.inLocker = -1; p.action = null; p.readNotes = new Set();
      p.revivedUntil = 0;
    }
    world.stats = { downs: 0, revives: 0, notesRead: 0, startTime: Date.now() };
    world.monster = null;
    emit("run_start", {});
    emit("obj", { text: "Find THREE fuses and seat them in the breaker — GENERATOR ROOM, west wing. Move quietly." });
  }

  function endGame(win, loseText) {
    if (world.state === "ended") return;
    world.state = "ended";
    const survivors = [...world.players.values()]
      .filter(p => p.connected && !p.dead)
      .map(p => ({ pid: p.pid, name: p.name, downed: p.downed }));
    world.endInfo = {
      win,
      text: win
        ? "The blast door swallows the light behind you. In the glass you can see the array still turning,\nturning, turning — singing to something that finally, gratefully, answers."
        : (loseText || "Station 9 goes quiet. Somewhere below, the chorus gains four more voices."),
      timeSec: Math.round(world.time - world.startedAt),
      survivors,
      stats: world.stats ? {
        downs: world.stats.downs, revives: world.stats.revives,
      } : { downs: 0, revives: 0 },
      roster: [...world.players.values()].filter(p => p.connected).map(p => ({
        pid: p.pid, name: p.name, dead: p.dead, downed: p.downed, escaped: win && !p.dead,
      })),
    };
    emit(win ? "win" : "lose", {});
    setTimeoutLike(14, () => resetToLobby());
  }

  function resetToLobby() {
    world.state = "lobby";
    world.phase = null;
    world.monster = null;
    world.items.length = 0;
    world.obj = null;
    world.endInfo = null;
    world.trap = null;
    for (const d of world.doors.values()) { d.open = false; d.locked = false; }
    for (const p of world.players.values()) { p.ready = false; p.x = POIS.spawn.x; p.y = POIS.spawn.y; }
    emit("to_lobby", {});
    pruneDisconnected(true);
  }

  function pruneDisconnected(force) {
    for (const [pid, p] of world.players) {
      if (p.connected) continue;
      const gone = world.time - p.disconnectedAt;
      if (force || gone > RULES.RECONNECT_GRACE ||
          (world.state === "lobby" && gone > 15)) {
        world.players.delete(pid);
        emit("left", { pid, name: p.name });
      }
    }
    promoteHost();
  }

  function promoteHost() {
    if (world.hostSid != null) {
      const sockAlive = [...world.sockets.entries()].some(([sid, pid]) => sid === world.hostSid);
      if (sockAlive) return;
    }
    let best = null;
    for (const [sid, pid] of world.sockets) {
      const p = world.players.get(pid);
      if (p && (!best || pid < best.pid)) best = { sid, pid, p };
    }
    world.hostSid = best ? best.sid : null;
    if (best) emit("host", { pid: best.pid });
  }

  /* ----- bleeding / downed ----- */
  function tickDowned(dt) {
    for (const p of world.players.values()) {
      if (!p.connected) continue;
      if (p.downed && !p.dead) {
        p.bleedout -= dt;
        if (p.bleedout <= 0) {
          p.dead = true; p.downed = false; p.bleedout = 0; p.action = null;
          emit("died", { pid: p.pid, name: p.name }, p.x, p.y);
          checkAllDown();
        }
      }
    }
  }

  /* ----- movement validation + noise ----- */
  function applyMove(p, msg) {
    if (world.state !== "playing" && world.state !== "countdown") {
      // in lobby, keep everyone parked
      return;
    }
    if (p.dead) return; // ghosts are client-side only
    const nowT = world.time;
    const lp = p.lastPos;
    const dt = Math.min(0.5, Math.max(0.033, nowT - lp.t));
    const d = dist(lp.x, lp.y, msg.x, msg.y);
    let maxV = PLAYER.WALK;
    if (p.downed) maxV = PLAYER.CRAWL;
    else if (msg.crouch) maxV = PLAYER.CROUCH;
    else if (msg.sprint) maxV = PLAYER.SPRINT;
    const maxD = maxV * dt * 1.9 + 0.05;
    let nx = msg.x, ny = msg.y;
    if (d > maxD) {
      // clamp toward requested
      const s = maxD / d;
      nx = lp.x + (msg.x - lp.x) * s;
      ny = lp.y + (msg.y - lp.y) * s;
    }
    // stay in bounds & out of solids
    const sf = doorSolidFn();
    const res = collideMove(p.x, p.y, Math.max(0.4, Math.min(MAP_W - 0.4, nx)), Math.max(0.4, Math.min(MAP_H - 0.4, ny)), PLAYER.R, sf);
    const moved = dist(p.x, p.y, res.x, res.y);
    p.x = res.x; p.y = res.y;
    p.aim = msg.a || 0;
    p.crouch = !!msg.crouch;
    p.sprint = !!msg.sprint && !p.crouch;
    p.flash = !!msg.flash;
    p.lastPos = { x: p.x, y: p.y, t: nowT };
    // noise from movement
    if (moved > 0.001 && p.inLocker < 0) {
      const v = moved / dt;
      if (v > PLAYER.SPRINT * 0.85) noise(p.x, p.y, RULES.NOISE_SPRINT, false);
      else if (v > PLAYER.WALK * 0.6) noise(p.x, p.y, RULES.NOISE_WALK, false);
      else if (v > 0.4) noise(p.x, p.y, RULES.NOISE_CROUCH, false);
    }
  }

  /* ----- item pickup ----- */
  function tickItems() {
    for (const p of world.players.values()) {
      if (!p.connected || p.dead || p.downed || p.carryingFuse || p.inLocker >= 0) continue;
      if (world.state !== "playing") continue;
      for (let i = world.items.length - 1; i >= 0; i--) {
        const it = world.items[i];
        if (dist2(p.x, p.y, it.x, it.y) < 0.6 * 0.6) {
          world.items.splice(i, 1);
          p.carryingFuse = true;
          emit("pickup", { pid: p.pid, name: p.name }, p.x, p.y);
          break;
        }
      }
    }
  }

  /* ----- lockers ----- */
  function nearestLocker(p) {
    let best = -1, bd = 1.5;
    POIS.lockers.forEach((l, i) => {
      const d = dist(p.x, p.y, l.x, l.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function enterLocker(p) {
    const li = nearestLocker(p);
    if (li < 0) return false;
    // occupied?
    for (const q of world.players.values()) if (q.inLocker === li) return false;
    p.inLocker = li;
    const l = POIS.lockers[li];
    p.x = l.x; p.y = l.y;
    p.action = null;
    const m = world.monster;
    if (m) {
      const seen = m.state === "hunt" && m.huntPid === p.pid &&
        losClear(m.x, m.y, p.x, p.y, monsterSolid()) && dist(m.x, m.y, p.x, p.y) < MONSTER.SIGHT + 3;
      if (seen) m.sawLockerEnter[p.pid] = world.time;
    }
    emit("locker_enter", { pid: p.pid }, p.x, p.y);
    return true;
  }
  function exitLocker(p) { p.inLocker = -1; emit("locker_exit", { pid: p.pid }, p.x, p.y); }

  function tickLockerRip() {
    const m = world.monster;
    if (!m || m.state !== "hunt") return;
    for (const [pid, t] of Object.entries(m.sawLockerEnter)) {
      if (world.time - t > 6) { delete m.sawLockerEnter[pid]; continue; }
      const p = world.players.get(+pid);
      if (!p || p.inLocker < 0) { delete m.sawLockerEnter[pid]; continue; }
      const l = POIS.lockers[p.inLocker];
      if (dist(m.x, m.y, l.x, l.y) < 1.4) {
        delete m.sawLockerEnter[pid];
        emit("locker_rip", { pid: p.pid }, l.x, l.y);
        monsterDownPlayer(p, "ripped");
      }
    }
  }

  /* ----- doors ----- */
  function toggleDoorNear(p) {
    let best = null, bd = 1.4;
    for (const d of world.doors.values()) {
      const dd = dist(p.x, p.y, d.x + 0.5, d.y + 0.5);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return false;
    if (best.locked) { emit("door_locked", { pid: p.pid }, best.x, best.y); return true; }
    best.open = !best.open;
    noise(best.x + 0.5, best.y + 0.5, 5, false);
    emit("door", { x: best.x, y: best.y, open: best.open }, best.x, best.y);
    return true;
  }

  /* ============================================================
     NETWORK SURFACE — create(ctx)
     ============================================================ */

  function create(ctx) {
    const allowDbg = !!(ctx && ctx.debug);
    const sockMeta = new Map(); // sid -> {hello, clientId?, name?}
    const liveSockets = new Map(); // sid -> ws
    let lastTickAt = 0;

    function wsById(sid) { return liveSockets.get(sid) || null; }

    function send(ws, obj) {
      try { ws.send(typeof obj === "string" ? obj : JSON.stringify(obj)); }
      catch (e) { /* dead socket; close() will prune */ }
    }
    function broadcast(obj) {
      const s = JSON.stringify(obj);
      for (const sid of world.sockets.keys()) {
        const ws = liveSockets.get(sid);
        if (ws) send(ws, s);
      }
    }

    function publicPlayers() {
      return [...world.players.values()].map(p => pubPlayer(p));
    }
    function pubPlayer(p) {
      return {
        pid: p.pid, n: p.name, c: p.colorIdx, x: r2(p.x), y: r2(p.y), a: r2(p.aim),
        cr: p.crouch ? 1 : 0, fl: p.flash ? 1 : 0, lk: p.inLocker,
        dn: p.downed ? 1 : 0, bo: Math.round(p.bleedout), dd: p.dead ? 1 : 0,
        fu: p.carryingFuse ? 1 : 0, conn: p.connected ? 1 : 0, rd: p.ready ? 1 : 0,
        act: p.action ? p.action.kind : null,
        actT: p.action ? Math.round(p.action.t * 20) / 20 : 0,
        actKey: p.action ? (p.action.key != null ? p.action.key : (p.action.pid != null ? p.action.pid : p.action.note)) : null,
      };
    }
    function r2(v) { return Math.round(v * 100) / 100; }

    function lobbyPayload(forPid) {
      return {
        t: "lobby",
        state: world.state,
        players: publicPlayers(),
        host: world.players.get(world.sockets.get(world.hostSid))?.pid ?? null,
        you: forPid,
        max: RULES.MAX_PLAYERS,
      };
    }

    function admitNextIfSlot() {
      while (world.waitlist.length) {
        const sid = world.waitlist[0];
        if (!wsById(sid)) { world.waitlist.shift(); continue; }
        if (world.players.size >= RULES.MAX_PLAYERS) break; // ghosts hold slots during grace
        world.waitlist.shift();
        const meta = sockMeta.get(sid);
        if (meta && meta.clientId) doHello(wsById(sid), sid, meta.clientId, meta.name, true);
        break;
      }
    }

    function doHello(ws, sid, clientId, name, fromQueue) {
      // reconnect by clientId
      let p = null;
      for (const cand of world.players.values())
        if (cand.clientId === clientId) { p = cand; break; }
      const isNew = !p;
      if (isNew) {
        // slot check
        if (world.players.size >= RULES.MAX_PLAYERS) {
          if (!fromQueue) {
            world.waitlist.push(sid);
            sockMeta.set(sid, { hello: true, clientId, name });
            send(ws, { t: "full", max: RULES.MAX_PLAYERS, pos: world.waitlist.length });
          }
          return;
        }
        const pid = nextPid++;
        p = makePlayer(pid, clientId, sanitizeName(name, pid));
        world.players.set(pid, p);
        emit("joined", { pid, name: p.name });
      } else {
        const oldSid = [...world.sockets.entries()].find(([, pid2]) => pid2 === p.pid)?.[0];
        if (oldSid != null && oldSid !== sid) { world.sockets.delete(oldSid); }
        p.connected = true;
        if (world.state === "playing" || world.state === "countdown")
          emit("rejoined", { pid: p.pid, name: p.name });
      }
      world.sockets.set(sid, p.pid);
      promoteHost();
      send(ws, {
        t: "welcome",
        yourPid: p.pid,
        state: world.state,
        colors: COLORS,
        mapw: MAP_W, maph: MAP_H,
        rules: {
          bleedout: RULES.BLEEDOUT, revive: RULES.REVIVE_TIME, extract: RULES.EXTRACT_CHANNEL,
          countdown: RULES.COUNTDOWN,
        },
        pois: {
          breaker: POIS.breaker, switchA: POIS.switchA, switchB: POIS.switchB,
          lever: POIS.lever, dishes: POIS.dishes, termA: POIS.termA, termB: POIS.termB,
          radio: POIS.radio, lockers: POIS.lockers, notes: POIS.notes.map(n => ({ x: n.x, y: n.y })),
          extract: EXTRACT_RECT, blast: BLAST_DOOR,
        },
      });
      send(ws, lobbyPayload(p.pid));
      broadcast(lobbyPayload(null));
      if (isNew) broadcast({ t: "sys", msg: `${p.name} jacked in.` });
    }

    return {
      open(ws) {
        const sid = ws.id;
        liveSockets.set(sid, ws);
        sockMeta.set(sid, { hello: false });
        // prefill from query if provided
        const cid = ws.query && ws.query.get ? (ws.query.get("c") || null) : null;
        const nm = ws.query && ws.query.get ? (ws.query.get("n") || null) : null;
        if (cid) sockMeta.set(sid, { hello: false, qClientId: cid, qName: nm });
        send(ws, { t: "hi", max: RULES.MAX_PLAYERS });
      },

      message(ws, data) {
        const sid = ws.id;
        const pid = world.sockets.get(sid);
        let m = data;
        if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { return; } }
        else if (m && typeof m === "object") {
          if (typeof m.buffer === "string") { try { m = JSON.parse(m.buffer); } catch (e) { return; } }
          else if (m.byteLength !== undefined || (m.buffer && m.buffer.byteLength !== undefined)) {
            try { m = JSON.parse(u8ToString(m)); } catch (e) { return; }
          }
        }
        if (!m || typeof m !== "object") return;

        // rate limit: token bucket refilled by simulation time
        const meP = world.players.get(world.sockets.get(sid));
        if (meP) {
          if ((meP.msgBudget || 0) < 1) return;
          meP.msgBudget -= 1;
        }

        switch (m.t) {
          case "hello": {
            const clientId = sanitizeId(m.c || (sockMeta.get(sid) || {}).qClientId);
            const nm = m.n || (sockMeta.get(sid) || {}).qName || "";
            sockMeta.set(sid, { hello: true, clientId, name: nm });
            doHello(ws, sid, clientId, nm, false);
            break;
          }
          case "name": {
            const p = world.players.get(pid);
            if (p && world.state === "lobby") {
              p.name = sanitizeName(m.n, p.pid);
              broadcast(lobbyPayload(null));
            }
            break;
          }
          case "ready": {
            const p = world.players.get(pid);
            if (p && world.state === "lobby") {
              p.ready = !!m.v;
              broadcast(lobbyPayload(null));
              broadcast({ t: "click", v: p.ready ? 1 : 0 });
            }
            break;
          }
          case "start": {
            if (world.hostSid === sid && world.state === "lobby") beginCountdown();
            break;
          }
          case "again": {
            if (world.state === "ended") resetToLobby();
            break;
          }
          case "p": {
            const p = world.players.get(pid);
            if (p && typeof m.x === "number" && typeof m.y === "number")
              applyMove(p, { x: m.x, y: m.y, a: m.a, crouch: m.cr, sprint: m.sp, flash: m.fl });
            break;
          }
          case "act": {
            const p = world.players.get(pid);
            if (!p || p.dead || p.downed) break;
            if (m.on) {
              if (m.k === "revive" && typeof m.i === "number") {
                p.action = { kind: "revive", t: 0, pid: m.i | 0 };
              } else if (m.k === "dish" || m.k === "note") {
                p.action = { kind: m.k, t: 0, key: m.i | 0, note: m.i | 0 };
              } else if (["insert", "switchA", "switchB", "termA", "termB", "lever", "radio"].includes(m.k)) {
                p.action = { kind: m.k, t: 0, key: null, note: null };
              }
            } else if (p.action && p.action.kind === m.k) {
              p.action = null;
            }
            break;
          }
          case "door": {
            const p = world.players.get(pid);
            if (p && !p.dead && p.downed !== true && p.inLocker < 0) toggleDoorNear(p);
            break;
          }
          case "locker": {
            const p = world.players.get(pid);
            if (!p || p.dead) break;
            if (p.inLocker >= 0) { if (!p.downed) exitLocker(p); }
            else if (!p.downed) enterLocker(p);
            break;
          }
          case "drop": {
            const p = world.players.get(pid);
            if (p && p.carryingFuse && p.inLocker < 0 && !p.dead && !p.downed) {
              p.carryingFuse = false;
              world.items.push({ id: world.itemId++, type: "fuse", x: p.x, y: p.y });
              emit("drop", { pid: p.pid }, p.x, p.y);
            }
            break;
          }
          case "ping": {
            const p = world.players.get(pid);
            if (p && !p.dead) emit("ping", { pid: p.pid, name: p.name }, p.x, p.y);
            break;
          }
          case "chat": {
            const p = world.players.get(pid);
            const i = m.i | 0;
            if (p && !p.dead && i >= 0 && i < 4)
              emit("chat", { pid: p.pid, name: p.name, i }, p.x, p.y);
            break;
          }
          case "dbg": {
            if (!allowDbg) break; // dev/test harnesses only (ctx.debug)
            const p = world.players.get(pid);
            dbgCmd(m.k, p, m);
            break;
          }
        }
      },

      close(ws) {
        const sid = ws.id;
        liveSockets.delete(sid);
        const pid = world.sockets.get(sid);
        sockMeta.delete(sid);
        world.waitlist = world.waitlist.filter(s => s !== sid);
        if (pid != null) {
          const p = world.players.get(pid);
          if (p) {
            p.connected = false;
            p.action = null;
            p.disconnectedAt = world.time;
            if (world.state === "lobby") {
              // quick recycle in lobby
              if (world.time - p.disconnectedAt >= 0) { /* kept briefly for refreshes */ }
            }
            broadcast({ t: "sys", msg: `${p.name} lost signal.` });
            broadcast(lobbyPayload(null));
          }
          world.sockets.delete(sid);
        }
        promoteHost();
        admitNextIfSlot();
      },

      tick(dtArg) {
        // explicit small-seconds dt wins (deterministic harnesses / solo bridge);
        // otherwise fall back to wall-clock deltas (platform cadence).
        let dt;
        if (typeof dtArg === "number" && dtArg > 0 && dtArg < 1) {
          dt = dtArg;
          lastTickAt = Date.now();
        } else {
          const now = Date.now();
          dt = lastTickAt ? (now - lastTickAt) / 1000 : 0.05;
          lastTickAt = now;
          if (!(dt > 0)) dt = 0.05;
          if (dt > 0.25) dt = 0.25;
        }
        world.time += dt;

        tickTimers();
        pruneSoon();

        if (world.state === "countdown") {
          if (world.time >= world.countdownEndsAt) beginRun();
        }

        if (world.state === "playing") {
          // noises were accumulated from message handlers since the previous
          // tick; the monster consumes them this tick, then we clear.
          tickActions(dt);
          if (world.monster) { tickMonster(dt); tickLockerRip(); }
          tickDowned(dt);
          tickItems();

          if (world.monster && Math.random() < dt * 0.12) {
            emit("creak", {}, world.monster.x, world.monster.y);
          }
        }

        const snap = buildSnap();
        broadcast(snap);

        world.events.length = 0;
        world.noises.length = 0;

        // refill message budgets (~30 msgs/sec sustained, burst 60)
        for (const p of world.players.values())
          p.msgBudget = Math.min(60, (p.msgBudget || 0) + 1.5);
      },

      stop() {
        liveSockets.clear();
        sockMeta.clear();
        world.sockets.clear();
        timers.length = 0;
      },
    };

    /* ----- snapshot builder ----- */
    function buildSnap() {
      const m = world.monster;
      let revealed = false;
      let monOut = null;
      if (m) {
        for (const p of world.players.values()) {
          if (!p.connected || p.dead) continue;
          if (dist(p.x, p.y, m.x, m.y) < 11) { revealed = true; break; }
        }
        if (m.state === "hunt" || m.state === "retreat") revealed = true;
        monOut = { x: r2(m.x), y: r2(m.y), s: m.state, rv: revealed ? 1 : 0, fz: world.phase === "escape" ? 1 : 0 };
      }
      return {
        t: "snap",
        tm: Math.round(world.time * 100),
        state: world.state,
        phase: world.phase,
        cd: world.state === "countdown" ? Math.max(0, +(world.countdownEndsAt - world.time).toFixed(1)) : null,
        pl: [...world.players.values()].map(pubPlayer),
        mon: monOut,
        dr: [...world.doors.values()].map(d => [`${d.x},${d.y}`, d.open ? 1 : 0, d.locked ? 1 : 0]),
        it: world.items.map(i => ({ i: i.id, x: r2(i.x), y: r2(i.y) })),
        ob: world.obj ? {
          fi: world.obj.fusesIn, fn: world.obj.fusesNeeded, sw: r2(world.obj.switchProg),
          di: world.obj.dishes.map(v => Math.min(1, +v.toFixed(2))),
          dc: r2(world.obj.decodeProg), dec: world.obj.decoded ? 1 : 0,
          tr: world.obj.trap ? { p: world.obj.trap.pid, l: world.obj.trap.released ? 1 : 0 } : null,
          bo: world.obj.blackoutUntil > world.time ? +(world.obj.blackoutUntil - world.time).toFixed(2) : 0,
          ec: r2(world.obj.extractChan),
        } : null,
        end: world.endInfo,
        ev: world.events.map(e => ({ i: e.id, y: e.type, x: r2(e.x || 0), yy: r2(e.y || 0), d: e.data })),
      };
    }

    function pruneSoon() {
      // periodic housekeeping every ~5s
      if (world.time - (pruneSoon._at || 0) < 5) return;
      pruneSoon._at = world.time;
      pruneDisconnected(false);
      admitNextIfSlot();
    }

    /* ----- debug commands (only reachable when ctx.debug) ----- */
    function dbgCmd(k, p, m) {
      if (!p && k !== "win" && k !== "lose") return;
      switch (k) {
        case "tp": p.x = m.x; p.y = m.y; p.lastPos.x = m.x; p.lastPos.y = m.y; break;
        case "fuse": p.carryingFuse = true; break;
        case "fuses": if (world.obj) world.obj.fusesIn = Math.max(world.obj.fusesIn, m.n | 0); break;
        case "power":
          if (world.state === "playing") { world.obj.fusesIn = world.obj.fusesNeeded; powerOn(); }
          break;
        case "dishes":
          if (world.state === "playing" && world.phase === "power") powerOn();
          if (world.phase === "signal") { world.obj.dishes = [1, 1, 1]; emit("dish_done", { key: -1, left: 0 }, p.x, p.y); }
          break;
        case "decode":
          if (world.state === "playing" && world.phase === "power") powerOn();
          if (world.phase === "signal") { world.obj.dishes = [1, 1, 1]; decodeDone(); }
          break;
        case "escape": startEscape(); break;
        case "spawnnear": {
          if (!world.monster) spawnMonster();
          const mm = world.monster;
          mm.x = p.x + (m.dx || 3); mm.y = p.y; mm.path = null; mm.state = "hunt"; mm.huntPid = p.pid;
          mm.repathAt = 0; mm.loseAt = world.time + 8;
          mm.lastSeen = { x: p.x, y: p.y, t: world.time };
          mm.face = Math.atan2(p.y - mm.y, p.x - mm.x);
          emit("screech", {}, mm.x, mm.y);
          break;
        }
        case "freeze":
          if (world.monster) {
            world.monster.path = null; world.monster.pauseUntil = world.time + (m.sec || 20);
            world.monster.state = "patrol"; world.monster.pulseAt = world.time + (m.sec || 20);
          }
          break;
        case "downme": monsterDownPlayer(p, "dbg"); break;
        case "reviveme": p.dead = false; p.downed = false; p.bleedout = 0; break;
        case "unmonster": world.monster = null; break;
        case "win": endGame(true); break;
        case "lose": endGame(false, "The run ends here."); break;
        case "start": if (world.state === "lobby") beginCountdown(); break;
      }
    }
  }

  return { create };
}

function sanitizeName(n, pid) {
  let s = String(n == null ? "" : n).replace(/[^\w\- ]/g, "").trim().slice(0, 12);
  if (!s) s = "UNIT-" + (100 + ((pid * 37) % 900));
  return s.toUpperCase();
}
function sanitizeId(c) {
  const s = String(c == null ? "" : c).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return s || ("anon-" + Math.random().toString(36).slice(2, 10));
}
function u8ToString(v) {
  let s = "";
  const arr = v instanceof Uint8Array ? v : new Uint8Array(v.buffer || v);
  const CH = 0x8000;
  for (let i = 0; i < arr.length; i += CH)
    s += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i + CH, arr.length)));
  return s;
}

/* ---------------- platform entry ---------------- */
export default {
  maxSockets: 8,
  tickMs: 50,
  create(ctx) {
    const game = createGame(Date.now() & 0x7fffffff);
    return game.create(ctx);
  },
};
