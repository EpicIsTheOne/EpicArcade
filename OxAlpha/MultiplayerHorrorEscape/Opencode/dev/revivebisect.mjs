import { createGame } from "../Multiplayer Horror Escape-opencode/server.mjs";

function scenario(name, prefix) {
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
  prefix(h, wa, wb);

  // common revive leg
  h.message(wb, JSON.stringify({ t: "dbg", k: "spawnnear", dx: 1 }));
  let bb = null;
  for (let i = 0; i < 40; i++) {
    h.tick(0.05);
    const s = [...log].reverse().find(m => m.t === "snap");
    bb = s.pl.find(p => p.pid === 2);
    if (bb.dn === 1) break;
  }
  if (bb.dn !== 1) { console.log(`${name}: FAILED TO DOWN B`); return; }
  h.message(wb, JSON.stringify({ t: "dbg", k: "unmonster" }));
  const s1 = [...log].reverse().find(m => m.t === "snap");
  const aa = s1.pl.find(p => p.pid === 1);
  if (aa.dn === 1 || aa.dd === 1) h.message(wa, JSON.stringify({ t: "dbg", k: "reviveme" }));
  h.tick(0.05);
  const s2 = [...log].reverse().find(m => m.t === "snap");
  const b2 = s2.pl.find(p => p.pid === 2);
  h.message(wa, JSON.stringify({ t: "dbg", k: "tp", x: b2.x - 0.8, y: b2.y }));
  h.tick(0.05);
  h.message(wa, JSON.stringify({ t: "act", k: "revive", i: 2, on: true }));
  let ok = false;
  for (let i = 0; i < 100; i++) {
    h.tick(0.05);
    const s = [...log].reverse().find(m => m.t === "snap");
    if (s.pl.find(p => p.pid === 2).dn === 0) { ok = true; break; }
  }
  console.log(`${name}: revived=${ok}`);
}

scenario("plain", () => {});

scenario("power-only", (h, wa) => {
  h.message(wa, JSON.stringify({ t: "dbg", k: "power" }));
  for (let i = 0; i < 5; i++) h.tick(0.05);
});

scenario("escape-only", (h, wa) => {
  h.message(wa, JSON.stringify({ t: "dbg", k: "power" }));
  h.tick(0.05);
  h.message(wa, JSON.stringify({ t: "dbg", k: "escape" }));
  for (let i = 0; i < 5; i++) h.tick(0.05);
});

scenario("decode-full-evacuated", (h, wa, wb) => {
  h.message(wa, JSON.stringify({ t: "dbg", k: "power" }));
  h.tick(0.05);
  h.message(wa, JSON.stringify({ t: "dbg", k: "decode" }));
  for (let i = 0; i < 20; i++) h.tick(0.05); // into blackout
  h.message(wa, JSON.stringify({ t: "dbg", k: "tp", x: 22.5, y: 24.5 }));
  h.message(wb, JSON.stringify({ t: "dbg", k: "tp", x: 36.5, y: 24.5 }));
  for (let i = 0; i < 300; i++) h.tick(0.05);
});
