/* Deterministic headless verification of the full co-op arc via dbg channel. */
import { createGame, MAP_ROWS, MAP_W, MAP_H } from "../Multiplayer Horror Escape-opencode/server.mjs";

const game = createGame(1234);
const log = [];
let evCount = 0;
const mk = id => ({ id, query: new URLSearchParams(), send: s => { const o = JSON.parse(s); log.push(o); if (o.ev) evCount += o.ev.length; }, close() {} });
const h = game.create({ debug: true });
const wsA = mk("A"), wsB = mk("B");
h.open(wsA); h.open(wsB);
h.message(wsA, JSON.stringify({ t: "hello", c: "cid-alpha", n: "ALPHA" }));
h.message(wsB, JSON.stringify({ t: "hello", c: "cid-beta", n: "BETA" }));

const snap = () => [...log].reverse().find(m => m.t === "snap");
const posOf = pid => {
  const s = snap();
  const p = s.pl.find(q => q && q.pid === pid);
  if (!p) { console.error("MISSING pid", pid, "in snap state", s.state, "pl:", JSON.stringify(s.pl)); process.exit(2); }
  return p;
};
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

function bfsPath(sx, sy, gx, gy) {
  const solid = (x, y) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || MAP_ROWS[y][x] === "#" || (y === 32 && x === 32);
  const key = (x, y) => y * MAP_W + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const q = [[sx, sy]];
  for (let hd = 0; hd < q.length; hd++) {
    const [cx, cy] = q[hd];
    if (cx === gx && cy === gy) break;
    for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
      if (prev.has(key(nx,ny)) || solid(nx,ny)) continue;
      prev.set(key(nx,ny), key(cx,cy));
      q.push([nx,ny]);
    }
  }
  if (!prev.has(key(gx,gy))) return null;
  const path = []; let cur = key(gx,gy);
  while (cur !== -1) { path.push([cur % MAP_W + 0.5, Math.floor(cur/MAP_W) + 0.5]); cur = prev.get(cur); }
  return path.reverse();
}

function walkTo(pid, tx, ty, maxTicks = 1600) {
  const start = posOf(pid);
  const path = bfsPath(Math.floor(start.x), Math.floor(start.y), Math.floor(tx), Math.floor(ty));
  if (!path) return false;
  const wpts = [...path, [tx, ty]];
  const ws = pid === 1 ? wsA : wsB;
  const opened = new Set();
  let wi = 0, stuck = 0, lx = -99, ly = -99;
  for (let i = 0; i < maxTicks; i++) {
    if (wi >= wpts.length) return true;
    const p = posOf(pid);
    const [wx, wy] = wpts[wi];
    const dx = wx - p.x, dy = wy - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) { wi++; continue; }
    for (let j = wi; j < Math.min(wi + 3, wpts.length); j++) {
      const [ax, ay] = wpts[j];
      const k2 = `${Math.floor(ax)},${Math.floor(ay)}`;
      if (!opened.has(k2) && MAP_ROWS[Math.floor(ay)][Math.floor(ax)] === "D" && Math.hypot(ax - p.x, ay - p.y) < 1.6) {
        h.message(ws, JSON.stringify({ t: "door" }));
        opened.add(k2);
      }
    }
    if (Math.abs(p.x - lx) < 0.01 && Math.abs(p.y - ly) < 0.01) {
      if (++stuck > 25) { h.message(ws, JSON.stringify({ t: "door" })); stuck = 0; }
    } else { stuck = 0; lx = p.x; ly = p.y; }
    const sp = 3.6 * 0.05;
    h.message(ws, JSON.stringify({ t: "p", x: p.x + dx/d*Math.min(sp,d), y: p.y + dy/d*Math.min(sp,d), a: 0 }));
    h.tick(0.05);
  }
  return dist(posOf(pid).x, posOf(pid).y, tx, ty) < 1.2;
}
const T = n => { for (let i = 0; i < n; i++) h.tick(0.05); };
const say = (w, o) => h.message(w, JSON.stringify(o));

