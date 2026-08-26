/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — particles, floating text, screen shake */
ARC.fx = (() => {
  const MAX_P = 420;

  class Particles {
    constructor() { this.list = []; }
    spawn(o) {
      if (this.list.length >= MAX_P) this.list.shift();
      this.list.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: .6, t: 0, size: 3, color: '#fff', grav: 0, shape: 'rect', drag: 1 }, o));
    }
    burst(x, y, n, color, { spd = 140, life = .6, size = 3, grav = 60, shape = 'rect' } = {}) {
      for (let i = 0; i < n; i++) {
        const a = ARC.util.rand(0, ARC.util.TAU), s = ARC.util.rand(spd * .25, spd);
        this.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: ARC.util.rand(life * .5, life), size: ARC.util.rand(size * .5, size * 1.4), color, grav, shape });
      }
    }
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.t += dt;
        if (p.t >= p.life) { L.splice(i, 1); continue; }
        p.vy += p.grav * dt;
        p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    draw(ctx) {
      for (const p of this.list) {
        const k = 1 - p.t / p.life;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        const s = Math.max(1, p.size * k);
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(p.x, p.y, s / 2, 0, ARC.util.TAU); ctx.fill(); }
        else ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
    clear() { this.list.length = 0; }
  }

  class Floaters {
    constructor() { this.list = []; }
    add(txt, x, y, color = '#fff', { size = 12, life = .9, vy = -46 } = {}) {
      if (this.list.length > 30) this.list.shift();
      this.list.push({ txt, x, y, color, size, life, t: 0, vy });
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const f = this.list[i]; f.t += dt;
        if (f.t >= f.life) { this.list.splice(i, 1); continue; }
        f.y += f.vy * dt;
      }
    }
    draw(ctx) {
      ctx.textAlign = 'center';
      for (const f of this.list) {
        const k = 1 - f.t / f.life;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `bold ${f.size}px Consolas, monospace`;
        ctx.fillStyle = '#000'; ctx.fillText(f.txt, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    clear() { this.list.length = 0; }
  }

  // per-game shake controller
  function Shaker() {
    let power = 0;
    return {
      kick(amt) { power = Math.min(16, Math.max(power, amt)); },
      update(dt) { power = Math.max(0, power - dt * 26); },
      get power() { return power; },
      offset() {
        if (power <= 0) return { x: 0, y: 0 };
        return { x: ARC.util.rand(-power, power), y: ARC.util.rand(-power, power) };
      },
    };
  }

  // starfield for shooter/dodger backgrounds
  function stars(n, w, h) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ x: ARC.util.rand(0, w), y: ARC.util.rand(0, h), z: ARC.util.rand(.25, 1) });
    return arr;
  }

  return { Particles, Floaters, Shaker, stars };
})();
