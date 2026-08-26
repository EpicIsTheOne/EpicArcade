/* SKYRUSH — particles, speed lines, trail ribbon, camera shake */
"use strict";

const Effects = {
  pool: [], POOL_N: 300,
  points: null,
  shakeAmt: 0,

  init() {
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.POOL_N * 3);
    this.colArr = new Float32Array(this.POOL_N * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this.posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    Game.scene.add(this.points);
    for (let i = 0; i < this.POOL_N; i++) {
      this.pool.push({ life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: -999, z: 0, r: 1, g: 1, b: 1 });
    }
    // trail ribbon
    const tGeo = new THREE.BufferGeometry();
    this.trailN = 40;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailCol = new Float32Array(this.trailN * 3);
    for (let i = 0; i < this.trailN; i++) { this.trailPos[i * 3 + 1] = -999; }
    tGeo.setAttribute("position", new THREE.BufferAttribute(this.trailPos, 3));
    tGeo.setAttribute("color", new THREE.BufferAttribute(this.trailCol, 3));
    this.trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    Game.scene.add(this.trail);
    this.trailTimer = 0;

    this.fxCanvas = document.getElementById("fx");
    this.fxCtx = this.fxCanvas.getContext("2d");
    this._resize();
    window.addEventListener("resize", () => this._resize());
  },

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.width = innerWidth * dpr; this.fxCanvas.height = innerHeight * dpr;
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    for (let i = 0; i < this.POOL_N; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        p.life = life; p.maxLife = life;
        p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
        p.r = r; p.g = g; p.b = b;
        return;
      }
    }
  },

  burst(pos, n, colorHex, spread = 2.5) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, up = U.rand(1, 4);
      this.spawn(
        pos.x, pos.y + 0.15, pos.z,
        Math.cos(a) * U.rand(0.5, spread), up, Math.sin(a) * U.rand(0.5, spread),
        c.r, c.g, c.b, U.rand(0.35, 0.7));
    }
  },

  dashStreak(pos, dx, dz) {
    for (let i = 0; i < 10; i++) {
      this.spawn(
        pos.x - dx * i * 0.22 + U.rand(-0.2, 0.2),
        pos.y + U.rand(0, 0.8),
        pos.z - dz * i * 0.22 + U.rand(-0.2, 0.2),
        -dx * 3, U.rand(0, 1), -dz * 3,
        0.45, 0.85, 1.0, U.rand(0.18, 0.34));
    }
  },

  confetti(pos) {
    const cols = [[1, 0.82, 0.4], [0.3, 0.79, 0.94], [1, 0.42, 0.42], [0.48, 0.9, 0.44]];
    for (let i = 0; i < 60; i++) {
      const c = cols[i % cols.length];
      const a = Math.random() * U.TAU;
      this.spawn(pos.x, pos.y + 1, pos.z,
        Math.cos(a) * U.rand(2, 6), U.rand(4, 9), Math.sin(a) * U.rand(2, 6),
        c[0], c[1], c[2], U.rand(0.9, 1.6));
    }
  },

  shake(v) { this.shakeAmt = Math.min(0.6, this.shakeAmt + v); },

  update(dt, playerSpeed, camPos) {
    // particles
    let any = false;
    for (let i = 0; i < this.POOL_N; i++) {
      const p = this.pool[i];
      const o = i * 3;
      if (p.life > 0) {
        any = true;
        p.life -= dt;
        p.vy -= 12 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < -500) p.life = 0;
        const k = Math.max(p.life / p.maxLife, 0);
        this.posArr[o] = p.x; this.posArr[o + 1] = p.y; this.posArr[o + 2] = p.z;
        this.colArr[o] = p.r * k; this.colArr[o + 1] = p.g * k; this.colArr[o + 2] = p.b * k;
      } else {
        this.posArr[o + 1] = -999;
      }
    }
    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    // trail behind player when moving fast
    this.trailTimer -= dt;
    if (playerSpeed > 9 && this.trailTimer <= 0 && Game.state === "playing") {
      this.trailTimer = 0.03;
      // shift ring buffer
      this.trailPos.copyWithin(3, 0, (this.trailN - 1) * 3);
      this.trailCol.copyWithin(3, 0, (this.trailN - 1) * 3);
      this.trailPos[0] = Player.pos.x; this.trailPos[1] = Player.pos.y + 0.4; this.trailPos[2] = Player.pos.z;
      const heat = U.clamp((playerSpeed - 9) / 10, 0, 1);
      this.trailCol[0] = 0.3 + heat * 0.7; this.trailCol[1] = 0.75; this.trailCol[2] = 1.0;
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.attributes.color.needsUpdate = true;
    }

    // speed lines overlay
    const intensity = U.clamp((playerSpeed - 11.5) / 12, 0, 1);
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (intensity > 0.02 && Game.state === "playing") {
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const n = 26;
      ctx.strokeStyle = "rgba(255,255,255," + (0.05 + intensity * 0.16).toFixed(3) + ")";
      ctx.lineWidth = 1 + intensity;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * U.TAU + performance.now() * 0.0004;
        const r0 = Math.max(innerWidth, innerHeight) * (0.38 + Math.random() * 0.08);
        const r1 = r0 + 90 + intensity * 190 * (0.6 + Math.random() * 0.6);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
  },
};
