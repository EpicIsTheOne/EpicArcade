// Weather: clear/rain/thunder cycles, rain+snow streaks, lightning flashes.
'use strict';
(function () {
class Weather {
  constructor(scene) {
    this.scene = scene;
    this.state = 'clear';
    this.timer = 90 + Math.random() * 180;
    this.intensity = 0;
    this.flashT = 0;
    this.snowBiome = false;
    this.count = 600;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.active = new Uint8Array(this.count);
    // LineSegments: 2 vertices per drop
    const pairArr = new Float32Array(this.count * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pairArr, 3));
    this.rainGeo = g;
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0 });
    this.lines = new THREE.LineSegments(g, this.rainMat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  update(dt, player, opts) {
    opts = opts || {};
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === 'clear') {
        this.state = Math.random() < 0.75 ? 'rain' : 'thunder';
        this.timer = 50 + Math.random() * 110;
      } else {
        this.state = 'clear';
        this.timer = 120 + Math.random() * 260;
      }
    }
    const target = this.state === 'clear' ? 0 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.4);
    this.snowBiome = !!opts.snowBiome;

    if (this.intensity > 0.02) {
      this.lines.visible = true;
      this.rainMat.opacity = this.intensity * 0.5;
      this.rainMat.color.setHex(this.snowBiome ? 0xe8f2ff : 0x9fb8d8);
      const cx = player.pos.x, cy = player.pos.y, cz = player.pos.z;
      const fall = this.snowBiome ? 2.4 : 26;
      const drift = this.snowBiome ? 1.3 : 0.6;
      const dst = this.rainGeo.attributes.position.array;
      const activeTarget = Math.floor(this.count * this.intensity);
      for (let i = 0; i < this.count; i++) {
        const isActive = i < activeTarget;
        if (!isActive) {
          dst[i * 6 + 1] = -9999; dst[i * 6 + 4] = -9999; // hide
          continue;
        }
        if (!this.active[i] || this.pos[i * 3 + 1] < cy - 12) {
          this.pos[i * 3] = cx + (Math.random() - 0.5) * 44;
          this.pos[i * 3 + 1] = cy + 8 + Math.random() * 16;
          this.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 44;
          this.vel[i * 3 + 1] = -(fall * (0.7 + Math.random() * 0.6));
          this.vel[i * 3] = drift * (Math.random() - 0.5);
          this.vel[i * 3 + 2] = drift * (Math.random() - 0.5);
          this.active[i] = 1;
        }
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        const len = this.snowBiome ? 0.1 : 0.55;
        dst[i * 6 + 0] = this.pos[i * 3];
        dst[i * 6 + 1] = this.pos[i * 3 + 1];
        dst[i * 6 + 2] = this.pos[i * 3 + 2];
        dst[i * 6 + 3] = this.pos[i * 3] + this.vel[i * 3] * 0.03;
        dst[i * 6 + 4] = this.pos[i * 3 + 1] - len;
        dst[i * 6 + 5] = this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * 0.03;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      if (this.state === 'thunder') {
        this.flashT -= dt;
        if (this.flashT <= -6 && Math.random() < dt * 0.25) { this.flashT = 0.22; if (opts.onThunder) opts.onThunder(); }
      }
    } else {
      this.lines.visible = false;
    }
  }

  lightningEnv() { return this.flashT > 0 ? this.flashT * 3 : 0; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Weather };
if (typeof self !== 'undefined') self.WEATHER_MOD = { Weather };
})();
