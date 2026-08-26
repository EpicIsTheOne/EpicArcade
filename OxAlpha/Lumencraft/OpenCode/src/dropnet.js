// Shared loot: host-authoritative item drops.
// The host simulates every ground item (physics, merge, despawn) and streams
// snapshots next to the mob stream; mirrors render remote drops, claim
// pickups ({op:'take'} → first-come grant via {op:'taken'}), inject their own
// drops (mined loot, thrown items, death scatter) into the host's pool.
import * as THREE from 'three';
import { createDropMesh } from './entities.js';

const SYNC_CAP = 64;    // must match server.mjs MAX_DROPS_SYNC
const SNAP_T = 0.1;     // 10Hz, piggybacked cadence with mobs
const TAKE_RANGE = 2.3; // how close a mirror must be to claim a drop
const TAKE_GRACE = 0.9; // seconds before a freshly seen drop can be claimed (throw safety)
const TAKE_TIMEOUT = 1.4; // optimistic hide reverts if the host never answers

export class DropNet {
  constructor(game) {
    this.game = game;
    this.remote = new Map();        // did -> rec
    this._seq = 0;
    this._sendT = 0;
    this._mirroring = false;
    this._pendingTake = new Map();  // did -> {meta:{id,count}, t}
    /** true while connected and someone else holds loot authority */
    this.mirroring = false;
  }

  get isHost() {
    const n = this.game.net;
    return !!(n && n.connected && n.hostId != null && n.hostId === n.you);
  }

  remoteCount() { return this.remote.size; }
  pendingTakes() { return [...this._pendingTake.keys()]; }

  /** peer-scoped drop id — collision-free across clients by construction */
  _nextDid() {
    return 'p' + this.game.net.you + ':' + (++this._seq);
  }

  /** recs are shape-compatible enough for QA introspection */
  pickList() { return [...this.remote.values()]; }

  // ---------- inbound ops ----------

  onDrops(ds) {
    if (!Array.isArray(ds) || !this.mirroring || this.isHost) return;
    const seen = new Set();
    for (const e of ds) {
      if (!Array.isArray(e) || e.length !== 6) continue;
      const [did, id, count, x, y, z] = e;
      if (typeof did !== 'string') continue;
      seen.add(did);
      let rec = this.remote.get(did);
      if (!rec) {
        rec = this._makeRec(did, id, count, x, y, z);
        this.remote.set(did, rec);
        continue;
      }
      rec.tgt.set(x, y, z);
      rec.count = count;
      rec.pendingSelf = false;
    }
    for (const [did, rec] of [...this.remote]) {
      if (!seen.has(did) && !this._pendingTake.has(did)) this._remove(rec);
    }
  }

  /** the host granted someone a pickup */
  onTaken(m) {
    const pend = this._pendingTake.get(m.did);
    this._pendingTake.delete(m.did);
    const rec = this.remote.get(m.did);
    const mine = this.game.net && m.by === this.game.net.myName;
    if (mine && pend) {
      const left = this.game.giveItem(pend.meta.id, pend.meta.count);
      if (this.game.audio) this.game.audio.pop();
      if (left > 0) this.injectLocal(this.game.player.pos.x, this.game.player.pos.y + 0.5, this.game.player.pos.z, pend.meta.id, left);
    }
    if (rec) this._remove(rec);
  }

  /** host side: a mirror injected a drop into the pool — simulate it for real */
  onInject(m) {
    if (!this.isHost) return;
    if (this.game.entities.drops.some((d) => d.did === m.did && !d.dead)) return;
    const d = this.game.entities.spawnDrop(m.x, m.y, m.z, m.id, m.count);
    if (!d) return;
    d.did = m.did;
    if (m.vx || m.vy || m.vz) {
      d.vel.set(m.vx || 0, m.vy || 0, m.vz || 0);
      d.age = Math.min(d.age, -0.3);   // brief grace so the tosser isn't robbed
    }
  }

  /** host side: arbitrate a pickup claim — first valid claim within range wins */
  onTake(m) {
    if (!this.isHost) return;
    const d = this.game.entities.drops.find((x) => x.did === m.did && !x.dead);
    if (!d) return;   // stale claim → claimant's optimistic hide times out and reverts
    const dx = m.tx - d.pos.x, dy = m.ty - d.pos.y, dz = m.tz - d.pos.z;
    if (dx * dx + dy * dy + dz * dz > 3.2 * 3.2) return;   // too far from the loot — denied by silence
    d.destroy();      // gone from the world; next snapshot tells everyone else
    this.game.net.sendTaken(m.did, m.by);
  }

  /** spawn funnel on mirrors: register locally as pending-self + tell the host */
  injectLocal(x, y, z, id, count, vel) {
    const n = this.game.net;
    if (!n.connected || count <= 0) return null;
    const did = this._nextDid();
    const rec = this._makeRec(did, id, count, x, y, z);
    rec.pendingSelf = true;
    rec.age = -0.6;               // don't instantly re-grab your own toss/mine pop
    if (vel) rec.vel.set(vel.vx || 0, vel.vy || 0, vel.vz || 0);
    this.remote.set(did, rec);
    n.sendInjectDrop({ did, id, count, x, y, z, vx: vel?.vx, vy: vel?.vy, vz: vel?.vz });
    return { did };
  }

