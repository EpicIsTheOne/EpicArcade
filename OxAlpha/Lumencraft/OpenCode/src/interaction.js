// Interaction: voxel raycast, mining progress with tools, placing, item use.
import { B, BLOCKS } from './blocks.js';
import { ITEMS, itemName, isBlockItem } from './items.js';
import { uvRect } from './atlas.js';

const REACH = 5.2;

export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist = REACH, hitLiquid = false) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = Math.abs(dy) < 1e-9 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : Math.abs(1 / dz);
  let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX;
  let tMaxY = Math.abs(dy) < 1e-9 ? Infinity : (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY;
  let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ;
  let face = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    const b = world.getBlockRaw(x, y, z);
    const bd = BLOCKS[b];
    if (b !== B.AIR && bd && bd.render !== 'air' && (hitLiquid || !bd.liquid) && b !== undefined) {
      return { x, y, z, id: b, face, dist: Math.min(tMaxX, tMaxY, tMaxZ) };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) break;
      x += stepX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) break;
      y += stepY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      if (tMaxZ > maxDist) break;
      z += stepZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
  }
  return null;
}

export class Interaction {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.player = game.player;

    this.mining = false;       // currently holding LMB on a block
    this.mineTarget = null;    // {x,y,z,id}
    this.mineProgress = 0;     // seconds accumulated
    this.mineNeeded = 1;
    this.attackCooldown = 0;
    this.placeCooldown = 0;
    this.useCooldown = 0;

