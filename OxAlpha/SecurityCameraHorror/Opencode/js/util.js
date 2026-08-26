'use strict';
/* GRAYLINE — Night Shift :: shared utilities */
window.G = window.G || {};

G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
G.lerp = (a, b, t) => a + (b - a) * t;
G.rand = (a, b) => a + Math.random() * (b - a);
G.randi = (a, b) => Math.floor(G.rand(a, b + 1));
G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
G.chance = p => Math.random() < p;

/* deterministic hash noise for per-frame jitter that doesn't strobe wildly */
G.hash = n => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

G.fmtTime = hourF => {
  const h24 = Math.floor(hourF) % 12;
  const h = h24 === 0 ? 12 : h24;
  const m = Math.floor((hourF % 1) * 60);
  const ampm = Math.floor(hourF) < 12 ? 'AM' : 'PM';
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
};
