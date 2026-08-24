// Main: bootstrap, game loop, weather, menus, save wiring, debug API.
import * as THREE from 'three';
import { CHUNK, HEIGHT, SEA, DAY_LENGTH, idx } from './config.js';
import { loadSettings, saveSettings, applyPreset } from './config.js';
import { B, BLOCKS, isSolid, isLiquid } from './blocks.js';
import { ITEMS, itemName, isBlockItem } from './items.js';

import { World } from './world.js';
import { buildChunkGeometry } from './mesher.js';
import { Generator } from './worldgen.js';
import { buildAtlas, uvRect, avgColor, TILES } from './atlas.js';
import { createTerrainMaterial, createWaterMaterial, createCrackMaterial, globalUniforms } from './materials.js';
import { Graphics } from './graphics.js';
import { Sky } from './sky.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Interaction, raycastVoxel } from './interaction.js';
import { EntityManager, MOB_TYPES, Mob } from './entities.js';
import { Net, resolveWsUrl } from './net.js';
import { Particles } from './particles.js';
import { AudioSys } from './audio.js';
import { UI, Inventory } from './ui.js';
import { getItemIcon } from './icons.js';
import * as SaveFile from './save.js';
import { Panorama } from './panorama.js';

const $ = (id) => document.getElementById(id);

// ---------------- boot ----------------
const settings = loadSettings();

let atlasTexture;
try {
  atlasTexture = buildAtlas();
} catch (e) {
  document.body.innerHTML = `<div style="color:#fff;font:16px sans-serif;padding:40px">Failed to initialize: ${e.message}</div>`;
  throw e;
}

const graphics = new Graphics($('glcanvas'));
graphics.applySettings(settings);
window.addEventListener('resize', () => graphics.resize());

const sky = new Sky(graphics.scene);
const audio = new AudioSys(settings);

// ---------------- game state container ----------------
let game = null;
let panorama = null;

function destroyGame() {
  if (panorama) {
    panorama.dispose();
    panorama = null;
    document.body.classList.remove('pano');
  }
  if (!game) return;
  if (game.net) game.net.dispose();
  game.world.destroy();
  // clear scene objects created by game systems
  for (const c of [...graphics.scene.children]) {
    if (c !== sky.dome && c !== sky.clouds && c !== sky.sunLight && c !== sky.sunLight.target && c !== sky.hemi && !c.isCamera) {
      graphics.scene.remove(c);
    }
  }
  game = null;
}

// Deferred saves: performed at the end of a rendered frame so the canvas can be
// sampled for the world-browser thumbnail without preserveDrawingBuffer.
function queueSave(g) {
  if (!g || !g.started || g.net) return; // multiplayer worlds live on the server
  g._pendingSave = true;
}

function grabThumbnail(gfx) {
  try {
    const src = gfx.canvas;
    const c = document.createElement('canvas');
    c.width = 168; c.height = 94;
    const cx2 = c.getContext('2d');
    const s = Math.max(c.width / src.width, c.height / src.height);
    const dw = src.width * s, dh = src.height * s;
    cx2.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    return c.toDataURL('image/jpeg', 0.62);
  } catch { return null; }
}

function syncQuitSave(g) {
  // synchronous path for page-exit flows; reuses most recent thumbnail
  if (g && g.started && !g.net) SaveFile.saveWorld(g.slot, g, g.lastThumb ?? null);
}

