import { createGame } from "../Multiplayer Horror Escape-opencode/server.mjs";
const game = createGame(1234);
const log = [];
const mk = id => ({ id, query: new URLSearchParams(), send: s => log.push(JSON.parse(s)), close() {} });
const h = game.create({ debug: true });
const wa = mk("A"), wb = mk("B");
h.open(wa); h.open(wb);
h.message(wa, JSON.stringify({ t: "hello", c: "c1", n: "ALPHA" }));
h.message(wb, JSON.stringify({ t: "hello", c: "c2", n: "BETA" }));
h.message(wa, JSON.stringify({ t: "start" }));
for (let i = 0; i < 80; i++) h.tick(0.05);
// down B via dbg, then remove the monster entirely
h.message(wb, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 1 }));
let bb = null;
for (let i = 0; i < 40; i++) {
  h.tick(0.05);
  const s = [...log].reverse().find(m => m.t === "snap");
  bb = s.pl.find(p => p.pid === 2);
  if (bb.dn === 1) break;
}
console.log("B:", bb.x, bb.y, "dn", bb.dn);
if (bb.dn !== 1) { console.error("FAILED TO DOWN B"); process.exit(1); }
h.message(wb, JSON.stringify({ t: "dbg", k: "unmonster" }));
h.message(wa, JSON.stringify({ t: "dbg", k: "tp", x: bb.x + 0.9, y: bb.y }));
for (let i = 0; i < 3; i++) h.tick(0.05);
console.log("A at:", [...log].reverse().find(m => m.t === "snap").pl.find(p => p.pid === 1).x);
h.message(wa, JSON.stringify({ t: "act", k: "revive", i: 2, on: true }));
for (let i = 1; i <= 120; i++) {
  h.tick(0.05);
  if (i % 20 === 0) {
    const s = [...log].reverse().find(m => m.t === "snap");
    const a = s.pl.find(p => p.pid === 1), b2 = s.pl.find(p => p.pid === 2);
    console.log(`t${i} A(${a.x},${a.y},act:${a.act},${a.actT}) B(dn${b2.dn} bo${b2.bo})`);
  }
}
