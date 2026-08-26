'use strict';
/* GRAYLINE — Night Shift :: threat AI */
window.G = window.G || {};

G.THREATS = {
  foreman: {
    name: 'THE FOREMAN', entry: 'LDOOR', side: 'L',
    grace: 3.6, blockMin: 2.2, blockMax: 4.2,
    ivMin: 7.5, ivMax: 12.5, coolMin: 6, coolMax: 10,
    spawns: ['atrium', 'stacks_a', 'manifest'], spawnDelay: 22
  },
  mange: {
    name: 'THE MANGE', entry: 'RDOOR', side: 'R',
    grace: 2.1, blockMin: 1.8, blockMax: 3.4,
    ivMin: 5.5, ivMax: 11, coolMin: 7, coolMax: 12,
    spawns: ['dock', 'east_hall'], spawnDelay: 45
  },
  wick: {
    name: 'WICK', entry: 'HATCH', side: 'C',
    grace: 4.0, blockMin: 2.0, blockMax: 3.5,
    ivMin: 3.5, ivMax: 6.5, coolMin: 5, coolMax: 9,
    spawns: ['manifest', 'cold_store', 'boiler', 'atrium', 'stacks_a', 'east_hall'], spawnDelay: 85
  }
};

function pickStep(from, target, occupied) {
  let ns = G.MAP.adj[from].filter(n => !occupied.has(n));
  if (!ns.length) ns = G.MAP.adj[from].slice();
  if (!ns.length) return null;
  const d0 = G.MAP.dist(from, target);
  let best = [], bw = -1;
  for (const n of ns) {
    const d = G.MAP.dist(n, target);
    let w = d < d0 ? 3 : (d === d0 ? 1 : 0.45);
    w *= 0.7 + Math.random() * 0.6;
    if (w > bw + 1e-9) { bw = w; best = [n]; }
    else if (Math.abs(w - bw) < 1e-9) best.push(n);
  }
  return G.pick(best);
}
G.pickStep = pickStep;

G.Stalker = class {
  constructor(kind, spawnAt) {
    this.kind = kind;
    this.cfg = G.THREATS[kind];
    this.spawnAt = spawnAt;
    this.node = null;
    this.mode = 'dormant';
    this.moveT = G.rand(this.cfg.ivMin, this.cfg.ivMax) * 0.9;
    this.cool = 0;
    this.graceT = 0;
    this.blockT = 0;
    this.blockNeed = 3;
    this.bangT = 0;
  }

  spawn(g) {
    this.node = G.pick(this.cfg.spawns);
    this.mode = 'roam';
    if (this.kind === 'mange') G.audio.skitter(0);
    else G.audio.footstep(this.cfg.side === 'L' ? 'L' : 'R', false);
  }

  update(dt, g) {
    if (this.mode === 'dormant') {
      if (g.clock >= this.spawnAt) this.spawn(g);
      return;
    }
    const diff = g.difficulty();
    if (this.mode === 'roam') {
      if (this.cool > 0) { this.cool -= dt; return; }
      const speed = g.blackout && this.kind === 'foreman' ? 1.7 : 1;
      this.moveT -= dt * speed;
      if (this.moveT <= 0) {
        if (g.isWatched(this.node)) { this.moveT = 0; return; }
        this.step(g, diff);
        this.moveT = G.rand(this.cfg.ivMin, this.cfg.ivMax) / diff;
      }
    } else if (this.mode === 'entry') {
      const closed = g.barrierClosed(this.kind);
      const pan = this.kind === 'foreman' ? -0.6 : 0.6;
      if (closed) {
        this.blockT += dt;
        this.bangT -= dt;
        if (this.bangT <= 0) {
          if (this.kind === 'mange') G.audio.skitter(pan);
          else G.audio.knock(pan);
          this.bangT = G.rand(1.0, 1.7);
        }
        if (this.blockT >= this.blockNeed) {
          g.stats.blocks++;
          this.retreat(g, diff);
        }
      } else {
        this.blockT = 0;
        this.graceT -= dt;
        if (Math.random() < dt * 0.55) G.audio.breath(1.4);
        if (this.graceT <= 0) g.breach(this.kind);
      }
    }
  }

  step(g, diff) {
    const occupied = new Set(
      g.stalkers.filter(s => s !== this && s.node).map(s => s.node)
    );
    const next = pickStep(this.node, this.cfg.entry, occupied);
    if (!next) return;
    if (next === this.cfg.entry) {
      this.node = next;
      this.mode = 'entry';
      this.graceT = this.cfg.grace;
      this.blockNeed = G.rand(this.cfg.blockMin, this.cfg.blockMax);
      this.blockT = 0;
      this.bangT = 0.4;
      g.stats.closeCalls++;
      if (this.kind === 'foreman') { G.audio.footstep('L', true); setTimeout(() => G.audio.knock(-0.7), 500); }
      else if (this.kind === 'mange') { G.audio.skitter(0.7); setTimeout(() => G.audio.skitter(0.7), 400); }
      g.toast((this.kind === 'foreman' ? 'SOMETHING AT THE WEST DOOR' : 'SKITTERING AT THE EAST DOOR'), true);
    } else {
      this.node = next;
      const d = G.MAP.dist(next, this.cfg.entry);
      if (this.kind === 'mange') G.audio.skitter(d <= 2 ? 0.5 : -0.2);
      else G.audio.footstep(this.cfg.side === 'L' ? 'L' : 'R', d <= 2);
    }
  }

  retreat(g, diff) {
    const back = G.MAP.adj[this.cfg.entry].filter(n => n !== this.cfg.entry);
    let dest = back.length ? back[0] : G.pick(G.THREATS[this.kind].spawns);
    for (const n of back) if (G.MAP.dist(n, this.cfg.entry) > G.MAP.dist(dest, this.cfg.entry)) dest = n;
    // jump further away sometimes
    if (Math.random() < 0.5) {
      const far = G.MAP.adj[dest];
      if (far && far.length) dest = G.pick(far);
    }
    this.node = dest;
    this.mode = 'roam';
    this.cool = G.rand(this.cfg.coolMin, this.cfg.coolMax) / Math.sqrt(diff);
    this.moveT = 1.5;
    G.audio.rumble(1.4);
    g.toast('IT LOST INTEREST');
  }
};

