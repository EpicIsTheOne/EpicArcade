// FX: pooled particles (coins, sparks, dust, crash), speed FOV, screen shake, trails.
(function (root) {
  function FX(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    var geo = new THREE.PlaneGeometry(0.3, 0.3);
    this.geo = geo;
    this.mats = {};
    var mkMat = function (color, additive) {
      return new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 1, side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false
      });
    };
    this.mats.coin = mkMat(0xffc94d, true);
    this.mats.gem = mkMat(0x38f8c8, true);
    this.mats.star = mkMat(0x9fd0ff, true);
    this.mats.spark = mkMat(0xffe08a, true);
    this.mats.dust = mkMat(0xcabfa8, false);
    this.mats.crash = mkMat(0xff6a4a, true);
    this.mats.power = mkMat(0x7bdcff, true);
    this.shakeT = 0; this.shakeAmp = 0;
  }
  FX.prototype.burst = function (type, x, y, z, n, spread, up) {
    for (var i = 0; i < n; i++) {
      var m = this.pool.pop();
      if (!m) { m = new THREE.Mesh(this.geo, this.mats[type]); this.scene.add(m); }
      m.material = this.mats[type];
      m.visible = true;
      m.position.set(x + (Math.random() - 0.5) * (spread || 0.5), y + (Math.random() - 0.5) * (spread || 0.5), z + (Math.random() - 0.5) * (spread || 0.5));
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      this.active.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 4, vy: (up || 2) + Math.random() * 3.5, vz: (Math.random() - 0.5) * 4 - 4,
        life: 1, decay: type === 'dust' ? 1.6 : 2.2, scale: type === 'crash' ? 1.6 : 1
      });
    }
  };
  FX.prototype.update = function (dt) {
    for (var i = this.active.length - 1; i >= 0; i--) {
      var p = this.active[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) { p.mesh.visible = false; this.pool.push(p.mesh); this.active.splice(i, 1); continue; }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 14 * dt;
      var s = p.scale * Math.max(0.05, p.life);
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = p.life;
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  };
  FX.prototype.shake = function (amp, dur) { this.shakeAmp = amp; this.shakeT = dur || 0.3; };
  FX.prototype.clear = function () {
    for (var i = this.active.length - 1; i >= 0; i--) {
      this.active[i].mesh.visible = false; this.pool.push(this.active[i].mesh);
    }
    this.active.length = 0;
  };
  root.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
