const URL = process.argv[2] || "ws://localhost:8321/ws/fnf-multiplayer-battle";
let failures = 0;
function ok(cond, label) {
  console.log((cond ? "PASS" : "FAIL") + "  " + label);
  if (!cond) failures++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, name, msgs: [], waiters: [] };
  c.wait = pred => new Promise(res => {
    const found = c.msgs.find(pred);
    if (found) return res(found);
    c.waiters.push({ pred, res });
  });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    for (let i = c.waiters.length - 1; i >= 0; i--) {
      if (c.waiters[i].pred(m)) { c.waiters[i].res(m); c.waiters.splice(i, 1); }
    }
  };
  c.send = o => ws.send(JSON.stringify(o));
  c.open = () => new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return c;
}

const a = client("ALPHA");
const b = client("BETA");
await a.open(); await b.open();
ok(true, "two clients connected");

a.send({ t: "hello", name: "alpha" });
b.send({ t: "hello", name: "beta" });
const ma = await a.wait(m => m.t === "matched");
const mb = await b.wait(m => m.t === "matched");
ok(ma.room === mb.room, `paired into same room ${ma.room} (seats ${ma.seat}/${mb.seat})`);
ok(ma.seat !== mb.seat, "distinct seats");

a.send({ t: "ready", v: true });
const opr = await b.wait(m => m.t === "opp_ready" && m.v);
ok(!!opr, "B sees A ready");

b.send({ t: "ready", v: true });
const sa = await a.wait(m => m.t === "start");
const sb = await b.wait(m => m.t === "start");
ok(sa && sb, "start broadcast to both");

for (let i = 0; i < 5; i++) {
  a.send({ t: "state", u: { score: i * 350, combo: i, acc: 99, judged: i, misses: 0, lastKind: "sick", lastLane: i % 4 } });
  await sleep(30);
}
const os = await b.wait(m => m.t === "opp_state" && m.u.score >= 1400);
ok(!!os, "state relay B-side");

b.send({ t: "state", u: { score: 100, combo: 1, acc: 80, judged: 1, misses: 0 } });
const osa = await a.wait(m => m.t === "opp_state" && m.u.score === 100);
ok(!!osa, "state relay A-side");

b.send({ t: "ko", won: true });
const ra = await a.wait(m => m.t === "result");
const rb = await b.wait(m => m.t === "result");
ok(ra.winner === "opp" && rb.winner === "you" && ra.reason === "ko", `KO arbitration (A:${ra.winner} B:${rb.winner})`);

a.send({ t: "rematch" });
const rr = await b.wait(m => m.t === "rematch_req");
ok(!!rr, "rematch request delivered");
b.send({ t: "rematch" });
const ra2 = await a.wait(m => m.t === "start", );
const rb2 = await b.wait(m => m.t === "start");
ok(ra2 && rb2, "rematch restarts both");

a.ws.close();
const left = await b.wait(m => m.t === "opp_left");
ok(!!left, "disconnect notifies opponent");
b.ws.close();

console.log(failures ? `\n${failures} FAILURES` : "\nALL PROTOCOL TESTS PASSED");
process.exit(failures ? 1 : 0);
