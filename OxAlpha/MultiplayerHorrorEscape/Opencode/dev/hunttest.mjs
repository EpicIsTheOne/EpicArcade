import { createGame } from "../Multiplayer Horror Escape-opencode/server.mjs";
const game = createGame(1234);
const log = [];
const ws = { id: "A", query: new URLSearchParams(), send: s => log.push(JSON.parse(s)), close() {} };
const ws2 = { id: "B", query: new URLSearchParams(), send: s => log.push(JSON.parse(s)), close() {} };
const h = game.create({ debug: true });
h.open(ws); h.open(ws2);
h.message(ws, JSON.stringify({ t: "hello", c: "c1", n: "ALPHA" }));
h.message(ws2, JSON.stringify({ t: "hello", c: "c2", n: "BETA" }));
h.message(ws, JSON.stringify({ t: "start" }));
for (let i = 0; i < 80; i++) h.tick(0.05);
h.message(ws, JSON.stringify({ t: "dbg", k: "power" }));
h.tick(0.05);
h.message(ws, JSON.stringify({ t: "dbg", k: "decode" }));
h.tick(0.05); // decode triggers timers; fast-forward blackout
for (let i = 0; i < 220; i++) h.tick(0.05);

const snap = () => [...log].reverse().find(m => m.t === "snap");
let s = snap();
console.log("phase:", s.phase);

h.message(ws2, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 3 }));
for (let i = 0; i <= 240; i++) {
  h.tick(0.05);
  if (i % 40 === 0) {
    const q = snap();
    const b = q.pl.find(p => p.pid === 2);
    console.log(`t${i} mon(${q.mon.x},${q.mon.y},${q.mon.s}) B(${b.x},${b.y},dn${b.dn})`);
  }
}