function startGame(opts) {
  destroyGame();
  const { seedStr, saved, slot, name, mpNet } = opts;
  const worldId = String(slot ?? SaveFile.newWorldId());

  const world = new World(seedStr);

  // multiplayer: bake the server-side edit log in before any chunk generates
  if (mpNet && mpNet.edits.length) {
    for (const e of mpNet.edits) {
      if (!Array.isArray(e) || e.length < 4) continue;
      const [x, y, z] = e;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      if (y < 0 || y >= HEIGHT) continue;
      const id = e[3] & 255, face = (e[4] | 0) & 3;
      const k = world.key(x >> 4, z >> 4);
      let em = world.edits.get(k);
      if (!em) { em = new Map(); world.edits.set(k, em); }
      em.set((y << 8) | ((z & 15) << 4) | (x & 15), id + (face << 8));
    }
  }

  const player = new Player(world, null); // input wired below
  const input = new Input($('glcanvas'), settings);

  const g = {
    world, player, input, graphics, sky, audio, atlasTexture, settings,
    slot: worldId,
    net: mpNet ?? null,
    worldName: name ?? saved?.meta?.name ?? undefined,
    lastThumb: saved?.meta?.thumb ?? null,
    timeOfDay: 0.28,
    playTime: 0,
    rainF: 0,
    weatherCoverage: 0.12,
    _weatherState: 'clear',
    _weatherT: 60 + Math.random() * 90,
    thunderT: 0,
    flash: 0,
    damageFlash: 0,
    started: false,
    paused: false,
    sleeping: false,
    flyPrevGrounded: true,
  };
  game = g;

  const ui = new UI(g);
  g.ui = ui;
  g.inventory = ui.inv;
  player.input = input;

  const entities = new EntityManager(g);
  g.entities = entities;
  const particles = new Particles(graphics.scene, world);
  g.particles = particles;
  const interaction = new Interaction(g);
  g.interaction = interaction;

  // ---------- multiplayer ----------
  if (g.net) {
    g.net.attachWorld(world);
    g.net.onChat = addChatLine;
    g.net.onToast = (m) => ui.toast(m);
    if (g.net.spawnNear) g._smpSpawnNear = g.net.spawnNear;
  }

  // ---------- world callbacks ----------
  const chunkMeshes = new Map();
  const terrainMat = createTerrainMaterial(atlasTexture);
  const waterMat = createWaterMaterial(atlasTexture);
  g.chunkMeshes = chunkMeshes;

  function buildChunkMesh(chunk) {
    const key = world.key(chunk.cx, chunk.cz);
    const old = chunkMeshes.get(key);
    if (old) {
      for (const m of [old.opaque, old.water]) if (m) { graphics.scene.remove(m); m.geometry.dispose(); }
      chunkMeshes.delete(key);
    }
    const geo = buildChunkGeometry(world, chunk);
    const entry = { opaque: null, water: null };
    if (geo.opaque) {
      const m = new THREE.Mesh(geo.opaque, terrainMat);
      m.frustumCulled = true;
      entry.opaque = m;
      graphics.scene.add(m);
    }
    if (geo.water) {
      const wm = new THREE.Mesh(geo.water, waterMat);
      wm.renderOrder = 2;
      wm.userData.noShadow = true;
      entry.water = wm;
      graphics.scene.add(wm);
    }
    chunkMeshes.set(key, entry);
    world.dirtyChunks.delete(key);
    chunk.dirty = false;
  }

  world.onChunkReady = (chunk) => { /* meshing happens via dirty queue */ };

  // ---------- drops / pickups ----------
  world.onDrops = (x, y, z, id, count) => entities.spawnDrop(x, y, z, id, count);
  g.giveItem = (id, count, dur) => {
    const left = ui.inv.give(id, count, dur);
    return left;
  };
  g.spawnDrop = (x, y, z, id, count) => entities.spawnDrop(x, y, z, id, count);

  // combat helpers expected by interaction/entities
  g.pickMob = (eye, dir, maxDist) => entities.pickMob(eye[0], eye[1], eye[2], dir.x, dir.y, dir.z, maxDist);
  g.attackMob = (mob, dir) => {
    const held = ui.hotbarSelected();
    let dmg = 1.5;
    if (held && typeof held.id === 'string' && ITEMS[held.id]?.dmg) dmg = ITEMS[held.id].dmg;
    const crit = !player.onGround && player.vel.y < -1;
    if (crit) dmg *= 1.5;
    mob.hurt(dmg, dir);
    if (crit) particles.critFx(mob.pos.x, mob.pos.y + mob.type.h * 0.7, mob.pos.z);
    audio.mobAttack(mob.typeName);
    audio.swing();
    if (held && typeof held.id === 'string' && ITEMS[held.id]?.toolClass === 'sword') {
      held.dur = (held.dur ?? ITEMS[held.id].durability) - 1;
      if (held.dur <= 0) {
        ui.replaceHotbarSlot(null);
        ui.toast('Your sword broke!');
      }
    }
  };

  g.uiOpen = () => ui.uiOpen();
  g.releasePointer = () => input.releaseLock();
  g.setHighlight = setHighlight;

  // ---------- audio hooks ----------
  player.onFootstep = (id, sprint) => audio.step(id, sprint);
  player.onDamage = (amount, cause) => {
    audio.hurt();
    g.damageFlash = Math.min(1, g.damageFlash + 0.55);
  };
  player.onDeath = (cause) => {
    if (g.net) g.net.sendDied(cause);
    $('death-msg').textContent = ({
      fall: 'You fell from a great height.',
      lava: 'The floor was lava.',
      drown: 'You ran out of air.',
      mob: 'A creature got the better of you.',
      starve: 'You forgot to eat.',
      void: 'You slipped into the abyss.',
      cactus: 'Hugged by a cactus.',
    })[cause] ?? 'You died.';
    ui.showScreen('screen-death');
    input.releaseLock();
  };

  world.onFurnaceSmelt = () => { if (!ui.uiOpen()) audio.pop(); };

  interaction.onBreakFx = (x, y, z, id) => {
    particles.blockBreakFx(x, y, z, id);
    audio.breakBlock(id);
  };
  interaction.onSwing = (strong) => { g.handSwing = 1; audio.swing(); };
  interaction.onToolUsed = () => ui.refreshHotbar();
  interaction.onToast = (m) => ui.toast(m);
  interaction.onCrack = (target, stage) => setCrack(target, stage);

  // ---------- highlight & crack ----------
  const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
  const highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
  highlight.visible = false;
  highlight.userData.noShadow = true;
  graphics.scene.add(highlight);

  const crackMat = createCrackMaterial(atlasTexture);
  const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMat);
  crackMesh.visible = false;
  crackMesh.userData.noShadow = true;
  graphics.scene.add(crackMesh);

  function setHighlight(hit) {
    if (!hit) { highlight.visible = false; return; }
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }
  function setCrack(target, stage) {
    if (!target || stage == null) { crackMesh.visible = false; return; }
    crackMesh.visible = true;
    crackMesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    crackMat.uniforms.uRect.value = uvRect('crack' + Math.max(0, Math.min(9, stage)));
  }

  // ---------- hand ----------
  const handGroup = new THREE.Group();
  graphics.camera.add(handGroup);
  graphics.scene.add(graphics.camera);
  handGroup.position.set(0.42, -0.42, -0.62);
  let handMesh = null;
  let handItemId = undefined;
  g.handSwing = 0;

  function rebuildHand() {
    const held = ui.hotbarSelected();
    const id = held ? held.id : '__fist__';
    if (id === handItemId) return;
    handItemId = id;
    if (handMesh) { handGroup.remove(handMesh); handMesh.geometry?.dispose(); handMesh = null; }
    if (held && typeof held.id === 'number' && BLOCKS[held.id]) {
      const geo = buildMiniBlock(BLOCKS[held.id]);
      handMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlasTexture, transparent: true, alphaTest: 0.15 }));
      handMesh.scale.setScalar(0.34);
      handMesh.rotation.set(0.2, -0.6, 0);
    } else if (held) {
      const tex = new THREE.CanvasTexture(getItemIcon(held.id));
      tex.magFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      handMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
      handMesh.rotation.set(-0.1, -0.5, 0.25);
    } else {
      handMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.36, 0.14),
        new THREE.MeshBasicMaterial({ color: 0xd8a07c }));
      handMesh.rotation.set(0.4, 0, -0.2);
    }
    handGroup.add(handMesh);
  }

  function buildMiniBlock(bd) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const sideT = bd.tileSide ?? bd.tile;
    const tiles = [sideT, sideT, bd.tileTop ?? bd.tile ?? sideT, bd.tileBottom ?? bd.tile ?? sideT, bd.tileFront ?? sideT, sideT];
    const uvAttr = geo.attributes.uv;
    const pattern = [[0, 1], [1, 1], [0, 0], [1, 0]];
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = uvRect(tiles[f]);
      for (let i = 0; i < 4; i++) {
        uvAttr.setXY(f * 4 + i, u0 + (u1 - u0) * pattern[i][0], v0 + (v1 - v0) * pattern[i][1]);
      }
    }
    return geo;
  }

  // ---------- chat ----------
  let chatOpen = false;
  const chatIn = $('chat-in');

  function addChatLine(entry) { pushChatLine(entry); }

  function openChat() {
    if (chatOpen) return;
    chatOpen = true;
    g.chatOpen = true;
    input.releaseAll();
    chatIn.value = '';
    chatIn.style.display = 'block';
    setTimeout(() => chatIn.focus(), 0);
  }
  function closeChat(send) {
    if (!chatOpen) return;
    chatOpen = false;
    g.chatOpen = false;
    chatIn.blur();
    chatIn.style.display = 'none';
    input.releaseAll();
    const text = chatIn.value.trim();
    if (send && text && g.net && g.net.sendChat(text)) {
      addChatLine({ kind: 'chat', name: g.net.myName, text });
    }
  }
  activeCloseChat = closeChat;
  g._openChat = openChat;

  // ---------- input routing ----------
  input.onWheel = (dir) => { if (!g.paused && !ui.openWindow) ui.selectSlot(ui.inv.selected + dir); };
  input.onMouseDown = (btn) => {
    audio.ensure(); audio.resume();
    if (g.started && !g.paused && !input.locked && !ui.anyScreenOpen() && !ui.openWindow) input.requestLock();
  };
  input.onKeyDown = (code, e) => {
    audio.ensure(); audio.resume();
    if (!game) return;

    if (code === 'F3') { e.preventDefault(); ui.toggleDebug(); return; }

    if (g.chatOpen) {
      if (code === 'Escape') closeChat(false);
      return;
    }

    if (code === 'Escape') {
      if (ui.openWindow) { ui.closeWindows(); return; }
      if (ui.anyScreenOpen()) {
        if ($('screen-pause').classList.contains('open') || $('screen-settings').classList.contains('open') ||
            $('screen-controls').classList.contains('open')) {
          closePauseOverlays();
        }
        return;
      }
      if (g.started && !g.sleeping) openPause();
      return;
    }

    if (!g.started || g.paused || ui.anyScreenOpen()) return;

    if (code.startsWith('Digit')) {
      const n = parseInt(code.slice(5));
      if (n >= 1 && n <= 9 && !ui.openWindow) ui.selectSlot(n - 1);
      return;
    }

    if (ui.openWindow) {
      if (code === 'KeyE') ui.closeWindows();
      return;
    }

    switch (code) {
      case 'KeyE': ui.openInventory(); break;
      case 'KeyT':
        e.preventDefault();
        openChat();
        break;
      case 'KeyX':
        player.flying = !player.flying;
        ui.toast(player.flying ? 'Fly mode ON (Space up · C down)' : 'Fly mode OFF');
        break;
      case 'KeyQ': {
        const held = ui.hotbarSelected();
        if (held) {
          const f = player.forwardVec();
          const d = entities.spawnDrop(player.pos.x + f.x, player.eyeY - 0.3, player.pos.z + f.z, held.id, 1);
          if (d) { d.vel.x = f.x * 5; d.vel.z = f.z * 5; d.vel.y = 2; d.age = -0.8; }
          held.count--;
          if (held.count <= 0) ui.replaceHotbarSlot(null);
        }
        break;
      }
    }
  };

  // ---------- pause / menus ----------
  function openPause() {
    g.paused = true;
    input.releaseLock();
    input.releaseAll();
    ui.showScreen('screen-pause');
    const ms = $('mp-status');
    if (ms) {
      ms.textContent = g.net
        ? (g.net.connected
            ? `${g.net.isSmp ? 'Site SMP world' : `Room '${g.net.room}'`} · ${g.net.peerCount() + 1} player${g.net.peerCount() ? 's' : ''} online · T to chat`
            : 'Multiplayer offline')
        : '';
    }
    queueSave(g);
  }
  function closePauseOverlays() {
    ['screen-pause', 'screen-settings', 'screen-controls'].forEach(id => $(id).classList.remove('open'));
    if (g.started) {
      g.paused = false;
      input.requestLock();
    } else {
      ui.showScreen('screen-title');
    }
  }
  g._openPause = openPause;
  g._closePauseOverlays = closePauseOverlays;

  input.onLockChange = (locked) => {
    if (!locked && g.started && !g.paused && !ui.openWindow && !ui.anyScreenOpen() && !g.sleeping) {
      openPause();
    }
  };

  // ---------- restore / spawn ----------
  if (saved) {
    g._restoredPos = true;
    g.timeOfDay = saved.meta.time ?? 0.28;
    g.playTime = saved.meta.playTime ?? 0;
    if (saved.meta.weather) {
      g.rainF = saved.meta.weather.rain ?? 0;
      g.weatherCoverage = saved.meta.weather.coverage ?? 0.12;
    }
    for (const [k, arr] of Object.entries(saved.edits)) {
      const m = new Map();
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      world.edits.set(k, m);
    }
    for (const [k, c] of Object.entries(saved.containers || {})) {
      world.containers.set(k, { ...c });
    }
    const sp = saved.player;
    player.pos.set(sp.x, sp.y, sp.z);
    player.yaw = sp.yaw; player.pitch = sp.pitch;
    player.hp = sp.hp; player.hunger = sp.hunger;
    player.spawnPoint = sp.spawn;
    ui.inv.deserialize(sp.inv);
    ui.inv.selected = sp.sel | 0;
  }

  // ---------- begin ----------
  g.begin = () => {
    g.started = true;
    g.paused = false;
    input.requestLock();
    ui.toast(saved ? 'World loaded — welcome back!' : 'Punch trees to gather wood!');
    if (!saved) {
      setTimeout(() => {
        if (game === g) {
          entities.seedPassives(player.pos.x, player.pos.z, 6);
          ui.inv.give(B.TORCH, 4);
        }
      }, 1500);
    }
    ui.refreshHotbar();
  };

  g.saveNow = () => {
    queueSave(g);
    ui.toast('World saved');
  };

  g.trySleep = () => {
    const cel = sky.update(g.timeOfDay, g.rainF, player.pos, { coverage: g.weatherCoverage });
    if (cel.dayF > 0.35) { ui.toast('You can only sleep at night'); return; }
    player.spawnPoint = { x: player.pos.x, y: player.pos.y + 0.5, z: player.pos.z };
    g.sleeping = true;
    input.releaseLock();
    ui.setSleepFade(1);
    setTimeout(() => {
      if (game !== g) return;
      g.timeOfDay = 0.02;
      ui.setSleepFade(0);
      ui.toast('Rise and shine — spawn point set');
      g.sleeping = false;
      if (!ui.anyScreenOpen()) input.requestLock();
    }, 1600);
  };

  // expose for QA/debugging
  window.__game = {
    game: () => game,
    music: () => audio.music,
    tp: (x, y, z) => { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
    look: (yawDeg, pitchDeg) => { player.yaw = yawDeg * Math.PI / 180; player.pitch = pitchDeg * Math.PI / 180; },
    aimAt: (x, y, z) => {
      const dx = x - player.pos.x, dy = y - player.eyeY, dz = z - player.pos.z;
      const h = Math.hypot(dx, dz) || 1e-6;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, h);
    },
    forward: () => { const f = player.forwardVec(); return [f.x, f.y, f.z]; },
    right: () => { const r = player.rightVec(); return [r.x, r.y, r.z]; },
    forceLock: (v) => { input.locked = v; },
    lockState: () => input.locked,
    raycast: () => {
      const f = player.forwardVec();
      const cp = Math.cos(player.pitch);
      return raycastVoxel(world, player.pos.x, player.eyeY, player.pos.z,
        f.x * cp, Math.sin(player.pitch), f.z * cp, 5.2);
    },
    findSolidUnder: (bx, bz) => {
      let y = world.surfaceY(bx, bz);
      const skip = new Set([0, 11, 23, 24, 25, 26, 27, 10, 49, 51]);
      let guard = 0;
      while (y > 1 && guard++ < 20) {
        const id = world.getBlockRaw(bx, y, bz);
        if (!skip.has(id)) return { y, id };
        y--;
      }
      return { y, id: world.getBlockRaw(bx, y, bz) };
    },
    time: (t) => { g.timeOfDay = ((t % 1) + 1) % 1; },
    setTimeOfDay: (t) => { g.timeOfDay = t; },
    give: (id, n = 1) => ui.inv.give(typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id) : id, n),
    invCount: (id) => ui.inv.countOf(typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id) : id),
    selectSlot: (i) => ui.selectSlot(i),
    save: () => g.saveNow(),
    state: () => ({
      pos: player.pos.toArray(), yaw: player.yaw, pitch: player.pitch,
      hp: player.hp, hunger: player.hunger, time: g.timeOfDay,
      chunks: world.chunks.size, pending: world.pendingCount(),
      mobs: entities.mobs.length, drops: entities.drops.length,
      fps: perf.fps,
      onGround: player.onGround, inWater: player.inWater, flying: player.flying,
      vel: player.vel.toArray(),
      mobList: entities.mobs.map(m => ({ type: m.typeName, hp: m.hp, pos: m.pos.toArray(), dying: m.dying })),
      skyLight: globalUniforms.uSkyLight.value,
      started: g.started, paused: g.paused,
    }),
    world: () => world,
    player: () => player,
    ui: () => ui,
    rain: (v) => { g.rainF = v; g._weatherState = v > 0 ? 'rain' : 'clear'; },
    spawnMob: (type, dx = 3, dz = 0) => {
      const x = Math.floor(player.pos.x + dx), z = Math.floor(player.pos.z + dz);
      const y = world.surfaceY(x, z) + 1;
      if (!MOB_TYPES[type]) return null;
      const m = new Mob(g, type, x + 0.5, y, z + 0.5);
      g.entities.mobs.push(m);
      return m;
    },
    setBlock: (x, y, z, id) => world.setBlock(x, y, z, typeof id === 'string' ? B[id.toUpperCase()] : id),
    getBlock: (x, y, z) => world.getBlockRaw(Math.floor(x), Math.floor(y), Math.floor(z)),
    net: () => g.net,
    mpPlace: (x, y, z, id) => { if (g.net) g.net.sendBlock(x, y, z, id | 0); },
    say: (t) => g.net ? g.net.sendChat(t) : false,
    peers: () => {
      if (!g.net || !g.net.remotes) return [];
      return [...g.net.remotes.map.entries()].map(([id, r]) =>
        ({ id, name: r.name, pos: [r.cur.x, r.cur.y, r.cur.z], yaw: r.cur.yaw }));
    },
    interactionState: () => ({
      mining: g.interaction.mining,
      progress: g.interaction.mineProgress,
      needed: g.interaction.mineNeeded,
      target: g.interaction.mineTarget,
      hit: g.interaction.lastHit,
      buttons: [...input.buttons],
    }),
    circuitProbe: (x, y, z) => {
      world.updateCircuitsNear(x, y, z);
      return 'done';
    },
    scanBiome: (target, maxR = 3000) => {
      const gen = new Generator(world.seedStr);
      for (let r = 64; r <= maxR; r += 48) {
        const steps = Math.max(8, Math.floor((2 * Math.PI * r) / 40));
        for (let s = 0; s < steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const x = Math.round(player.pos.x + Math.cos(a) * r);
          const z = Math.round(player.pos.z + Math.sin(a) * r);
          const info = gen.columnInfo(x, z);
          if (info.biome === target && info.h > SEA + 1) return [x, info.h, z];
        }
      }
      return null;
    },
    scanOcean: (maxR = 3000) => {
      const gen = new Generator(world.seedStr);
      for (let r = 96; r <= maxR; r += 64) {
        const steps = Math.max(8, Math.floor((2 * Math.PI * r) / 56));
        for (let s = 0; s < steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const x = Math.round(player.pos.x + Math.cos(a) * r);
          const z = Math.round(player.pos.z + Math.sin(a) * r);
          const info = gen.columnInfo(x, z);
          if (info.biome === 0 && info.h < SEA - 5) return [x, info.h, z];
        }
      }
      return null;
    },
    mobsDetail: () => entities.mobs.map(m => ({ type: m.typeName, hp: m.hp, dying: m.dying, dead: m.dead, pos: m.pos.toArray() })),
  };

  // ---------- main loop pieces stored on g ----------
  g._buildChunkMesh = buildChunkMesh;
  g._handGroup = handGroup;
  g._rebuildHand = rebuildHand;

  // loading sequence
  ui.showScreen(null);
  showLoading(true);
  g._loadPhase = true;

  return g;
}

