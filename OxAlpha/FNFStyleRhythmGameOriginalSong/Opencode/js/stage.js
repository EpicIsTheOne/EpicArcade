/* Neon rooftop stage: sky, skyline, string lights, speakers, spotlights.
   Beat-reactive via beatPulse (0..1 decaying) + section energy. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  let seededState = 12345;
  function srand() {
    seededState = (seededState * 1103515245 + 12345) & 0x7fffffff;
    return seededState / 0x7fffffff;
  }

  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({ x: srand() * 1600, y: srand() * 380, r: 0.6 + srand() * 1.6, tw: srand() * TAU, sp: 0.5 + srand() * 2 });
  }
  // two skyline layers
  function mkSkyline(baseY, minH, maxH, w0) {
    const b = []; let x = -80;
    while (x < 1700) {
      const w = w0 * (0.6 + srand() * 0.9);
      const h = minH + srand() * (maxH - minH);
      const wins = [];
      const cols = Math.floor(w / 16), rows = Math.floor(h / 22);
      for (let r0 = 0; r0 < rows; r0++) for (let c0 = 0; c0 < cols; c0++) {
        if (srand() < 0.42) wins.push({ x: 6 + c0 * 16, y: 10 + r0 * 22, on: srand() < 0.8, fl: srand() });
      }
      b.push({ x, w, h, wins });
      x += w + 4 + srand() * 14;
    }
    return b;
  }
  const skyFar = mkSkyline(0, 120, 300, 90);
  const skyNear = mkSkyline(0, 70, 190, 120);

  const bulbs = [];
  for (let i = 0; i <= 14; i++) {
    bulbs.push({ t: i / 14, hue: (i * 26) % 360, ph: i * 0.7 });
  }

  const Stage = {
    t: 0,
    draw(c, W, H, cam, beatPulse, beatIndex, energy) {
      this.t += 0.016;
      c.save();
      // camera
      c.translate(W / 2, H / 2);
      c.scale(cam.zoom, cam.zoom);
      c.translate(-W / 2 - cam.x, -H / 2 - cam.y);

      // sky
      const g = c.createLinearGradient(0, -60, 0, H);
      g.addColorStop(0, "#0a0524"); g.addColorStop(0.45, "#1c0f45");
      g.addColorStop(0.75, "#3a1660"); g.addColorStop(1, "#571d63");
      c.fillStyle = g; c.fillRect(-100, -100, W + 200, H + 200);

      // stars
      for (const s of stars) {
        const a = 0.35 + 0.5 * Math.abs(Math.sin(this.t * s.sp + s.tw));
        c.fillStyle = `rgba(255,255,255,${a * 0.8})`;
        c.fillRect(s.x - 40, s.y, s.r * 2, s.r * 2);
      }

      // moon
      const mg = c.createRadialGradient(1180, 120, 20, 1180, 120, 190);
      mg.addColorStop(0, "rgba(255,230,190,.55)"); mg.addColorStop(1, "rgba(255,230,190,0)");
      c.fillStyle = mg; c.fillRect(950, -80, 460, 460);
      c.fillStyle = "#ffe9c9";
      c.beginPath(); c.arc(1180, 120, 52, 0, TAU); c.fill();
      c.fillStyle = "rgba(220,190,150,.5)";
      c.beginPath(); c.arc(1165, 108, 9, 0, TAU); c.fill();
      c.beginPath(); c.arc(1198, 132, 6, 0, TAU); c.fill();
      c.beginPath(); c.arc(1178, 140, 4, 0, TAU); c.fill();

      // skylines
      c.save();
      c.translate(-cam.x * 0.25, 0);
      for (const b of skyFar) {
        c.fillStyle = "#170b38";
        c.fillRect(b.x, 560 - b.h, b.w, b.h + 40);
        for (const w of b.wins) {
          if (!w.on) continue;
          const flick = w.fl < 0.12 ? (Math.sin(this.t * 6 + w.fl * 50) > 0 ? 1 : 0.2) : 1;
          c.fillStyle = `rgba(120,220,255,${0.16 * flick})`;
          c.fillRect(b.x + w.x, 560 - b.h + w.y, 6, 9);
        }
      }
      c.restore();
      c.save();
      c.translate(-cam.x * 0.45, 0);
      for (const b of skyNear) {
        c.fillStyle = "#0f0728";
        c.fillRect(b.x, 560 - b.h, b.w, b.h + 40);
        for (const w of b.wins) {
          if (!w.on) continue;
          const warm = w.fl > 0.5;
          c.fillStyle = warm ? `rgba(255,190,110,${0.22})` : `rgba(140,230,255,${0.2})`;
          c.fillRect(b.x + w.x, 560 - b.h + w.y, 7, 10);
        }
        // rooftop antenna lights
        if (b.h > 150) {
          const blink = (Math.sin(this.t * 3 + b.x) > 0.4) ? 1 : 0.15;
          c.fillStyle = `rgba(255,60,80,${0.8 * blink})`;
          c.beginPath(); c.arc(b.x + b.w / 2, 560 - b.h - 6, 3, 0, TAU); c.fill();
        }
      }
      c.restore();

      // spotlight beams from behind rooftop
      for (let i = 0; i < 3; i++) {
        const ang = -0.5 + Math.sin(this.t * (0.25 + i * 0.11) + i * 2.1) * 0.35;
        const bx = 240 + i * 400;
        c.save();
        c.translate(bx, 585);
        c.rotate(ang);
        const beam = c.createLinearGradient(0, 0, 0, -620);
        const hue = i === 1 ? "255,62,200" : (i === 2 ? "122,60,255" : "0,229,255");
        beam.addColorStop(0, `rgba(${hue},${0.16 + 0.1 * beatPulse})`);
        beam.addColorStop(1, `rgba(${hue},0)`);
        c.fillStyle = beam;
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(-90, -640); c.lineTo(90, -640); c.lineTo(14, 0); c.fill();
        c.restore();
      }

      // rooftop floor
      const fg = c.createLinearGradient(0, 552, 0, H);
      fg.addColorStop(0, "#241640"); fg.addColorStop(1, "#120a26");
      c.fillStyle = fg; c.fillRect(-100, 552, W + 200, H - 500);
      // floor edge glow strip
      c.fillStyle = `rgba(0,229,255,${0.5 + 0.4 * beatPulse})`;
      c.fillRect(-100, 549, W + 200, 3.4);
      // floor seams
      c.strokeStyle = "rgba(255,255,255,.05)"; c.lineWidth = 2;
      for (let x = 0; x < W + 100; x += 90) {
        c.beginPath(); c.moveTo(x, 556); c.lineTo(x - 30, H); c.stroke();
      }

      // bulkhead door + AC unit (left back)
      c.fillStyle = "#1b1136";
      c.fillRect(60, 448, 96, 104);
      c.fillStyle = "#241848";
      c.fillRect(66, 456, 84, 96);
      c.fillStyle = "#0e0824";
      c.fillRect(100, 456, 16, 96);
      c.fillStyle = `rgba(255,176,32,${0.5 + 0.3 * beatPulse})`;
      c.fillRect(88, 500, 6, 6);

      c.fillStyle = "#1e1440";
      c.beginPath(); c.roundRect(1130, 470, 120, 82, 8); c.fill();
      c.fillStyle = "#2a1d55";
      c.beginPath(); c.roundRect(1138, 478, 104, 30, 6); c.fill();
      // AC fan
      c.save();
      c.translate(1190, 522);
      c.rotate(this.t * 4);
      c.strokeStyle = "rgba(140,244,255,.5)"; c.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(0, 0);
        c.arc(0, 0, 16, i * TAU / 3, i * TAU / 3 + 1.1); c.stroke();
      }
      c.restore();

      // speaker stacks behind each performer
      this.speaker(c, 150, 552, beatPulse, energy);
      this.speaker(c, 1090, 552, beatPulse, energy);

      // string lights across the rooftop
      c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 28; i++) {
        const t01 = i / 28;
        const x = 40 + t01 * 1200;
        const y = 300 + Math.sin(t01 * Math.PI) * 46 + Math.sin(t01 * 9 + this.t) * 3;
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
      for (const b of bulbs) {
        const x = 40 + b.t * 1200;
        const y = 300 + Math.sin(b.t * Math.PI) * 46 + Math.sin(b.t * 9 + this.t) * 3;
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(beatIndex * 0.5 + b.ph));
        c.fillStyle = `hsla(${b.hue},100%,70%,${0.25 + 0.5 * pulse})`;
        c.beginPath(); c.arc(x, y + 6, 4.4, 0, TAU); c.fill();
        c.fillStyle = `hsla(${b.hue},100%,80%,${0.1 * pulse})`;
        c.beginPath(); c.arc(x, y + 6, 11, 0, TAU); c.fill();
      }

      // haze
      const hz = c.createLinearGradient(0, 380, 0, 620);
      hz.addColorStop(0, "rgba(90,40,140,0)");
      hz.addColorStop(1, `rgba(90,40,140,${0.16 + 0.06 * beatPulse})`);
      c.fillStyle = hz; c.fillRect(-100, 380, W + 200, 260);

      c.restore();
    },

    speaker(c, x, baseY, beatPulse, energy) {
      const pump = 1 + beatPulse * 0.09 * (0.6 + energy * 0.6);
      c.save();
      c.translate(x, baseY);
      // box
      c.fillStyle = "#141026";
      c.beginPath(); c.roundRect(-52, -150, 104, 150, 8); c.fill();
      c.strokeStyle = "rgba(0,229,255,.25)"; c.lineWidth = 2;
      c.beginPath(); c.roundRect(-52, -150, 104, 150, 8); c.stroke();
      // woofer
      c.save();
      c.translate(0, -62);
      c.scale(pump, pump);
      c.fillStyle = "#06040f";
      c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill();
      c.strokeStyle = "rgba(122,60,255,.6)"; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.stroke();
      c.fillStyle = "#1d1740";
      c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill();
      c.fillStyle = "rgba(0,229,255,.8)";
      c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
      c.restore();
      // tweeter
      c.save();
      c.translate(0, -122);
      c.scale(pump * 0.9, pump * 0.9);
      c.fillStyle = "#06040f";
      c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.fill();
      c.strokeStyle = "rgba(255,62,200,.5)"; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.stroke();
      c.fillStyle = "rgba(255,62,200,.7)";
      c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
      c.restore();
      c.restore();
    },
  };

  window.GameStage = { Stage };
})();
