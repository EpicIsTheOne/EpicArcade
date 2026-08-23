/* ============================================================
   VOLT RUSH — collectibles.js
   Rings (common), Data Shards (secrets/progression),
   HUD overlay, localStorage save system.
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);

  /* ---------------- RING FIELD (instanced) ---------------- */
  class RingField {
    constructor(scene, ringDefs) {
      // ringDefs: [{x,y,z}, ...] — one InstancedMesh for all
      this.defs = ringDefs;
      this.count = ringDefs.length;
      this.taken = new Uint8Array(this.count);
      this.scene = scene;
      const geo = new (T().TorusGeometry)(0.55, 0.09, 6, 18);
      const mat = new (T().MeshStandardMaterial)({
        color: 0xffd23e, emissive: 0xffa61a, emissiveIntensity: 1.4,
        roughness: 0.35, metalness: 0.6,
      });
      this.mesh = new (T().InstancedMesh)(geo, mat, Math.max(1, this.count));
      this.mesh.instanceMatrix.setUsage(T().DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      const m4 = new (T().Matrix4)();
      for (let i = 0; i < this.count; i++) {
        const d = ringDefs[i];
        m4.makeTranslation(d.x, d.y, d.z);
        if (d.axis === 'x') m4.multiply(new (T().Matrix4)().makeRotationY(Math.PI / 2));
        this.mesh.setMatrixAt(i, m4);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      scene.add(this.mesh);
      this._m4 = m4;
      this._zero = new (T().Matrix4)().makeScale(0.0001, 0.0001, 0.0001);
    }
    // returns count collected this frame; player has .pos, game handles fx/audio via cb
    update(player, dt, time, onCollect) {
      let got = 0;
      const px = player.pos.x, py = player.pos.y + 0.8, pz = player.pos.z;
      const R2 = 1.5 * 1.5;
      for (let i = 0; i < this.count; i++) {
        if (this.taken[i]) continue;
        const d = this.defs[i];
        const dx = d.x - px, dy = d.y - py, dz = d.z - pz;
        if (dx * dx + dy * dy + dz * dz < R2) {
          this.taken[i] = 1;
          this.mesh.setMatrixAt(i, this._zero);
          got++;
          if (onCollect) onCollect(d, i);
        }
      }
      if (got) this.mesh.instanceMatrix.needsUpdate = true;
      // gentle spin via shader-free trick: rotate whole field slowly is wrong for placed rings;
      // instead pulse emissive
      this.mesh.material.emissiveIntensity = 1.2 + Math.sin(time * 5) * 0.35;
      return got;
    }
    reset() {
      this.taken.fill(0);
      const m4 = new (T().Matrix4)();
      for (let i = 0; i < this.count; i++) {
        const d = this.defs[i];
        m4.makeTranslation(d.x, d.y, d.z);
        if (d.axis === 'x') m4.multiply(new (T().Matrix4)().makeRotationY(Math.PI / 2));
        this.mesh.setMatrixAt(i, m4);
      }
      this.mesh.instanceMesh && (this.mesh.instanceMesh.needsUpdate = true);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    remaining() { let n = 0; for (let i = 0; i < this.count; i++) if (!this.taken[i]) n++; return n; }
    dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  }

  /* ---------------- DATA SHARDS (gems / secrets) ---------------- */
  class ShardSet {
    constructor(scene, defs) {
      // defs: [{x,y,z,name}]
      this.defs = defs;
      this.scene = scene;
      this.groups = [];
      this.spin = [];
      for (const d of defs) {
        const g = new (T().Group)();
        g.position.set(d.x, d.y, d.z);
        const geo = new (T().OctahedronGeometry)(0.5, 0);
        const mat = new (T().MeshStandardMaterial)({
          color: d.color || 0xff4fd8, emissive: d.color || 0xff4fd8,
          emissiveIntensity: 1.7, roughness: 0.2, metalness: 0.4,
        });
        const m = new (T().Mesh)(geo, mat);
        g.add(m);
        const halo = new (T().Mesh)(new (T().SphereGeometry)(0.75, 10, 10),
          new (T().MeshBasicMaterial)({ color: d.color || 0xff4fd8, transparent: true, opacity: 0.14, depthWrite: false }));
        g.add(halo);
        g.visible = true;
        scene.add(g);
        this.groups.push(g);
        this.spin.push(Math.random() * 6);
      }
      this.collected = new Uint8Array(defs.length);
    }
    update(player, dt, time, onCollect) {
      const px = player.pos.x, py = player.pos.y + 0.8, pz = player.pos.z;
      for (let i = 0; i < this.groups.length; i++) {
        const g = this.groups[i];
        if (!g.visible) continue;
        this.spin[i] += dt;
        g.rotation.y = this.spin[i] * 1.6;
        g.position.y += Math.sin(time * 2 + i) * dt * 0.35;
        const p = g.position;
        const dx = p.x - px, dy = p.y - py, dz = p.z - pz;
        if (dx * dx + dy * dy + dz * dz < 2.6) {
          g.visible = false;
          this.collected[i] = 1;
          if (onCollect) onCollect(this.defs[i], i);
        }
      }
    }
    reset() { for (let i = 0; i < this.groups.length; i++) { this.groups[i].visible = true; } this.collected.fill(0); }
    collectedCount() { let n = 0; for (let i = 0; i < this.collected.length; i++) n += this.collected[i]; return n; }
    dispose() { for (const g of this.groups) this.scene.remove(g); }
  }

  /* ---------------- HUD ---------------- */
  class HUD {
    constructor() {
      this.root = document.getElementById('hud');
      this.ringEl = document.getElementById('hud-rings');
      this.shardEl = document.getElementById('hud-shards');
      this.timeEl = document.getElementById('hud-time');
      this.speedEl = document.getElementById('hud-speed');
      this.speedBar = document.getElementById('speedbar-fill');
      this.boostEl = document.getElementById('boost-pips');
      this.stateEl = document.getElementById('hud-state');
      this.centerEl = document.getElementById('center-msg');
      this.dmgEl = document.getElementById('damage-vignette');
      this.comboEl = document.getElementById('combo-msg');
      this._msgTimer = null;
      this._comboTimer = null;
    }
    setRings(n) { if (this.ringEl) this.ringEl.textContent = String(n).padStart(3, '0'); }
    setShards(got, total) { if (this.shardEl) this.shardEl.textContent = `${got}/${total}`; }
    setTime(t) {
      if (!this.timeEl) return;
      const m = Math.floor(t / 60), s = t % 60;
      this.timeEl.textContent = `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
    }
    setSpeed(v01, kmh) {
      if (this.speedEl) this.speedEl.textContent = String(Math.round(kmh));
      if (this.speedBar) this.speedBar.style.width = `${Math.min(100, v01 * 100)}%`;
    }
    setState(txt) {
      if (this.stateEl && this.stateEl.textContent !== txt) this.stateEl.textContent = txt;
    }
    boostPips(pips) {
      if (!this.boostEl) return;
      const kids = this.boostEl.children;
      for (let i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('lit', i < pips);
      }
    }
    centerMsg(html, dur = 2200) {
      if (!this.centerEl) return;
      this.centerEl.innerHTML = html;
      this.centerEl.classList.add('show');
      clearTimeout(this._msgTimer);
      this._msgTimer = setTimeout(() => this.centerEl.classList.remove('show'), dur);
    }
    combo(txt) {
      if (!this.comboEl) return;
      this.comboEl.textContent = txt;
      this.comboEl.classList.remove('pop');
      void this.comboEl.offsetWidth; // reflow to restart animation
      this.comboEl.classList.add('pop');
    }
    damageFlash() {
      if (!this.dmgEl) return;
      this.dmgEl.classList.remove('flash');
      void this.dmgEl.offsetWidth;
      this.dmgEl.classList.add('flash');
    }
  }

  /* ---------------- SAVE ---------------- */
  const SAVE_KEY = 'voltrush.save.v1';
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  window.VoltCollect = { RingField, ShardSet, HUD, loadSave, writeSave };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltCollect;
})();
