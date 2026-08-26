window.Modes = (function () {

  function barsMode() {
    const N = 76;
    const smooth = new Float32Array(N);
    const peaks = new Float32Array(N);
    return {
      name: 'BARS',
      draw(s) {
        const ctx = s.ctx, w = s.w, h = s.h;
        const base = h * 0.86;
        const bw = w / N;
        const iw = Math.max(2, bw * 0.55);
        const span = h * 0.60 * s.set.intensity;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const fl = ctx.createLinearGradient(0, base - 2, 0, base + 2);
        fl.addColorStop(0, s.pal(0.5, 0.0));
        fl.addColorStop(0.5, s.pal(0.5, 0.35));
        fl.addColorStop(1, s.pal(0.5, 0.0));
        ctx.fillStyle = fl;
        ctx.fillRect(0, base - 2, w, 4);
        for (let i = 0; i < N; i++) {
          const fi = Math.floor(Math.pow(i / N, 1.7) * s.freq.length * 0.72);
          const v = s.freq[fi] * 0.65 + s.freq[Math.min(s.freq.length - 1, fi + 1)] * 0.35;
          smooth[i] += (v - smooth[i]) * Math.min(1, s.dt * 16);
          peaks[i] = Math.max(peaks[i] - s.dt * 0.30, smooth[i]);
          if (smooth[i] < 0.008 && peaks[i] < 0.01) continue;
          const x = i * bw + (bw - iw) / 2;
          const bh = Math.max(1.5, Math.pow(smooth[i], 1.25) * span);
          const col = s.pal(i / N, Math.min(1, 0.45 + smooth[i] * 0.6));
          U.rr(ctx, x, base - bh, iw, bh, iw / 2);
          ctx.fillStyle = col;
          ctx.fill();
          U.rr(ctx, x, base + 4, iw, bh * 0.30, iw / 2);
          ctx.fillStyle = s.pal(i / N, 0.14);
          ctx.fill();
          const py = base - Math.pow(peaks[i], 1.25) * span - 7;
          if (peaks[i] > 0.02) {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + smooth[i] * 0.3).toFixed(3) + ')';
            ctx.fillRect(x, py, iw, 2.5);
          }
        }
        ctx.restore();
      }
    };
  }

  function radialMode() {
    const NR = 160;
    const sm = new Float32Array(NR);
    let rot = 0;
    const rings = [];
    return {
      name: 'RADIAL',
      draw(s) {
        const ctx = s.ctx, cx = s.cx, cy = s.cy, md = s.md;
        rot += s.dt * (0.10 + s.bands.mid * 0.55);
        const base = md * 0.155 * (1 + s.bands.bass * 0.55 * s.set.intensity);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = rings.length - 1; i >= 0; i--) {
          const rg = rings[i];
          rg.r += s.dt * md * 0.62;
          rg.a -= s.dt * 1.05;
          if (rg.a <= 0) { rings.splice(i, 1); continue; }
          ctx.beginPath();
          ctx.arc(0, 0, rg.r, 0, U.TAU);
          ctx.strokeStyle = s.pal((rg.r / md) % 1, rg.a * 0.85);
          ctx.lineWidth = 2 + rg.a * 2;
          ctx.stroke();
        }
        ctx.lineCap = 'round';
        for (let i = 0; i < NR; i++) {
          const a = i / NR * U.TAU;
          const fi = Math.floor(Math.pow(i / NR, 1.5) * s.freq.length * 0.6);
          const v = s.freq[fi];
          sm[i] += (v - sm[i]) * Math.min(1, s.dt * 17);
          const len = Math.pow(sm[i], 1.3) * md * 0.30 * s.set.intensity;
          if (len < 1) continue;
          const ca = Math.cos(a), sa = Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(ca * base, sa * base);
          ctx.lineTo(ca * (base + len), sa * (base + len));
          ctx.strokeStyle = s.pal(((i / NR) + s.t * 0.03) % 1, Math.min(1, 0.30 + sm[i] * 0.7));
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
        ctx.rotate(-rot * 2);
        const R = base * 0.82;
        ctx.beginPath();
        const WP = 360;
        for (let j = 0; j <= WP; j++) {
          const th = j / WP * U.TAU;
          const wi = (j & (s.wave.length - 1));
          const rr = R + s.wave[wi] * base * 0.42 * s.set.intensity;
          const x = Math.cos(th) * rr, y = Math.sin(th) * rr;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = s.pal(0.85, 0.75);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, base * 0.95);
        cg.addColorStop(0, s.pal(0.12, 0.35 + s.pulse * 0.40));
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(-base * 1.1, -base * 1.1, base * 2.2, base * 2.2);
        ctx.restore();
        if (s.beatHit && rings.length < 7) rings.push({ r: base + 4, a: 0.6 });
      }
    };
  }

  function waveMode() {
    return {
      name: 'WAVE',
      draw(s) {
        const ctx = s.ctx, w = s.w, h = s.h;
        const cy = h * 0.5;
        const H = h * 0.28 * s.set.intensity;
        const n = s.wave.length;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        const passes = [[0.13, 1.0, 0.85], [0.42, 0.62, 0.45], [0.71, 1.4, 0.28]];
        for (let p = 0; p < passes.length; p++) {
          const [off, ampM, alpha] = passes[p];
          ctx.beginPath();
          const o0 = Math.floor(off * n);
          for (let i = 0; i < n; i += 2) {
            const x = i / (n - 1) * w;
            const v = s.wave[(i + o0) & (n - 1)];
            const y = cy + v * H * ampM;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = s.pal(p * 0.32 + 0.08, alpha * (0.45 + Math.min(0.55, s.bands.level * 1.4)));
          ctx.lineWidth = p === 0 ? 2 : 1.2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.strokeStyle = s.pal(0.5, 0.12);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (s.pulse > 0.03) {
          const g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.35);
          g.addColorStop(0, s.pal(0.15, 0.20 * s.pulse));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(w * 0.15, cy - h * 0.4, w * 0.7, h * 0.8);
        }
        ctx.restore();
      }
    };
  }

  function particleMode() {
    const MAX = 340;
    const px = new Float32Array(MAX), py = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
    const life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
    const band = new Uint8Array(MAX), hjit = new Float32Array(MAX), size = new Float32Array(MAX);
    let head = 0, seeded = false;
    const HUE = [0.02, 0.5, 0.85];
    function spawnAmbient(i, s) {
      const a = U.rand(U.TAU), r = Math.sqrt(Math.random()) * s.md * 0.55;
      px[i] = s.cx + Math.cos(a) * r;
      py[i] = s.cy + Math.sin(a) * r;
      vx[i] = U.rand(-s.md, s.md) * 0.02;
      vy[i] = U.rand(-s.md, s.md) * 0.02;
      life[i] = maxLife[i] = U.rand(3, 7);
      const rb = Math.random();
      band[i] = rb < 0.25 ? 0 : (rb < 0.68 ? 1 : 2);
      size[i] = band[i] === 0 ? U.rand(2.5, 5) : band[i] === 1 ? U.rand(1.8, 3.2) : U.rand(1.1, 2.2);
      hjit[i] = U.rand(-0.06, 0.06);
    }
    return {
      name: 'PARTICLES',
      draw(s) {
        const ctx = s.ctx, w = s.w, h = s.h, md = s.md, cx = s.cx, cy = s.cy;
        if (!seeded) {
          seeded = true;
          for (let i = 0; i < MAX; i++) spawnAmbient(i, s);
        }
        const energy = [s.bands.bass, s.bands.mid, s.bands.treble];
        const drive = 0.5 + s.bands.level * 2.2;
        if (s.beatHit) {
          for (let k = 0; k < 24; k++) {
            const i = head++ % MAX;
            const a = U.rand(U.TAU), sp = md * U.rand(0.22, 0.55) * s.set.intensity;
            px[i] = cx; py[i] = cy;
            vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp;
            life[i] = maxLife[i] = U.rand(0.9, 1.7);
            band[i] = Math.random() < 0.5 ? 1 : 2;
            size[i] = U.rand(1.6, 3.4);
            hjit[i] = U.rand(-0.08, 0.08);
          }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < MAX; i++) {
          life[i] -= s.dt;
          const dx = cx - px[i], dy = cy - py[i];
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const bnd = band[i];
          const kk = bnd === 0 ? 0.22 : bnd === 1 ? 0.55 : 1.1;
          const tx = (-dy / d) * kk * drive * md * 0.9;
          const ty = (dx / d) * kk * drive * md * 0.9;
          const pull = bnd === 0 ? 0.10 : 0.02;
          vx[i] += (tx + dx / d * pull * md) * s.dt * 0.5;
          vy[i] += (ty + dy / d * pull * md) * s.dt * 0.5;
          if (bnd === 2) {
            vx[i] += U.rand(-1, 1) * energy[2] * md * 0.9 * s.dt;
            vy[i] += U.rand(-1, 1) * energy[2] * md * 0.9 * s.dt;
          }
          const damp = Math.exp(-s.dt * 0.65);
          vx[i] *= damp; vy[i] *= damp;
          px[i] += vx[i] * s.dt; py[i] += vy[i] * s.dt;
          if (life[i] <= 0 || px[i] < -40 || px[i] > w + 40 || py[i] < -40 || py[i] > h + 40) {
            spawnAmbient(i, s);
            continue;
          }
          const e = energy[bnd];
          const a = Math.min(1, life[i] / maxLife[i]) * (0.25 + e * 0.85);
          if (a < 0.01) continue;
          const hue = U.clamp(HUE[bnd] + hjit[i], 0, 1);
          const sx = px[i] - vx[i] * 0.06, sy = py[i] - vy[i] * 0.06;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(px[i], py[i]);
          ctx.strokeStyle = s.pal(hue, a);
          ctx.lineWidth = size[i];
          ctx.stroke();
          if (bnd === 0) {
            ctx.beginPath();
            ctx.arc(px[i], py[i], size[i] * 0.6, 0, U.TAU);
            ctx.fillStyle = s.pal(hue, a * 0.8);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    };
  }

  function tunnelMode() {
    const NRING = 18;
    const rings = [];
    for (let i = 0; i < NRING; i++) rings.push({ d: i / NRING, ph: U.rand(U.TAU), jit: U.rand(0.85, 1.15) });
    const NSTAR = 110;
    const stars = [];
    for (let i = 0; i < NSTAR; i++) stars.push({ d: Math.random(), a: U.rand(U.TAU), rf: U.rand(0.15, 1), seed: U.rand(100) });
    const flashes = [];
    return {
      name: 'TUNNEL',
      draw(s) {
        const ctx = s.ctx, w = s.w, h = s.h, md = s.md;
        const diag = Math.sqrt(w * w + h * h);
        const shk = s.pulse * 7 * s.set.intensity;
        const cx = s.cx + U.rand(-shk, shk), cy = s.cy + U.rand(-shk, shk);
        const focal = md * 1.1;
        const speed = (0.09 + s.bands.bass * 0.50 + s.bands.level * 0.22) * s.set.intensity;
        const proj = d => {
          const z = U.lerp(0.12, 2.0, U.clamp(d, 0, 1));
          return focal / z;
        };
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const st of stars) {
          st.d -= speed * s.dt * 1.25;
          if (st.d <= 0.01) { st.d = 1; st.a = U.rand(U.TAU); st.rf = U.rand(0.15, 1); }
          const p1 = proj(st.d), p2 = proj(st.d + 0.035);
          const tw = 0.55 + 0.45 * Math.sin(s.t * 3 + st.seed);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(st.a) * st.rf * p2 * 0.5, cy + Math.sin(st.a) * st.rf * p2 * 0.5);
          ctx.lineTo(cx + Math.cos(st.a) * st.rf * p1 * 0.5, cy + Math.sin(st.a) * st.rf * p1 * 0.5);
          ctx.strokeStyle = s.pal(st.rf, (1 - st.d) * 0.55 * tw);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        for (const r of rings) {
          r.d -= speed * s.dt * r.jit;
          if (r.d <= 0) { r.d = 1; r.ph = U.rand(U.TAU); }
          const pr = proj(r.d);
          const sr = pr * 0.52;
          if (sr > diag * 0.75 || sr < 3) continue;
          const fog = 1 - r.d;
          const rot = r.ph + s.t * 0.22 + r.d * 5;
          const P = 56;
          ctx.beginPath();
          for (let k = 0; k <= P; k++) {
            const th = k / P * U.TAU;
            const fi = Math.floor((((k / P * 0.5) + r.d * 0.7 + s.t * 0.05) % 1) * s.freq.length);
            const mod = 1 + s.freq[fi] * 0.16 * s.set.intensity;
            const rr = sr * mod;
            const x = cx + Math.cos(th + rot) * rr, y = cy + Math.sin(th + rot) * rr;
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.strokeStyle = s.pal(r.d, Math.max(0.04, fog * fog * 0.85));
          ctx.lineWidth = U.lerp(0.8, 3.6, fog) * (s.glow ? 1.25 : 1);
          ctx.stroke();
        }
        if (s.beatHit && flashes.length < 8) flashes.push({ d: 0.02, a: 0.9 });
        for (let i = flashes.length - 1; i >= 0; i--) {
          const f = flashes[i];
          f.d += speed * 1.7 * s.dt;
          f.a -= s.dt * 1.15;
          if (f.a <= 0 || f.d > 1.05) { flashes.splice(i, 1); continue; }
          const sr = proj(f.d) * 0.52;
          if (sr < diag * 0.75) {
            ctx.beginPath();
            ctx.arc(cx, cy, sr, 0, U.TAU);
            ctx.strokeStyle = s.pal(0.1, f.a * 0.8);
            ctx.lineWidth = 4 + (1 - f.d) * 5;
            ctx.stroke();
          }
        }
        const cr = md * 0.30 * (0.55 + s.bands.bass * 0.8);
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        cg.addColorStop(0, s.pal(0.12, 0.30 + s.pulse * 0.35));
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
        ctx.restore();
      }
    };
  }

  function kaleidoMode() {
    const SEG = 9;
    const PTS = 140;
    const sm = new Float32Array(PTS);
    const rings = [];
    return {
      name: 'GEOMETRY',
      draw(s) {
        const ctx = s.ctx, cx = s.cx, cy = s.cy, md = s.md;
        for (let i = 0; i < PTS; i++) {
          const fi = Math.floor(i / PTS * s.freq.length * 0.5);
          sm[i] += (s.freq[fi] - sm[i]) * Math.min(1, s.dt * 15);
        }
        const R0 = md * 0.105 * (1 + s.bands.bass * 0.6 * s.set.intensity);
        const amp = md * 0.155 * s.set.intensity;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        for (let sg = 0; sg < SEG; sg++) {
          ctx.save();
          ctx.rotate(sg / SEG * U.TAU + s.t * 0.06 * (sg % 2 ? 1 : -1));
          if (sg % 2) ctx.scale(1, -1);
          ctx.beginPath();
          for (let i = 0; i < PTS; i++) {
            const th = i / (PTS - 1) * Math.PI;
            const r = R0 + Math.pow(sm[i], 1.3) * amp + s.wave[i & (s.wave.length - 1)] * amp * 0.45;
            const x = Math.cos(th) * r, y = Math.sin(th) * r;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.strokeStyle = s.pal(sg / SEG, 0.38);
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.restore();
        }
        const sides = 6;
        const pr = R0 * 1.2 * (1 + s.pulse * 0.35);
        ctx.save();
        ctx.rotate(s.t * 0.2);
        ctx.beginPath();
        for (let k = 0; k <= sides; k++) {
          const a = k / sides * U.TAU;
          const fi = Math.floor(((k % sides) / sides) * s.freq.length * 0.35);
          const rr = pr * (1 + s.freq[fi] * 0.35 * s.set.intensity);
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = s.pal(0.5, 0.9);
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = s.pal(0.5, 0.07);
        ctx.fill();
        ctx.restore();
        if (s.beatHit && rings.length < 6) rings.push({ r: pr, a: 0.55, rot: s.t });
        for (let i = rings.length - 1; i >= 0; i--) {
          const rg = rings[i];
          rg.r += s.dt * md * 0.5;
          rg.a -= s.dt * 0.9;
          if (rg.a <= 0) { rings.splice(i, 1); continue; }
          ctx.save();
          ctx.rotate(-(s.t - rg.rot) * 0.5);
          ctx.beginPath();
          for (let k = 0; k <= sides; k++) {
            const a = k / sides * U.TAU;
            const x = Math.cos(a) * rg.r, y = Math.sin(a) * rg.r;
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = s.pal(0.75, rg.a);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
    };
  }

  return [barsMode, radialMode, waveMode, particleMode, tunnelMode, kaleidoMode];
})();
