// STARWEAVE — main game engine: world sim, player control, combat, quests
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

import { buildWorld, isWalkable, ISLANDS, LOOM_POS, STARWELL_POS, GATE_POS, ARENA_CENTER, SPAWN_POINT } from './world.js';
import { buildHeroMesh, buildEnemyMesh, ParticleSystem, Projectiles, Effects, ELEM_COLORS } from './entities.js';
import { CHARACTERS, ENEMIES, SPAWNS, QUESTS, NPCS, elemMultiplier, statAt, xpNeeded, levelCap } from './data.js';
import { AudioSys } from './audio.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MELEE_WEAPONS = ['Sword', 'Gauntlets', 'Hammer', 'Trident', 'Scythe', 'Greatshield'];

export class Game {
  constructor(hooks) {
    this.hooks = hooks || {}; // {onDamageNumber, onToast, onPrompt, onDialogLine, onBossHp, onPlayerStats, onQuestEvent}
    this.save = null;
    this.keys = {};
    this.mouseDown = false;
    this.yaw = Math.PI; this.pitch = 0;
    this.player = {
      pos: V3(SPAWN_POINT.x, 0, SPAWN_POINT.z), vel: V3(0, 0, 0),
      yawModel: Math.PI, onGround: true, hp: 100, maxHp: 100,
      energy: 0, dashCd: 0, dashTime: 0, invuln: 0, attackCd: 0, skillCd: 0,
      comboStage: 0, comboTimer: 0, swapLock: 0, dead: false, shield: 0,
    };
    this.teamInstances = []; // [{id,hp,maxHp,energy,mesh}]
    this.activeIdx = 0;
    this.enemies = [];
    this.pickups = [];
    this.npcs = [];
    this.interactables = [];
    this.projectileSpeed = 26;
    this.time = 0;
    this.paused = false;
    this.inDialog = false;
    this.quality = 'high';
    this._tmpV = V3(0, 0, 0);
  }

