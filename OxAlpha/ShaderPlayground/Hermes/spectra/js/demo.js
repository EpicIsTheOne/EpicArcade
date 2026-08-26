/* SPECTRA-SPRUN02 — demo.js : locally generated demo media (no network) */
(function () {
  'use strict';

  // deterministic PRNG so demo art is stable across runs
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function make(w, h, painter, seed) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    painter(c.getContext('2d'), w, h, mulberry32(seed));
    return c;
  }

  const DEMOS = {

    aurora: () => make(1280, 720, (ctx, w, h, rnd) => {
      // night sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#04060f');
      sky.addColorStop(0.55, '#0a1626');
      sky.addColorStop(1, '#10263a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

      // stars
      for (let i = 0; i < 240; i++) {
        const x = rnd() * w, y = rnd() * h * 0.72, r = rnd() * 1.3 + 0.2;
        ctx.globalAlpha = 0.25 + rnd() * 0.75;
        ctx.fillStyle = rnd() < 0.12 ? '#cfe8ff' : '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // aurora ribbons
      ctx.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 5; band++) {
        const baseY = h * (0.18 + band * 0.07);
        const hue = 150 + band * 18 + rnd() * 20;
        const grd = ctx.createLinearGradient(0, baseY - 90, 0, baseY + 130);
        grd.addColorStop(0, `hsla(${hue},85%,62%,0)`);
        grd.addColorStop(0.45, `hsla(${hue},85%,58%,${0.16 + rnd() * 0.14})`);
        grd.addColorStop(1, `hsla(${hue + 30},80%,55%,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(-40, baseY);
        const amp = 34 + rnd() * 46, per = 2 + Math.floor(rnd() * 3), ph = rnd() * 9;
        for (let x = -40; x <= w + 40; x += 24) {
          const y = baseY + Math.sin((x / w) * per * Math.PI * 2 + ph) * amp;
          ctx.lineTo(x, y);
        }
        for (let x = w + 40; x >= -40; x -= 24) {
          const y = baseY + 120 + Math.sin((x / w) * per * Math.PI * 2 + ph + 1.2) * amp * 0.7;
          ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // mountain ridges
      const ridge = (baseH, fill) => {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.moveTo(0, h);
        let y = baseH;
        for (let x = 0; x <= w; x += 32) {
          y += (rnd() - 0.52) * 46;
          y = Math.min(h - 60, Math.max(baseH - 110, y));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      };
      ridge(h * 0.66, '#0a1220');
      ridge(h * 0.78, '#050a13');

      // faint snow glow at peaks
      const gl = ctx.createLinearGradient(0, h * 0.5, 0, h);
      gl.addColorStop(0, 'rgba(140,190,255,0.06)');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, h * 0.5, w, h * 0.5);
    }, 20260826),

    city: () => make(1280, 720, (ctx, w, h, rnd) => {
      // dusk sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#170f33');
      sky.addColorStop(0.5, '#5b2260');
      sky.addColorStop(0.78, '#c2455e');
      sky.addColorStop(1, '#f2884b');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

      // sun
      const sunY = h * 0.68;
      const halo = ctx.createRadialGradient(w * 0.62, sunY, 10, w * 0.62, sunY, 260);
      halo.addColorStop(0, 'rgba(255,214,150,0.95)');
      halo.addColorStop(0.25, 'rgba(255,150,90,0.55)');
      halo.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(w * 0.62 - 300, sunY - 300, 600, 600);
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath(); ctx.arc(w * 0.62, sunY, 74, 0, 7); ctx.fill();

      // far skyline
      const towers = (count, minH, maxH, fill, litChance, litColor) => {
        ctx.fillStyle = fill;
        let x = -10;
        while (x < w + 10) {
          const bw = 34 + rnd() * 70, bh = minH + rnd() * (maxH - minH);
          ctx.fillRect(x, h - bh, bw, bh);
          if (litChance > 0) {
            for (let wy = h - bh + 10; wy < h - 14; wy += 16) {
              for (let wx = x + 6; wx < x + bw - 8; wx += 13) {
                if (rnd() < litChance) {
                  ctx.fillStyle = rnd() < 0.5 ? litColor : '#ffe9b8';
                  ctx.globalAlpha = 0.35 + rnd() * 0.65;
                  ctx.fillRect(wx, wy, 4.5, 6.5);
                }
              }
            }
            ctx.globalAlpha = 1; ctx.fillStyle = fill;
          }
          x += bw + 4 + rnd() * 26;
        }
      };
      towers(26, 90, 230, 'rgba(38,20,54,0.9)', 0.10, '#ff7ab8');
      towers(20, 50, 150, '#160b22', 0.16, '#59e0ff');

      // wet street reflection strip
      const street = ctx.createLinearGradient(0, h - 46, 0, h);
      street.addColorStop(0, '#241228');
      street.addColorStop(1, '#0d0612');
      ctx.fillStyle = street; ctx.fillRect(0, h - 46, w, 46);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 60; i++) {
        const rx = rnd() * w;
        ctx.strokeStyle = rnd() < 0.5 ? 'rgba(89,224,255,0.5)' : 'rgba(255,122,184,0.5)';
        ctx.lineWidth = 1 + rnd() * 2;
        ctx.beginPath(); ctx.moveTo(rx, h - 44); ctx.lineTo(rx + (rnd() - 0.5) * 8, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }, 777001),

    field: () => make(1024, 1024, (ctx, w, h, rnd) => {
      ctx.fillStyle = '#101019'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const hues = [188, 210, 320, 265, 155, 15];
      for (let i = 0; i < 7; i++) {
        const cx = w * (0.15 + rnd() * 0.7), cy = h * (0.15 + rnd() * 0.7);
        const r = w * (0.18 + rnd() * 0.3);
        const hue = hues[i % hues.length] + rnd() * 24 - 12;
        const g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
        g.addColorStop(0, `hsla(${hue},90%,64%,${0.55 + rnd() * 0.3})`);
        g.addColorStop(0.65, `hsla(${hue + 20},85%,52%,${0.22})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      }
      // fine sparkle dust
      for (let i = 0; i < 500; i++) {
        ctx.globalAlpha = 0.04 + rnd() * 0.2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }, 424242),
  };

  window.SPDemos = { list: ['aurora', 'city', 'field'], labels: { aurora: 'Aurora Ridge', city: 'Neon City', field: 'Color Field' }, get(id) { return DEMOS[id](); } };
})();
