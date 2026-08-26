const URL = process.argv[2] || "ws://localhost:59997/ws/fnf-multiplayer-battle";
const MODE = process.argv[3] || "drop"; 
const ws = new WebSocket(URL);
const sleep = ms => new Promise(r => setTimeout(r, ms));
ws.onopen = async () => {
  ws.send(JSON.stringify({ t: "hello", name: "RIVAL" }));
  await wait(m => m.t === "matched");
  ws.send(JSON.stringify({ t: "ready", v: true }));
  const start = await wait(m => m.t === "start");
  console.log("PEER: match started");
  let i = 0;
  const iv = setInterval(() => {
    i++;
    ws.send(JSON.stringify({ t: "state", u: { score: i * 310, combo: i, acc: 97.5, judged: i, misses: i % 9 === 0 ? 1 : 0, lastKind: i % 9 === 0 ? "miss" : "sick", lastLane: i % 4 } }));
  }, 250);
  if (MODE === "drop") {
    setTimeout(() => { console.log("PEER: dropping connection"); process.exit(0); }, 14000);
  } else if (MODE === "win") {
    setTimeout(() => { ws.send(JSON.stringify({ t: "ko", won: true })); console.log("PEER: claimed KO win"); clearInterval(iv); }, 12000);
    setTimeout(() => process.exit(0), 15000);
  }
};
ws.onmessage = e => {
  const d = buf.push(e.data);
};
const buf = [];
function wait(pred) {
  return new Promise(res => {
    const h = m => { if (pred(m)) { ws.removeEventListener("message", h); res(m); } };
    ws.addEventListener("message", ev => h(JSON.parse(ev.data)));
  });
}
ws.onclose = () => console.log("PEER: closed");
ws.onerror = () => console.log("PEER: error");
