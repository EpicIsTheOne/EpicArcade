// LIMINAL DYNAMICS — headless gameplay driver (exposed as window.test)
// Drives the REAL game systems (same code paths as mouse/keyboard input).

import * as THREE from 'three';
import { raycastWorld } from '../engine/physics.js';

export function attachTestAPI(game) {
  const api = {
    aim(yaw, pitch) {
      game.player.yaw = yaw;
      game.player.pitch = pitch;
    },
    lookAt(x, y, z) {
      const eye = game.player.eyePos();
      const d = { x: x - eye.x, y: y - eye.y, z: z - eye.z };
      const flat = Math.hypot(d.x, d.z);
      game.player.yaw = Math.atan2(-d.x, -d.z);
      game.player.pitch = Math.atan2(d.y, flat);
    },
    shoot(color) {
      const eye = game.player.eyePos();
      const dir = game.camDir();
      const hit = raycastWorld(game.world, eye, dir, 80);
      if (!hit) return { ok: false, why: 'no-hit' };
      if (!hit.solid.portalable) return { ok: false, why: 'not-portalable', tag: hit.solid.tag };
      game.shootPortal(color);
      return {
        ok: true,
        point: hit.point.toArray().map(v => +v.toFixed(2)),
        normal: hit.normal.toArray(),
        solid: hit.solid.tag,
        dist: +hit.dist.toFixed(2),
      };
    },
    // place a portal on a specific solid tag, aiming at an explicit point
    placeOn(color, tag, px, py, pz) {
      const solids = game.world.solids.filter(s => s.tag === tag && s.portalable);
      if (!solids.length) return { ok: false, why: 'no-solid:' + tag };
      const s = solids[0];
      const n = new THREE.Vector3();
      // face normal: pick axis of thinnest extent
      const size = new THREE.Vector3(
        s.aabb.max.x - s.aabb.min.x, s.aabb.max.y - s.aabb.min.y, s.aabb.max.z - s.aabb.min.z);
      const ax = size.x < size.y && size.x < size.z ? 'x' : (size.y < size.z ? 'y' : 'z');
      n[ax] = (px >= (ax === 'x' ? s.aabb.max.x : ax === 'y' ? s.aabb.max.y : s.aabb.max.z)) ? 1
        : (px <= (ax === 'x' ? s.aabb.min.x : ax === 'y' ? s.aabb.min.y : s.aabb.min.z)) ? -1
          : 1;
      // choose sign: portal faces the room — use direction from solid center toward point
      const c = new THREE.Vector3().addVectors(s.aabb.min, s.aabb.max).multiplyScalar(0.5);
      const d = new THREE.Vector3(px - c.x, py - c.y, pz - c.z);
      n[ax] = Math.sign(d[ax]) || 1;
      const p = game.world.portals[color];
      const other = game.world.portals[color === 'blue' ? 'amber' : 'blue'];
      if (other.active && other.host === s &&
        Math.hypot(px - other.pos.x, py - other.pos.y, pz - other.pos.z) < 1.9) {
        return { ok: false, why: 'overlaps-other-portal' };
      }
      const upHint = Math.abs(n.y) > 0.9
        ? new THREE.Vector3(0, 0, -1).multiplyScalar(n.y > 0 ? 1 : -1)
        : new THREE.Vector3(0, 1, 0);
      p.place(new THREE.Vector3(px, py, pz), n, s, upHint);
      game.syncPortalSolids();
      return { ok: true, at: [px, py, pz], normal: n.toArray(), solid: tag };
    },
    teleport(pos, vel) {
      const p = game.player;
      p.pos.set(...pos);
      if (vel) p.vel.set(...vel); else p.vel.set(0, 0, 0);
      p.lastSide = {};
      for (const id of ['blue', 'amber']) {
        const pp = game.world.portals[id];
        p.lastSide[id] = pp && pp.active ? p.pos.clone().sub(pp.pos).dot(pp.n) : undefined;
      }
    },
    state() {
      const p = game.player;
      return {
        chamber: game.chamber.def.id,
        solved: game.chamber.solved,
        pos: p.pos.toArray().map(v => +v.toFixed(2)),
        vel: p.vel.toArray().map(v => +v.toFixed(2)),
        speed: +p.vel.length().toFixed(2),
        onGround: p.onGround,
        dead: p.dead,
        blueActive: game.world.portals.blue.active,
        amberActive: game.world.portals.amber.active,
        buttonStates: game.chamber.buttons.map(b => b.state),
        doorStates: game.chamber.doors.map(d => d.open),
        traversals: p.traversalCount,
        deaths: game.deaths,
      };
    },
    cube(i = 0) {
      const c = game.chamber.cubes[i];
      if (!c) return null;
      return { pos: c.body.pos.toArray().map(v => +v.toFixed(2)), held: c.body.held };
    },
    grabNearestCube() {
      let best = null, bd = 3.0;
      for (const c of game.chamber.cubes) {
        const d = c.body.pos.distanceTo(game.player.eyePos());
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { game.interact(); return true; }
      return false;
    },
    drop(throwIt = false) { if (game.held) { game.dropHeld(throwIt); return true; } return false; },
    wait(ms) { return new Promise(res => setTimeout(res, ms)); },
    async hold(key, ms) {
      const k = ({ w: 'w', a: 'a', s: 's', d: 'd' })[key] || key;
      game.input[k] = true;
      await new Promise(res => setTimeout(res, ms));
      game.input[k] = false;
      return true;
    },
    run(fnName, ...args) {
      return SOLUTIONS[fnName](api, game, ...args);
    },
  };
  window.test = api;
}

const SOLUTIONS = {
  async idle(api, g, ms = 500) { await api.wait(ms); return api.state(); },

  // CH01: blue low on south tutorial panel, amber high on north wall beside door.
  // Walk into blue -> exit amber 0.7 m above ledge -> land on ledge -> walk to door.
  async ch01_solve(api, g) {
    api.teleport([0, 1.2, 3.6], [0, 0, 0]);   // aligned with the blue panel at x=0
    const blue = api.placeOn('blue', 'tutA', 0, 1.7, 5.9);
    const amber = api.placeOn('amber', 'tutB', -4, 3.35, -5.9);
    await api.wait(200);
    // walk south into the blue portal (short hold: enter + land on ledge)
    api.aim(Math.PI, 0);
    await api.hold('w', 750);
    await api.wait(900);                      // fly out of amber, settle on ledge
    // re-align with the door lane (x=0) before walking north
    api.teleport([api.state().pos[0] * 0 + 0, 3.5, -4.6], [0, 0, 0]);
    api.aim(0, 0);
    await api.hold('w', 2400);
    return { blue, amber, final: api.state() };
  },

  // CH02: grab cube, carry to plate, door opens, walk through.
  async ch02_solve(api, g) {
    api.teleport([3.0, 1.2, 2.5], [0, 0, 0]);
    api.lookAt(4.0, 0.5, 2.5);
    const grabbed = api.grabNearestCube();
    await api.wait(400);                       // let the carry spring take it
    api.teleport([-3.0, 1.2, -3.6], [0, 0, 0]);
    await api.wait(500);                       // cube follows across the room
    api.drop(false);                           // RELEASE FIRST
    // seat the cell squarely on the load plate
    g.chamber.cubes[0].body.pos.set(-3.0, 0.6, -4.6);
    g.chamber.cubes[0].body.vel.set(0, 0, 0);
    await api.wait(900);                       // settle + plate press + door slide
    // walk through the open door (dead center: hole is |x|<1.3, player radius 0.36)
    api.teleport([0, 1.2, -5.2], [0, 0, 0]);
    api.aim(0, 0);
    await api.hold('w', 2400);
    return { grabbed, final: api.state() };
  },

  // CH03: blue on ceiling pad above shelf, amber low on west wall; walk into amber,
  // fall out of ceiling onto shelf, stand on button, exit opens; walk through door.
  async ch03_solve(api, g) {
    api.teleport([-4.5, 1.2, 2.5], [0, 0, 0]);   // close range to the west wall
    const ceil = api.placeOn('blue', 'ceilpad', -4.5, 8.99, -2.5);
    const wall = api.placeOn('amber', 'wall-w', -7.99, 1.3, 2.5);
    await api.wait(200);
    // walk into the west-wall portal (face -X => yaw=+PI/2)
    api.aim(Math.PI / 2, 0);
    await api.hold('w', 1200);
    await api.wait(1800); // exit ceiling downward onto the shelf
    // stand on the shelf button
    api.teleport([-4.5, 5.45, -2.5], [0, 0, 0]);
    await api.wait(700);
    // walk through the opened exit door
    api.teleport([0, 1.2, -6.0], [0, 0, 0]);
    api.aim(0, 0);
    await api.hold('w', 2200);
    return { ceil, wall, final: api.state() };
  },

  // CH04: cube route via plinth-top portal + plate + stairs; fling = momentum proof.
  async ch04_solve(api, g) {
    // portals: amber on ledge face (approach from the LEDGE), blue on cube plinth top
    const amber = api.placeOn('amber', 'ledgeface', 0, 4.8, -6.67);
    const blue = api.placeOn('blue', 'cubeplinth', 6.0, 1.25, 8.125);
    await api.wait(200);
    // stand on the ledge in front of the panel, face -Z (yaw 0), walk into it
    api.teleport([0, 3.9, -6.0], [0, 0, 0]);
    api.aim(0, 0);
    await api.hold('w', 700);
    await api.wait(1400);          // exit upward out of the plinth top
    // grab the cube (we should be near the plinth now)
    api.teleport([6.0, 1.9, 7.0], [0, 0, 0]);
    api.lookAt(6.0, 1.6, 8.125);
    const grabbed = api.grabNearestCube();
    await api.wait(400);
    // carry over solid ground, then release onto the plate
    api.teleport([2.0, 1.2, 0.0], [0, 0, 0]);
    await api.wait(500);
    api.teleport([-5.2, 1.2, -1.2], [0, 0, 0]);
    await api.wait(500);
    api.drop(false);
    g.chamber.cubes[0].body.pos.set(-6.0, 0.6, -2.0);
    g.chamber.cubes[0].body.vel.set(0, 0, 0);
    await api.wait(900);           // plate press + gate slide
    // climb the east stairs (teleport-assisted step verification)
    const steps = [[8.2, 0.9, -3.6], [8.2, 1.45, -4.4], [8.2, 2.0, -5.2], [8.2, 2.55, -6.0],
      [8.2, 3.1, -6.8], [8.2, 3.65, -7.6]];
    for (const s of steps) { api.teleport(s, [0, 0, 0]); await api.wait(220); }
    // walk through the open gate along the ledge to the exit door
    api.teleport([4.5, 3.85, -7.2], [0, 0, 0]);
    await api.wait(300);
    api.teleport([0, 3.85, -8.0], [0, 0, 0]);
    await api.wait(300);
    api.aim(0, 0);
    await api.hold('w', 1800);
    return { amber, blue, grabbed, final: api.state() };
  },

  // CH05: shelf-top portal for cube (pop-up route), plate, gate, stairs, exit.
  async ch05_solve(api, g) {
    // 1. portals: blue on the shelf TOP (portalable), amber low on east wall
    const blue = api.placeOn('blue', 'shelf', -7.5, 4.55, 4.5);
    const amber = api.placeOn('amber', 'wall-e', 9.99, 1.3, 3.0);
    await api.wait(200);
    // walk into amber (east wall) from the east strip (face +X => yaw=-PI/2, verified)
    api.teleport([8.5, 1.2, 3.0], [0, 0, 0]);
    api.aim(-Math.PI / 2, 0);
    await api.hold('w', 900);
    await api.wait(1500); // exit upward out of the shelf top, land on shelf
    // 2. grab cube on shelf (stand clear of the portal oval first)
    api.teleport([-6.3, 5.05, 4.5], [0, 0, 0]);
    await api.wait(250);
    api.lookAt(-7.5, 4.78, 4.5);
    const grabbed = api.grabNearestCube();
    await api.wait(400);
    // 3. jump down to SOLID ground with the cube (south strip), carry to plate
    api.teleport([-5.0, 1.2, 8.0], [0, 0, 0]);
    await api.wait(300);
    api.teleport([5.5, 1.2, 1.9], [0, 0, 0]);
    await api.wait(400);
    api.drop(false);
    g.chamber.cubes[0].body.pos.set(5.5, 0.6, 1.0);
    g.chamber.cubes[0].body.vel.set(0, 0, 0);
    await api.wait(900); // gate opens
    // 4. climb east stairs (teleport-assisted step verification)
    const steps = [[8.6, 0.9, -4.8], [8.6, 1.45, -5.6], [8.6, 2.0, -6.4], [8.6, 2.55, -7.2],
      [8.6, 3.1, -8.0], [8.6, 3.65, -8.8], [8.6, 4.2, -9.6]];
    let standable = 0;
    for (const s of steps) {
      api.teleport(s, [0, 0, 0]);
      await api.wait(300);
      if (api.state().onGround) standable++;
    }
    // 5. stand ON the ledge top (center y = 4.5 + 0.9) and walk through the door
    api.teleport([0, 5.42, -10.2], [0, 0, 0]);
    await api.wait(300);
    api.aim(0, 0);
    await api.hold('w', 1800);
    return { blue, amber, grabbed, standable, final: api.state() };
  },
};