  // ------------------------------------------------------------ setup
  init(canvas, save) {
    this.save = save;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

    this.world = buildWorld(scene);

    // post-processing bloom
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.65, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.particles = new ParticleSystem(scene);
    this.projectiles = new Projectiles(scene);
    this.effects = new Effects(scene);

    this.buildTeam();
    this.spawnEnemies();
    this.spawnNPCs();
    this.spawnPickups();

    this.bindInput();
    this.applyQuality(save.settings.quality || 'high');

    addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  applyQuality(q) {
    this.quality = q;
    this.save.settings.quality = q;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    this.bloom.enabled = q === 'high';
    this.onResize();
  }
  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  bindInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.paused && !this.inDialog && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.paused) return;
      this.yaw -= e.movementX * 0.0026;
      this.pitch = Math.max(-0.9, Math.min(1.2, this.pitch - e.movementY * 0.0018));
    });
    document.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.tryAttack(); });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.paused || this.inDialog) return;
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'KeyQ') this.tryBurst();
      if (e.code === 'Digit1') this.swapTo(0);
      if (e.code === 'Digit2') this.swapTo(1);
      if (e.code === 'Digit3') this.swapTo(2);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.tryDash();
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // ------------------------------------------------------------ team / roster
  buildTeam() {
    // dispose old meshes
    for (const t of this.teamInstances) if (t.mesh) this.scene.remove(t.mesh);
    this.teamInstances = [];
    const teamIds = this.save.team.filter(Boolean);
    teamIds.forEach((id, i) => {
      const unit = this.save.roster[id];
      if (!unit) return;
      const def = CHARACTERS[id];
      const stats = statAt(def, unit.level);
      const mesh = buildHeroMesh(def);
      mesh.visible = false;
      mesh.position.copy(this.player.pos);
      this.scene.add(mesh);
      this.teamInstances.push({
        id, level: unit.level, maxHp: stats.hp * 2.2, hp: stats.hp * 2.2, energy: 0,
        atk: stats.atk, def: stats.def, mesh,
      });
    });
    if (this.activeIdx >= this.teamInstances.length) this.activeIdx = 0;
    const act = this.teamInstances[this.activeIdx];
    if (act) { this.player.maxHp = act.maxHp; this.player.hp = Math.min(this.player.hp <= 0 ? act.maxHp : this.player.hp, act.maxHp); }
    this.refreshActiveMesh();
  }
  refreshActiveMesh() {
    this.teamInstances.forEach((t, i) => { if (t.mesh) t.mesh.visible = i === this.activeIdx; });
    const act = this.teamInstances[this.activeIdx];
    if (act) { this.player.maxHp = act.maxHp; }
  }
  activeUnit() { return this.teamInstances[this.activeIdx]; }
  activeDef() { const a = this.activeUnit(); return a ? CHARACTERS[a.id] : null; }

  swapTo(i) {
    if (i === this.activeIdx || !this.teamInstances[i] || this.player.dead || this.swapLock > 0) return;
    AudioSys.sfx('swap');
    this.activeIdx = i;
    this.swapLock = 0.4;
    const act = this.activeUnit();
    this.player.maxHp = act.maxHp;
    this.player.energy = act.energy;
    this.particles.burst(this.player.pos.x, 1, this.player.pos.z, '#ffffff', 10, 3, 2);
    this.refreshActiveMesh();
    this.hooks.onPlayerStats && this.hooks.onPlayerStats();
  }

  // ------------------------------------------------------------ spawning
  spawnEnemies() {
    for (const sp of SPAWNS) {
      for (let i = 0; i < sp.count; i++) this.spawnEnemyAt(sp.type, sp.cx + (Math.random() - 0.5) * sp.r * 2, sp.cz + (Math.random() - 0.5) * sp.r * 2, sp);
    }
  }
  spawnEnemyAt(type, x, z, home) {
    const def = ENEMIES[type];
    const mesh = buildEnemyMesh(type);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const scale = 1 + (home && home.tierBoost ? home.tierBoost : 0);
    const e = {
      def, type, mesh, home,
      hp: def.hp * scale, maxHp: def.hp * scale,
      atkCd: 0, state: 'idle', stateT: Math.random() * 3, dead: false,
      wanderTarget: null, slowT: 0, stunT: 0, phase2: false, summonCd: 8,
    };
    this.enemies.push(e);
    return e;
  }
  spawnBoss() {
    if (this.boss && !this.boss.dead) return;
    const e = this.spawnEnemyAt('colossus', ARENA_CENTER.x, ARENA_CENTER.cz - 14, null);
    e.isBoss = true;
    this.boss = e;
    AudioSys.sfx('bossroar');
    this.hooks.onToast && this.hooks.onToast('⚠ The Umbral Colossus awakens!', '#b06cff');
  }

  spawnNPCs() {
    for (const n of NPCS) {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd8d2ea });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.95, 8), bodyMat);
      body.position.y = 0.85;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshLambertMaterial({ color: 0xf2ddc4 }));
      head.position.y = 1.62;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.295, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: n.id === 'maren' ? 0xcfd4e8 : n.id === 'ondo' ? 0x8a6a3a : 0x4a3a5e }));
      hair.position.y = 1.66;
      hair.rotation.x = 0.12;
      g.add(body, head, hair);
      // nameplate
      const cnv = document.createElement('canvas');
      cnv.width = 256; cnv.height = 64;
      const cctx = cnv.getContext('2d');
      cctx.font = 'bold 34px Georgia';
      cctx.textAlign = 'center';
      cctx.fillStyle = 'rgba(10,8,20,0.65)';
      this._roundRect(cctx, 20, 6, 216, 52, 14);
      cctx.fill();
      cctx.fillStyle = n.color;
      cctx.fillText(n.name, 128, 45);
      const tex = new THREE.CanvasTexture(cnv);
      const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      plate.scale.set(2.4, 0.6, 1);
      plate.position.y = 2.5;
      g.add(plate);
      g.position.set(n.pos[0], 0, n.pos[1]);
      this.scene.add(g);
      this.npcs.push({ ...n, mesh: g });
    }
    // Vesperine story NPC at the glade (appears in ch4+, hidden before)
    this.vesperineNpc = this.makeHeroNpc('vesperine', 112, 96);
    this.vesperineNpc.mesh.visible = false;
  }
  makeHeroNpc(charId, x, z) {
    const def = CHARACTERS[charId];
    const mesh = buildHeroMesh(def);
    mesh.position.set(x, 0, z);
    mesh.scale.setScalar(1.35);
    this.scene.add(mesh);
    const npc = { id: charId, name: CHARACTERS[charId].name, mesh, x, z, isHeroNpc: true };
    this.npcs.push(npc);
    return npc;
  }

  spawnPickups() {
    // Sunshards for ch2
    const spots = [[-30, 18], [100, -24], [126, -6]];
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 1.4 })
      );
      m.position.set(x, 1.4, z);
      this.scene.add(m);
      this.pickups.push({ kind: 'sunshard', x, z, mesh: m, taken: false });
    }
  }

  // ------------------------------------------------------------ interaction
  nearestInteractable() {
    const p = this.player.pos;
    let best = null, bestD = 3.4;
    const consider = (x, z, data) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = data; }
    };
    for (const n of this.npcs) {
      if (!n.mesh.visible) continue;
      consider(n.mesh.position.x, n.mesh.position.z, { kind: 'npc', ref: n, label: `Talk to ${n.name}` });
    }
    if (this.save.unlocked.gacha) consider(LOOM_POS.x, LOOM_POS.z + 6, { kind: 'loom', label: 'Weave at the Astral Loom' });
    else consider(LOOM_POS.x, LOOM_POS.z + 6, { kind: 'loom_locked', label: 'The silent Loom' });
    consider(STARWELL_POS.x, STARWELL_POS.z, { kind: 'starwell', label: 'Drink from the Starwell' });
    consider(GATE_POS.x, GATE_POS.z, { kind: 'gate', label: 'Enter the Fracture Gate' });
    return best;
  }
  tryInteract() {
    if (this.player.dead) return;
    const it = this.nearestInteractable();
    if (!it) return;
    AudioSys.sfx('click');
    switch (it.kind) {
      case 'npc': this.talkTo(it.ref); break;
      case 'loom': this.hooks.openGacha && this.hooks.openGacha(); break;
      case 'loom_locked': this.hooks.onToast && this.hooks.onToast('The Loom sleeps. Advance the story to rekindle it.', '#8fa8c9'); break;
      case 'starwell': this.claimStarwell(); break;
      case 'gate':
        if (this.save.quests.current >= 4) {
          this.teleport(ARENA_CENTER.x, ARENA_CENTER.cz + 20);
          this.spawnBoss();
        } else this.hooks.onToast && this.hooks.onToast('The gate is sealed. The thread is not yet woven.', '#8fa8c9');
        break;
    }
  }
  claimStarwell() {
    const now = Date.now();
    const remain = this.save.starwellLast + 8 * 60 * 1000 - now;
    if (remain > 0) {
      const mins = Math.ceil(remain / 60000);
      this.hooks.onToast && this.hooks.onToast(`Starwell recharging — ${mins} min until it fills.`, '#8fa8c9');
      AudioSys.sfx('error');
      return;
    }
    this.save.starwellLast = now;
    this.addStardust(80);
    this.particles.burst(STARWELL_POS.x, 2, STARWELL_POS.z, '#7fe8dd', 24, 4, 6);
    AudioSys.sfx('stardust');
    this.hooks.onToast && this.hooks.onToast('+80 ✦ The Starwell blesses you!', '#7fe8dd');
    this.hooks.persist && this.hooks.persist();
  }
  teleport(x, z) {
    this.player.pos.set(x, 0, z);
    this.particles.burst(x, 1, z, '#b06cff', 30, 5, 5);
  }
  talkTo(npc) {
    if (npc.isHeroNpc) {
      this.startDialog([{ who: npc.id, text: 'Fate threads tangle pleasantly around you, Weaver.' }]);
      return;
    }
    const lines = [];
    const q = this.currentQuest();
    if (npc.id === 'maren' && q) {
      lines.push(...q.intro);
    } else {
      const dl = npc.dialog || ['…'];
      lines.push({ who: npc.id, text: dl[Math.floor(Math.random() * dl.length)] });
    }
    this.startDialog(lines);
  }
  startDialog(lines, onDone) {
    if (this.inDialog) return;
    this.inDialog = true;
    document.exitPointerLock && document.exitPointerLock();
    this.hooks.onDialog && this.hooks.onDialog(lines, () => {
      this.inDialog = false;
      onDone && onDone();
    });
  }

  // ------------------------------------------------------------ quests
  currentQuest() {
    const qi = this.save.quests.current;
    return qi < QUESTS.length ? QUESTS[qi] : null;
  }
  questProgressText() {
    const q = this.currentQuest();
    if (!q) return null;
    const st = this.save.quests;
    const step = q.steps[st.step];
    if (!step) return q.name;
    let cur = 0;
    if (step.type === 'kill') cur = st.counters['kill_' + step.target] || 0;
    else if (step.type === 'killany') cur = st.counters.killany || 0;
    else if (step.type === 'collect') cur = this.save.shards;
    else if (step.type === 'reach') cur = st.counters.reach_vesperine || 0;
    else if (step.type === 'boss') cur = st.counters.boss_colossus || 0;
    return `${q.name} — ${step.hint} (${Math.min(cur, step.count)}/${step.count})`;
  }
  onQuestEvent(type, target) {
    const q = this.currentQuest();
    if (!q) return;
    const st = this.save.quests;
    const step = q.steps[st.step];
    if (!step) return;
    let matched = false;
    if (step.type === 'kill' && type === 'kill' && step.target === target) {
      st.counters['kill_' + target] = (st.counters['kill_' + target] || 0) + 1;
      matched = (st.counters['kill_' + target] >= step.count);
    } else if (step.type === 'killany' && type === 'kill') {
      st.counters.killany = (st.counters.killany || 0) + 1;
      matched = (st.counters.killany >= step.count);
    } else if (step.type === 'collect' && type === 'collect') {
      matched = this.save.shards >= step.count;
    } else if (step.type === 'reach' && type === 'reach') {
      st.counters.reach_vesperine = 1;
      matched = true;
    } else if (step.type === 'boss' && type === 'boss') {
      st.counters.boss_colossus = 1;
      matched = true;
    }
    if (matched) this.completeStep();
    this.hooks.onQuestUpdate && this.hooks.onQuestUpdate();
    this.hooks.persistSoon && this.hooks.persistSoon();
  }
  completeStep() {
    const q = this.currentQuest();
    const st = this.save.quests;
    st.step++;
    AudioSys.sfx('quest');
    if (st.step >= q.steps.length) this.completeQuest();
    else {
      const ns = q.steps[st.step];
      this.hooks.onToast && this.hooks.onToast(`✔ ${ns.hint}`, '#ffd76e');
    }
  }
  completeQuest() {
    const q = this.currentQuest();
    const st = this.save.quests;
    st.done.push(q.id);
    st.current++;
    st.step = 0;
    st.counters = {};
    this.save.shards = 0;
    this.addStardust(q.rewards.stardust || 0);
    if (q.rewards.sigils) { this.save.sigils += q.rewards.sigils; }
    if (q.rewards.grant) { this.grantUnit(q.rewards.grant, true); }
    if (q.rewards.unlock) {
      this.save.unlocked[q.rewards.unlock] = true;
      if (q.rewards.unlock === 'gacha') this.hooks.onGachaUnlocked && this.hooks.onGachaUnlocked();
    }
    this.hooks.onToast && this.hooks.onToast(`★ Chapter complete: ${q.name}  (+${q.rewards.stardust}✦${q.rewards.sigils ? `, +${q.rewards.sigils} Sigils` : ''})`, '#ffd76e');
    AudioSys.sfx('levelup');
    const next = this.currentQuest();
    if (next) {
      setTimeout(() => {
        this.startDialog(next.intro);
      }, 800);
    } else {
      this.hooks.onStoryComplete && this.hooks.onStoryComplete();
    }
    this.hooks.onQuestUpdate && this.hooks.onQuestUpdate();
    this.hooks.persist && this.hooks.persist();
  }
  grantUnit(id, toast) {
    if (this.save.roster[id]) return;
    this.save.roster[id] = { level: 1, xp: 0, ascension: 0, resonance: 0 };
    const slot = this.save.team.findIndex(t => !t);
    if (slot >= 0) this.save.team[slot] = id;
    this.buildTeam();
    if (toast) this.hooks.onToast && this.hooks.onToast(`◆ ${CHARACTERS[id].name} joins your weave!`, '#ffd76e');
    this.hooks.onRosterChange && this.hooks.onRosterChange();
  }
  addStardust(n) {
    this.save.stardust += n;
    this.hooks.onCurrencyUpdate && this.hooks.onCurrencyUpdate();
    this.hooks.persistSoon && this.hooks.persistSoon();
  }

  // ------------------------------------------------------------ combat: player
  tryAttack() {
    const u = this.activeUnit();
    if (!u || this.player.attackCd > 0 || this.player.dead) return;
    const def = this.activeDef();
    const isMelee = MELEE_WEAPONS.includes(def.weapon);
    this.player.comboTimer = 1.2;
    this.player.comboStage = (this.player.comboStage % 3) + 1;
    const stageMult = [1, 1.12, 1.45][this.player.comboStage - 1];
    this.player.attackCd = isMelee ? 0.42 : 0.55;
    AudioSys.sfx(isMelee ? 'slash' : 'skill');
    const elColor = ELEM_COLORS[def.element];

    if (isMelee) {
      const fwd = this.forwardFlat();
      this.effects.slashArc(this.player.pos, Math.atan2(fwd.x, fwd.z), elColor);
      this.hitArc(2.9, 1.15, u.atk * 0.42 * stageMult, def.element);
      // swing arm animation
      const arm = u.mesh.userData.arms[1];
      arm.userData.swing = 0.28;
    } else {
      // projectile basic
      const dir = this.aimDir();
      const from = this.player.pos.clone().add(V3(0, 1.4, 0)).addScaledVector(dir, 0.8);
      this.projectiles.spawn({
        from, dir, speed: this.projectileSpeed, color: elColor,
        dmg: u.atk * 0.42 * stageMult, element: def.element, hitRadius: 0.9,
        onHit: (e, pos) => this.damageEnemy(e, u.atk * 0.42 * stageMult, def.element, pos),
      });
    }
  }
  forwardFlat() {
    return V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  aimDir() {
    const d = V3(
      -Math.sin(this.yaw) * Math.cos(this.pitch * 0.6),
      Math.sin(-this.pitch * 0.5),
      -Math.cos(this.yaw) * Math.cos(this.pitch * 0.6)
    );
    return d.normalize();
  }
  hitArc(range, halfAngleRad, baseDmg, element) {
    const fwd = this.forwardFlat();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - this.player.pos.x;
      const dz = e.mesh.position.z - this.player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.def.radius) continue;
      const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
      if (dot < Math.cos(halfAngleRad)) continue;
      this.damageEnemy(e, baseDmg, element, e.mesh.position.clone().setY(1.2));
    }
  }
  damageEnemy(e, baseDmg, element, atPos) {
    if (e.dead) return;
    const mult = elemMultiplier(element, e.def.element);
    const crit = Math.random() < 0.08;
    let dmg = baseDmg * mult * (0.95 + Math.random() * 0.1) * (crit ? 1.6 : 1);
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.state = 'chase'; // aggro
    this.particles.burst(atPos.x, atPos.y, atPos.z, mult > 1 ? '#ffffff' : (ELEM_COLORS[element] || '#ffd76e'), crit ? 12 : 7, 4, 2.5);
    this.hooks.onDamageNumber && this.hooks.onDamageNumber(atPos, dmg, crit ? '#ff9a3c' : (mult > 1.05 ? '#7fe8dd' : '#fff'), crit);
    AudioSys.sfx('hit');
    const u = this.activeUnit();
    if (u) { u.energy = Math.min(100, u.energy + 7); this.player.energy = u.energy; }
    if (e.def.boss) this.hooks.onBossHp && this.hooks.onBossHp(e.hp / e.maxHp);
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e) {
    e.dead = true;
    this.scene.remove(e.mesh);
    this.particles.burst(e.mesh.position.x, 1.2, e.mesh.position.z, '#b06cff', 26, 6, 4);
    this.particles.burst(e.mesh.position.x, 1.2, e.mesh.position.z, '#ffffff', 12, 3, 3);
    // rewards
    const xp = e.def.xp;
    this.gainXp(xp);
    const dust = e.type === 'colossus' ? 400 : e.type === 'brute' ? 40 + Math.floor(Math.random() * 30) : 8 + Math.floor(Math.random() * 12);
    this.addStardust(dust);
    this.hooks.onPickupText && this.hooks.onPickupText(e.mesh.position, `+${dust} ✦`, '#ffe6a8');
    if ((e.type === 'brute' && Math.random() < 0.35) || e.type === 'colossus') {
      this.save.sigils += 1;
      this.hooks.onPickupText && this.hooks.onPickupText(e.mesh.position, '+1 Sigil ◈', '#b07aff');
      this.hooks.onCurrencyUpdate && this.hooks.onCurrencyUpdate();
    }
    this.save.stats.kills++;
    this.onQuestEvent('kill', e.type);
    if (e.isBoss) {
      this.hooks.onBossHp && this.hooks.onBossHp(0);
      this.hooks.onBossDefeated && this.hooks.onBossDefeated();
    }
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    // schedule respawn for non-boss
    if (!e.isBoss) {
      setTimeout(() => {
        if (this.disposed) return;
        const ne = this.spawnEnemyAt(e.type, e.home ? e.home.cx + (Math.random() - 0.5) * (e.home.r || 8) * 2 : e.mesh.position.x, e.home ? e.home.cz + (Math.random() - 0.5) * (e.home.r || 8) * 2 : e.mesh.position.z, e.home);
        ne.home = e.home;
      }, 32000);
    }
    this.hooks.persistSoon && this.hooks.persistSoon();
  }
  gainXp(n) {
    for (const id of Object.keys(this.save.roster)) {
      const unit = this.save.roster[id];
      const amt = this.save.team.includes(id) ? n : Math.round(n * 0.5);
      unit.xp += amt;
      let leveled = false;
      while (unit.xp >= xpNeeded(unit.level) && unit.level < levelCap(unit.ascension)) {
        unit.xp -= xpNeeded(unit.level);
        unit.level++;
        leveled = true;
      }
      if (leveled && this.save.team.includes(id)) {
        this.hooks.onLevelUp && this.hooks.onLevelUp(id, unit.level);
      }
    }
    // refresh stats
    for (const t of this.teamInstances) {
      const unit = this.save.roster[t.id];
      const stats = statAt(CHARACTERS[t.id], unit.level);
      const ratio = t.hp / t.maxHp;
      t.maxHp = stats.hp * 2.2; t.atk = stats.atk; t.def = stats.def;
      t.hp = Math.min(t.maxHp, Math.max(ratio, 0.4) * t.maxHp);
    }
    this.refreshActiveMesh();
    this.hooks.onPlayerStats && this.hooks.onPlayerStats();
    this.hooks.persistSoon && this.hooks.persistSoon();
  }
  tryDash() {
    const p = this.player;
    if (p.dashCd > 0 || p.dead) return;
    p.dashCd = 1.1; p.dashTime = 0.24; p.invuln = Math.max(p.invuln, 0.32);
    AudioSys.sfx('dash');
  }
  trySkill() {
    const u = this.activeUnit();
    const def = this.activeDef();
    if (!u || this.player.skillCd > 0 || this.player.dead) return;
    this.player.skillCd = def.kit.skill.cd;
    AudioSys.sfx('skill');
    this.castAbility(u, def, def.kit.skill, false);
  }
  tryBurst() {
    const u = this.activeUnit();
    const def = this.activeDef();
    if (!u || u.energy < 100 || this.player.dead) {
      if (u && u.energy < 100) AudioSys.sfx('error');
      return;
    }
    u.energy = 0; this.player.energy = 0;
    AudioSys.sfx('burst');
    this.hooks.onToast && this.hooks.onToast(`${def.name}: ${def.kit.burst.name}!`, ELEM_COLORS[def.element]);
    this.castAbility(u, def, def.kit.burst, true);
  }

  castAbility(u, def, ability, isBurst) {
    const elColor = ELEM_COLORS[def.element];
    const base = u.atk * ability.mult;
    const pos = this.player.pos.clone();
    const type = ability.type;
    if (type === 'nova' || type === 'nova_big' || type === 'nova_big_burn' || type === 'bubble_slow' || type === 'stun_slam') {
      const r = isBurst ? 8.5 : 5.5;
      this.effects.nova(pos, elColor, r, 0.55);
      for (const e of [...this.enemies]) {
        if (e.dead) continue;
        const d = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
        if (d < r + e.def.radius) {
          this.damageEnemy(e, base, def.element, e.mesh.position.clone().setY(1.2));
          if (type === 'bubble_slow') e.slowT = 3;
          if (type === 'stun_slam') e.stunT = 2.2;
        }
      }
      if (type === 'nova_big_burn') this.effects.zone(pos, '#ff7847', r * 0.8, 4, 'fire');
      if (ability.heal) this.healActive(ability.heal);
    } else if (type === 'dash_pierce' || type === 'phase_drain' || type === 'rip') {
      const fwd = this.forwardFlat();
      const start = pos.clone();
      const end = pos.clone().addScaledVector(fwd, isBurst ? 12 : 9);
      this.effects.beamLine(start.clone().add(V3(0, 1.2, 0)), end.clone().add(V3(0, 1.2, 0)), elColor, 0.3);
      this.player.pos.copy(end);
      this.player.invuln = Math.max(this.player.invuln, 0.3);
      for (const e of [...this.enemies]) {
        if (e.dead) continue;
        const t = ((e.mesh.position.x - start.x) * fwd.x + (e.mesh.position.z - start.z) * fwd.z) / 12;
        if (t < -0.2 || t > 1.2) continue;
        const px = start.x + fwd.x * 12 * t, pz = start.z + fwd.z * 12 * t;
        if (Math.hypot(e.mesh.position.x - px, e.mesh.position.z - pz) < 2.4 + e.def.radius) {
          this.damageEnemy(e, base, def.element, e.mesh.position.clone().setY(1.2));
          if (type === 'phase_drain') this.healActive(0.04);
          e.stunT = Math.max(e.stunT, 0.6);
        }
      }
    } else if (type === 'line_shot') {
      const dir = this.aimDir();
      const from = pos.clone().add(V3(0, 1.5, 0));
      this.projectiles.spawn({
        from, dir, speed: 46, color: elColor, pierce: true, hitRadius: 1.4,
        onHit: (e, p) => this.damageEnemy(e, base, def.element, p),
      });
      this.effects.beamLine(from, from.clone().addScaledVector(dir, 30), elColor, 0.2);
    } else if (type === 'rocket') {
      const target = this.nearestEnemy(30);
      const dir = target
        ? target.mesh.position.clone().add(V3(0, 1.2, 0)).sub(pos.clone().add(V3(0, 1.4, 0))).normalize()
        : this.aimDir();
      this.projectiles.spawn({
        from: pos.clone().add(V3(0, 1.4, 0)), dir, speed: 30, color: elColor,
        hitRadius: 1.6, gravity: 2,
        onHit: (e, p) => {
          this.damageEnemy(e, base, def.element, p);
          this.effects.nova(p, elColor, 3.4, 0.4);
          for (const e2 of this.enemies) {
            if (e2.dead || e2 === e) continue;
            if (Math.hypot(e2.mesh.position.x - p.x, e2.mesh.position.z - p.z) < 3.4) this.damageEnemy(e2, base * 0.5, def.element, e2.mesh.position.clone().setY(1));
          }
        },
      });
    } else if (type === 'arrow_rain') {
      for (let i = 0; i < 14; i++) {
        setTimeout(() => {
          if (this.disposed) return;
          const tx = pos.x + (Math.random() - 0.5) * 14;
          const tz = pos.z + (Math.random() - 0.5) * 14;
          const from = V3(tx, 14, tz);
          this.effects.beamLine(from, V3(tx, 0, tz), elColor, 0.18);
          this.particles.burst(tx, 0.6, tz, elColor, 5, 3, 2);
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.mesh.position.x - tx, e.mesh.position.z - tz) < 2 + e.def.radius) this.damageEnemy(e, base / 5, def.element, e.mesh.position.clone().setY(1.2));
          }
        }, i * 90);
      }
    } else if (type === 'shield_team') {
      const amount = u.maxHp * (ability.shield || 0.28);
      this.player.shield = amount;
      this.effects.nova(pos, '#d9a066', 4, 0.6);
      AudioSys.sfx('shield');
      this.hooks.onShield && this.hooks.onShield(amount);
    } else if (type === 'heal') {
      this.healActive(ability.heal || 0.22);
      this.effects.nova(pos, '#fff3cf', 3, 0.5);
      AudioSys.sfx('heal');
    } else if (type === 'hot_field') {
      this.effects.zone(pos, '#fff3cf', 6, 8, 'heal');
      this.hotField = { x: pos.x, z: pos.z, r: 6, t: 8, tick: 0 };
      AudioSys.sfx('heal');
    } else if (type === 'ground_fire') {
      this.effects.zone(pos, '#ff7847', 6.5, 6, 'fire');
      this.fireZone = { x: pos.x, z: pos.z, r: 6.5, t: 6, dps: base / 3, tick: 0 };
    } else if (type === 'vortex') {
      this.effects.zone(pos, '#5aa9ff', 7, 5, 'vortex');
      this.vortex = { x: pos.x, z: pos.z, r: 7, t: 5, dps: base / 4, tick: 0 };
    } else if (type === 'spin_drain') {
      let hits = 0;
      const iv = setInterval(() => {
        if (this.disposed || hits++ > 7) { clearInterval(iv); return; }
        this.effects.nova(this.player.pos, elColor, 4.5, 0.3);
        for (const e of [...this.enemies]) {
          if (e.dead) continue;
          const d = Math.hypot(e.mesh.position.x - this.player.pos.x, e.mesh.position.z - this.player.pos.z);
          if (d < 5.5 + e.def.radius) {
            this.damageEnemy(e, base / 4, def.element, e.mesh.position.clone().setY(1.2));
            this.healActive(0.012);
          }
        }
      }, 260);
    }
  }
  healActive(frac) {
    const p = this.player;
    if (p.hp <= 0) return;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * frac);
    const u = this.activeUnit();
    if (u) u.hp = p.hp;
    this.hooks.onPlayerStats && this.hooks.onPlayerStats();
  }
  nearestEnemy(maxDist) {
    let best = null, bd = maxDist || 20;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.mesh.position.x - this.player.pos.x, e.mesh.position.z - this.player.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  hurtPlayer(rawDmg, fromPos) {
    const p = this.player;
    if (p.invuln > 0 || p.dead) return;
    let dmg = rawDmg * (0.9 + Math.random() * 0.2);
    const u = this.activeUnit();
    if (u) dmg *= 130 / (130 + u.def);
    dmg = Math.round(dmg);
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed; dmg -= absorbed;
    }
    if (dmg <= 0) return;
    p.hp -= dmg;
    if (u) { u.hp = p.hp; u.energy = Math.min(100, u.energy + 5); p.energy = u.energy; }
    p.invuln = 0.35;
    this.hooks.onDamageNumber && this.hooks.onDamageNumber(this.player.pos.clone().setY(1.8), dmg, '#ff5a6e', false, true);
    this.hooks.onPlayerStats && this.hooks.onPlayerStats();
    AudioSys.sfx('hit');
    if (fromPos) {
      const kb = V3(p.pos.x - fromPos.x, 0, p.pos.z - fromPos.z).normalize().multiplyScalar(2.2);
      p.vel.add(kb);
    }
    if (p.hp <= 0) this.playerDown();
  }
  playerDown() {
    const p = this.player;
    p.hp = 0; p.dead = true;
    this.particles.burst(p.pos.x, 1, p.pos.z, '#ff5a6e', 30, 5, 4);
    this.hooks.onToast && this.hooks.onToast('You have fallen… the Loom catches your thread.', '#ff5a6e');
    setTimeout(() => {
      if (this.disposed) return;
      // revive at hub
      p.pos.set(SPAWN_POINT.x, 0, SPAWN_POINT.z);
      p.dead = false;
      p.hp = p.maxHp;
      for (const t of this.teamInstances) t.hp = t.maxHp;
      // clear aggro
      for (const e of this.enemies) e.state = 'idle';
      this.hooks.onPlayerStats && this.hooks.onPlayerStats();
      this.hooks.onRevived && this.hooks.onRevived();
    }, 2600);
  }

  // ------------------------------------------------------------ loop
  loop() {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
    }
    this.render();
  }
  render() {
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  update(dt) {
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectilesZones(dt);
    this.updatePickupsNpcs(dt);
    this.particles.update(dt);
    this.effects.update(dt);
    this.world.update(this.time, dt, this.player.pos);
    this.updateCamera(dt);
    // hud prompt
    const it = (!this.inDialog && !this.player.dead) ? this.nearestInteractable() : null;
    this.hooks.onPrompt && this.hooks.onPrompt(it ? `[E] ${it.label}` : null);
    this.hooks.onFrame && this.hooks.onFrame(dt);
  }
  updatePlayer(dt) {
    const p = this.player;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.swapLock = Math.max(0, p.swapLock - dt);
    if (p.comboTimer > 0) { p.comboTimer -= dt; if (p.comboTimer <= 0) p.comboStage = 0; }
    if (p.dead) return;

    // movement
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.KeyW) mz += 1;
    if (k.KeyS) mz -= 1;
    if (k.KeyA) mx -= 1;
    if (k.KeyD) mx += 1;
    const moving = mx || mz;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const fwd = this.forwardFlat();
      const right = V3(-fwd.z, 0, fwd.x);
      const move = V3(
        fwd.x * mz + right.x * mx, 0,
        fwd.z * mz + right.z * mx
      );
      const boost = p.dashTime > 0 ? 3.4 : 1;
      p.vel.x = move.x * 8.4 * boost;
      p.vel.z = move.z * 8.4 * boost;
      p.yawModel = Math.atan2(move.x, move.z);
    } else {
      p.vel.x *= 0.82; p.vel.z *= 0.82;
    }
    if (p.dashTime > 0 && !moving) {
      const fwd = this.forwardFlat();
      p.vel.x = fwd.x * 26; p.vel.z = fwd.z * 26;
    }
    // jump
    if (k.Space && p.onGround) { p.vel.y = 7.5; p.onGround = false; }
    p.vel.y -= 21 * dt;
    // integrate with walkable clamp
    const nx = p.pos.x + p.vel.x * dt;
    const nz = p.pos.z + p.vel.z * dt;
    if (isWalkable(nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
    else if (isWalkable(nx, p.pos.z)) p.pos.x = nx;
    else if (isWalkable(p.pos.x, nz)) p.pos.z = nz;
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }

    // skill key
    if (this.keys.KeyF) this.trySkill();
    // sync mesh
    const u = this.activeUnit();
    if (u && u.mesh) {
      u.mesh.position.copy(p.pos);
      u.mesh.rotation.y = p.yawModel;
      // bob + swing anims
      const t = this.time;
      u.mesh.position.y = p.pos.y + (moving ? Math.abs(Math.sin(t * 11)) * 0.06 : Math.sin(t * 2.2) * 0.03);
      const armR = u.mesh.userData.arms[1];
      if (armR.userData.swing > 0) {
        armR.userData.swing -= dt;
        armR.rotation.x = -2.2 + (0.28 - armR.userData.swing) * 9;
      } else {
        armR.rotation.x = moving ? Math.sin(t * 11) * 0.55 : Math.sin(t * 2) * 0.06;
      }
      const armL = u.mesh.userData.arms[0];
      armL.rotation.x = moving ? -Math.sin(t * 11) * 0.55 : -Math.sin(t * 2) * 0.06;
      if (u.mesh.userData.weapon.userData.floatOrb) {
        u.mesh.userData.weapon.position.y = -0.2 + Math.sin(t * 3) * 0.08;
      }
    }
  }
  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ep = e.mesh.position;
      const dx = p.pos.x - ep.x, dz = p.pos.z - ep.z;
      const dist = Math.hypot(dx, dz);
      e.atkCd = Math.max(0, e.atkCd - dt);
      e.stateT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.stunT > 0) { e.stunT -= dt; continue; }
      const speedMul = (e.slowT > 0 ? 0.45 : 1) * (e.phase2 ? 1.3 : 1);

      if (e.def.boss) {
        if (!e.phase2 && e.hp < e.maxHp * 0.5) {
          e.phase2 = true;
          this.hooks.onToast && this.hooks.onToast('The Colossus howls — the fracture widens!', '#b06cff');
          this.particles.burst(ep.x, 5, ep.z, '#b06cff', 60, 10, 8);
        }
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = 14;
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * Math.PI * 2;
            this.spawnEnemyAt('wisp', ep.x + Math.cos(a) * 8, ep.z + Math.sin(a) * 8, null);
          }
          this.hooks.onToast && this.hooks.onToast('The Colossus calls gloamwisps!', '#b06cff');
        }
        // slam attack
        if (dist < 16 && e.atkCd <= 0) {
          e.atkCd = e.phase2 ? 3.2 : 4.6;
          // telegraph then slam
          this.effects.zone(ep, '#b06cff', 11, 1.0, 'telegraph');
          setTimeout(() => {
            if (this.disposed || e.dead) return;
            this.effects.nova(ep, '#b06cff', 11, 0.5);
            AudioSys.sfx('burst');
            const d2 = Math.hypot(p.pos.x - ep.x, p.pos.z - ep.z);
            if (d2 < 11) this.hurtPlayer(e.def.atk * 1.6, ep);
          }, 1000);
        }
        // contact
        if (dist < 4.5 && e.atkCd > 1) this.hurtPlayer(e.def.atk * 0.4, ep);
      } else if (e.def.ranged) {
        if (dist < 22 && (e.state === 'chase' || dist < 12)) {
          e.state = 'chase';
          const want = 11;
          if (dist > want + 2) { ep.x += (dx / dist) * e.def.speed * speedMul * dt; ep.z += (dz / dist) * e.def.speed * speedMul * dt; }
          else if (dist < want - 3) { ep.x -= (dx / dist) * e.def.speed * speedMul * dt; ep.z -= (dz / dist) * e.def.speed * speedMul * dt; }
          if (e.atkCd <= 0 && dist < 20) {
            e.atkCd = 2.4;
            const from = ep.clone().add(V3(0, 1.3, 0));
            const dir = V3(p.pos.x - from.x, (p.pos.y + 1) - from.y, p.pos.z - from.z).normalize();
            // gloam bolt (own mesh, checked against player only)
            const bolt = new THREE.Mesh(
              new THREE.SphereGeometry(0.18, 6, 5),
              new THREE.MeshBasicMaterial({ color: 0xc9a2ff })
            );
            bolt.position.copy(from);
            this.scene.add(bolt);
            this.enemyProjectiles.push({ pos: from.clone(), dir, life: 1.8, dmg: e.def.atk, mesh: bolt });
            AudioSys.sfx('slash');
          }
        } else if (e.stateT <= 0) {
          e.stateT = 2 + Math.random() * 2;
          ep.x += (Math.random() - 0.5) * 3; ep.z += (Math.random() - 0.5) * 3;
        }
      } else {
        // melee chase
        if (dist < 19 && (e.state === 'chase' || dist < 9)) {
          e.state = 'chase';
          if (dist > (e.def.radius + 1.1)) {
            const s = e.def.speed * speedMul * dt;
            ep.x += (dx / dist) * s; ep.z += (dz / dist) * s;
          } else if (e.atkCd <= 0) {
            e.atkCd = e.type === 'brute' ? 2.2 : 1.3;
            this.hurtPlayer(e.def.atk, ep);
          }
        } else if (e.stateT <= 0) {
          e.stateT = 2 + Math.random() * 3;
          e.wanderTarget = ep.clone().add(V3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        }
        if (e.state === 'idle' && e.wanderTarget && e.stateT > 0) {
          const wx = e.wanderTarget.x - ep.x, wz = e.wanderTarget.z - ep.z;
          const wd = Math.hypot(wx, wz);
          if (wd > 0.4) { ep.x += (wx / wd) * e.def.speed * 0.4 * dt; ep.z += (wz / wd) * e.def.speed * 0.4 * dt; }
        }
      }
      // face player
      if (e.state === 'chase') e.mesh.rotation.y = Math.atan2(dx, dz);
      // float bob
      const bobAmp = e.type === 'wisp' || e.type === 'shade' ? 0.5 : 0.12;
      e.mesh.position.y = Math.abs(Math.sin(this.time * 2.4 + e.mesh.id)) * bobAmp;
    }
    // enemy projectiles vs player
    if (!this.enemyProjectiles) this.enemyProjectiles = [];
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const pr = this.enemyProjectiles[i];
      pr.life -= dt;
      pr.pos.addScaledVector(pr.dir, 17 * dt);
      pr.mesh.position.copy(pr.pos);
      const d = Math.hypot(pr.pos.x - p.pos.x, pr.pos.z - p.pos.z);
      if (d < 1.1 && Math.abs(pr.pos.y - (p.pos.y + 1)) < 1.6) {
        this.hurtPlayer(pr.dmg, pr.pos);
        pr.life = 0;
      }
      if (pr.life <= 0) {
        this.scene.remove(pr.mesh);
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }
  updateProjectilesZones(dt) {
    this.projectiles.update(dt, this.enemies);
    const p = this.player;
    if (this.fireZone) {
      const fz = this.fireZone;
      fz.t -= dt; fz.tick -= dt;
      if (fz.tick <= 0) {
        fz.tick = 0.5;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.mesh.position.x - fz.x, e.mesh.position.z - fz.z) < fz.r) this.damageEnemy(e, fz.dps * 0.5, 'EMBER', e.mesh.position.clone().setY(1));
        }
      }
      if (fz.t <= 0) this.fireZone = null;
    }
    if (this.vortex) {
      const vz = this.vortex;
      vz.t -= dt; vz.tick -= dt;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = vz.x - e.mesh.position.x, dz = vz.z - e.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < vz.r && d > 0.5) {
          e.mesh.position.x += (dx / d) * 3.4 * dt;
          e.mesh.position.z += (dz / d) * 3.4 * dt;
        }
      }
      if (vz.tick <= 0) {
        vz.tick = 0.5;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.mesh.position.x - vz.x, e.mesh.position.z - vz.z) < vz.r) this.damageEnemy(e, vz.dps * 0.5, 'TIDE', e.mesh.position.clone().setY(1));
        }
      }
      if (vz.t <= 0) this.vortex = null;
    }
    if (this.hotField) {
      const hf = this.hotField;
      hf.t -= dt; hf.tick -= dt;
      const inside = Math.hypot(p.pos.x - hf.x, p.pos.z - hf.z) < hf.r;
      if (inside && hf.tick <= 0) {
        hf.tick = 1;
        this.healActive(0.06);
        this.particles.burst(p.pos.x, 1, p.pos.z, '#fff3cf', 4, 2, 2);
      }
      if (hf.t <= 0) this.hotField = null;
    }
  }
  updatePickupsNpcs(dt) {
    const p = this.player;
    // shard pickup
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.4 + Math.sin(this.time * 3 + pk.x) * 0.2;
      if (Math.hypot(p.pos.x - pk.x, p.pos.z - pk.z) < 1.8) {
        pk.taken = true;
        pk.mesh.visible = false;
        this.save.shards++;
        AudioSys.sfx('shard');
        this.hooks.onPickupText && this.hooks.onPickupText(pk.mesh.position, '☀ Sunshard', '#ffd76e');
        this.onQuestEvent('collect', 'sunshard');
      }
    }
    // vesperine reach check (ch4 step 1)
    const q = this.currentQuest();
    if (q && q.id === 'ch4' && this.save.quests.step === 0) {
      this.vesperineNpc.mesh.visible = true;
      if (Math.hypot(p.pos.x - 112, p.pos.z - 96) < 4 && !this.save.quests.counters.reach_vesperine) {
        this.startDialog([
          { who: 'vesperine', text: 'Well, well. The little thread walks right into my web.' },
          { who: 'vesperine', text: 'Tell me, Weaver — can you keep pace with fate? Prove it. Four Duskshades. Go.' },
        ], () => {
          this.onQuestEvent('reach', 'vesperine_spot');
        });
      }
    } else if (this.save.quests.current > 3) {
      this.vesperineNpc.mesh.visible = true;
    }
    // npc idle turn toward player when near
    for (const n of this.npcs) {
      if (!n.mesh.visible) continue;
      const dx = p.pos.x - n.mesh.position.x, dz = p.pos.z - n.mesh.position.z;
      if (Math.hypot(dx, dz) < 6) n.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }
  updateCamera(dt) {
    const p = this.player;
    const pivot = this._tmpV.set(p.pos.x, p.pos.y + 1.7, p.pos.z);
    const elev = Math.max(-0.5, Math.min(1.05, this.pitch));
    const dist = 7.2;
    const cx = pivot.x + Math.sin(this.yaw) * Math.cos(elev) * dist;
    const cy = pivot.y + Math.sin(elev) * dist + 0.6;
    const cz = pivot.z + Math.cos(this.yaw) * Math.cos(elev) * dist;
    this.camera.position.lerp(V3(cx, cy, cz), 1 - Math.pow(0.0001, dt));
    this.camera.lookAt(pivot);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
  }
}