// wire enter-world button (game set later)
document.getElementById('btn-enter').addEventListener('click', () => {
  audio.click();
  if (game) {
    document.getElementById('screen-playready').classList.remove('open');
    game.begin();
  }
});

function showLoading(on, text = '') {
  let el = $('loading-overlay');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:rgba(5,7,12,.88);z-index:50;color:#ffd76a;font-size:18px;letter-spacing:1px;';
      el.innerHTML = '<div style="font-size:26px;margin-bottom:14px">Shaping the world…</div><div id="load-detail" style="color:#99a;font-size:13px"></div>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    $('load-detail').textContent = text;
  } else if (el) el.style.display = 'none';
}

// chat log lives outside any single game instance
function pushChatLine(entry) {
  const log = document.getElementById('chatlog');
  if (!log) return;
  const d = document.createElement('div');
  d.className = 'chat-line' + (entry.kind === 'sys' ? ' sys' : '');
  if (entry.kind === 'chat') {
    const b = document.createElement('b');
    b.textContent = entry.name;
    d.appendChild(b);
    d.appendChild(document.createTextNode(': ' + entry.text));
  } else {
    d.textContent = entry.text;
  }
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => { d.style.opacity = '0'; }, 7000);
    setTimeout(() => d.remove(), 8000);
}

