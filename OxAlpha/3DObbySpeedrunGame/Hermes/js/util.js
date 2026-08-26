/* SKYRUSH — math & misc utilities */
"use strict";
const U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  // frame-rate independent exponential damp
  damp: (a, b, lambda, dt) => U.lerp(a, b, 1 - Math.exp(-lambda * dt)),
  rand: (a, b) => a + Math.random() * (b - a),
  TAU: Math.PI * 2,

  fmtTime(t) { // seconds -> m:ss.cc
    if (t == null || !isFinite(t)) return "—";
    const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return m + ":" + String(s).padStart(2, "0") + "." + String(c).padStart(2, "0");
  },
  fmtDelta(d) { // signed delta -> +s.cc / -s.cc
    const sign = d >= 0 ? "+" : "−";
    const a = Math.abs(d);
    const s = Math.floor(a % 60), c = Math.floor((a * 100) % 100);
    return sign + s + "." + String(c).padStart(2, "0");
  },

  store: {
    get(k, fb) { try { const v = localStorage.getItem("skyrush." + k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem("skyrush." + k, JSON.stringify(v)); } catch (e) {} },
  },
};