  /** Net told us who the host is now (welcome / host op / rejoin) */
  onHostChanged(hostId) {
    const n = this.game.net;
    if (n && n.connected && hostId != null && hostId === n.you) this._adoptSnapshot();
  }

  handleDisconnect() {
    this.clearRemote();
    this._pendingTake.clear();
    this.mirroring = false;
  }

  clearRemote() {
    for (const rec of [...this.remote.values()]) this._remove(rec);
    this.remote.clear();
  }

  dispose() { this.clearRemote(); }

  // ---------- per-frame ----------

  update(dt) {
    const n = this.game.net;
    const shouldBeMirroring = !!(n && n.connected && !this.isHost);
    this.mirroring = shouldBeMirroring;

    if (this.isHost) {
      this._sendT -= dt;
      if (this._sendT <= 0) { this._sendT = SNAP_T; this._publish(); }
      this._expirePending();
    } else if (this.remote.size) {
      this._mirrorUpdate(dt);
      this._expirePending();
    }
  }

  // ---------- internals ----------

  _makeRec(did, id, count, x, y, z) {
    const mesh = createDropMesh(this.game, id);
    mesh.position.set(x, y, z);
    mesh.userData.noShadow = true;
    this.game.graphics.scene.add(mesh);
    return {
      did, id, count,
      mesh,
      pos: new THREE.Vector3(x, y, z),
      tgt: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      age: 0,
      pendingSelf: false,
      dead: false,
    };
  }

  _remove(rec) {
    this.remote.delete(rec.did);
    this.game.graphics.scene.remove(rec.mesh);
    rec.dead = true;
  }

  _publish() {
    const n = this.game.net;
    if (!n.remotes || n.remotes.count() === 0) return;
    const p = this.game.player;
    const drops = this.game.entities.drops;
    for (const d of drops) if (!d.dead && d.did == null) d.did = this._nextDid();
    const list = drops
      .filter((d) => !d.dead)
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos))
      .slice(0, SYNC_CAP)
      .map((d) => [d.did, d.id, d.count,
        Math.round(d.pos.x * 100) / 100, Math.round(d.pos.y * 100) / 100, Math.round(d.pos.z * 100) / 100]);
    n.sendDrops(list);
  }

  _mirrorUpdate(dt) {
    const p = this.game.player;
    for (const rec of [...this.remote.values()]) {
      if (rec.dead) continue;
      rec.age += dt;

      if (rec.pendingSelf && rec.vel.lengthSq() > 0.01) {
        // rough local toss arc until the host's authoritative positions arrive
        rec.vel.y -= 14 * dt;
        rec.tgt.addScaledVector(rec.vel, dt);
        rec.vel.multiplyScalar(Math.pow(0.35, dt));
      }
      const k = Math.min(1, dt * 12);
      rec.pos.lerp(rec.tgt, k);
      rec.mesh.position.set(rec.pos.x, rec.pos.y + 0.22 + Math.sin(rec.age * 2.4) * 0.05, rec.pos.z);
      rec.mesh.rotation.y += dt * 1.8;

      // pickup claim: close enough, old enough, not already claimed
      if (!rec.pendingSelf && rec.age > TAKE_GRACE &&
          Math.abs(rec.pos.y - (p.pos.y + 0.9)) < 2.4 &&
          rec.pos.distanceToSquared(p.pos) < TAKE_RANGE * TAKE_RANGE) {
        this._claim(rec);
      }
    }
  }

  _claim(rec) {
    if (this._pendingTake.has(rec.did)) return;
    const p = this.game.player;
    rec.mesh.visible = false;   // optimistic: restore on timeout/deny
    this._pendingTake.set(rec.did, { meta: { id: rec.id, count: rec.count }, t: rec.age });
    this.game.net.sendTake(rec.did, p.pos.x, p.pos.y + 0.9, p.pos.z);
  }

  _expirePending() {
    for (const [did, pend] of [...this._pendingTake]) {
      const rec = this.remote.get(did);
      if (!rec) { this._pendingTake.delete(did); continue; }
      if (rec.age - pend.t > TAKE_TIMEOUT) {
        this._pendingTake.delete(did);
        rec.mesh.visible = true;   // host didn't answer → someone else got it or it moved
      }
    }
  }

  /** promoted to host: the last mirrored snapshot becomes real simulated drops */
  _adoptSnapshot() {
    const ents = this.game.entities;
    for (const rec of [...this.remote.values()]) {
      if (rec.dead) continue;
      const d = ents.spawnDrop(rec.pos.x, rec.pos.y, rec.pos.z, rec.id, rec.count);
      if (d) d.did = rec.did;
    }
    this.clearRemote();
    this._pendingTake.clear();
    this._sendT = 0;
  }
}
