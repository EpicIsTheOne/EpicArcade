(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const U = DS.util;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  const GATE_DEFS = [
    [0, -40, 4], [26, -62, 7], [52, -52, 12], [66, -26, 15], [56, 4, 10],
    [30, 26, 6], [0, 38, 10], [-30, 24, 6], [-52, -2, 12], [-36, -28, 7]
  ];
  const START_POS = V3(0, 0, -16);
  const FINISH_POS = V3(-18, 0, -56);
  const RING_R = 2.6, PASS_R = 2.05;

  const COL_UPCOMING = 0x17708c;
  const COL_NEXT = 0x38d9ff;
  const COL_PASSED = 0x2fb56a;

  function makeArch(kind) {
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshLambertMaterial({ color: kind === "finish" ? 0xdadfe4 : 0x7f8c99 });
    const ph = 7;
    for (const sx of [-3.2, 3.2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, ph, 0.55), pillarMat);
      p.position.set(sx, ph / 2, 0);
      p.castShadow = true;
      g.add(p);
    }
    let beamMat;
    if (kind === "finish") {
      beamMat = new THREE.MeshLambertMaterial({ map: U.checkerTexture(8, "#101216", "#e8ecef") });
    } else {
      beamMat = new THREE.MeshLambertMaterial({ color: 0x2ea8d8 });
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.6, 0.6), beamMat);
    beam.position.set(0, ph, 0);
    beam.castShadow = true;
    g.add(beam);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 0.25),
      new THREE.MeshBasicMaterial({
        color: kind === "finish" ? 0xffd54a : 0x59e0ff,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide
      })
    );
    strip.position.set(0, ph - 0.45, 0);
    g.add(strip);
    return g;
  }

  function Race(scene, world, callbacks) {
    this.scene = scene;
    this.world = world;
    this.cb = callbacks || {};
    this.state = "idle";
    this.nextIdx = 0;
    this.elapsed = 0;
    this.countdownT = 0;
    this.best = null;
    try {
      const b = localStorage.getItem("droneSimBestTime");
      if (b != null) this.best = parseFloat(b);
    } catch (e) {}

    this.gates = GATE_DEFS.map(([x, z, y]) => {
      const gy = world.groundAt(x, z);
      return { pos: V3(x, Math.max(y, gy + 2.8), z), normal: V3(0, 0, -1) };
    });
    for (let i = 0; i < this.gates.length; i++) {
      const prevP = i === 0 ? START_POS : this.gates[i - 1].pos;
      const nextP = i === this.gates.length - 1 ? FINISH_POS : this.gates[i + 1].pos;
      this.gates[i].normal.copy(nextP).sub(prevP);
      this.gates[i].normal.y = 0;
      this.gates[i].normal.normalize();
    }

    const torusGeo = new THREE.TorusGeometry(RING_R, 0.17, 12, 42);
    const haloTex = U.radialGlowTexture(0, 60, [[0, "rgba(90,220,255,0.5)"], [0.5, "rgba(70,180,255,0.14)"], [1, "rgba(0,120,255,0)"]]);
    this.gateVisuals = this.gates.map((gate, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: COL_UPCOMING });
      const ring = new THREE.Mesh(torusGeo, mat);
      ring.position.copy(gate.pos);
      ring.lookAt(gate.pos.clone().add(gate.normal));
      scene.add(ring);

      const numTex = U.numberLabelTexture(String(i + 1), "#dff6ff");
      const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: numTex, transparent: true, depthWrite: false }));
      num.scale.set(1.7, 1.7, 1);
      num.position.copy(gate.pos).add(V3(0, 4.0, 0));
      scene.add(num);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(11, 11, 1);
      halo.position.copy(gate.pos);
      scene.add(halo);

      const dia = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42),
        new THREE.MeshBasicMaterial({ color: 0xffd54a })
      );
      dia.visible = false;
      scene.add(dia);
      gate.ring = ring; gate.mat = mat; gate.halo = halo; gate.dia = dia;
      return gate;
    });

    this.startArch = makeArch("start");
    this.startArch.position.copy(START_POS);
    scene.add(this.startArch);
    const finDir = new THREE.Vector3().subVectors(FINISH_POS, this.gates[9].pos);
    finDir.y = 0;
    finDir.normalize();
    this._finishNormal = finDir;
    this.finishArch = makeArch("finish");
    this.finishArch.position.copy(FINISH_POS);
    this.finishArch.rotation.y = Math.atan2(finDir.x, finDir.z);
    scene.add(this.finishArch);
    this.startArch.rotation.y = Math.PI;

    this.computeCheckpoints();
    this._prevPos = null;
    this._missCd = 0;

    this.finishDia = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: 0xffd54a })
    );
    this.finishDia.visible = false;
    scene.add(this.finishDia);

    const mkLabel = (txt, color) => {
      const [c, ctx] = U.makeCanvas(256, 64);
      ctx.font = "800 40px 'Segoe UI', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 8; ctx.strokeStyle = "rgba(5,12,18,0.9)";
      ctx.strokeText(txt, 128, 34);
      ctx.fillStyle = color; ctx.fillText(txt, 128, 34);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.canvasTex(c), transparent: true, depthWrite: false }));
      sp.scale.set(4.2, 1.05, 1);
      return sp;
    };
    const sl = mkLabel("START", "#8fe6ff");
    sl.position.copy(START_POS).add(V3(0, 10.4, 0));
    scene.add(sl);
    const fl = mkLabel("FINISH", "#ffd54a");
    fl.position.copy(FINISH_POS).add(V3(0, 10.4, 0));
    scene.add(fl);
  }

  Race.prototype.arm = function () {
    this.state = "armed";
    this.nextIdx = 0;
    this.elapsed = 0;
    this._refreshVisuals();
  };

  Race.prototype.toIdle = function () {
    this.state = "idle";
    this.nextIdx = 0;
    this.elapsed = 0;
    this._refreshVisuals();
  };

  Race.prototype.retry = function () {
    this.arm();
  };

  Race.prototype.getRespawn = function () {
    const cp = this.lastCheckpoint();
    return { pos: cp.pos.clone(), yawDeg: cp.yawDeg };
  };

  Race.prototype.computeCheckpoints = function () {
    const startCp = {
      pos: V3(START_POS.x, 1.6, START_POS.z + 6),
      yawDeg: 0
    };
    this.checkpoints = [startCp];
    for (let i = 0; i < this.gates.length; i++) {
      const gt = this.gates[i];
      const n = gt.normal;
      const gy = this.world.groundAt(gt.pos.x, gt.pos.z);
      const p = V3(gt.pos.x - n.x * 8, Math.max(gt.pos.y, gy + 1.6), gt.pos.z - n.z * 8);
      this.checkpoints.push({ pos: p, yawDeg: THREE.MathUtils.radToDeg(Math.atan2(-n.x, -n.z)) });
    }
    this._cpPos = startCp.pos;
    this._cpYaw = startCp.yawDeg;
  };

  Race.prototype.lastCheckpoint = function () {
    return this.checkpoints ? this.checkpoints[this.nextIdx] : this.checkpoints[0];
  };

  Race.prototype.nextGateInfo = function () {
    if (this.state !== "running") return null;
    if (this.nextIdx >= this.gates.length) {
      return { pos: FINISH_POS.clone().add(V3(0, 3, 0)), index: this.gates.length, total: this.gates.length, isFinish: true };
    }
    const g = this.gates[this.nextIdx];
    return { pos: g.pos.clone(), index: this.nextIdx, total: this.gates.length, isFinish: false };
  };

  Race.prototype.mapData = function () {
    return {
      gates: this.gates.map((g, i) => ({
        x: g.pos.x, z: g.pos.z,
        state: this.state === "running" || this.state === "finished"
          ? (i < this.nextIdx ? "passed" : i === this.nextIdx && this.state === "running" ? "next" : "upcoming")
          : "upcoming"
      })),
      start: { x: START_POS.x, z: START_POS.z },
      finish: { x: FINISH_POS.x, z: FINISH_POS.z }
    };
  };

  Race.prototype._crossPlane = function (prev, cur, center, normal) {
    const s0 = (prev.x - center.x) * normal.x + (prev.z - center.z) * normal.z;
    const s1 = (cur.x - center.x) * normal.x + (cur.z - center.z) * normal.z;
    if (!(s0 < 0 && s1 >= 0)) return null;
    const t = s0 / (s0 - s1);
    return new THREE.Vector3().lerpVectors(prev, cur, t);
  };

  Race.prototype.update = function (dt, drone, t) {
    if (this.state === "running") this.elapsed += dt * 1000;
    if (this._missCd > 0) this._missCd -= dt;
    if (drone.crashed) {
      this._pulse(t);
      return;
    }
    const prev = drone._prev;
    const cur = drone.pos;

    if (this.state === "armed") {
      const p = this._crossPlane(prev, cur, START_POS, V3(0, 0, -1));
      if (p) {
        const lat = Math.abs(p.x - START_POS.x);
        if (lat < 3.2 && p.y > 0.35 && p.y < 6.9) {
          this.state = "countdown";
          this.countdownT = 3.0;
          this._cdLast = 4;
          if (this.cb.onArmed) this.cb.onArmed();
        } else if (lat < 8 && (p.y >= 6.9 || p.y <= 0.35) && this._missCd <= 0) {
          this._missCd = 2.0;
          if (this.cb.onArchMiss) this.cb.onArchMiss();
        }
      }
    } else if (this.state === "countdown") {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (n < this._cdLast && n > 0) {
        this._cdLast = n;
        if (this.cb.onCountdown) this.cb.onCountdown(n);
      }
      if (this.countdownT <= 0) {
        this.state = "running";
        this.elapsed = 0;
        this.nextIdx = 0;
        this._refreshVisuals();
        if (this.cb.onCountdownGo) this.cb.onCountdownGo();
      }
    } else if (this.state === "running") {
      if (this.nextIdx < this.gates.length) {
        const g = this.gates[this.nextIdx];
        const p = this._crossPlane(prev, cur, g.pos, g.normal);
        if (p) {
          const rel = p.sub(g.pos);
          const lat = Math.hypot(rel.x, rel.z);
          if (lat < PASS_R && Math.abs(rel.y) < PASS_R) {
            this.nextIdx++;
            this._advanceCheckpoint();
            if (this.cb.onGate) this.cb.onGate(this.nextIdx, this.gates.length);
            this._refreshVisuals();
          }
        }
      } else {
        const p = this._crossPlane(prev, cur, FINISH_POS, this._finishNormal);
        if (p) {
          const lat = Math.abs(p.x - FINISH_POS.x);
          if (lat < 3.4 && p.y > 0.35 && p.y < 6.9) {
            this._finish();
          }
        }
      }
    }

    this._pulse(t);
  };

  Race.prototype._pulse = function (t) {
    const pulse = 1 + Math.sin(t * 5.5) * 0.05;
    const finishLeg = this.state === "running" && this.nextIdx >= this.gates.length;
    if (this.finishDia) {
      this.finishDia.visible = finishLeg;
      if (finishLeg) {
        this.finishDia.rotation.y = t * 2.2;
        this.finishDia.scale.setScalar(pulse * 1.3);
        this.finishDia.position.set(FINISH_POS.x, 3.2, FINISH_POS.z);
      }
    }
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      if (i === this.nextIdx && this.state === "running" && !finishLeg) {
        gate.dia.visible = true;
        gate.dia.rotation.y = t * 2.2;
        gate.dia.scale.setScalar(pulse);
        gate.dia.position.copy(gate.pos);
      } else {
        gate.dia.visible = false;
      }
    }
  };

  Race.prototype._advanceCheckpoint = function () {
    if (!this.checkpoints) return;
    const cp = this.checkpoints[Math.min(this.nextIdx, this.checkpoints.length - 1)];
    this._cpPos = cp.pos;
    this._cpYaw = cp.yawDeg;
  };

  Race.prototype._finish = function () {
    this.state = "finished";
    const time = this.elapsed;
    let isRecord = false;
    if (this.best == null || time < this.best) {
      this.best = time;
      isRecord = true;
      try { localStorage.setItem("droneSimBestTime", String(time)); } catch (e) {}
    }
    this._refreshVisuals();
    if (this.cb.onFinish) this.cb.onFinish(time, this.best, isRecord);
  };

  Race.prototype.resetBest = function () {
    this.best = null;
    try { localStorage.removeItem("droneSimBestTime"); } catch (e) {}
  };

  Race.prototype._refreshVisuals = function () {
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      let col = COL_UPCOMING;
      if (this.state === "running" || this.state === "finished") {
        if (i < this.nextIdx) col = COL_PASSED;
        else if (i === this.nextIdx && this.state === "running") col = COL_NEXT;
      }
      gate.mat.color.setHex(col);
      gate.halo.material.opacity = i === this.nextIdx && this.state === "running" ? 0.75 : 0.06;
    }
  };

  Race.prototype.formatBest = function () { return U.fmtTime(this.best); };
  Object.defineProperty(Race.prototype, "timeMs", {
    get() {
      if (this.state === "running") return this.elapsed;
      if (this.state === "finished") return this.elapsed;
      return null;
    }
  });

  DS.Race = Race;
})();