// chat input is a single global element; the running game registers its closer
let activeCloseChat = null;
document.getElementById('chat-in')?.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); activeCloseChat?.(true); }
  else if (e.key === 'Escape') { e.preventDefault(); activeCloseChat?.(false); }
});

// ---------------- title screen wiring ----------------
$('btn-new').addEventListener('click', () => { audio.ensure(); audio.click(); openWorldBrowser(); });

// ---------------- multiplayer screen ----------------
$('btn-multi').addEventListener('click', () => {
  audio.ensure(); audio.click();
  ui_show(null);
  $('screen-multiplayer').classList.add('open');
  try {
    $('inp-mp-name').value = localStorage.getItem('lumencraft_mp_name') || '';
    $('inp-mp-room').value = localStorage.getItem('lumencraft_mp_room') || '';
  } catch {}
  setTimeout(() => ($('inp-mp-' + ($('inp-mp-name').value ? 'room' : 'name'))).focus(), 0);
});
$('btn-mp-back').addEventListener('click', () => { audio.click(); ui_show('screen-title'); });
function mpLaunch(room) {
  const name = $('inp-mp-name').value.trim().slice(0, 16);
  const code = String(room).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (!code) return;
  try { localStorage.setItem('lumencraft_mp_name', name); } catch {}
  sessionStorage.setItem('lumencraft_boot', JSON.stringify({ mode: 'mp', room: code, name }));
  location.reload();
}
$('btn-mp-smp').addEventListener('click', () => { audio.click(); mpLaunch('SMP'); });
$('btn-mp-join').addEventListener('click', () => {
  audio.click();
  const room = $('inp-mp-room').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (!room) { $('inp-mp-room').focus(); $('inp-mp-room').placeholder = 'Room code is required!'; return; }
  try { localStorage.setItem('lumencraft_mp_room', room); } catch {}
  mpLaunch(room);
});
$('inp-mp-room').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-mp-join').click(); });
$('inp-mp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-mp-smp').focus(); });

