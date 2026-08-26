/* SKYRUSH — personal-best ghost recording & playback */
"use strict";

const Ghost = {
  SAMPLE_DT: 0.09,
  rec: [], recT: 0,
  playData: null,   // { dt, samples: [[x,y,z], ...] }
  mesh: null,
  enabled: true,

  init() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9ff3ff, emissive: 0x2bd8ff, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.38, depthWrite: false,
    });
    const bodyGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.28, 0.5, 4, 10) : new THREE.SphereGeometry(0.34, 12, 10);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.55;
    g.add(body);
    g.visible = false;
    Game.scene.add(g);
    this.mesh = g;
    this.playData = U.store.get("ghost", null);
  },

  startRecording() {
    this.rec = []; this.recT = 0;
    this._push();
  },

  _push() {
    if (this.rec.length < 3400) {
      this.rec.push([
        +Player.pos.x.toFixed(2), +Player.pos.y.toFixed(2), +Player.pos.z.toFixed(2)]);
    }
  },

  record(dt) {
    this.recT += dt;
    while (this.recT >= this.SAMPLE_DT) {
      this.recT -= this.SAMPLE_DT;
      this._push();
    }
  },

  finishAndMaybeSave(runTime) {
    // keep only if it's a valid full run
    if (this.rec.length > 20) return { dt: this.SAMPLE_DT, samples: this.rec };
    return null;
  },

  sample(t) {
    const d = this.playData;
    if (!d || !d.samples.length) return null;
    const idx = t / d.dt;
    const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, d.samples.length - 1);
    if (i0 >= d.samples.length - 1 && idx > d.samples.length) return null; // ghost finished
    const f = U.clamp(idx - i0, 0, 1);
    const a = d.samples[i0], b = d.samples[i1];
    if (!a || !b) return null;
    return [U.lerp(a[0], b[0], f), U.lerp(a[1], b[1], f), U.lerp(a[2], b[2], f)];
  },

  update(raceTime) {
    if (!this.enabled || !this.playData || Game.state !== "playing") { this.mesh.visible = false; return; }
    const s = this.sample(raceTime);
    if (s) {
      this.mesh.visible = true;
      this.mesh.position.set(s[0], s[1], s[2]);
    } else {
      this.mesh.visible = false;
    }
  },

  saveIfBest(timeMs) {
    const data = this.finishAndMaybeSave();
    if (data) {
      U.store.set("ghost", data);
      this.playData = data;
    }
  },
};
