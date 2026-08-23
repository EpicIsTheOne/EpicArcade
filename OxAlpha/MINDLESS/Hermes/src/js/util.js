// MINDLESS-Hermes :: util.js — math, RNG, save data
"use strict";
const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // move current toward target by maxDelta (Godot move_toward)
  moveToward(cur, target, maxDelta) {
    if (Math.abs(target - cur) <= maxDelta) return target;
    return cur + Math.sign(target - cur) * maxDelta;
  },
  dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.hypot(dx, dy); },
  sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; },
  rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  fmtTime(sec) {
    if (!isFinite(sec)) sec = 0;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  },
};

// ---- persistent save (mirrors user://mindless_progress.cfg intent) ----
const SAVE_KEY = "mindless_progress_v1";
const SaveData = {
  data: null,
  defaults() {
    return {
      best_times: {},          // stageId -> seconds
      viewed_story: [],        // story keys already seen
      rescue_total: 0,
      settings: {
        musicVol: 0.8, sfxVol: 0.9, reducedFlash: false, inputOffsetMs: 0, showFps: false,
      },
      campaign_complete: false,
      seen_intro: false,
      seen_rescue: false,
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(this.defaults(), JSON.parse(raw)) : this.defaults();
      this.data.settings = Object.assign(this.defaults().settings, this.data.settings || {});
    } catch (e) { this.data = this.defaults(); }
    return this.data;
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  },
};
