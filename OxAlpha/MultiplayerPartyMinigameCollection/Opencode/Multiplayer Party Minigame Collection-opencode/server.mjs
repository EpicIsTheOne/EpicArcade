// Multiplayer Party Minigame Collection — authoritative room/match server.
// ESM, Node builtins only. Loaded by the platform: no listen(), no spawn.
//
// Platform contract:
//   export default { maxSockets, tickMs, create(ctx) -> { open, message, close, tick } }
//   ws: { id, send(obj|string), close(code), query(URLSearchParams), ip }
//   tick(elapsedMs) is driven by the platform at tickMs.

const TICK_MS = 50;
const MAX_ROOMS = 128;
const MAX_PLAYERS = 8;
const ROOM_TTL_MS = 10 * 60 * 1000;

const INTRO_MS = 4200;
const COUNT_MS = 3200; // 3-2-1-GO
const RESULTS_MS = 6000;

const PTS = [1000, 750, 550, 420, 320, 240, 160, 100];
const GAME_KEYS = ['tiles', 'draw', 'rush', 'dodge', 'match'];

// quick=true (dev/testing) compresses durations.
const QUICK_SCALE = 0.38;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, n) => Math.floor(rng() * n);

function makeCode(rooms) {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let tries = 0; tries < 64; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += alpha[Math.floor(Math.random() * alpha.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function makePid() { return Math.random().toString(36).slice(2, 10); }

export default {
  maxSockets: 512,
  tickMs: TICK_MS,
  create(ctx) {
    const rooms = new Map();      // code -> room
    const conns = new Map();      // ws.id -> { ws, room, player }

    const safeSend = (c, obj) => {
      try {
        const sock = c && c.ws ? c.ws : c;
        if (sock && sock.send) sock.send(obj);
      } catch (e) { /* socket dying; close() will clean */ }
    };
    const sendTo = (p, obj) => { if (p.connId && conns.has(p.connId)) safeSend(conns.get(p.connId), obj); };
    const broadcast = (room, obj) => {
      for (const p of room.players.values()) sendTo(p, obj);
    };

    const lobbyPlayers = (room) => [...room.players.values()].map(p => ({
      pid: p.pid, name: p.name, score: p.score, connected: !!p.connId,
      host: p.pid === room.hostPid, active: p.active,
    }));

    const sendRoomState = (room) => broadcast(room, {
      t: 'room', code: room.code, phase: room.phase,
      players: lobbyPlayers(room), host: room.hostPid,
      round: room.roundIdx >= 0 ? { idx: room.roundIdx, total: room.queue.length, key: room.queue[room.roundIdx] } : null,
      quick: room.quick || undefined,
    });

    const pruneRooms = () => {
      if (rooms.size <= MAX_ROOMS) return;
      const now = Date.now();
      const inactive = [...rooms.values()]
        .filter(r => ![...r.players.values()].some(p => p.connId))
        .sort((a, b) => a.lastActivity - b.lastActivity);
      for (const r of inactive.slice(0, rooms.size - MAX_ROOMS)) {
        if (now - r.lastActivity > 60_000) rooms.delete(r.code);
      }
    };

    // ---------------------------------------------------------------- games

    const GAMES = {
      // ---- Tile Trouble: shrinking tile island survival -------------------
      tiles: {
        dur: 58000, name: 'Tile Trouble',
        init(g, rng, players) {
          g.W = 9; g.H = 7;
          g.alive = new Array(g.W * g.H).fill(true);
          g.warn = new Map();        // idx -> deadline(ms remaining)
          g.players = new Map();
          const cx = Math.floor((g.W - 1) / 2), cy = Math.floor((g.H - 1) / 2);
          const ring = [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]];
          let slot = 0;
          for (const pid of players) {
            const off = ring[slot++ % ring.length];
            const x = Math.max(0, Math.min(g.W - 1, cx + off[0]));
            const y = Math.max(0, Math.min(g.H - 1, cy + off[1]));
            g.players.set(pid, { pid, x, y, cd: 0, alive: true, elimAt: Infinity });
          }
          g.crumbleT = 2600;         // grace before first crumble
          g.interval = 950;
          g.t = 0;
        },
        onInput(g, p, st, pl, msg) {
          if (!pl || !pl.alive || msg.k !== 'step') return;
          if (pl.cd > 0) return;
          const nx = pl.x + (msg.d ? msg.d[0] : 0), ny = pl.y + (msg.d ? msg.d[1] : 0);
          if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return;
          const idx = ny * g.W + nx;
          if (!g.alive[idx]) return;
          for (const o of g.players.values()) if (o !== pl && o.alive && o.x === nx && o.y === ny) return;
          pl.x = nx; pl.y = ny; pl.cd = 0.16;
        },
        update(g, dt, api) {
          g.t += dt;
          for (const pl of g.players.values()) if (pl.cd > 0) pl.cd -= dt;
          g.crumbleT -= dt;
          if (g.crumbleT <= 0) {
            g.interval = Math.max(430, g.interval * 0.985);
            g.crumbleT = g.interval;
            const open = [];
            for (let i = 0; i < g.alive.length; i++) if (g.alive[i] && !g.warn.has(i)) open.push(i);
            if (open.length > Math.max(4, g.players.size)) {
              const batch = Math.max(1, Math.floor(open.length / 26));
              for (let b = 0; b < batch; b++) {
                const i = open[ri(api.rng, open.length)];
                g.warn.set(i, 1.15);
              }
              api.ev('crumble', { tiles: [...g.warn.keys()] });
            }
          }
          for (const [i, left] of [...g.warn]) {
            const nl = left - dt;
            if (nl <= 0) {
              g.warn.delete(i); g.alive[i] = false;
              for (const pl of g.players.values()) {
                if (pl.alive && pl.y * g.W + pl.x === i) { pl.alive = false; pl.elimAt = g.t; api.elim(pl.pid); }
              }
            } else g.warn.set(i, nl);
          }
          let aliveN = 0;
          for (const pl of g.players.values()) if (pl.alive) aliveN++;
          if (aliveN <= 1 || g.t > g.dur) api.done();
        },
        rank(g) {
          const arr = [...g.players.entries()];
          const survivors = arr.filter(([, p]) => p.alive).map(([pid]) => pid);
          const dead = arr.filter(([, p]) => !p.alive)
            .sort((a, b) => b[1].elimAt - a[1].elimAt).map(([pid]) => pid);
          return [...survivors, ...dead];
        },
        snap(g) {
          const ps = [];
          for (const [pid, p] of g.players) ps.push([pid, p.x, p.y, p.alive ? 1 : 0]);
          return { W: g.W, H: g.H, a: g.alive.map(v => v ? 1 : 0), w: [...g.warn.keys()], p: ps };
        },
      },

      // ---- Quick Draw: reaction trials -------------------------------------
      draw: {
        dur: 75000, name: 'Quick Draw',
        init(g, rng, players) {
          g.rng = rng;
          g.trialsTotal = players.size >= 3 ? 8 : 5;
          g.trial = 0; g.phase = 'wait'; g.pt = 1.2 + rng() * 1.2;
          g.wins = new Map(players.map(p => [p, 0]));
          g.false = new Map(players.map(p => [p, 0]));
          g.rtSum = new Map(players.map(p => [p, 0])); g.rtN = new Map(players.map(p => [p, 0]));
          g.stun = new Map(); g.winner = null; g.goAt = 0; g.t = 0;
        },
        onInput(g, p, st, pl, msg) {
          if (!pl || msg.k !== 'act') return;
          const now = g.t;
          const stunUntil = g.stun.get(p) || 0;
          if (now < stunUntil) return;
          if (g.phase === 'wait') {
            g.false.set(p, (g.false.get(p) || 0) + 1);
            g.stun.set(p, now + 1.1);
            api_ev(g, 'early', { pid: p });
            return;
          }
          if (g.phase === 'go' && !g.winner) {
            g.winner = p;
            g.wins.set(p, (g.wins.get(p) || 0) + 1);
            g.rtSum.set(p, g.rtSum.get(p) + (now - g.goAt)); g.rtN.set(p, g.rtN.get(p) + 1);
            api_ev(g, 'score', { pid: p });
            g.phase = 'between'; g.pt = 1.0;
          }
        },
        update(g, dt, api) {
          g.t += dt;
          g.pt -= dt;
          if (g.phase === 'wait' && g.pt <= 0) {
            g.phase = 'go'; g.goAt = g.t; g.winner = null;
            api.ev('signal', {});
            g.pt = 2.4;
          } else if (g.phase === 'go' && g.pt <= 0) {
            g.phase = 'between'; g.pt = 0.8;
          } else if (g.phase === 'between' && g.pt <= 0) {
            g.trial++;
            if (g.trial >= g.trialsTotal || g.t > g.dur) { api.done(); return; }
            g.phase = 'wait';
            g.pt = 1.2 + g.rng() * 1.8;
            api.ev('reset', {});
          }
        },
        rank(g) {
          return [...g.wins.keys()].sort((a, b) =>
            (g.wins.get(b) - g.wins.get(a)) ||
            ((g.false.get(a) || 0) - (g.false.get(b) || 0)) ||
            ((g.rtSum.get(a) / Math.max(1, g.rtN.get(a))) - (g.rtSum.get(b) / Math.max(1, g.rtN.get(b)))));
        },
        snap(g) {
          return { ph: g.phase === 'go' ? 1 : 0, w: g.winner || null, tr: g.trial, tt: g.trialsTotal, last: g.lastWin || null };
        },
      },

      // ---- Lane Rush: rhythm obstacle race ---------------------------------
      rush: {
        dur: 70000, name: 'Lane Rush', FINISH: 100,
        init(g, rng, players) {
          g.FINISH = 100;
          g.obs = [];
          let d = 12;
          let lastLanes = [-1, -1];
          while (d < g.FINISH - 6) {
            const lanes = [0, 1, 2].filter(() => rng() < 0.62);
            let pick = lanes.length ? lanes : [ri(rng, 3)];
            if (pick.length >= 2) pick = pick.slice(0, 2);
            // guarantee at least one free lane
            if (pick.length >= 2 && lastLanes[0] === pick[0]) pick = [pick[1]];
            for (const l of pick) g.obs.push({ d: +(d.toFixed(1)), l });
            lastLanes = pick;
            d += 5.5 + rng() * 3.5;
          }
          g.pulseEvery = 0.85;
          g.clock = 0;
          g.players = new Map();
          for (const pid of players) g.players.set(pid, { pid, lane: 1, prog: 0, stun: 0, boost: 0, fin: 0, laneCd: 0, prevProg: 0 });
          g.t = 0;
        },
        onInput(g, p, st, pl, msg) {
          if (!pl || pl.fin) return;
          if (msg.k === 'step' && msg.d) {
            if (pl.laneCd > 0) return;
            const nl = Math.max(0, Math.min(2, pl.lane + msg.d[1] + msg.d[0]));
            if (nl !== pl.lane) { pl.lane = nl; pl.laneCd = 0.14; }
          } else if (msg.k === 'act') {
            const ph = (g.clock % g.pulseEvery) / g.pulseEvery;
            const diff = Math.min(ph, 1 - ph) * g.pulseEvery;
            if (diff <= 0.15) { pl.boost = 0.75; api_ev(g, 'boost', { pid: p }); }
            else { pl.stun = Math.max(pl.stun, 0.55); api_ev(g, 'stumble', { pid: p }); }
          }
        },
        update(g, dt, api) {
          g.clock += dt; g.t += dt;
          const base = Math.min(13.5, 8.6 + g.t * 0.22);
          for (const pl of g.players.values()) {
            if (pl.laneCd > 0) pl.laneCd -= dt;
            if (pl.stun > 0) pl.stun -= dt;
            if (pl.boost > 0) pl.boost -= dt;
            if (pl.fin) continue;
            const eff = pl.stun > 0 ? 0 : base * (pl.boost > 0 ? 1.42 : 1);
            pl.prevProg = pl.prog;
            pl.prog += eff * dt;
            if (!pl.fin) {
              for (const o of g.obs) {
                if (o.l === pl.lane && pl.prevProg < o.d && pl.prog >= o.d && pl.stun <= 0) {
                  pl.prog = o.d - 0.35; pl.stun = 0.85; api_ev(g, 'hit', { pid: pl.pid, lane: o.l });
                  break;
                }
              }
            }
            if (!pl.fin && pl.prog >= g.FINISH) { pl.fin = g.t; api_ev(g, 'finish', { pid: pl.pid }); }
          }
          let pending = 0;
          for (const pl of g.players.values()) if (!pl.fin) pending++;
          if (pending === 0 || g.t > g.dur) api.done();
        },
        rank(g) {
          return [...g.players.entries()]
            .sort((a, b) => {
              if (a[1].fin && b[1].fin) return a[1].fin - b[1].fin;
              if (a[1].fin) return -1;
              if (b[1].fin) return 1;
              return b[1].prog - a[1].prog;
            }).map(([pid]) => pid);
        },
        snap(g) {
          const ps = []; const bs = [];
          for (const [pid, p] of g.players) ps.push([pid, +p.prog.toFixed(2), p.lane, p.fin ? 1 : 0, p.boost > 0 ? 1 : 0, p.stun > 0 ? 1 : 0]);
          return { F: g.FINISH, o: g.obs.map(o => [+o.d.toFixed(1), o.l]), p: ps, clk: +g.clock.toFixed(2), pe: g.pulseEvery };
        },
      },

      // ---- Dodge Frenzy: bouncing-ball survival -----------------------------
      dodge: {
        dur: 52000, name: 'Dodge Frenzy',
        init(g, rng, players) {
          g.R = 1;
          g.players = new Map();
          let i = 0;
          for (const pid of players) {
            const a = (i / players.length) * Math.PI * 2;
            g.players.set(pid, { pid, x: Math.cos(a) * 0.72, y: Math.sin(a) * 0.72, hp: 3, inv: 0, alive: true, elimAt: Infinity, kx: 0, ky: 0 });
            i++;
          }
          g.balls = [];
          for (let b = 0; b < 3; b++) this.spawnBall(g, rng);
          g.spawnT = 11; g.t = 0;
        },
        spawnBall(g, rng) {
          const a = rng() * Math.PI * 2;
          const sp = 0.55 + rng() * 0.25 + (g.balls.length * 0.02);
          g.balls.push({ x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.85, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, r: 0.055 + rng() * 0.03 });
        },
        onInput(g, p, st, pl, msg) {
          if (!pl || !pl.alive) return;
          if (msg.k === 'dir') {
            const dx = msg.d ? msg.d[0] : 0, dy = msg.d ? msg.d[1] : 0;
            const m = Math.hypot(dx, dy) || 1;
            pl.tx = dx / m; pl.ty = dy / m; pl.moving = (dx || dy) ? true : false;
          }
        },
        update(g, dt, api) {
          g.t += dt;
          g.spawnT -= dt;
          const speed = 0.52;
          for (const pl of g.players.values()) {
            if (pl.inv > 0) pl.inv -= dt;
            if (!pl.alive) continue;
            let vx = (pl.moving ? pl.tx : 0) * speed, vy = (pl.moving ? pl.ty : 0) * speed;
            vx += pl.kx; vy += pl.ky;
            pl.kx *= 0.86; pl.ky *= 0.86;
            pl.x += vx * dt; pl.y += vy * dt;
            const d = Math.hypot(pl.x, pl.y);
            if (d > g.R - 0.045) { pl.x *= (g.R - 0.045) / d; pl.y *= (g.R - 0.045) / d; }
          }
          const ballSpd = 1 + Math.min(0.65, g.t / 40);
          for (const b of g.balls) {
            b.x += b.vx * ballSpd * dt; b.y += b.vy * ballSpd * dt;
            const d = Math.hypot(b.x, b.y);
            if (d > g.R - b.r) {
              const nx = b.x / d, ny = b.y / d;
              b.x = nx * (g.R - b.r); b.y = ny * (g.R - b.r);
              const dot = b.vx * nx + b.vy * ny;
              b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
            }
            for (const [pid, pl] of g.players) {
              if (!pl.alive || pl.inv > 0) continue;
              if (Math.hypot(b.x - pl.x, b.y - pl.y) < b.r + 0.038) {
                pl.hp--; pl.inv = 1.25;
                const kd = Math.hypot(b.vx, b.vy) || 1;
                pl.kx = (b.vx / kd) * 0.45; pl.ky = (b.vy / kd) * 0.45;
                api.ev('hit', { pid, hp: pl.hp });
                if (pl.hp <= 0) { pl.alive = false; pl.elimAt = g.t; api.elim(pid); }
                break;
              }
            }
          }
          if (g.spawnT <= 0 && g.balls.length < 7) { this.spawnBall(g, api.rng); g.spawnT = 10; api.ev('newball', {}); }
          let aliveN = 0;
          for (const pl of g.players.values()) if (pl.alive) aliveN++;
          if (aliveN <= 1 || g.t > g.dur) api.done();
        },
        rank(g) {
          return [...g.players.entries()]
            .sort((a, b) => {
              if (a[1].alive !== b[1].alive) return a[1].alive ? -1 : 1;
              if (a[1].hp !== b[1].hp) return b[1].hp - a[1].hp;
              return a[1].elimAt - b[1].elimAt;
            }).map(([pid]) => pid);
        },
        snap(g) {
          const ps = [], bs = [];
          for (const [pid, p] of g.players) ps.push([pid, +p.x.toFixed(3), +p.y.toFixed(3), p.hp, p.inv > 0 ? 1 : 0, p.alive ? 1 : 0]);
          for (const b of g.balls) bs.push([+b.x.toFixed(3), +b.y.toFixed(3), +b.r.toFixed(3)]);
          return { R: g.R, p: ps, b: bs };
        },
      },

      // ---- Mind Match: shared memory board ----------------------------------
      match: {
        dur: 70000, name: 'Mind Match',
        init(g, rng, players) {
          const N = 24, pairs = N / 2;
          const ids = [];
          for (let i = 0; i < pairs; i++) ids.push(i, i);
          for (let i = ids.length - 1; i > 0; i--) { const j = ri(rng, i + 1);[ids[i], ids[j]] = [ids[j], ids[i]]; }
          g.cards = ids.map(id => ({ id, st: 0, by: null, lockT: 0 })); // st 0 hidden,1 locked/revealed,2 matched
          g.sel = new Map();           // pid -> [idx]
          g.pairsW = new Map(players.map(p => [p, 0]));
          g.miss = new Map(players.map(p => [p, 0]));
          g.matched = 0; g.t = 0;
        },
        onInput(g, p, st, pl, msg) {
          if (!pl || msg.k !== 'tile') return;
          const i = msg.i | 0;
          if (i < 0 || i >= g.cards.length) return;
          const card = g.cards[i];
          if (card.st !== 0 || card.lockT > 0) return;
          const sel = g.sel.get(p) || [];
          if (sel.length >= 2) return;
          card.st = 1; card.by = p; card.lockT = 999;
          sel.push(i); g.sel.set(p, sel);
          api_ev(g, 'flip', { pid: p, i });
          if (sel.length === 2) {
            const [a, b] = sel.map(j => g.cards[j]);
            if (a.id === b.id) {
              a.st = 2; b.st = 2; a.lockT = 0; b.lockT = 0;
              g.pairsW.set(p, (g.pairsW.get(p) || 0) + 1);
              g.matched += 2; g.sel.set(p, []);
              api_ev(g, 'pair', { pid: p, a: sel[0], b: sel[1], n: g.pairsW.get(p) });
              if (g.matched >= g.cards.length) g.forceEnd = true;
            } else {
              g.miss.set(p, (g.miss.get(p) || 0) + 1);
              a.lockT = 0.75; b.lockT = 0.75;
              g.sel.set(p, []);
              api_ev(g, 'miss', { pid: p, a: sel[0], b: sel[1] });
            }
          }
        },
        update(g, dt, api) {
          g.t += dt;
          for (const c of g.cards) {
            if (c.lockT > 0 && c.lockT < 900) {
              c.lockT -= dt;
              if (c.lockT <= 0) { c.st = 0; c.by = null; c.lockT = 0; api.ev('unflip', { i: g.cards.indexOf(c) }); }
            }
          }
          if (g.forceEnd || g.t > g.dur) api.done();
        },
        rank(g) {
          return [...g.pairsW.keys()].sort((a, b) =>
            (g.pairsW.get(b) - g.pairsW.get(a)) || ((g.miss.get(a) || 0) - (g.miss.get(b) || 0)));
        },
        snap(g) {
          return { c: g.cards.map(c => c.st === 2 ? c.id + 100 : c.st === 1 ? c.id : -1), pw: [...g.pairsW.entries()], t: +g.t.toFixed(1), d: +g.dur.toFixed(1) };
        },
      },
    };

    // helper so game defs can emit events without full api plumbing
    function api_ev(g, kind, data) { if (g._ev) g._ev(kind, data); }

    // ------------------------------------------------------------- room flow

    const startRound = (room) => {
      room.roundIdx++;
      if (room.roundIdx >= room.queue.length) {
        room.phase = 'podium'; room.game = null;
        const board = [...room.players.values()]
          .map(p => ({ pid: p.pid, name: p.name, score: p.score }))
          .sort((a, b) => b.score - a.score);
        broadcast(room, { t: 'final', board });
        broadcast(room, { t: 'toast', msg: 'Match over!' });
        return;
      }
      const key = room.queue[room.roundIdx];
      room.phase = 'intro';
      room.phaseT = INTRO_MS * (room.quick ? 0.6 : 1);
      room.seed = (Math.random() * 0xffffffff) >>> 0;
      broadcast(room, {
        t: 'intro', idx: room.roundIdx, total: room.queue.length,
        key, dur: GAMES[key].dur * (room.quick ? QUICK_SCALE : 1) / 1000, seed: room.seed,
      });
      sendRoomState(room);
    };

    const beginPlay = (room) => {
      const key = room.queue[room.roundIdx];
      const def = GAMES[key];
      const seed = room.seed;
      const rng = mulberry32(seed);
      const participants = [...room.players.values()].filter(p => p.connId && p.active !== false);
      room.gameKey = key;
      room.game = { key, def, t: 0, dur: def.dur * (room.quick ? QUICK_SCALE : 1) / 1000, state: {}, over: false };
      const g = room.game.state;
      g._ev = (kind, data) => broadcast(room, { t: 'ev', k: kind, ...data });
      const api = {
        rng,
        ev: (kind, data) => broadcast(room, { t: 'ev', k: kind, ...data }),
        elim: (pid) => broadcast(room, { t: 'ev', k: 'elim', pid }),
        done: () => { room.game.over = true; },
      };
      room.gameApi = api;
      def.init(g, rng, participants.map(p => p.pid));
      room.phase = 'play';
      room.snapT = 0;
      broadcast(room, { t: 'go' });
      broadcastSnap(room);
    };

    const broadcastSnap = (room) => {
      if (!room.game) return;
      const g = room.game.state;
      const payload = { t: 'snap', k: room.game.key, tm: +room.game.t.toFixed(2), dur: +room.game.dur.toFixed(2), s: room.game.def.snap(g) };
      broadcast(room, payload);
    };

    const finishRound = (room) => {
      if (!room.game) { startRound(room); return; }
      const g = room.game.state;
      const rankedIds = room.game.def.rank(g);
      const parts = [...room.players.values()];
      const inGame = new Set(rankedIds);
      const rank = [];
      rankedIds.forEach((pid, i) => {
        const p = room.players.get(pid);
        if (!p) return;
        const pts = PTS[i] || 100;
        p.score += pts;
        rank.push({ pid, name: p.name, pts, total: p.score });
      });
      // players who joined mid-round or disconnected get nothing but stay listed
      for (const p of parts) {
        if (!inGame.has(p.pid)) rank.push({ pid: p.pid, name: p.name, pts: 0, total: p.score });
      }
      room.phase = 'results';
      room.phaseT = RESULTS_MS;
      room.game = null;
      broadcast(room, { t: 'results', rank });
      sendRoomState(room);
    };

    const tickRoom = (room, dtMs) => {
      const dt = dtMs / 1000;
      switch (room.phase) {
        case 'intro':
          room.phaseT -= dtMs;
          if (room.phaseT <= 0) {
            room.phase = 'countdown'; room.count = 3; room.countT = 1000;
            broadcast(room, { t: 'count', n: 3 });
          }
          break;
        case 'countdown': {
          room.countT -= dtMs;
          if (room.countT <= 0) {
            room.count--;
            if (room.count <= 0) {
              beginPlay(room);
            } else {
              broadcast(room, { t: 'count', n: room.count });
              room.countT = 1000;
            }
          }
          break;
        }
        case 'play': {
          if (!room.game) break;
          room.game.t += dt;
          const g = room.game.state;
          room.game.def.update(g, dt, room.gameApi);
          room.snapT = (room.snapT || 0) + dtMs;
          if (room.snapT >= 90) { room.snapT = 0; broadcastSnap(room); }
          if (room.game.over || room.game.t >= room.game.dur) finishRound(room);
          break;
        }
        case 'results':
          room.phaseT -= dtMs;
          if (room.phaseT <= 0) startRound(room);
          break;
        default:
          break;
      }
      room.lastActivity = Date.now();
    };

    // -------------------------------------------------------------- handlers

    const handleCreate = (ws, m) => {
      if (rooms.size >= MAX_ROOMS) pruneRooms();
      const code = makeCode(rooms);
      if (!code) { safeSend(wsConn(ws), { t: 'err', msg: 'Server busy' }); return; }
      const room = {
        code, hostPid: null, phase: 'lobby', players: new Map(),
        roundIdx: -1, queue: [], quick: !!m.quick, seed: 0,
        lastActivity: Date.now(),
      };
      rooms.set(code, room);
      joinRoom(ws, room, m.name);
    };

    const connOf = (ws) => conns.get(ws.id);
    const wsConn = (ws) => connOf(ws)?.wrapper || ws;

    const joinRoom = (ws, room, name, rejoinPid) => {
      const cleanName = String(name || 'Player').slice(0, 14).trim() || 'Player';
      let player = null;
      if (rejoinPid && room.players.has(rejoinPid)) player = room.players.get(rejoinPid);
      if (!player) {
        if (room.players.size >= MAX_PLAYERS) { safeSend(connOf(ws), { t: 'err', msg: 'Room is full (8 max)' }); return; }
        player = { pid: makePid(), name: cleanName, score: 0, connId: null, active: true };
        room.players.set(player.pid, player);
      } else {
        player.name = cleanName || player.name;
      }
      const wasOff = !player.connId;
      player.connId = ws.id;
      const hostP = room.players.get(room.hostPid);
      if (!room.hostPid || !hostP || !hostP.connId) room.hostPid = player.pid;
      conns.set(ws.id, { ws, room, player, wrapper: ws });

      sendTo(player, { t: 'welcome', pid: player.pid, code: room.code, phase: room.phase, host: room.hostPid });
      if (wasOff) broadcast(room, { t: 'toast', msg: `${player.name} joined` });
      sendRoomState(room);
      if (room.phase === 'podium') {
        const board = [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score })).sort((a, b) => b.score - a.score);
        sendTo(player, { t: 'final', board });
      }
    };

    const handleStart = (room, player, m) => {
      if (player.pid !== room.hostPid) return;
      if (room.phase !== 'lobby' && room.phase !== 'podium') return;
      const connected = [...room.players.values()].filter(p => p.connId);
      if (connected.length < 2) { sendTo(player, { t: 'err', msg: 'Need at least 2 players' }); return; }
      room.quick = !!m.quick;
      for (const p of room.players.values()) { p.score = 0; p.active = p.connId ? true : false; }
      room.queue = [...GAME_KEYS];
      for (let i = room.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]]; }
      room.roundIdx = -1;
      room.seed = (Math.random() * 0xffffffff) >>> 0;
      startRound(room);
    };

    const handleAgain = (room, player) => {
      if (player.pid !== room.hostPid || room.phase !== 'podium') return;
      room.phase = 'lobby';
      for (const p of room.players.values()) { p.score = 0; p.active = true; }
      sendRoomState(room);
      handleStart(room, player, {});
    };

    const message = (ws, raw) => {
      const c = conns.get(ws.id);
      let m;
      try { m = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw)); } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (m.t === 'create') { handleCreate(ws, m); return; }
      if (m.t === 'join') {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) { safeSend(connOf(ws), { t: 'err', msg: 'Room not found' }); return; }
        joinRoom(ws, room, m.name);
        return;
      }
      if (m.t === 'rejoin') {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) { safeSend(connOf(ws), { t: 'err', msg: 'Room closed', gone: true }); return; }
        joinRoom(ws, room, m.name, m.pid);
        return;
      }
      if (!c) return;
      const { room, player } = c;

      switch (m.t) {
        case 'start': handleStart(room, player, m); break;
        case 'again': handleAgain(room, player); break;
        case 'name': {
          const nn = String(m.name || '').slice(0, 14).trim();
          if (nn && room.phase === 'lobby') { player.name = nn; sendRoomState(room); }
          break;
        }
        case 'in': {
          if (room.phase !== 'play' || !room.game) return;
          const g = room.game.state;
          const pl = g.players ? g.players.get(player.pid) : null;
          if (pl === null && !(room.game.key === 'match')) return;
          if (msgRateOk(ws)) room.game.def.onInput(g, player.pid, room, pl, m);
          break;
        }
        default: break;
      }
    };

    const rateMap = new Map(); // ws.id -> {n, win}
    function msgRateOk(ws) {
      const now = Date.now();
      let e = rateMap.get(ws.id);
      if (!e || now - e.win > 1000) { e = { n: 0, win: now }; rateMap.set(ws.id, e); }
      e.n++;
      return e.n <= 30;
    }

    const open = (ws) => {
      // Auto rejoin via query params: ?code=XXXX&pid=token&name=Nick
      const q = ws.query;
      if (q && q.get('code')) {
        const room = rooms.get(q.get('code').toUpperCase());
        if (room) joinRoom(ws, room, q.get('name') || '', q.get('pid') || undefined);
      } else {
        safeSend(connOf(ws) ? connOf(ws) : ws, { t: 'hello' });
      }
    };

    const close = (ws) => {
      const c = conns.get(ws.id);
      rateMap.delete(ws.id);
      if (!c) return;
      conns.delete(ws.id);
      const { room, player } = c;
      player.connId = null;
      let any = false;
      for (const p of room.players.values()) if (p.connId) { any = true; break; }
      if (any) broadcast(room, { t: 'toast', msg: `${player.name} disconnected` });
      if (room.hostPid === player.pid) {
        for (const p of room.players.values()) if (p.connId) { room.hostPid = p.pid; break; }
        sendRoomState(room);
      } else if (any) {
        sendRoomState(room);
      }
      if (!any) room.lastActivity = Date.now();
    };

    const tick = (dtMs) => {
      const d = (typeof dtMs === 'number' && isFinite(dtMs) && dtMs > 0 && dtMs < 5000) ? dtMs : TICK_MS;
      for (const room of [...rooms.values()]) {
        try { tickRoom(room, d); } catch (e) { /* keep other rooms alive */ }
      }
    };

    return { open, message, close, tick };
  },
};
