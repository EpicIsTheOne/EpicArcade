import * as RAPIER_NS from '../lib/rapier.es.js';
import { G, CFG } from './state.js';

let RAPIER = null;

export async function initPhysics() {
  RAPIER = RAPIER_NS.default ?? RAPIER_NS;
  await RAPIER.init();
  G.RAPIER = RAPIER;
  createWorld();
}

export function createWorld() {
  if (G.world) {
    try { G.world.free(); } catch (e) {}
    G.world = null;
  }
  if (G.eventQueue) {
    try { G.eventQueue.free(); } catch (e) {}
    G.eventQueue = null;
  }
  const world = new RAPIER.World({ x: 0, y: CFG.gravity, z: 0 });
  world.timestep = 1 / 60;
  G.world = world;
  G.eventQueue = new RAPIER.EventQueue(true);
  G.byCollider.clear();
}

export function makeBody(o) {
  const world = G.world;
  const bd = o.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
  bd.setTranslation(o.pos.x, o.pos.y, o.pos.z);
  if (o.quat) bd.setRotation(o.quat);
  if (!o.fixed) {
    bd.setLinearDamping(o.damping ?? 0.04);
    bd.setAngularDamping((o.damping ?? 0.04) + 0.03);
    if (o.ccd) bd.setCcdEnabled(true);
  }
  const body = world.createRigidBody(bd);
  let cd;
  const s = o.size;
  if (o.shape === 'sphere') cd = RAPIER.ColliderDesc.ball(s.r);
  else if (o.shape === 'cyl') cd = RAPIER.ColliderDesc.cylinder(s.h / 2, s.r);
  else cd = RAPIER.ColliderDesc.cuboid(s.sx / 2, s.sy / 2, s.sz / 2);
  cd.setFriction(o.friction ?? 0.75);
  cd.setRestitution(o.restitution ?? 0.05);
  cd.setDensity(o.density ?? 1);
  cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
  const estMass = o.fixed ? 1e9 : body.mass();
  cd.setContactForceEventThreshold(Math.max(80, estMass * 45));
  const collider = world.createCollider(cd, body);
  return { body, collider };
}

export function stepWorld() {
  G.world.step(G.eventQueue);
}

export function collectImpacts() {
  const q = G.eventQueue;
  const impacts = [];
  const seen = new Set();
  q.drainContactForceEvents((ev) => {
    const h1 = ev.collider1();
    const h2 = ev.collider2();
    const key = h1 < h2 ? h1 + '_' + h2 : h2 + '_' + h1;
    if (seen.has(key)) return;
    seen.add(key);
    const a = G.byCollider.get(h1);
    const b = G.byCollider.get(h2);
    if (!a && !b) return;
    let mag = 0;
    try { mag = ev.maxForceMagnitude(); } catch (e) {}
    let pt = null;
    try { pt = ev.maxForcePoint(); } catch (e) {}
    const ma = a && a.body.isDynamic() ? a.body.mass() : 1e9;
    const mb = b && b.body.isDynamic() ? b.body.mass() : 1e9;
    const ref = Math.min(ma, mb);
    impacts.push({ a, b, mag, rel: mag / Math.max(60, ref * 30), pt });
  });
  q.drainCollisionEvents(() => {});
  return impacts;
}
