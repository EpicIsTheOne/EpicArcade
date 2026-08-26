import { BEAT } from "./music.js";
import { LANE_COLORS } from "./render.js";

export const WIN = { sick: 0.045, good: 0.09, bad: 0.135, miss: 0.16 };
const SCORE = { sick: 350, good: 200, bad: 50 };
const WGT = { sick: 1, good: 0.8, bad: 0.4 };
const HP = { sick: 0.0058, good: 0.0038, bad: 0.001, miss: -0.018 };

function newState(name) {
  return {
    name,
    score: 0,
    combo: 0,
    maxCombo: 0,
    acc: 100,
    judged: 0,
    wsum: 0,
    sicks: 0,
    goods: 0,
    bads: 0,
    misses: 0,
  };
}

function gauss(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function makeAmbient(seedFn) {
  const parts = [];
  const colors = ["#22d3ee", "#f472b6", "#a78bfa", "#ffd166"];
  return {
    parts,
    spawnBeat() {
      if (parts.length > 34) return;
      parts.push({
        x: Math.random(),
        y: 1.05,
        vx: (Math.random() - 0.5) * 0.02,
        vy: -(0.03 + Math.random() * 0.06),
        s: 2 + Math.random() * 3,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    },
    tick(dt, h) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.24;
        if (p.y < -0.05 || p.life <= 0) parts.splice(i, 1);
        p.px = p.x;
        p.py = p.y;
      }
    },
    screenParts(w, h) {
      return parts.map(p => ({ x: p.x * w, y: p.y * h, s: p.s, life: Math.max(0, Math.min(1, p.life)), color: p.color }));
    },
  };
}

export class Match {
  constructor(opts) {
    this.charts = opts.charts;
    this.songLen = opts.songLen;
    this.sections = opts.sections;
    this.engine = opts.engine;
    this.renderer = opts.renderer;
    this.isOnline = !!opts.online;
    this.meName = opts.meName || "YOU";
    this.opName = opts.opName || "RIVAL";
    this.onSendState = opts.onSendState || (() => {});
    this.onFinish = opts.onFinish || (() => {});
    this.onKo = opts.onKo || (() => {});
    this.rnd = opts.rnd || Math.random;
    this.bot = opts.bot || null;

    this.chartMe = { notes: this.charts.p1.map(n => Object.assign({}, n)), firstVisible: 0 };
    this.chartOp = { notes: this.charts.p2.map(n => Object.assign({}, n)), firstVisible: 0 };
    this.meState = newState(this.meName);
    this.opState = newState(this.opName);
    this.hp = 0.5;
    this.over = false;
    this.winnerLocal = null;
    this.finishedSent = false;
    this.stateTimer = 0;
    this.ambient = makeAmbient();
    this.lastBeatSpawned = -99;
    this.pressLaneMe = -1;
    this.pressLaneOp = -1;
    this.pressLaneMeT = 0;
    this.pressLaneOpT = 0;
    this.holdActive = [false, false, false, false];
    this.holdRefs = [null, null, null, null];
    this.botIdx = 0;
    this.botQueue = [];
    this.botPendingIdx = 0;
    this.botSkill = opts.botSkill ?? 0.93;
    this.running = false;
  }

  start() {
    this.engine.start(this.events, this.songLen, () => this.timeUp());
    this.running = true;
  }

  setEvents(events) {
    this.events = events;
  }

  timeUp() {
    if (!this.over) this.finish("finish");
  }

  press(lane) {
    if (!this.running || this.over) return;
    this.pressLaneMe = lane;
    this.pressLaneMeT = performance.now();
    const pos = this.engine.pos();
    let best = null, bestD = 9;
    for (let i = this.chartMe.firstVisible; i < this.chartMe.notes.length; i++) {
      const n = this.chartMe.notes[i];
      if (n.t - pos > WIN.bad) break;
      if (n.judged || n.lane !== lane) continue;
      const d = Math.abs(n.t - pos);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best || bestD > WIN.bad) return;
    this.judgeNote(best, bestD <= WIN.sick ? "sick" : bestD <= WIN.good ? "good" : "bad", pos);
    if (best.hold && best.hit) {
      this.holdActive[lane] = true;
      this.holdRefs[lane] = best;
    }
  }

  release(lane) {
    this.holdActive[lane] = false;
    const ref = this.holdRefs[lane];
    if (ref && !ref.holdDone) {
      const pos = this.engine.pos();
      const frac = (pos - ref.t) / ref.hold;
      if (frac < 0.55) {
        ref.dropped = true;
        this.breakCombo();
        this.hp += HP.miss * 0.5;
      }
      this.holdRefs[lane] = null;
    }
  }

  judgeNote(n, kind, pos) {
    n.judged = true;
    n.hit = true;
    const st = this.meState;
    st.score += SCORE[kind];
    st.judged++;
    st.wsum += WGT[kind];
    st.acc = (st.wsum / st.judged) * 100;
    if (kind === "miss") { st.misses++; }
    else if (kind === "sick") st.sicks++;
    else if (kind === "good") st.goods++;
    else st.bads++;
    if (kind !== "bad") st.combo++;
    if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    st.lastKind = kind;
    st.lastLane = n.lane;
    this.hp += HP[kind];
    const L = this.renderer.layout();
    const lx = L.plX + (n.lane - 1.5) * L.laneGap;
    const ly = L.plRecY;
    this.renderer.spark(lx, ly, LANE_COLORS[n.lane], kind === "sick" ? 12 : 7, kind === "sick" ? 1.15 : 0.85);
    if (kind !== "bad") {
      this.renderer.pop(L.plX + (Math.random() - 0.5) * 60, L.plRecY - 70, kind === "sick" ? "SICK!!" : "GOOD", kind);
      this.renderer.pops[this.renderer.pops.length - 1].combo = st.combo;
    } else {
      this.renderer.pop(L.plX, L.plRecY - 70, "BAD", "bad");
    }
    this.renderer.charSing("me", n.lane, Math.max(0.18, n.hold || 0.18));
    if (this.hp >= 1) { this.hp = 1; this.koWin(); }
    if (this.hp <= 0) { this.hp = 0; this.koLose(); }
  }

  breakCombo() {
    if (this.meState.combo > 0) this.renderer.pop(this.renderer.layout().plX, this.renderer.layout().plRecY - 110, "COMBO LOST", "miss");
    this.meState.combo = 0;
  }

  missNoteVisual(n) {
    this.meState.judged++;
    this.meState.misses++;
    this.meState.acc = (this.meState.wsum / this.meState.judged) * 100;
    this.meState.combo = 0;
    this.hp += HP.miss;
    this.renderer.charMiss("me");
    const L = this.renderer.layout();
    this.renderer.pop(L.plX + (n.lane - 1.5) * L.laneGap, L.plRecY - 50, "MISS", "miss");
    if (this.hp <= 0) { this.hp = 0; this.koLose(); }
  }

  koWin() {
    if (this.over) return;
    this.over = true;
    this.winnerLocal = "you";
    this.onKo(true);
  }
  koLose() {
    if (this.over) return;
    this.over = true;
    this.winnerLocal = "opp";
    this.onKo(false);
  }

  finish(reason) {
    if (this.finishedSent) return;
    this.finishedSent = true;
    const s = this.meState;
    this.onFinish({
      reason,
      score: s.score,
      acc: s.acc,
      maxCombo: s.maxCombo,
      sicks: s.sicks,
      goods: s.goods,
      bads: s.bads,
      misses: s.misses,
    });
  }

  applyOpponent(u) {
    if (!u) return;
    const prevScore = this.opState.score;
    const prevJudged = this.opState.judged;
    Object.assign(this.opState, {
      score: u.score ?? this.opState.score,
      combo: u.combo ?? this.opState.combo,
      acc: u.acc ?? this.opState.acc,
      judged: u.judged ?? this.opState.judged,
      misses: u.misses ?? this.opState.misses,
    });
    const dScore = this.opState.score - prevScore;
    const dJudged = this.opState.judged - prevJudged;
    if (dJudged > 0) {
      const wasMiss = u.lastKind === "miss";
      if (!wasMiss) {
        const avgKind = dScore / dJudged > 280 ? "sick" : dScore / dJudged > 120 ? "good" : "bad";
        this.hp -= HP[avgKind] * 0.72 * dJudged;
        if (Math.random() < 0.75) {
          const lane = u.lastLane != null ? u.lastLane : Math.floor(Math.random() * 4);
          this.renderer.charSing("op", lane, 0.22);
        }
      } else {
        this.hp += 0.01;
        this.renderer.charMiss("op");
      }
    }
    this.clampHp();
  }

  applyOpponentDelta(dScore, dJudged, kind, lane) {
    if (this.over || dJudged <= 0) return;
    if (kind === "miss") {
      this.hp += 0.01;
      this.opState.misses = (this.opState.misses || 0);
      this.renderer.charMiss("op");
    } else {
      this.hp -= HP[kind] * 0.78 * dJudged;
      if (Math.random() < 0.75) {
        this.renderer.charSing("op", lane != null ? lane : Math.floor(Math.random() * 4), 0.22);
      }
    }
    this.clampHp();
  }
  clampHp() {
    if (this.over) return;
    if (this.hp >= 1) { this.hp = 1; this.koWin(); }
    else if (this.hp <= 0) { this.hp = 0; this.koLose(); }
  }

  oppLeft() {
    this.running = false;
  }

  tick(dt) {
    if (!this.running) return;
    const pos = this.engine.pos();
    if (pos > -1) {
      const bi = Math.floor(pos / BEAT);
      if (bi !== this.lastBeatSpawned) {
        this.lastBeatSpawned = bi;
        this.ambient.spawnBeat();
      }
    }
    this.ambient.tick(dt);

    for (let i = this.chartMe.firstVisible; i < this.chartMe.notes.length; i++) {
      const n = this.chartMe.notes[i];
      if (n.t + WIN.miss < pos) {
        if (!n.judged) {
          n.judged = true;
          n.missed = true;
          this.missNoteVisual(n);
        }
      } else break;
    }
    while (this.chartMe.firstVisible < this.chartMe.notes.length &&
      this.chartMe.notes[this.chartMe.firstVisible].t + (this.chartMe.notes[this.chartMe.firstVisible].hold || 0) < pos - 0.45) {
      this.chartMe.firstVisible++;
    }
    while (this.chartOp.firstVisible < this.chartOp.notes.length &&
      this.chartOp.notes[this.chartOp.firstVisible].t + (this.chartOp.notes[this.chartOp.firstVisible].hold || 0) < pos - 0.45) {
      this.chartOp.firstVisible++;
    }

    for (let l = 0; l < 4; l++) {
      const ref = this.holdRefs[l];
      if (ref && this.holdActive[l]) {
        if (pos >= ref.t + ref.hold * 0.92 && !ref.holdDone) {
          ref.holdDone = true;
          this.meState.score += 100;
          this.renderer.spark(
            this.renderer.layout().plX + (ref.lane - 1.5) * this.renderer.layout().laneGap,
            this.renderer.layout().plRecY, "#fff", 6, 0.7
          );
        }
      }
    }

    if (this.bot) this.tickBot(pos);

    this.stateTimer += dt;
    if (this.stateTimer > 0.25) {
      this.stateTimer = 0;
      const s = this.meState;
      this.onSendState({
        score: s.score,
        combo: s.combo,
        acc: Math.round(s.acc * 10) / 10,
        judged: s.judged,
        misses: s.misses,
        lastLane: s.lastLane,
        lastKind: s.lastKind,
      });
    }

    if (!this.over && !this.finishedSent && pos > this.songLen + 0.4) {
      this.finish("finish");
    }
  }

  tickBot(pos) {
    const notes = this.chartOp.notes;
    while (this.botIdx < notes.length && notes[this.botIdx].t + WIN.miss < pos - 0.001) {
      const n = notes[this.botIdx];
      if (!n.judged) {
        n.judged = true;
        n.missed = true;
        this.opState.judged++;
        this.opState.misses++;
        this.opState.combo = 0;
        this.opState.acc = Math.max(60, this.opState.acc - 0.3);
        this.applyOpponentDelta(0, 1, "miss");
      }
      this.botIdx++;
    }
    while (this.botQueue.length && this.botQueue[0].at <= pos) {
      const q = this.botQueue.shift();
      const n = q.note;
      if (n.judged) continue;
      n.judged = true;
      n.hit = true;
      this.opState.score += q.kind === "sick" ? 350 : 200;
      this.opState.combo++;
      if (this.opState.combo > this.opState.maxCombo) this.opState.maxCombo = this.opState.combo;
      this.opState.judged++;
      if (q.kind === "sick") this.opState.sicks++;
      else this.opState.goods++;
      this.opState.acc = Math.min(99.4, this.opState.acc + (q.kind === "sick" ? 0.02 : 0));
      const L = this.renderer.layout();
      this.renderer.spark(L.opX + (n.lane - 1.5) * L.laneGap * 0.82, L.opRecY, LANE_COLORS[n.lane], 5, 0.7);
      this.renderer.charSing("op", n.lane, Math.max(0.18, n.hold || 0.2));
      this.pressLaneOp = n.lane;
      this.pressLaneOpT = performance.now();
      this.applyOpponentDelta(q.kind === "sick" ? 350 : 200, 1, q.kind, n.lane);
      if (n.hold) {
        n.holdDone = true;
        this.opState.score += 100;
      }
    }
    while (this.botPendingIdx < notes.length && notes[this.botPendingIdx].t < pos + 2) {
      const n = notes[this.botPendingIdx++];
      if (Math.random() < this.botSkill) {
        const kind = Math.random() < 0.72 ? "sick" : "good";
        const err = gauss(Math.random) * 0.028;
        this.botQueue.push({ at: n.t + err, note: n, kind });
        this.botQueue.sort((a, b) => a.at - b.at);
      }
    }
  }

  beginBot() {
    this.botPendingIdx = 0;
    this.botIdx = 0;
  }

  snapshot() {
    return {
      mode: "play",
      pos: this.engine.pos(),
      songLen: this.songLen,
      sections: this.sections,
      chartMe: this.chartMe,
      chartOp: this.chartOp,
      meState: this.meState,
      opState: this.opState,
      hp: this.hp,
      meName: this.meName,
      opName: this.opName,
      particles: this.ambient.screenParts(1, 1),
      bpmActive: true,
      pressLane: performance.now() - this.pressLaneMeT < 110 ? this.pressLaneMe : -1,
      opPressLane: performance.now() - this.pressLaneOpT < 110 ? this.pressLaneOp : -1,
    };
  }
}
