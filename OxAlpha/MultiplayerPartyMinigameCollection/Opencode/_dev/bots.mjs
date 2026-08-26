// DEV ONLY — headless bot players for multi-client testing.
// usage: node bots.mjs --port 8941 --bots 3 --create --wait 4 [--quick]
//        node bots.mjs --port 8941 --bots 2 --join ABCD
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : true;
}
const PORT = +(opt.port || 8941);
const NBOTS = +(opt.bots || 3);
const WAIT_FOR = +(opt.wait || 0); // total players before host bot starts
const JOIN = opt.join ? String(opt.join).toUpperCase() : null;
const CREATE = !!opt.create;
const NAMES = ['Zippy', 'Blip', 'Mochi', 'Turbo', 'Pixel', 'Wobble', 'Noodle'];

function rnd(n) { return Math.floor(Math.random() * n); }

class Bot {
  constructor(name) {
    this.name = name;
    this.pid = null;
    this.gameKey = null;
    this.timers = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/party-minigames`);
    this.ws.onopen = () => {
      if (CREATE && !JOIN) this.send({ t: 'create', name: this.name });
      else this.send({ t: 'join', code: JOIN, name: this.name });
    };
    this.ws.onmessage = (e) => this.onMsg(JSON.parse(e.data));
    this.ws.onclose = () => this.stopPlay();
    this.ws.onerror = () => {};
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  every(ms, fn) { const t = setInterval(fn, ms); this.timers.push(t); }
  stopPlay() { for (const t of this.timers) clearInterval(t); this.timers = []; }

  onMsg(m) {
    switch (m.t) {
      case 'welcome':
        this.pid = m.pid;
        console.log(`[bot ${this.name}] joined room ${m.code}`);
        if (CREATE && !JOIN) Bot.roomCode = m.code;
        break;
      case 'room': {
        const connected = m.players.filter(p => p.connected).length;
        if (CREATE && !JOIN && m.host === this.pid && connected >= WAIT_FOR && (m.phase === 'lobby' || m.phase === 'podium') && !Bot.started) {
          Bot.started = true;
          setTimeout(() => {
            console.log(`[bot ${this.name}] starting match (${connected} players, quick mode)`);
            this.send({ t: 'start', quick: true });
          }, 2500);
          console.log(`ROOM=${m.code} (starting in ~2.5s)`);
        }
        break;
      }
      case 'intro':
        this.gameKey = m.key;
        this.stopPlay();
        this.startPlay();
        break;
      case 'go':
        this.startPlay();
        break;
      case 'results':
        console.log(`[bot ${this.name}] results: ` + m.rank.map(r => `${r.name}:+${r.pts}`).join(' '));
        break;
      case 'final':
        console.log('[FINAL] ' + m.board.map(b => `${b.name}:${b.score}`).join(' | '));
        setTimeout(() => { console.log('[bots] match complete, exiting'); process.exit(0); }, 1500);
        break;
    }
  }

  startPlay() {
    if (!this.gameKey || this.timers.length) return;
    const k = this.gameKey;
    let lane = 1;
    if (k === 'tiles') this.every(340, () => this.send({ t: 'in', k: 'step', d: [[1, 0], [-1, 0], [0, 1], [0, -1]][rnd(4)] }));
    else if (k === 'draw') this.every(420 + rnd(400), () => this.send({ t: 'in', k: 'act' }));
    else if (k === 'rush') {
      this.every(680, () => this.send({ t: 'in', k: 'act' }));
      this.every(1400, () => { lane = rnd(3); this.send({ t: 'in', k: 'step', d: [0, lane - 1] }); });
    } else if (k === 'dodge') {
      this.every(380, () => {
        const a = Math.random() * Math.PI * 2;
        this.send({ t: 'in', k: 'dir', d: [+Math.cos(a).toFixed(2), +Math.sin(a).toFixed(2)] });
      });
    } else if (k === 'match') {
      this.every(760, () => this.send({ t: 'in', k: 'tile', i: rnd(24) }));
    }
  }
}

if (CREATE && !JOIN) {
  // creator bot waits a moment so humans/others can join
  new Bot(NAMES[0]);
  for (let i = 0; i < NBOTS - 1; i++) setTimeout(() => new Bot(NAMES[1 + i]), 800 * (i + 1));
} else {
  for (let i = 0; i < NBOTS; i++) setTimeout(() => new Bot(NAMES[i % NAMES.length]), 500 * i);
}
setTimeout(() => { console.log('[bots] timeout — exiting'); process.exit(0); }, 8 * 60 * 1000);