// ---------------- world browser ----------------
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
const fmtPlay = (s) => s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;

let selWorldId = null;
let deleteArmed = false;
let deleteTimer = null;

function disarmDelete() {
  deleteArmed = false;
  clearTimeout(deleteTimer);
  $('btn-world-delete').textContent = 'Delete';
}

function syncWorldButtons() {
  const has = !!selWorldId;
  $('btn-world-play').disabled = !has;
  $('btn-world-delete').disabled = !has;
  $('btn-world-delete').textContent = deleteArmed ? 'Really delete?' : 'Delete';
  if (!has) disarmDelete();
}

function selectWorld(id) {
  selWorldId = id;
  document.querySelectorAll('.world-entry').forEach(el => el.classList.toggle('sel', el.dataset.id === id));
  syncWorldButtons();
}

function launchWorld(id) {
  audio.click();
  sessionStorage.setItem('lumencraft_boot', JSON.stringify({ mode: 'load', id }));
  location.reload();
}

function refreshWorldList() {
  const list = $('world-list');
  const worlds = SaveFile.listWorlds();
  list.innerHTML = '';
  $('worlds-empty').style.display = worlds.length ? 'none' : 'block';
  if (!worlds.some(w => w.id === selWorldId)) { selWorldId = null; disarmDelete(); }
  for (const w of worlds) {
    const entry = document.createElement('div');
    entry.className = 'world-entry' + (w.id === selWorldId ? ' sel' : '');
    entry.dataset.id = w.id;
    const img = document.createElement('img');
    if (w.thumb) img.src = w.thumb;
    else img.alt = '';
    img.loading = 'lazy';
    entry.appendChild(img);
    const col = document.createElement('div');
    col.className = 'wi-col';
    const posTxt = w.pos ? ` · at ${w.pos[0]}, ${w.pos[1]}, ${w.pos[2]}` : '';
    col.innerHTML =
      `<div class="wi-name">${esc(w.name)}</div>` +
      `<div class="wi-sub"><b>Seed:</b> ${esc(w.seed)}<br>` +
      `${new Date(w.savedAt).toLocaleString()} · ${fmtSize(w.size)}<br>` +
      `Played ${fmtPlay(w.playTime)}${posTxt}</div>`;
    entry.appendChild(col);
    entry.addEventListener('click', () => { audio.click(); selectWorld(w.id); });
    entry.addEventListener('dblclick', () => launchWorld(w.id));
    list.appendChild(entry);
  }
  syncWorldButtons();
}

function openWorldBrowser() {
  ui_show(null);
  $('screen-worlds').classList.add('open');
  refreshWorldList();
}
function ui_show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('open'));
  if (id) $(id).classList.add('open');
}

