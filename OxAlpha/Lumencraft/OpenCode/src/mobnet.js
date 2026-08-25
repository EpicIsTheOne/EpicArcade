// Shared mobs: host-authoritative co-op survival sync.
// The oldest peer (host) simulates every mob exactly like single-player and
// publishes 10Hz snapshots; everyone else mirrors them and routes their hits
// back to the host ({op:'mobhit'}). On host leave the next-oldest peer
// adopts the last snapshot as live mobs (seamless migration).
import * as THREE from 'three';
import { MOB_TYPES, Mob, buildMobModel, rollDrops, reserveMobEid } from './entities.js';
import { globalUniforms } from './materials.js';

const SYNC_CAP = 40;   // must match server.mjs MAX_MOBS_SYNC
const SNAP_T = 0.1;    // 10Hz snapshots

export class MobNet {
  constructor(game) {
    this.game = game;
    this.remote = new Map();        // eid -> mirrored mob record
    this._sendT = 0;
    this._lastAttacker = new Map(); // eid -> attacker name (host side)
    /** true while connected and someone else holds mob authority */
    this.mirroring = false;
  }

  get isHost() {
    const n = this.game.net;
    return !!(n && n.connected && n.hostId != null && n.hostId === n.you);
  }

  /** number of mirrored mobs (debug/QA) */
  remoteCount() { return this.remote.size; }

  /** mirrored mobs are pickable targets: shape-compatible with EntityManager.mobs */
  pickList() { return [...this.remote.values()]; }

  // ---------- inbound ops (wired by main.js onto the Net instance) ----------

  onMobs(ms) {
    if (!Array.isArray(ms) || !this.mirroring) return;
    const seen = new Set();
    for (const e of ms) {
      if (!Array.isArray(e) || e.length !== 7) continue;
      const [eid, typeName, x, y, z, hp, yaw] = e;
      if (!MOB_TYPES[typeName]) continue;
      seen.add(eid);
      let rec = this.remote.get(eid);
      if (!rec) {
        this._spawnRemote(eid, typeName, x, y, z, yaw, hp);
        continue;
      }
      rec.tgt.x = x; rec.tgt.y = y; rec.tgt.z = z; rec.tgt.yaw = yaw;
      if (hp < rec.hp - 0.01) rec.hurtT = 0.4;   // someone hit it
      rec.hp = hp;
    }
    // absent from snapshot → despawned or fell outside the synced cap
    for (const rec of [...this.remote.values()]) {
      if (!seen.has(rec.eid)) this._removeRemote(rec);
    }
  }

  /** host side: another player's hit lands on one of my mobs */
  onMobHit(m) {
    if (!this.isHost) return;
    const mob = this.game.entities.mobs.find((x) => x.eid === m.id && !x.dead);
    if (!mob || mob.dying) return;
    if (m.by) this._lastAttacker.set(m.id, String(m.by).slice(0, 16));
    mob.hurt(+m.dmg || 1, (m.kx || m.kz) ? new THREE.Vector3(m.kx || 0, 0, m.kz || 0) : null);
  }

  /** mirror side: the host declared a mob dead */
  onMobDie(m) {
    const rec = this.remote.get(m.id);
    if (!rec) return;
    this._lastAttacker.delete(m.id);
    rec.hp = 0;
    rec.dying = true;
    rec.deathT = 0;
    if (this.game.audio) this.game.audio.mobDie(rec.typeName);
    if (this.game.particles) {
      this.game.particles.burst(rec.pos.x, rec.pos.y + 0.6, rec.pos.z, [0.7, 0.1, 0.1], 10, 2.2);
    }
    // loot belongs to the killing blow: if that was me, my client drops it
    if (m.killer && this.game.net && m.killer === this.game.net.myName) {
      rollDrops(this.game, rec.typeName, rec.pos.x, rec.pos.y, rec.pos.z);
    }
    this.remote.delete(m.id);
  }

  /** Net told us who the host is now (welcome / host op / rejoin) */
  onHostChanged(hostId) {
    const n = this.game.net;
    if (n && n.connected && hostId != null && hostId === n.you) this._adoptSnapshot();
  }

  /** connection loss: forget mirrored state; sim goes solo until rejoin */
  handleDisconnect() {
    this.clearRemote();
    this._lastAttacker.clear();
    this.mirroring = false;
  }

  clearRemote() {
    for (const rec of [...this.remote.values()]) this._removeRemote(rec);
    this.remote.clear();
  }

  dispose() { this.clearRemote(); }

  // ---------- per-frame ----------

  update(dt) {
    const n = this.game.net;
    const ents = this.game.entities;
    const shouldBeMirroring = !!(n && n.connected && !this.isHost);

    if (shouldBeMirroring && !this.mirroring) this._demote();
    this.mirroring = shouldBeMirroring;
    ents.spawnEnabled = !shouldBeMirroring;

    if (this.isHost) {
      this._sendT -= dt;
      if (this._sendT <= 0) { this._sendT = SNAP_T; this._publish(); }
    } else if (this.remote.size) {
      this._mirrorUpdate(dt);
    }
  }

