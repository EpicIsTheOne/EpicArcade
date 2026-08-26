import { createGame } from "../Multiplayer Horror Escape-opencode/server.mjs";

function scenario(name, steps) {
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
  steps(h, wa, wb);
  const snap = () => [...log].reverse().find(m => m.t === "snap");
  const s = snap();
  const b = s.pl.find(p => p.pid === 2);
  console.log(`${name}: phase=${s.phase} mon=${s.mon ? `${s.mon.x},${s.mon.y},${s.mon.s}` : "null"} B(dn${b.dn})`);
}

scenario("A: power->escape->spawnnear", (h, wa, wb) => {
  h.message(wa, JSON.stringify({ t: "dbg", k: "power" }));
  h.message(wa, JSON.stringify({ t: "dbg", k: "escape" }));
  for (let i = 0; i < 10; i++) h.tick(0.05);
  h.message(wb, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 2 }));
  for (let i = 0; i < 100; i++) h.tick(0.05);
});

scenario("B: power->decode(evacuate during blackout)->spawnnear", (h, wa, wb) => {
  h.message(wa, JSON.stringify({ t: "dbg", k: "power" }));
  h.tick(0.05);
  h.message(wa, JSON.stringify({ t: "dbg", k: "decode" }));
  for (let i = 0; i < 20; i++) h.tick(0.05); // 1s into blackout
  h.message(wa, JSON.stringify({ t: "dbg", k: "tp", x: 22.5, y: 24.5 }));
  h.message(wb, JSON.stringify({ t: "dbg", k: "tp", x: 36.5, y: 24.5 }));
  for (let i = 0; i < 300; i++) h.tick(0.05);
  h.message(wb, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 2 }));
  for (let i = 0; i < 100; i++) h.tick(0.05);
});

scenario("C: no dbgs, just spawnnear after start", (h, wa, wb) => {
  for (let i = 0; i < 5; i++) h.tick(0.05);
  h.message(wb, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 2 }));
  for (let i = 0; i < 100; i++) h.tick(0.05);
});