    this.onCrack = null;       // (stage 0..9 | null)
    this.onBreakFx = null;     // (x,y,z,id)
    this.onSwing = null;
    this.onToolUsed = null;    // (slotIdx)
    this.onToast = null;
  }

  heldStack() { return this.game.ui.hotbarSelected(); }

  update(dt) {
    this.attackCooldown -= dt;
    this.placeCooldown -= dt;
    this.useCooldown -= dt;

    const inp = this.game.input;
    const eye = [this.player.pos.x, this.player.eyeY, this.player.pos.z];
    const f = this.player.forwardVec();
    const pitchDir = new (f.constructor)(f.x * Math.cos(this.player.pitch), Math.sin(this.player.pitch), f.z * Math.cos(this.player.pitch));
    const hit = raycastVoxel(this.world, eye[0], eye[1], eye[2], pitchDir.x, pitchDir.y, pitchDir.z, REACH);
    this.lastHit = hit;

    // highlight target
    this.game.setHighlight(hit);

    // ---- mining / attacking ----
    if (inp.buttons.has(0) && !this.game.uiOpen()) {
      // entity first?
      const mob = this.game.pickMob(eye, pitchDir, 3.4);
      if (mob) {
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 0.45;
          this.game.attackMob(mob, pitchDir);
          if (this.onSwing) this.onSwing(true);
        }
        this._stopMining();
      } else if (hit) {
        this._mineTick(hit, dt);
      } else this._stopMining();
    } else this._stopMining();

    // ---- right click use/place ----
    if (inp.buttons.has(2) && this.placeCooldown <= 0 && !this.game.uiOpen()) {
      this.placeCooldown = 0.22;
      this.useOrPlace(hit, eye, pitchDir);
    }
  }

  _mineTick(hit, dt) {
    const bd = BLOCKS[hit.id];
    if (bd.hardness < 0) { this._stopMining(); return; }

    // retarget reset
    if (!this.mining || !this.mineTarget || this.mineTarget.x !== hit.x || this.mineTarget.y !== hit.y || this.mineTarget.z !== hit.z) {
      this.mining = true;
      this.mineTarget = { ...hit };
      this.mineProgress = 0;
      this.mineNeeded = this.breakTime(bd, hit.id);
      if (this.onSwing) this.onSwing(false);
    }

    this.mineProgress += dt * this.toolSpeedMult(bd, hit.id);
    if (this.onSwing && Math.random() < dt * 6) this.onSwing(false);
    const stage = Math.min(9, Math.floor((this.mineProgress / this.mineNeeded) * 10));
    if (this.onCrack) this.onCrack(this.mineTarget, stage);

    if (this.mineProgress >= this.mineNeeded) {
      this.breakBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z);
      this.addExhaustionFor(bd);
      this._stopMining();
    }
  }

  breakTime(bd, id) {
    let t = bd.hardness;
    if (bd.tool && bd.requireTool) t *= 1.65;
    else if (bd.tool) t *= 1.2;
    return Math.max(0.05, t);
  }

  toolSpeedMult(bd, id) {
    const held = this.heldStack();
    let speed = 1;
    if (held && typeof held.id === 'string' && ITEMS[held.id]?.toolClass) {
      const it = ITEMS[held.id];
      if (it.toolClass === bd.tool) speed = it.speed;
      else if (it.toolClass === 'sword') speed = 1.15;
    }
    // can it yield drops at all?
    return speed;
  }

  canHarvest(bd) {
    if (!bd.requireTool) return true;
    const held = this.heldStack();
    if (!held || typeof held.id !== 'string') return false;
    const it = ITEMS[held.id];
    if (!it || !it.toolClass) return false;
    if (bd.tool && it.toolClass !== bd.tool) return false;
    return (it.tier ?? 0) >= (bd.tier ?? 0);
  }

  addExhaustionFor(bd) { this.player.addExhaustion(0.03); }

  _stopMining() {
    if (this.mining) {
      this.mining = false;
      this.mineTarget = null;
      this.mineProgress = 0;
      if (this.onCrack) this.onCrack(null);
    }
  }

  breakBlock(x, y, z) {
    const id = this.world.getBlockRaw(x, y, z);
    if (id === B.AIR) return;
    const bd = BLOCKS[id];

    // container cleanup
    this.world.containers.delete(x + ',' + y + ',' + z);

    this.world.setBlock(x, y, z, B.AIR);
    if (this.game.net) this.game.net.sendBlock(x, y, z, B.AIR);

    // drops
    if (this.canHarvest(bd)) {
      let dropId = id, count = 1;
      if (Array.isArray(bd.drop)) {
        if (bd.drop.length === 0) dropId = null;
        else { dropId = bd.drop[0][0]; count = bd.drop[0][1]; }
        // chance extras like seeds from wheat handled via dropFn
      } else if (bd.dropFn === 'seeds') {
        dropId = Math.random() < 0.55 ? 'seeds' : null;
        count = 1;
      } else if (bd.dropFn === 'oakLeaves') {
        const r = Math.random();
        dropId = r < 0.06 ? 'apple' : r < 0.28 ? B.SAPLING : null;
      } else if (id === B.GRAVEL) {
        dropId = Math.random() < 0.12 ? 'coal' : B.GRAVEL;
      }
      // crop bonus
      if (bd.cropStage === 3) count = 1;
      if (dropId != null && this.game.spawnDrop) this.game.spawnDrop(x + 0.5, y + 0.35, z + 0.5, dropId, count);
      // extra seed drop from wheat
      if (bd.cropStage === 3 && Math.random() < 0.7 && this.game.spawnDrop) {
        this.game.spawnDrop(x + 0.35, y + 0.35, z + 0.62, 'seeds', 1);
      }
    }

    // durability
    const held = this.heldStack();
    if (held && typeof held.id === 'string' && ITEMS[held.id]?.toolClass && bd.hardness >= 0.3) {
      held.dur = (held.dur ?? ITEMS[held.id].durability) - 1;
      if (this.onToolUsed) this.onToolUsed();
      if (held.dur <= 0) {
        this.game.ui.replaceHotbarSlot(null);
        if (this.onToast) this.onToast('Your tool broke!');
      }
    }

    if (this.onBreakFx) this.onBreakFx(x, y, z, id);
  }

  useOrPlace(hit, eye, dir) {
    // interactable block targeted?
    if (hit) {
      const bd = BLOCKS[hit.id];
      if (bd.interact) {
        if (this.interactBlock(hit, bd)) return;
      }
    }

    const held = this.heldStack();
    if (!held) return;

    // food
    if (typeof held.id === 'string' && ITEMS[held.id]?.food) {
      if (this.useCooldown <= 0 && this.player.hunger < 19.5) {
        this.useCooldown = 1.1;
        const f = ITEMS[held.id].food;
        this.player.eat(f.hunger);
        held.count--;
        if (held.count <= 0) this.game.ui.replaceHotbarSlot(null);
        if (this.game.audio) this.game.audio.eat();
        if (this.onSwing) this.onSwing(true);
      }
      return;
    }

    if (!isBlockItem(held.id) || !hit) return;

    // hoe → farmland
    if (typeof held.id === 'string' && ITEMS[held.id]?.toolClass === 'hoe') {
      const top = this.world.getBlockRaw(hit.x, hit.y, hit.z);
      if ((top === B.GRASS || top === B.DIRT) && hit.face[1] === 1) {
        this.world.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        if (this.game.net) this.game.net.sendBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        if (this.game.audio) this.game.audio.dig(B.FARMLAND);
        held.dur = (held.dur ?? ITEMS[held.id].durability) - 1;
        if (held.dur <= 0) this.game.ui.replaceHotbarSlot(null);
        if (this.onSwing) this.onSwing(false);
      }
      return;
    }

    // place block
    const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];
    if (py < 0 || py >= 128) return;
    const cur = this.world.getBlockRaw(px, py, pz);
    if (!(cur === B.AIR || BLOCKS[cur].replaceable)) return;

    const bid = held.id;
    const nbd = BLOCKS[bid];
    // don't place inside player AABB
    if (nbd.solid) {
      const p = this.player.pos;
      if (px + 1 > p.x - 0.32 && px < p.x + 0.32 &&
          pz + 1 > p.z - 0.32 && pz < p.z + 0.32 &&
          py + 1 > p.y && py < p.y + 1.85) return;
      // or mobs
      for (const m of this.game.entities.mobs) {
        if (px + 1 > m.pos.x - m.w / 2 && px < m.pos.x + m.w / 2 &&
            pz + 1 > m.pos.z - m.w / 2 && pz < m.pos.z + m.w / 2 &&
            py + 1 > m.pos.y && py < m.pos.y + m.h) return;
      }
    }
    // support requirements
    if (nbd.attach === 'ground' && !BLOCKS[this.world.getBlockRaw(px, py - 1, pz)].solid) return;
    if (bid === B.WHEAT0 && this.world.getBlockRaw(px, py - 1, pz) !== B.FARMLAND) return;
    if (bid === B.SAPLING) {
      const below = this.world.getBlockRaw(px, py - 1, pz);
      if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOW_GRASS) return;
    }
    // facing metadata for furnace/chest/pumpkin-ish blocks
    const opts = {};
    if (nbd.tileFront) {
      opts.face = hit.face[0] === 1 ? 0 : hit.face[0] === -1 ? 1 : hit.face[2] === 1 ? 2 : 3;
    }

    this.world.setBlock(px, py, pz, bid, opts);
    if (this.game.net) this.game.net.sendBlock(px, py, pz, bid, opts.face ?? 0);
    if (this.game.audio) this.game.audio.place(bid);
    if (this.onSwing) this.onSwing(false);
    held.count--;
    if (held.count <= 0) this.game.ui.replaceHotbarSlot(null);
  }

  interactBlock(hit, bd) {
    switch (bd.interact) {
      case 'crafting': this.game.ui.openCraftingTable(); return true;
      case 'chest':
        this.game.ui.openChest(hit.x, hit.y, hit.z);
        return true;
      case 'furnace':
        this.game.ui.openFurnace(hit.x, hit.y, hit.z);
        return true;
      case 'bed': this.game.trySleep(); return true;
      case 'lever': {
        this.world.toggleLever(hit.x, hit.y, hit.z);
        if (this.game.net) {
          const now = this.world.getBlockRaw(hit.x, hit.y, hit.z);
          if (now !== undefined) this.game.net.sendBlock(hit.x, hit.y, hit.z, now);
        }
        if (this.game.audio) this.game.audio.click();
        return true;
      }
    }
    return false;
  }
}