  _publish() {
    const n = this.game.net;
    if (!n.remotes || n.remotes.count() === 0) return;
    const p = this.game.player;
    const mobs = this.game.entities.mobs
      .filter((m) => !m.dead && !m.dying)
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos))
      .slice(0, SYNC_CAP);
    const r2 = (v) => Math.round(v * 100) / 100;
    const ms = mobs.map((m) => [
      m.eid, m.typeName, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z),
      Math.round(m.hp * 10) / 10, r2(m.moveYaw),
    ]);
    n.sendMobs(ms);
  }

  /** attacker-side hook for mirrored mobs: predict flash, route damage */
  hitRemote(eid, dmg, dir) {
    const rec = this.remote.get(eid);
    if (!rec || rec.dying) return;
    rec.hurtT = 0.4;   // instant feedback; authoritative hp lands ~100ms later
    this.game.net.sendMobHit(eid, dmg, dir ? dir.x : 0, dir ? dir.z : 0);
  }

  /** host-side bookkeeping for kills made by my own hand */
  noteLocalHit(mob) {
    if (this.isHost) this._lastAttacker.set(mob.eid, this.game.net.myName);
  }

  /** Mob.startDeath callback (via game.onMobDeath): broadcast + drop routing */
  onMobDeath(mob) {
    const killer = this._lastAttacker.get(mob.eid) || '';
    this._lastAttacker.delete(mob.eid);
    if (killer && killer !== this.game.net.myName) mob.skipDrops = true; // killer's client drops loot
    this.game.net.sendMobDie(mob.eid, killer);
  }

  // ---------- internals ----------

  _spawnRemote(eid, typeName, x, y, z, yaw, hp) {
    const model = buildMobModel(typeName);
    model.group.position.set(x, y, z);
    model.group.userData.noShadow = true;
    this.game.graphics.scene.add(model.group);
    const rec = {
      eid, typeName, type: MOB_TYPES[typeName], isRemote: true,
      group: model.group, P: model.P, mat: model.mat,
      pos: new THREE.Vector3(x, y, z),
      cur: { x, y, z, yaw },
      tgt: { x, y, z, yaw },
      hp: hp > 0 ? hp : 1,
      hurtT: 0, dying: false, deathT: 0, dead: false,
      speed: 0, walkPhase: 0, lightT: 0, lightMul: 1,
    };
    rec.group.rotation.y = yaw + Math.PI;
    this.remote.set(eid, rec);
    return rec;
  }

  _removeRemote(rec) {
    this.remote.delete(rec.eid);
    this.game.graphics.scene.remove(rec.group);
    rec.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    rec.dead = true;
  }

  _mirrorUpdate(dt) {
    const k = Math.min(1, dt * 12);
    const w = this.game.world;
    for (const rec of [...this.remote.values()]) {
      if (rec.dead) continue;
      if (rec.dying) {
        rec.deathT += dt;
        rec.group.rotation.z = Math.min(1, rec.deathT / 0.3) * (Math.PI / 2);
        rec.mat.color.setRGB(0.8, 0.3, 0.3);
        if (rec.deathT > 0.55) this._removeRemote(rec);
        continue;
      }
      const c = rec.cur, t = rec.tgt;
      const dx = t.x - c.x, dz = t.z - c.z;
      const dist = Math.hypot(dx, dz);
      rec.speed += (Math.min(dist / Math.max(dt, 1e-4), 6) - rec.speed) * Math.min(1, dt * 8);
      c.x += dx * k; c.y += (t.y - c.y) * k; c.z += dz * k;
      let dyaw = t.yaw - c.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      c.yaw += dyaw * Math.min(1, dt * 10);
      rec.pos.set(c.x, c.y, c.z);
      rec.group.position.copy(rec.pos);
      rec.group.rotation.y = c.yaw + Math.PI;

      // lighting + hurt flash (same look as local mobs)
      rec.lightT -= dt;
      if (rec.lightT <= 0 && w) {
        rec.lightT = 0.22;
        const sky = w.getSky(Math.floor(c.x), Math.floor(c.y + 0.8), Math.floor(c.z)) / 15;
        const blk = w.getBlk(Math.floor(c.x), Math.floor(c.y + 0.8), Math.floor(c.z)) / 15;
        const L = Math.max(sky * globalUniforms.uSkyLight.value, blk * 0.95);
        rec.lightMul = 0.16 + 0.9 * Math.pow(L, 1.1);
      }
      rec.hurtT = Math.max(0, rec.hurtT - dt);
      const flash = rec.hurtT > 0 ? rec.hurtT / 0.4 : 0;
      const li = rec.lightMul;
      rec.mat.color.setRGB(li * (1 + flash * 1.4), li * (1 - flash * 0.65), li * (1 - flash * 0.75));

      // walk cycle
      rec.walkPhase += rec.speed * dt * 2.6;
      const amp = Math.min(1, rec.speed / 4.3) * 0.7;
      const sw = Math.sin(rec.walkPhase) * amp;
      const legs = rec.P.legs || (rec.P.legL ? [rec.P.legL, rec.P.legR] : []);
      legs.forEach((l, i) => { l.rotation.x = sw * (i % 2 ? -1 : 1); });
    }
  }

  /** promoted to host: the last mirrored snapshot becomes live simulated mobs */
  _adoptSnapshot() {
    const ents = this.game.entities;
    for (const rec of [...this.remote.values()]) {
      if (rec.dead || rec.dying) continue;
      reserveMobEid(rec.eid);
      let mob = ents.mobs.find((m) => m.eid === rec.eid);
      if (!mob) {
        mob = new Mob(this.game, rec.typeName, rec.cur.x, rec.cur.y, rec.cur.z, rec.eid);
        ents.mobs.push(mob);
      }
      mob.pos.copy(rec.pos);
      mob.hp = Math.max(1, rec.hp);
      mob.moveYaw = rec.cur.yaw;
    }
    this.clearRemote();
    ents.spawnEnabled = true;
    this._sendT = 0;
  }

  /** demoted (joined someone else's world / lost an election): mobs are theirs now */
  _demote() {
    const ents = this.game.entities;
    for (const m of ents.mobs) if (!m.dead) m.remove();
    ents.mobs = ents.mobs.filter((m) => m.dead);
    this.clearRemote();
    this._lastAttacker.clear();
  }
}
