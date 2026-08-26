(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const smoothstep = (x, e0, e1) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmtTime(ms) {
    if (ms == null || !isFinite(ms)) return "--:--.--";
    const cs = Math.floor((ms % 1000) / 10);
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000);
    return m + ":" + String(s).padStart(2, "0") + "." + String(cs).padStart(2, "0");
  }
  function fmtSec(sec) {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d")];
  }
  function canvasTex(canvas, repeatX, repeatY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace !== undefined ? THREE.SRGBColorSpace : tex.colorSpace;
    if (repeatX) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeatX, repeatY || repeatX); }
    tex.anisotropy = 4;
    return tex;
  }

  function radialGlowTexture(inner, outer, stops) {
    const [c, ctx] = makeCanvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, inner || 0, 64, 64, outer || 62);
    (stops || [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.55)"], [1, "rgba(255,255,255,0)"]]).forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  }

  function numberLabelTexture(text, color) {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = "800 84px 'Segoe UI', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 10; ctx.strokeStyle = "rgba(5,12,18,0.9)";
    ctx.strokeText(text, 64, 68);
    ctx.fillStyle = color || "#eaf7ff";
    ctx.fillText(text, 64, 68);
    return canvasTex(c);
  }

  function checkerTexture(n, colA, colB) {
    const S = 256, cell = S / n;
    const [c, ctx] = makeCanvas(S, S);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? colA : colB;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    return canvasTex(c, n / 2, 1);
  }

  function windowsTexture(rng) {
    const W = 128, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = "#8494a4"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(0, 0, W, 6);
    const cols = 6, rows = 16, mw = 8, mh = 8;
    const ww = (W - mw * (cols + 1)) / cols, wh = (H - mh * (rows + 1)) / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.14;
      ctx.fillStyle = lit ? (rng() < 0.5 ? "#ffd98c" : "#d9edff") : "#3d5266";
      ctx.fillRect(mw + x * (ww + mw), mh + y * (wh + mh), ww, wh);
    }
    return canvasTex(c);
  }

  function helipadTexture() {
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = "#23272d"; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "#e8c93f"; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 40, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#e8c93f";
    ctx.font = "900 300px 'Segoe UI', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("H", S / 2, S / 2 + 14);
    return canvasTex(c);
  }

  function balloonStripeTexture() {
    const W = 256, H = 128;
    const [c, ctx] = makeCanvas(W, H);
    const stripes = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#e67e22", "#9b59b6"];
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = stripes[i % stripes.length];
      ctx.fillRect((i * W) / 24, 0, W / 24 + 1, H);
    }
    return canvasTex(c, 1, 1);
  }

  function towerBandTexture() {
    const W = 32, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = "#c8433a"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e8e3da";
    for (let y = 0; y < H; y += 64) ctx.fillRect(0, y, W, 32);
    return canvasTex(c, 1, 1);
  }

  function propDiscTexture() {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    ctx.translate(S / 2, S / 2);
    ctx.strokeStyle = "rgba(200,220,240,0.85)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.rotate(Math.PI / 3);
      ctx.lineWidth = 7;
      ctx.moveTo(0, 0); ctx.lineTo(58, 10); ctx.lineTo(56, -8);
      ctx.closePath(); ctx.fillStyle = "rgba(190,210,235,0.28)"; ctx.fill();
    }
    ctx.fillStyle = "rgba(30,36,44,0.95)";
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    return canvasTex(c);
  }

  function cloudTexture(rng) {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    for (let i = 0; i < 26; i++) {
      const r = 18 + rng() * 34;
      const x = 48 + rng() * 160, y = 90 + rng() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return canvasTex(c);
  }

  function segDist(px, pz, ax, az, bx, bz) {
    const abx = bx - ax, abz = bz - az;
    const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
    const dx = px - (ax + abx * t), dz = pz - (az + abz * t);
    return Math.hypot(dx, dz);
  }

  DS.util = {
    clamp, lerp, damp, smoothstep, mulberry32, fmtTime, fmtSec,
    makeCanvas, canvasTex, radialGlowTexture, numberLabelTexture,
    checkerTexture, windowsTexture, helipadTexture, balloonStripeTexture,
    towerBandTexture, propDiscTexture, cloudTexture, segDist
  };
})();