$('btn-world-play').addEventListener('click', () => { if (selWorldId) launchWorld(selWorldId); });
$('btn-world-create').addEventListener('click', () => {
  audio.click();
  ui_show(null);
  $('screen-newworld').classList.add('open');
  $('inp-name').value = 'New World';
  $('inp-seed').value = '';
});
$('btn-worlds-back').addEventListener('click', () => { audio.click(); ui_show('screen-title'); });
$('btn-world-delete').addEventListener('click', () => {
  if (!selWorldId) return;
  audio.click();
  if (!deleteArmed) {
    deleteArmed = true;
    $('btn-world-delete').textContent = 'Really delete?';
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(disarmDelete, 3000);
    return;
  }
  SaveFile.deleteWorld(selWorldId);
  selWorldId = null;
  disarmDelete();
  refreshWorldList();
});

$('btn-create').addEventListener('click', () => {
  audio.click();
  const seed = $('inp-seed').value.trim() || String((Math.random() * 1e9) | 0);
  const name = ($('inp-name').value.trim() || 'New World').slice(0, 32);
  sessionStorage.setItem('lumencraft_boot', JSON.stringify({ mode: 'new', seed, id: SaveFile.newWorldId(), name }));
  location.reload();
});
$('btn-new-back').addEventListener('click', () => { audio.click(); openWorldBrowser(); });
$('btn-continue').addEventListener('click', () => {
  audio.click();
  const mostRecent = SaveFile.listWorlds()[0];
  if (mostRecent) launchWorld(mostRecent.id);
});

// pause buttons
$('btn-resume').addEventListener('click', () => { audio.click(); game && game._closePauseOverlays(); });
$('btn-save').addEventListener('click', () => { audio.click(); game && game.saveNow(); });
$('btn-quit').addEventListener('click', () => {
  audio.click();
  syncQuitSave(game);
  sessionStorage.removeItem('lumencraft_boot');
  location.reload();
});
$('btn-respawn').addEventListener('click', () => {
  audio.click();
  if (!game) return;
  game.player.respawn();
  $('screen-death').classList.remove('open');
  game.input.requestLock();
});
$('btn-death-quit').addEventListener('click', () => {
  syncQuitSave(game);
  sessionStorage.removeItem('lumencraft_boot');
  location.reload();
});

// settings screen
let settingsReturnTo = 'screen-title';
function bindSettings() {
  const s = settings;
  const q = $('set-quality'); q.value = s.quality;
  const rd = $('set-rd'); rd.value = s.renderDistance;
  const fov = $('set-fov'); fov.value = s.fov;
  const sens = $('set-sens'); sens.value = s.sensitivity;
  const res = $('set-res'); res.value = s.resScale;
  const sh = $('set-shadows'); sh.checked = s.shadows;
  const bl = $('set-bloom'); bl.checked = s.bloom;
  const wa = $('set-water'); wa.checked = s.fancyWater;
  const cl = $('set-clouds'); cl.checked = s.clouds;
  const ix = $('set-invx'); ix.checked = s.invertX;
  const iy = $('set-invy'); iy.checked = s.invertY;
  const vol = $('set-vol'); vol.value = s.volume;
  const mus = $('set-music'); mus.value = s.music ?? 60;
  const syncLabels = () => {
    $('set-rd-v').textContent = rd.value;
    $('set-fov-v').textContent = fov.value;
    $('set-sens-v').textContent = sens.value + '%';
    $('set-res-v').textContent = res.value + '%';
    $('set-vol-v').textContent = vol.value + '%';
    $('set-music-v').textContent = mus.value + '%';
  };
  syncLabels();

  const apply = () => {
    Object.assign(s, {
      quality: q.value, renderDistance: +rd.value, fov: +fov.value, sensitivity: +sens.value,
      resScale: +res.value, shadows: sh.checked, bloom: bl.checked, fancyWater: wa.checked,
      clouds: cl.checked, invertX: ix.checked, invertY: iy.checked, volume: +vol.value,
      music: +mus.value,
    });
    saveSettings(s);
    graphics.applySettings(s);
    audio.setVolume(s.volume);
    audio.setMusicVolume(s.music);
    if (game) game.input.settings = s;
    syncLabels();
  };
  [rd, fov, sens, res, vol, mus].forEach(el => el.addEventListener('input', apply));
  [q, sh, bl, wa, cl, ix, iy].forEach(el => el.addEventListener('change', apply));

  $('btn-settings-back').addEventListener('click', () => {
    audio.click();
    $('screen-settings').classList.remove('open');
    if (settingsReturnTo === 'pause') { $('screen-pause').classList.add('open'); }
    else $('screen-title').classList.add('open');
  });
}
$('btn-settings-title').addEventListener('click', () => {
  audio.click();
  settingsReturnTo = 'title';
  $('screen-title').classList.remove('open');
  $('screen-settings').classList.add('open');
});
$('btn-settings-pause').addEventListener('click', () => {
  audio.click();
  settingsReturnTo = 'pause';
  $('screen-pause').classList.remove('open');
  $('screen-settings').classList.add('open');
});
$('btn-controls').addEventListener('click', () => {
  audio.click();
  $('screen-title').classList.remove('open');
  $('screen-controls').classList.add('open');
});
$('btn-controls-pause').addEventListener('click', () => {
  audio.click();
  $('screen-pause').classList.remove('open');
  $('screen-controls').classList.add('open');
});
$('btn-controls-back').addEventListener('click', () => {
  audio.click();
  $('screen-controls').classList.remove('open');
  if (game && game.started) $('screen-pause').classList.add('open');
  else $('screen-title').classList.add('open');
});

bindSettings();

// ---------------- boot from sessionStorage ----------------
const bootFlag = (() => {
  try { return JSON.parse(sessionStorage.getItem('lumencraft_boot')); } catch { return null; }
})();

