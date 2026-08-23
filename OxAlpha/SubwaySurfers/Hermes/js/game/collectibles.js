// Collectibles: pooled coins/gems/stars + magnet attraction + pickup FX.
(function (root) {
  var COL = { COIN: 'coin', GEM: 'gem', STAR: 'star' };
  function CollectibleSys(scene, mats) {
    this.scene = scene; this.mats = mats;
    this.active = [];
    this.free = { coin: [], gem: [], star: [] };
    this.onCollect = null;   // fn(type, x,y,z)
    this.coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 18);
    this.gemGeo = new THREE.OctahedronGeometry(0.42, 0);
    this.starGeo = new THREE.OctahedronGeometry(0.55, 0);
    this.spin = 0;
  }
  CollectibleSys.prototype.spawn = function (type, x, y, z, k, lz) {
    var mesh = this._get(type);
    mesh.position.set(x, y, z);
    mesh.visible = true;
    this.active.push({ type: type, mesh: mesh, taken: false, k: k, lz: lz, bx: x, by: y });
  };
  CollectibleSys.prototype._get = function (type) {
    if (this.free[type].length) return this.free[type].pop();
    var geo = type === 'coin' ? this.coinGeo : (type === 'gem' ? this.gemGeo : this.starGeo);
    var mat = type === 'coin' ? this.mats.coinMat : (type === 'gem' ? this.mats.gemMat : this.mats.starMat);
    var m = new THREE.Mesh(geo, mat);
    if (type === 'coin') m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    return m;
  };
  CollectibleSys.prototype.loadChunk = function (chunk) {
    for (var i = 0; i < chunk.coins.length; i++) {
      var c = chunk.coins[i];
      this.spawn(c.type, c.x, c.y, chunk.startZ + c.z, chunk.index, c.z);
    }
  };
  CollectibleSys.prototype.update = function (dt, playerPos, magnetR, speedNorm, travel) {
    this.spin += dt * 4;
    var L = root.CFG.CHUNK_LEN;
    for (var i = this.active.length - 1; i >= 0; i--) {
      var a = this.active[i];
      var m = a.mesh;
      // ride the streaming world: world z = -k*L + travel + local z
      m.position.z = -a.k * L + travel + a.lz;
      m.rotation.z = this.spin; m.rotation.y = this.spin * 0.7;
      m.position.y = a.by + Math.sin(this.spin * 2 + i) * 0.12;
      // magnet
      if (magnetR > 0 && a.type === 'coin') {
        var dx = playerPos.x - m.position.x, dy = playerPos.y + 1 - m.position.y, dz = playerPos.z - m.position.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < magnetR * magnetR) {
          var d = Math.sqrt(d2) || 1, pull = dt * 26;
          m.position.x += dx / d * pull; m.position.y += dy / d * pull; m.position.z += dz / d * pull;
        }
      }
      // pickup check
      var px = m.position.x - playerPos.x, py = m.position.y - (playerPos.y + 0.9), pz = m.position.z - playerPos.z;
      var rad = a.type === 'coin' ? 1.05 : 1.25;
      if (px * px + py * py * 0.35 + pz * pz < rad * rad && !a.taken) {
        a.taken = true;
        if (this.onCollect) this.onCollect(a.type, m.position.x, m.position.y, m.position.z);
        this._recycle(i);
      } else if (m.position.z > playerPos.z + 2.0) {
        this._recycle(i); // passed by: recycle immediately so nothing lingers near the camera
      }
    }
  };
  CollectibleSys.prototype._recycle = function (i) {
    var a = this.active[i];
    a.mesh.visible = false;
    this.free[a.type].push(a.mesh);
    this.active.splice(i, 1);
  };
  CollectibleSys.prototype.clear = function () {
    for (var i = this.active.length - 1; i >= 0; i--) this._recycle(i);
  };
  CollectibleSys.prototype.count = function () { return this.active.length; };
  root.CollectibleSys = CollectibleSys;
  root.COLLECT_TYPES = COL;
})(typeof window !== 'undefined' ? window : globalThis);