G.Wick = class extends G.Stalker {
  constructor(spawnAt) {
    super('wick', spawnAt);
  }

  step(g, diff) {
    const occupied = new Set(['LDOOR', 'RDOOR']);
    const watched = g.isWatched(this.node);
    if (watched && this.mode !== 'entry') return; // frozen in plain sight
    const next = pickStep(this.node, this.cfg.entry, occupied);
    if (!next) return;
    if (next === this.cfg.entry) {
      this.node = next;
      this.mode = 'entry';
      this.graceT = this.cfg.grace;
      this.blockNeed = G.rand(this.cfg.blockMin, this.cfg.blockMax);
      this.blockT = 0;
      this.bangT = 0.4;
      g.stats.closeCalls++;
      G.audio.beep(1240, 0.05);
      setTimeout(() => G.audio.beep(990, 0.05), 180);
      g.toast('THE HATCH LIGHT IS BLINKING', true);
    } else {
      this.node = next;
      G.audio.beep(G.randi(1500, 2100), 0.03);
    }
  }

  retreat(g, diff) {
    this.node = G.pick(this.cfg.spawns);
    this.mode = 'roam';
    this.cool = G.rand(this.cfg.coolMin, this.cfg.coolMax);
    this.moveT = 1.5;
    G.audio.staticBlip(0.08);
    g.toast('THE LIGHT WENT OUT');
  }

  update(dt, g) {
    if (this.mode === 'dormant') {
      if (g.clock >= this.spawnAt) this.spawn(g);
      return;
    }
    const diff = g.difficulty();
    if (this.mode === 'roam') {
      if (this.cool > 0) { this.cool -= dt; return; }
      if (g.isWatched(this.node)) return; // frozen while observed
      this.moveT -= dt;
      if (this.moveT <= 0) {
        this.step(g, diff);
        this.moveT = G.rand(this.cfg.ivMin, this.cfg.ivMax) / diff;
      }
    } else if (this.mode === 'entry') {
      const closed = g.barrierClosed(this.kind);
      if (closed) {
        this.blockT += dt;
        this.bangT -= dt;
        if (this.bangT <= 0) { G.audio.beep(880, 0.06); this.bangT = G.rand(0.9, 1.4); }
        if (this.blockT >= this.blockNeed) {
          g.stats.blocks++;
          this.retreat(g, diff);
        }
      } else {
        this.blockT = 0;
        this.graceT -= dt;
        if (this.graceT <= 0) g.breach('wick');
      }
    }
  }
};