if (bootFlag) {
  sessionStorage.removeItem('lumencraft_boot');
  if (bootFlag.mode === 'new') {
    const id = String(bootFlag.id ?? bootFlag.slot ?? SaveFile.newWorldId());
    game = startGame({ seedStr: bootFlag.seed, slot: id, name: bootFlag.name });
  } else if (bootFlag.mode === 'load') {
    const id = String(bootFlag.id ?? bootFlag.slot);
    const data = SaveFile.loadWorld(id);
    if (data) game = startGame({ seedStr: data.meta.seed, saved: data, slot: id });
    else {
      $('screen-title').querySelector('.panel p.sub').textContent = 'Save missing — create a new world';
    }
  } else if (bootFlag.mode === 'mp') {
    // Multiplayer: connect first (server owns the seed), then build the world.
    const net = new Net({
      url: resolveWsUrl(),
      room: bootFlag.room,
      name: bootFlag.name,
      scene: graphics.scene,
      onToast: (m) => {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = m;
        document.getElementById('toasts')?.appendChild(t);
        setTimeout(() => t.remove(), 3200);
      },
      onChat: pushChatLine,
    });
    showLoading(true, `Connecting to room '${net.room}'…`);
    net.connect().then((welcome) => {
      if (game) return;
      game = startGame({ seedStr: welcome.seed, mpNet: net, name: 'MP · ' + welcome.room });
    }).catch((err) => {
      showLoading(false);
      net.dispose();
      const sub = $('screen-title').querySelector('.panel p.sub');
      if (sub) sub.textContent = `Multiplayer unavailable — ${err.message}`;
      $('screen-title').classList.add('open');
    });
  }
} else {
  // title screen defaults
  $('btn-continue').disabled = !SaveFile.hasAnySave();
}

