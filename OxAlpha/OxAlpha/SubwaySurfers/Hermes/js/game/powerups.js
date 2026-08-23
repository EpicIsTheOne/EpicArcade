// Powerups: magnet, jetpack, shield, 2x multiplier, boost + hoverboard system.
(function (root) {
  var PW = {};
  PW.TYPES = ['magnet', 'jetpack', 'shield', 'multiplier', 'boost'];
  PW.DEFS = {
    magnet:     { name: 'MAGNET',    color: 0xffb547, dur: [8, 10.5, 13, 15.5, 18], icon: '◉' },
    jetpack:    { name: 'JETPACK',   color: 0xff7043, dur: [4.5, 5.6, 6.7, 7.8, 9],  icon: '↑' },
    shield:     { name: 'SHIELD',    color: 0x63e0ff, dur: [6, 8, 10, 12, 14],       icon: '⬡' },
    multiplier: { name: 'SCORE ×2',  color: 0xb388ff, dur: [10, 13, 16, 19, 22],     icon: '×' },
    boost:      { name: 'BOOST',     color: 0x69f0ae, dur: [3.5, 4.4, 5.3, 6.2, 7.1], icon: '»' }
  };
  // Upgrade cost per level (level = current upgrade level 0..4)
  PW.upgradeCost = function (type, level) {
    var base = { magnet: 300, jetpack: 400, boost: 350, shield: 450, multiplier: 500 }[type];
    return Math.round(base * Math.pow(1.9, level));
  };

  function PowerupSys(scene) {
    this.scene = scene;
    this.active = {};         // type -> remaining seconds
    this.durTotal = {};       // type -> total duration for HUD bar
    this.worldItems = [];     // floating pickups in the world
    this.freeMeshes = [];
    this.onPickup = null; this.onEnd = null; this.onStart = null;
    var geo = new THREE.IcosahedronGeometry(0.52, 0);
    this.geo = geo;
    this.mats = {};
    var self = this;
    PW.TYPES.forEach(function (t) {
      self.mats[t] = new THREE.MeshStandardMaterial({
        color: PW.DEFS[t].color, emissive: PW.DEFS[t].color, emissiveIntensity: 1.1,
        metalness: 0.5, roughness: 0.2
      });
    });
  }
  PowerupSys.prototype.loadChunk = function (chunk) {
    for (var i = 0; i < chunk.powerups.length; i++) {
      var p = chunk.powerups[i];
      var type = root.PW.TYPES[(Math.abs(Math.round(p.x * 7 + p.z * 13))) % root.PW.TYPES.length];
      var mesh = this.freeMeshes.pop() || this._make();
      mesh.material = this.mats[type];
      mesh.position.set(p.x, 1.45, chunk.startZ + p.z);
      mesh.visible = true;
      mesh.userData.type = type;
      mesh.userData.k = chunk.index;
      mesh.userData.lz = p.z;
      this.worldItems.push(mesh);
    }
  };
  PowerupSys.prototype._make = function () {
    var m = new THREE.Mesh(this.geo, this.mats.magnet);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.add(ring); m.userData.ring = ring;
    this.scene.add(m);
    return m;
  };
  PowerupSys.prototype.update = function (dt, t, playerPos, player, travel) {
    // world items spin & pickup (ride streaming world)
    var L = root.CFG.CHUNK_LEN;
    for (var i = this.worldItems.length - 1; i >= 0; i--) {
      var m = this.worldItems[i];
      m.position.z = -m.userData.k * L + travel + m.userData.lz;
      m.rotation.y = t * 2.2; m.rotation.x = t * 1.3;
      if (m.userData.ring) m.userData.ring.rotation.z = t * 3;
      m.position.y = 1.45 + Math.sin(t * 3 + i) * 0.15;
      var dx = m.position.x - playerPos.x, dz = m.position.z - playerPos.z;
      var dy = m.position.y - (playerPos.y + 0.9);
      if (dx * dx + dy * dy * 0.5 + dz * dz < 1.5 * 1.5) {
        this._grant(m.userData.type);
        this._despawn(i);
      } else if (m.position.z > playerPos.z + 12) this._despawn(i);
    }
    // active timers
    for (var type in this.active) {
      if (this.active[type] > 0) {
        this.active[type] -= dt;
        if (this.active[type] <= 0) {
          this.active[type] = 0;
          if (this.onEnd) this.onEnd(type);
        }
      }
    }
  };
  PowerupSys.prototype._despawn = function (i) {
    var m = this.worldItems[i];
    m.visible = false;
    this.freeMeshes.push(m);
    this.worldItems.splice(i, 1);
  };
  PowerupSys.prototype._grant = function (type) {
    var lvl = (root.Save.data.upgrades[type] || 0);
    var durs = root.PW.DEFS[type].dur;
    var durV = durs[Math.min(lvl, durs.length - 1)];
    this.active[type] = durV;
    this.durTotal[type] = durV;
    if (this.onStart) this.onStart(type);
  };
  PowerupSys.prototype.isActive = function (t) { return !!this.active[t]; };
  PowerupSys.prototype.remaining = function (t) { return this.active[t] || 0; };
  PowerupSys.prototype.frac = function (t) { return this.durTotal[t] ? this.active[t] / this.durTotal[t] : 0; };
  PowerupSys.prototype.endNow = function (t) { if (this.active[t]) { this.active[t] = 0; if (this.onEnd) this.onEnd(t); } };
  PowerupSys.prototype.clearAll = function () {
    for (var i = this.worldItems.length - 1; i >= 0; i--) this._despawn(i);
    this.active = {}; this.durTotal = {};
  };
  PowerupSys.prototype.grantDirect = function (type, secs) {
    this.active[type] = secs; this.durTotal[type] = secs;
    if (this.onStart) this.onStart(type);
  };
  root.PowerupSys = PowerupSys;
  root.PW = PW;
})(typeof window !== 'undefined' ? window : globalThis);