/* ---- lobby & countdown ---- */
say(wsA, { t: "ready", v: true });
say(wsB, { t: "ready", v: true });
say(wsA, { t: "start" });
T(80);
console.log("countdown -> playing:", snap().state === "playing", "| phase:", snap().phase);

/* ---- phase 1: real walk, pickup, insert ---- */
console.log("walk to storage fuse:", walkTo(1, 2.5, 7.5));
console.log("fuse picked up:", posOf(1).fu === 1, "| items left:", snap().it.length);
console.log("walk to breaker:", walkTo(1, 7.5, 13.9));
say(wsA, { t: "act", k: "insert", on: true });
T(60);
console.log("fuses in:", snap().ob.fi, "/", snap().ob.fn);

/* ---- power on via remaining fuses (dbg), monster spawns ---- */
say(wsA, { t: "dbg", k: "power" });
T(10);
console.log("phase signal:", snap().phase === "signal", "| monster:", !!snap().mon);

/* ---- dishes + decode: trap + escape ---- */
say(wsA, { t: "dbg", k: "dishes" });
T(3);
// evacuate during blackout so the airlock win-channel can't fire while parked;
// A hides in storage (off the monster's atrium->corridor route), B baits in the east corridor
say(wsA, { t: "dbg", k: "tp", x: 3.5, y: 4.5 });
say(wsB, { t: "dbg", k: "tp", x: 38.5, y: 24.5 });
say(wsA, { t: "dbg", k: "decode" });
T(300);
const sDec = snap();
console.log("decoded+escape:", sDec.phase === "escape", "| state playing:", sDec.state === "playing", "| trapped pid:", sDec.ob.tr && sDec.ob.tr.p);

/* ---- hunt catches a stationary target (controlled) ---- */
say(wsB, { t: "dbg", k: "spawnnear", dx: 2 });
let downedAt = -1;
for (let i = 0; i <= 200; i++) {
  T(1);
  if (posOf(2).dn === 1) { downedAt = i; break; }
}
console.log("hunt downs B:", downedAt >= 0, `(tick ${downedAt})`);

/* ---- revive (threat removed, adjacent, outside win zone) ---- */
say(wsA, { t: "dbg", k: "unmonster" });
say(wsA, { t: "dbg", k: "reviveme" });
T(2);
const bPos = posOf(2);
say(wsA, { t: "dbg", k: "tp", x: bPos.x - 0.8, y: bPos.y });
T(2);
say(wsA, { t: "act", k: "revive", i: 2, on: true });
let revivedAt = -1;
for (let i = 0; i < 120; i++) {
  T(1);
  if (posOf(2).dn === 0) { revivedAt = i; break; }
  if (i > 0 && i % 40 === 0) {
    const s = snap();
    const a = s.pl.find(q => q.pid === 1), b = s.pl.find(q => q.pid === 2);
    console.log(`  rv${i} state=${s.state} A(${a.x},${a.y},act:${a.act},${a.actT}) B(${b.x},${b.y},dn${b.dn})`);
  }
}
console.log("revive works:", revivedAt >= 0, `(tick ${revivedAt})`);

/* ---- lose path: whole crew down ---- */
for (const w of [wsA, wsB]) say(w, { t: "dbg", k: "downme" });
T(5);
const sLose = snap();
console.log("all-down ends run:", sLose.state === "ended", "| is lose:", !!(sLose.end && !sLose.end.win));

/* ---- auto lobby return + replay ---- */
T(320);
console.log("auto lobby:", snap().state === "lobby");
say(wsA, { t: "ready", v: true });
say(wsB, { t: "ready", v: true });
say(wsA, { t: "start" });
T(80);
console.log("second run:", snap().state === "playing", snap().phase);

console.log(`events=${evCount} msgs=${log.length}`);