// ---------------- main loop ----------------
const perf = { fps: 0, frames: 0, accum: 0, lastMs: performance.now(), meshTime: 0 };
let autosaveT = 0;
let lastViewCx = 1e9, lastViewCz = 1e9;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - perf.lastMs) / 1000);
  perf.lastMs = now;
  perf.frames++;
  perf.accum += dt;
  if (perf.accum >= 0.5) {
    perf.fps = Math.round(perf.frames / perf.accum);
    perf.frames = 0; perf.accum = 0;
  }

  if (!game) {
    // rotating live-world panorama behind the title screen
    if (!panorama) {
      panorama = new Panorama(graphics.scene, atlasTexture);
      document.body.classList.add('pano');
    }
    globalUniforms.uTime.value += dt;
    globalUniforms.uFogDensity.value = 0.0046;
    sky.update(0.38, 0, panorama.center, { coverage: 0.16 });
    panorama.update(dt, graphics.camera);
    graphics.renderFrame({
      playerPos: panorama.center,
      sunDir: globalUniforms.uSunDir.value,
      underwater: false,
    });
    return;
  }

  const g = game;
  const player = g.player, world = g.world, ui = g.ui, input = g.input;
  const playing = g.started && !g.paused && !g.sleeping && !ui.anyScreenOpen() && !player.dead && !g.chatOpen;

  // ---- streaming ----
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  if (pcx !== lastViewCx || pcz !== lastViewCz) {
    lastViewCx = pcx; lastViewCz = pcz;
    world.requestArea(pcx, pcz, settings.renderDistance);
  }
  world.pumpRequests();
  const lightBudget = g._loadPhase ? 60000 : 14000;
  world.processLight(lightBudget);
  if (playing) {
    world.tick(dt);
    world.randomTicks(player.pos.x, player.pos.z);
    world.tickFurnaces(dt);
  }

  // ---- meshing budget ----
  if (world.dirtyChunks.size) {
    const t0 = performance.now();
    const dirty = [...world.dirtyChunks];    dirty.sort((a, b) => {
      const pa = a.split(','), pb = b.split(',');
      const da = (pa[0] - pcx) ** 2 + (pa[1] - pcz) ** 2;
      const db = (pb[0] - pcx) ** 2 + (pb[1] - pcz) ** 2;
      return da - db;
    });
    let built = 0;
    for (const k of dirty) {
      if (built >= (g._loadPhase ? 24 : 3) || performance.now() - t0 > (g._loadPhase ? 30 : 6)) break;
      const c = world.chunks.get(k);
      if (!c) { world.dirtyChunks.delete(k); continue; }
      // require neighbors for seamless borders
      if (!world.getChunk(c.cx + 1, c.cz) || !world.getChunk(c.cx - 1, c.cz) ||
          !world.getChunk(c.cx, c.cz + 1) || !world.getChunk(c.cx, c.cz - 1)) continue;
      g._buildChunkMesh(c);
      built++;
    }
    perf.meshTime = performance.now() - t0;
  }

  // ---- loading phase completion ----
  if (g._loadPhase) {
    const centerReady = !!g.chunkMeshes.get(world.key(pcx, pcz));
    if (centerReady && world.pendingCount() < 20) {
      // multiplayer: hop the stream center next to an existing player first
      if (g._smpSpawnNear && !g._smpSpawnDone) {
        const [sx, sz] = g._smpSpawnNear;
        player.pos.set(sx + 0.5, 90, sz + 0.5);
        lastViewCx = 1e9; lastViewCz = 1e9;
        g._smpSpawnDone = true;
        return; // keep the loading overlay up while chunks stream in there
      }
      g._loadPhase = false;
      if (!g.player.placed) {
        if (g._smpSpawnDone) {
          player.pos.y = world.surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z)) + 2.5;
          player.spawnPoint = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
        } else if (!g._restoredPos) {
          const sp = world.findSpawn();
          player.pos.set(sp.x, sp.y, sp.z);
          player.spawnPoint = { x: sp.x, y: sp.y, z: sp.z };
        }
        g.player.placed = true;
      }
      showLoading(false);
      ui.showScreen('screen-playready');
    }
  }

  // ---- simulation ----
  if (playing) {
    player.update(dt);
    g.interaction.update(dt);
    g.entities.update(dt);
    g.playTime += dt;
  }

  // time of day
  if (!g.paused) g.timeOfDay = (g.timeOfDay + dt / DAY_LENGTH) % 1;
  // multiplayer: everyone follows the server's shared clock
  if (g.net) {
    g.net.sendState(player.pos, player.yaw, player.pitch);
    g.net.update(dt);
    const sharedT = g.net.dayT();
    if (sharedT !== null) g.timeOfDay = sharedT;
  }
  globalUniforms.uTime.value += dt;

  // weather machine
  g._weatherT -= dt;
  if (g._weatherT <= 0) {
    if (g._weatherState === 'clear') {
      if (Math.random() < 0.4) {
        g._weatherState = 'rain';
        g._weatherT = 45 + Math.random() * 80;
      } else g._weatherT = 50 + Math.random() * 110;
    } else {
      g._weatherState = 'clear';
      g._weatherT = 70 + Math.random() * 140;
    }
  }
  const wantRain = g._weatherState === 'rain' ? 1 : 0;
  g.rainF += (wantRain - g.rainF) * Math.min(1, dt * 0.4);
  g.weatherCoverage += (wantRain * 0.95 - g.weatherCoverage) * Math.min(1, dt * 0.3);
  if (wantRain && Math.random() < dt * 0.05) {
    g.thunderT = 1.2;
    audio.thunder(0.4 + Math.random() * 2);
  }
  g.thunderT = Math.max(0, g.thunderT - dt * 2);
  g.flash = g.thunderT;

  // sky & lighting uniforms
  const cel = g.sky.update(g.timeOfDay, g.rainF, g.graphics.camera.position, { coverage: g.weatherCoverage });

  // underwater / fog adjustments
  const underwater = player.headInWater;
  if (underwater) {
    globalUniforms.uFogDensity.value = 0.09;
    globalUniforms.uFogColor.value.setRGB(0.03, 0.13, 0.30).lerp(new THREE.Color(0.10, 0.22, 0.38), cel.dayF);
  } else {
    globalUniforms.uFogDensity.value = 0.0052 + g.rainF * 0.004 + (cel.dayF < 0.2 ? 0.001 : 0);
  }

  // ---- camera ----
  const bobY = Math.sin(player.bobPhase * 2) * 0.045 * player.bobAmt;
  const bobX = Math.cos(player.bobPhase) * 0.03 * player.bobAmt;
  const cam = g.graphics.camera;
  cam.position.set(
    player.pos.x + bobX * Math.cos(player.yaw),
    player.eyeY + bobY,
    player.pos.z - bobX * Math.sin(player.yaw));
  cam.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  const targetFov = settings.fov * (player.sprinting ? 1.08 : 1) * (underwater ? 0.96 : 1);
  if (Math.abs(cam.fov - targetFov) > 0.05) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  }

  // ---- hand animation ----
  g._rebuildHand();
  g.handSwing = Math.max(0, g.handSwing - dt * 4.5);
  const hg = g._handGroup;
  const sw = Math.sin(g.handSwing * Math.PI) ;
  hg.position.set(0.42 - sw * 0.18, -0.42 - sw * 0.12 + bobY * 0.5, -0.62 + sw * 0.1);
  hg.rotation.set(-sw * 1.1, sw * 0.4, 0);
  // hand light tint
  const L = Math.max(world.getSky(Math.floor(player.pos.x), Math.floor(player.eyeY), Math.floor(player.pos.z)) / 15 * Math.max(0.25, cel.dayF),
    world.getBlk(Math.floor(player.pos.x), Math.floor(player.eyeY), Math.floor(player.pos.z)) / 15);
  const tint = 0.25 + 0.85 * L;
  if (g._handGroup.children[0]) {
    const hm = g._handGroup.children[0].material;
    hm.color.setRGB(tint, tint * (hm.map ? 1 : 0.92), tint * (hm.map ? 1 : 0.82));
  }

  // ---- particles & audio ----
  const snowBiome = world.biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z)) === 5;
  g.particles.update(dt, playing ? cam.position : null, g.rainF, snowBiome && g.rainF > 0.1);
  audio.update(dt, {
    rainF: g.rainF * (underwater ? 0.3 : 1),
    windExposure: Math.min(1, Math.max(0, (player.pos.y - SEA) / 40)),
    nightF: 1 - cel.dayF,
    outdoors: world.getSky(Math.floor(player.pos.x), Math.floor(player.eyeY), Math.floor(player.pos.z)) > 12,
  });

  // splash transitions
  if (player.headInWater !== g._wasUnderwater) {
    if (Math.abs(player.vel.y) > 2) audio.splash();
    g.particles.splash(player.pos.x, player.pos.y + 1.4, player.pos.z);
    g._wasUnderwater = player.headInWater;
  }

  // ---- HUD ----
  ui.updateHUD(player);
  g.damageFlash = Math.max(0, g.damageFlash - dt * 1.8);
  ui.setDamageFlash(g.damageFlash);
  ui.setUnderwaterTint(underwater);
  ui.setFlash(g.flash * 0.55);
  ui.tickFurnaceWindow();

  // hotbar selection via wheel handled by input callback; digits too.

  // debug text
  if (ui.debugVisible) {
    const st = world.chunks.size;
    const bio = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Peaks', 'Mountains'][world.biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z))];
    ui.setDebugText(
      `FPS ${perf.fps}  ·  ${perf.meshTime.toFixed(1)}ms mesh\n` +
      `XYZ ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}\n` +
      `Chunk ${pcx},${pcz}  loaded ${st}  pending ${world.pendingCount()}\n` +
      `Biome ${bio}  Time ${(g.timeOfDay * 24).toFixed(1)}h  Rain ${(g.rainF * 100) | 0}%\n` +
      `Mobs ${g.entities.mobs.length}  Drops ${g.entities.drops.length}\n` +
      (g.net && g.net.isSmp
        ? `Claim ${g.net.claimOwnerAt(Math.floor(player.pos.x), Math.floor(player.pos.z)) || 'wilderness'}  Net peers ${g.net.peerCount()}\n`
        : '') +
      `Draw calls ${g.graphics.renderer.info.render.calls}  tris ${(g.graphics.renderer.info.render.triangles / 1000).toFixed(0)}k\n` +
      `Vel ${player.vel.length().toFixed(1)}  ${player.onGround ? 'grounded' : player.inWater ? 'swimming' : 'airborne'}${player.flying ? ' (fly)' : ''}`);
  }

  // autosave
  autosaveT += dt;
  if (autosaveT > 45) {
    autosaveT = 0;
    if (g.started) queueSave(g);
  }

  // ---- render ----
  g.graphics.renderFrame({
    playerPos: player.pos,
    sunDir: globalUniforms.uSunDir.value,
    underwater,
  });

  // deferred saves run here, immediately after a render, so the canvas can be
  // sampled for the world-browser thumbnail within the same frame task
  if (g._pendingSave) {
    g._pendingSave = false;
    const thumb = grabThumbnail(g.graphics);
    if (thumb) g.lastThumb = thumb;
    SaveFile.saveWorld(g.slot, g, thumb);
  }
}

requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => {
  syncQuitSave(game);
});
