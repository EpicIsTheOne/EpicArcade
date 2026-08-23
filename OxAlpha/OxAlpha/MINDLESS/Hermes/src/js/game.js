// MINDLESS-Hermes :: game.js — orchestrator: boot, menu, intro, play, pause, results
"use strict";

const RunManager = {
  reset(stageDef) {
    this.stageId = stageDef.id;
    this.stageName = stageDef.name;
    this.competitive = !["combat_training", "resistance_tutorial"].includes(stageDef.id);
    this.elapsedSeconds = 0;
    this.rescueCount = 0;
    this.running = this.competitive;
  },
};

class Game {
  static W = 240;   // native pixel resolution (original viewport)
  static H = 135;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.state = "boot";           // boot|menu|intro|play|pause|results|gameover|campaign_end
    this.time = 0;
    this.menuIdx = 0;
    this.intro = null;
    this.world = null;
    this.stageKey = null;
    this.bossActive = false;
    this.cameraLocked = false;
    this.hitstop = 0;
    this.lastGrade = null; this.lastGradeTime = 0;
    this.beatFlashT = 0;
    this.storySeenThisRun = new Set();
    this.pendingStoryAfterDialogue = null;
    this.tutorialStep = -1;
    this.tutorialSteps = ["move", "jump", "attack", "jumpkick", "swap", "beat"];
    this.tutorialDone = false;
    this.menuMusicStarted = false;
    this.results = null;
    this.campaignSummary = null;
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0; this._fpsT = 0;
    this.qaAutopilot = null;
  }

  boot() {
    // QA graphics modes: ?qa=1 (reduced), ?gfx=low|med|high|ultra
    const qs = new URLSearchParams(location.search);
    Game.qaMode = qs.get("qa") === "1" || qs.get("qa") === "true";
    const gfx = qs.get("gfx");
    if (Game.qaMode) Game.graphicsLevel = "low";
    else Game.graphicsLevel = gfx || "ultra";
    if (qs.get("autopilot") === "1") this.autopilotQueued = true;
    if (qs.get("skipintro") === "1") this.skipIntroQueued = true;
    this.godMode = qs.get("god") === "1";

    SaveData.load();
    this.ctx0 = new (window.AudioContext || window.webkitAudioContext)();
    this.audio = {
      ctx: this.ctx0,
      musicGain: this.ctx0.createGain(),
      sfxGain: this.ctx0.createGain(),
    };
    this.audio.musicGain.connect(this.ctx0.destination);
    this.audio.sfxGain.connect(this.ctx0.destination);
    this.audio.musicGain.gain.value = SaveData.data.settings.musicVol;
    this.audio.sfxGain.gain.value = SaveData.data.settings.sfxVol;
    // convenience wrappers
    this.audio.play = (key, opts) => this.sound.play(key, opts);
    this.audio.stopSongs = (s) => this.beat.stopSongs(s);
    this.sound = new SoundManager(this.audio);
    this.sound.init(this.ctx0, this.audio.sfxGain);
    this.beat = new BeatManager({ ctx: this.ctx0, musicGain: this.audio.musicGain });
    this.beat.onBeat(idx => this.onBeat(idx));
    this.beat.onGrade((grade) => { this.lastGrade = grade; this.lastGradeTime = performance.now(); });
    this.ui = new UI(this);

    Assets.loadAll(
      (n, total) => { this.bootProgress = n / total; },
      null
    );
    Assets.loadAudio(this.audio, Object.keys(Assets.AUDIO_MANIFEST),
      (n, total) => { this.bootProgress = 0.5 + 0.5 * n / total; },
      () => this.finishBoot());
  }

  finishBoot() {
    this.sound.init(this.ctx0, this.audio.sfxGain);
    this.state = "menu";
    this.playMenuMusic();
    if (this.skipIntroQueued || this.autopilotQueued) {
      // QA fast path
      this.menuIdx = 0;
      this.startIntro();
      this.intro.t = 99; this.intro.chars = 999;   // allow instant skip
    }
    if (this.autopilotQueued) {
      this.installAutopilot();
    }
    window.MINDLESS_QA = this.buildQaApi();
  }

  // ---------- QA / headless automation ----------
  buildQaApi() {
    const g = this;
    if (!this.qaEvents) this.qaEvents = [];
    this.logEvent = (msg) => { this.qaEvents.push({ t: +this.beat.getHeardSongPositionSec().toFixed(2), msg }); if (this.qaEvents.length > 120) this.qaEvents.shift(); };
    return {
      events: () => (g.qaEvents || []).slice(-40),
      // state introspection
      state: () => g.state,
      stage: () => g.stageKey,
      player: () => {
        if (!g.world) return null;
        const p = g.world.player;
        return { x: +p.x.toFixed(2), y: p.y, height: +p.height.toFixed(2), vx: +p.vx.toFixed(2), heading: p.heading,
                 state: p.state, twin: p.twin, hp: p.currentHealth, maxHp: p.maxHealth, rage: Math.round(p.rage), rageState: p.rageState, novaMode: p.novaMode };
      },
      enemies: () => (g.world ? g.world.enemies.filter(e => !e.dead).map(e => ({ x: +e.x.toFixed(1), hp: e.currentHealth, type: e.type, boss: !!e.isBoss, state: e.state })) : []),
      projectiles: () => (g.world ? g.world.projectiles.length : 0),
      boss: () => {
        const b = g.world && g.world.enemies.find(e => e.isBoss && !e.dead);
        return b ? { type: b.bossType, hp: b.currentHealth, maxHp: b.maxHealth, phase: b.phase, phaseHits: b.phaseHits, vulnerable: !b.invulnerable, x: +b.x.toFixed(1) } : null;
      },
      beat: () => ({ bpm: g.beat.bpm, pos: +g.beat.getHeardSongPositionSec().toFixed(3), running: g.beat.running,
                     nearestGrade: g.beat.getBeatResult().grade, secPerBeat: g.beat.secPerBeat }),
      camX: () => (g.world ? +g.world.camX.toFixed(2) : 0),
      checkpoint: () => (g.world ? g.world.checkpoints.map(c => ({ x: c.x, activated: c.activated, cleared: c.cleared })) : []),
      fps: () => g.fps,
      dialogueOpen: () => !!g.ui.dialogue,
      // controls
      press: (code, holdMs = 80) => {
        Input.down.add(code); Input.tap(code);
        setTimeout(() => Input.down.delete(code), holdMs);
      },
      keyDown: (code) => Input.down.add(code),
      keyUp: (code) => Input.down.delete(code),
      // flow control
      advanceDialogue: () => { if (g.ui.dialogue) g.ui.advanceDialogue(); },
      skipDialogue: () => { const d = g.ui.dialogue; if (d) { g.ui.dialogue = null; d.onDone && d.onDone(); } },
      startNewGame: () => { g.menuIdx = 0; g.startIntro(); g.intro.t = 99; g.intro.chars = 999; g.finishIntro(); },
      showIntro: () => { g.stopMenuMusic(); g.state = "intro"; g.intro = { slide: 0, line: 0, chars: 0, t: 0, wait: 0, musicStarted: true }; },
      introState: () => g.intro ? { slide: g.intro.slide, line: g.intro.line } : null,
      introNext: () => {
        const n = g.intro; if (!n) return;
        n.line++; n.t = 0; n.wait = 0; n.chars = 0;
        if (n.slide >= INTRO_SLIDES.length) return;
        if (n.line >= INTRO_SLIDES[n.slide].lines.length) { n.slide++; n.line = 0; }
        if (n.slide >= INTRO_SLIDES.length) { g.finishIntro(); }
      },
      loadStage: (key) => g.loadStage(key),
      // beat sync measurement: sample drift between audio clock and beat grid
      beatDriftProbe: (ms = 2000) => new Promise(res => {
        const samples = [];
        const t0 = performance.now();
        const iv = setInterval(() => {
          const r = g.beat.getBeatResult();
          samples.push(r.delta);
          if (performance.now() - t0 > ms) { clearInterval(iv); res(samples); }
        }, 50);
      }),
    };
  }

  installAutopilot() {
    // Scripted gameplay driver for headless QA: walks right, attacks, swaps,
    // jumps, dodges — enough to traverse a stage without human input.
    const g = this;
    let phase = "wait", phaseT = 0, dialogueGuard = 0, autoT = 0, stepT = 0;
    this.qaAutopilot = (dt) => {
      // flow screens: advance results / campaign end
      if (g.state === "results" || g.state === "campaign_end") {
        autoT += dt;
        if (autoT > 2.2) { autoT = 0; Input.tap("Enter"); }
        return;
      }
      if (g.state !== "play") return;
      phaseT += dt;
      if (g.ui.dialogue) {
        dialogueGuard += dt;
        if (dialogueGuard > 0.4) { dialogueGuard = 0; g.ui.advanceDialogue(); }
        return;
      }
      dialogueGuard = 0;
      const p = g.world.player;
      const enemies = g.world.enemies.filter(e => !e.dead);
      let near = null, nearDist = Infinity;
      for (const e of enemies) { const d = Math.abs(e.x - p.x); if (d < nearDist) { nearDist = d; near = e; } }
      if (nearDist >= 60) near = null;
      // tutorial steps take priority in training (enemies there are sparse)
      if (g.tutorialStep >= 0 && !g.tutorialDone) {
        stepT += dt;
        if (stepT > 0.5 && ![2, 6].includes(p.state)) {
          stepT = 0;
          const step = g.tutorialSteps[g.tutorialStep];
          if (step === "move") { Input.down.add("KeyD"); Input.down.delete("KeyA"); }
          else if (step === "jump" && p.twin === "ecliptio") Input.tap("KeyX");
          else if (step === "attack") Input.tap("KeyC");
          else if (step === "jumpkick" && p.twin === "ecliptio") {
            if (p.state === 0 || p.state === 1) Input.tap("KeyX");
            else if (p.state === 4) Input.tap("KeyC");
          }
          else if (step === "swap") Input.tap("KeyE");
          else if (step === "beat" && p.twin === "nova") Input.tap("KeyC");
          else if (p.twin === "nova") Input.tap("KeyC");
        }
        return;
      }
      // simple behavior loop
      if (p.state === State.ATTACK || p.state === State.JUMPKICK || p.state === State.HURT) return;
      if (near) {
        const gap = Math.abs(near.x - p.x);
        if (gap > 18) {
          // out of melee reach: close in (don't whiff)
          Input.down.add(near.x > p.x ? "KeyD" : "KeyA");
          Input.down.delete(near.x > p.x ? "KeyA" : "KeyD");
        } else {
          // in range: face the target before swinging
          const wantRight = near.x > p.x;
          if ((p.heading === 1) !== wantRight) {
            Input.down.add(wantRight ? "KeyD" : "KeyA");
            Input.down.delete(wantRight ? "KeyA" : "KeyD");
            if (phaseT > 0.12) { phaseT = 0; Input.tap("KeyC"); }
          } else {
            Input.down.delete("KeyA"); Input.down.delete("KeyD");
            if (phaseT > 0.25) { phaseT = 0; Input.tap("KeyC"); }
          }
        }
      } else {
        // navigation: prefer walking right; if pinned by the right arena wall, turn around
        // and deal with anything behind us (or re-position left to let spawns come)
        const atRightWall = g.world.wallsR !== null && p.x > g.world.wallsR - 14;
        const anyEnemy = enemies.length > 0;
        if (atRightWall && anyEnemy) {
          // enemy is behind (we passed it): walk back toward it
          Input.down.add("KeyA"); Input.down.delete("KeyD");
          if (near && Math.abs(near.x - p.x) <= 18 && phaseT > 0.25) { phaseT = 0; Input.tap("KeyC"); }
        } else if (atRightWall) {
          Input.down.delete("KeyD"); Input.down.add("KeyA");
        } else {
          Input.down.add("KeyD"); Input.down.delete("KeyA");
        }
        if (phaseT > 2.2) {
          phaseT = 0;
          // finish tutorial steps deterministically while in training
          if (g.tutorialStep >= 0 && !g.tutorialDone) {
            const step = g.tutorialSteps[g.tutorialStep];
            Input.down.delete("KeyA");
            if (step === "move") { /* walking handles it */ }
            else if (step === "jump" && p.twin === "ecliptio") Input.tap("KeyX");
            else if (step === "attack") Input.tap("KeyC");
            else if (step === "jumpkick" && p.twin === "ecliptio") {
              if (p.state === 0 || p.state === 1) {           // idle/walk -> takeoff
                Input.tap("KeyX");
              } else if (p.state === 4) {                     // JUMP -> kick
                Input.tap("KeyC");
              }
            }
            else if (step === "swap") Input.tap("KeyE");
            else if (step === "beat" && p.twin === "nova") {
              // tap C repeatedly to catch a beat window
              Input.tap("KeyC");
            } else if (p.twin === "nova") Input.tap("KeyC");
          } else {
            const roll = Math.random();
            if (roll < 0.35) Input.tap("KeyE");
            else if (roll < 0.65) Input.tap("KeyX");
            else if (p.twin === "nova") Input.tap("KeyC");
          }
        }
      }
      // boss: attack only when something is actually in reach (spamming C mid-air locks
      // the player into ATTACK loops and freezes all movement)
      const boss = enemies.find(e => e.isBoss);
      const bossReachable = boss && !boss.invulnerable &&
        Math.abs(boss.x - p.x) < 26 && (boss.height === undefined || boss.height < 14);
      const minionReachable = near !== null;
      if ((bossReachable || minionReachable) && phaseT > 0.25) { phaseT = 0; Input.tap("KeyC"); }
      // vs boss: minions take priority (Angelica's wave is her shield); punish her when
      // she descends and nothing else threatens
      if (boss && enemies.filter(e => !e.isBoss).length === 0) {
        const dx = boss.x - p.x;
        const reachable = !boss.invulnerable && (boss.height === undefined || boss.height < 14);
        if (p.twin === "nova") {
          // Nova duels from range: hold 90-140px and fire on the beat
          if (Math.abs(dx) < 70) { Input.down.add(dx > 0 ? "KeyA" : "KeyD"); Input.down.delete(dx > 0 ? "KeyD" : "KeyA"); }
          else {
            Input.down.delete("KeyA"); Input.down.delete("KeyD");
            // face the boss and shoot
            const wantRight = dx > 0;
            if ((p.heading === 1) !== wantRight) { Input.down.add(wantRight ? "KeyD" : "KeyA"); Input.down.delete(wantRight ? "KeyA" : "KeyD"); }
            if (phaseT > 0.3) { phaseT = 0; Input.tap("KeyC"); }
          }
        } else if (reachable && Math.abs(dx) < 26) {
          Input.down.delete("KeyA"); Input.down.delete("KeyD");
          if (phaseT > 0.25) { phaseT = 0; Input.tap("KeyC"); }
        } else if (!boss.invulnerable && Math.abs(dx) > 26) {
          Input.down.add(dx > 0 ? "KeyD" : "KeyA"); Input.down.delete(dx > 0 ? "KeyA" : "KeyD");
        } else {
          if (Math.abs(dx) < 70) { Input.down.add(dx > 0 ? "KeyA" : "KeyD"); Input.down.delete(dx > 0 ? "KeyD" : "KeyA"); }
          else { Input.down.delete("KeyA"); Input.down.delete("KeyD"); }
        }
      }
      // dodge incoming shockwaves: jump when one is near
      const wave = (g.world.projectiles || []).find(pr => pr.constructor && pr.constructor.name === "Shockwave");
      if (wave && Math.abs(wave.x - p.x) < 34 && p.height <= 0 && p.twin === "ecliptio") {
        Input.tap("KeyX");
      }
    };
  }

  playMenuMusic() {
    if (this.menuMusicStarted) return;
    this.menuMusicStarted = true;
    const buf = Assets.audio.mus_menu;
    if (!buf) return;
    const src = this.ctx0.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(this.audio.musicGain);
    src.start();
    this.menuSrc = src;
  }
  stopMenuMusic() {
    if (this.menuSrc) { try { this.menuSrc.stop(); } catch (e) {} this.menuSrc = null; this.menuMusicStarted = false; }
  }

  // ============ flow ============
  startIntro() {
    this.stopMenuMusic();
    this.state = "intro";
    this.intro = { slide: 0, line: 0, chars: 0, t: 0, wait: 0, musicStarted: false };
    SaveData.data.seen_intro = true; SaveData.save();
  }

  beginCampaign(fromMenu) {
    this.stopMenuMusic();
    this.campaignIndex = 0;
    this.loadStage("training");
  }

  continueCampaign() {
    // start at first stage without a best time (simple progress)
    let idx = 0;
    for (let i = 0; i < CAMPAIGN.length; i++) {
      const def = STAGE_DEFS[CAMPAIGN[i]];
      if (SaveData.data.best_times[def.id] !== undefined) idx = i + 1;
    }
    this.campaignIndex = Math.min(idx, CAMPAIGN.length - 1);
    this.stopMenuMusic();
    this.loadStage(CAMPAIGN[this.campaignIndex]);
  }

  loadStage(key) {
    this.stageKey = key;
    const def = STAGE_DEFS[key];
    RunManager.reset(def);
    this.run = RunManager;
    this.world = new World(def, this);
    if (this.godMode) { this.world.player.maxHealth = 9999; this.world.player.setHealth(9999); }
    this.state = "play";
    this.bossActive = false;
    this.cameraLocked = false;
    this.ui.tutorialText = null;
    this.ui.enemyBarTimer = 0;
    this.ui.dialogue = null;
    this.tutorialStep = -1;
    this.tutorialDone = def.id === "combat_training" ? false : true;
    this.storySeenThisRun.clear();
    this.startStageMusic(def);
    this.ui.showBanner(def.name, def.bpm + " BPM");
    // stage opening story
    if (def.story && def.story.opening) this.queueStory("opening");
    if (def.id === "combat_training") this.advanceTutorial("start");
  }

  startStageMusic(def) {
    const track = Assets.audio[def.music];
    const met = Assets.audio[def.metronome];
    this.beat.setBpm(def.bpm);
    if (track) this.beat.startSongs(track, met || null, 0);
    this.beat.setMetronomeMuted(true);
  }

  startBossEncounter(cp) {
    const boss = this.world.spawnBoss(cp.spec.boss);
    this.bossActive = true;
    this.cameraLocked = true;
    this.world.wallsL = Math.max(this.world.wallsL, cp.x - 120);
    this.world.wallsR = Math.min(this.world.length - 4, cp.x + 236);
    // boss music + bpm (authentic map)
    const musicMap = {
      evangeline: ["mus_evangeline", 104],
      eden: ["mus_eden", 144],
      angelica: ["mus_angelica", 140],
    };
    const [musKey, bpm] = musicMap[cp.spec.boss];
    this.beat.setBpm(bpm);
    this.beat.startSongs(Assets.audio[musKey], null, 0);
    // full heal (authentic reset_healh)
    const p = this.world.player;
    p.setHealth(p.maxHealth);
    // pre-boss exchange
    const def = STAGE_DEFS[this.stageKey];
    if (def.story && def.story.boss) this.queueStory("boss");
    this.ui.enemyBar = { name: boss.constructor.name.replace("Boss", "").toUpperCase() === "EVANGELINE" ? "EVANGELINE" : boss.bossType === Type.EDEN ? "EDEN" : boss.bossType === Type.ANGELICA ? "ANGELICA" : "EVANGELINE", cur: boss.currentHealth, max: boss.maxHealth, type: boss.bossType };
    this.ui.enemyBarTimer = 999999;
  }

  onBeat(idx) {
    // drive beat-gated bosses
    if (!this.world) return;
    for (const e of this.world.enemies) {
      if (e.isBoss && !e.dead && e.state !== State.DEATH) {
        e.onBeatGate(idx);
      }
    }
    // visual pulse
    this.beatFlashT = 0.12;
    // tutorial beat step
    if (this.tutorialStep === 5) {
      // any graded action completes it (handled in onNovaShot)
    }
  }

  onTwinSwapped(twin) {
    this.beat.setMetronomeMuted(twin !== "nova");   // authentic: Nova hears the metronome
    this.audio.play("click", { pitch: twin === "nova" ? 1.4 : 1.0, volume: 0.5 });
    this.ui.spawnGradePop(this.world.player.x, this.world.player.y - 34, twin === "nova" ? "NOVA" : "ECLIPTIO", twin === "nova" ? "#7dffcf" : "#ff6a72");
    if (this.tutorialStep === 4) this.advanceTutorial("swap");
  }

  onNovaShot(grade) {
    if (this.tutorialStep === 5 && this.tutorialSteps[this.tutorialStep] === "beat" && grade <= BeatGrade.OKAY) this.advanceTutorial("beat");
    const names = ["PERFECT!", "GOOD!", "OKAY", "MISS"];
    const cols = ["#ffd24a", "#7dff8f", "#7ab4ff", "#8890a0"];
    this.ui.spawnGradePop(this.world.player.x, this.world.player.y - 40, names[grade], cols[grade]);
    if (grade === BeatGrade.PERFECT) this.world.sparkBurst(this.world.player.x, this.world.player.y - 20, "#ffd24a", 5);
  }

  onNovaHit(note, enemy, landed) {
    this.audio.play(landed ? "hit2" : "miss", { pitch: U.rand(0.95, 1.2), volume: 0.5 });
    this.world.hitSpark(enemy.x, enemy.y - enemy.height - 12, U.sign(note.vx) || 1, note.grade === BeatGrade.PERFECT);
    if (enemy.isBoss) this.ui.enemyBar.cur = enemy.currentHealth;
  }

  onMeleeHit(player, enemy, dmg, hitType, isFinisher) {
    this.audio.play(isFinisher ? "powermove" : "hit1", { pitch: U.rand(0.9, 1.15), volume: 0.7 });
    this.world.hitSpark(enemy.x + (player.heading * -4), enemy.y - enemy.height - 13, player.heading, isFinisher);
    if (isFinisher) { this.world.shake(2.5, 0.14); this.hitstop = 0.05; }
    else this.hitstop = 0.028;
    if (enemy.isBoss) this.ui.enemyBar.cur = enemy.currentHealth;
    player.addRage(isFinisher ? 14 : 6);
    if (this.tutorialStep === 2) this.advanceTutorial("attack");
  }

  onPlayerHit() {
    this.world.shake(2, 0.12);
    this.hitstop = 0.03;
  }

  onHeavyBlow(ent) {
    this.world.shake(2.5, 0.15);
  }

  onEnemyDeath(e) {
    this.world.sparkBurst(e.x, e.y - 10, "#ff5060", 8);
    this.world.sparkBurst(e.x, e.y - 10, "#ffd24a", 5);
    this.audio.play("grunt", { pitch: 0.7, volume: 0.6 });
    // rage gain for kills
    this.world.player.addRage(8);
    // free the checkpoint slot so trickle spawns continue (original can_spawn_enemies flow)
    const cp = this.world.activeCheckpoint;
    if (cp && !cp.cleared) cp.liveCount = Math.max(0, cp.liveCount - 1);
  }

  onBossHit(boss, amount) {
    this.audio.play("hit2", { pitch: 1.2, volume: 0.7 });
    this.world.hitSpark(boss.x, boss.y - boss.height - 14, 0, true);
    this.ui.enemyBar.cur = boss.currentHealth;
    this.logEvent && this.logEvent(`HIT ${boss.bossType} hp=${boss.currentHealth} ph=${boss.phase} phaseHits=${boss.phaseHits}`);
  }

  onBossPhase(boss) {
    this.logEvent && this.logEvent(`PHASE ${boss.phase}`);
    this.ui.toast("PHASE " + boss.phase, "#b46aff");
    this.world.shake(3, 0.25);
    this.audio.play("powermove", { pitch: 0.6, volume: 0.7 });
  }

  onBossVulnerable(boss) {
    this.logEvent && this.logEvent(`WINDOW OPEN ${boss.bossType}`);
    this.ui.toast("VULNERABLE!", "#7dff8f");
    this.audio.play("gogogo", { volume: 0.5 });
  }

  onBossDying(boss) {
    this.world.shake(4, 0.5);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.world && this.world.sparkBurst(boss.x + U.rand(-14, 14), boss.y - U.rand(0, 30), "#ffd24a", 8), i * 130);
    }
  }

  onBossDeath(boss) {
    this.bossActive = false;
    this.ui.enemyBarTimer = 0;
    this.cameraLocked = false;
    this.world.wallsR = null;
    this.world.wallsL = 0;
    // clear remaining minions + projectiles
    for (const e of this.world.enemies) if (!e.isBoss) e.receiveDamage(999, 1, HitType.KNOCKDOWN, 100, "boss_death");
    this.world.projectiles.length = 0;
    // complete the boss checkpoint
    const cp = this.world.checkpoints.find(c => c.spec.boss && c.activated && !c.cleared);
    if (cp) this.world.completeCheckpoint(cp);
  }

  onAngelicaWave(boss) {
    // spawn 3 random enemies (original spawn_enemy_wave)
    const kinds = ["basic", "dasher", "elite"];
    for (let i = 0; i < 3; i++) {
      const e = this.world.spawnEnemy(U.pick(kinds), this.world.camX + Game.W + 10 + i * 14);
      e.x = U.clamp(e.x, this.world.wallsL + 12, this.world.wallsR - 12);
    }
    this.angelicaBoss = boss;
    // watch for wave clear (dead minions are gone even if their corpses remain in the array)
    let checks = 0;
    const check = setInterval(() => {
      if (this.state !== "play" || !this.world || boss.dead) { clearInterval(check); return; }
      checks++;
      const live = this.world.enemies.filter(e => !e.isBoss && !e.dead && e.currentHealth > 0 && e.state !== State.DEATH);
      if ((live.length === 0 || checks > 90) && boss.spawningWave) {   // 36s failsafe
        clearInterval(check);
        boss.onWaveCleared();
      }
    }, 400);
  }

  onCheckpointStart(cp) {
    this.cameraLocked = true;
    this.audio.play("click", { pitch: 0.7, volume: 0.4 });
    const def = STAGE_DEFS[this.stageKey];
    if (def.story && def.story.checkpoint && !this.storySeenThisRun.has("checkpoint" + cp.idx)) {
      this.storySeenThisRun.add("checkpoint" + cp.idx);
      this.queueStory("checkpoint");
    }
  }

  onCheckpointComplete(cp) {
    this.ui.onward = 2.2;
    this.audio.play("gogogo", { volume: 0.6 });
    this.cameraLocked = false;
    this.world.slots.reset();
    const def = STAGE_DEFS[this.stageKey];
    const isLast = cp.idx === this.world.checkpoints.length - 1;
    if (isLast) this.completeStage();
  }

  queueStory(which) {
    const def = STAGE_DEFS[this.stageKey];
    const lines = def.story && def.story[which];
    if (!lines) return;
    const key = this.stageKey + ":" + which;
    const repeat = SaveData.data.viewed_story.includes(key);
    if (repeat && which !== "boss") return;      // skip repeats except boss exchanges
    if (!SaveData.data.viewed_story.includes(key)) {
      SaveData.data.viewed_story.push(key);
      SaveData.save();
    }
    this.run && (this.run.running = false);
    this.ui.startDialogue(lines, () => {
      this.run && (this.run.running = this.run.competitive);
      const after = this.pendingStoryAfterDialogue;
      this.pendingStoryAfterDialogue = null;
      if (after) after();
    });
  }

  completeStage() {
    const def = STAGE_DEFS[this.stageKey];
    this.run.running = false;
    // save best time
    const prev = SaveData.data.best_times[def.id];
    const isNewBest = this.run.competitive && (prev === undefined || this.run.elapsedSeconds < prev);
    if (isNewBest) SaveData.data.best_times[def.id] = this.run.elapsedSeconds;
    if (this.campaignIndex === CAMPAIGN.length - 1) SaveData.data.campaign_complete = true;
    SaveData.save();
    if (def.story && def.story.completion) {
      this.pendingStoryAfterDialogue = () => this.showResults(isNewBest, prev);
      this.queueStory("completion");
    } else {
      this.showResults(isNewBest, prev);
    }
  }

  showResults(isNewBest, prev) {
    this.state = "results";
    this.results = { isNewBest, prev, def: STAGE_DEFS[this.stageKey] };
  }

  onPlayerDown() {
    SaveData.data.rescue_total = (SaveData.data.rescue_total || 0) + 1;
    SaveData.save();
  }

  onRescueComplete() {
    // restart stage (original restarts level; timer resets via RunManager)
    this.loadStage(this.stageKey);
  }

  advanceTutorial(action) {
    if (this.tutorialDone) return;
    if (action === "start") { this.tutorialStep = 0; this.ui.startTutorialPrompt(0); return; }
    const need = this.tutorialSteps[this.tutorialStep];
    const map = { move: "move", jump: "jump", attack: "attack", jumpkick: "jumpkick", swap: "swap", beat: "beat" };
    if (map[action] !== need) return;
    this.tutorialStep++;
    if (this.tutorialStep >= this.tutorialSteps.length) {
      this.tutorialDone = true;
      this.tutorialStep = -1;
      this.ui.clearTutorialPrompt();
      this.ui.toast("TRAINING COMPLETE", "#7dff8f");
      // auto-advance to next stage after a beat
      setTimeout(() => {
        if (this.state === "play" && this.stageKey === "training") this.completeStage();
      }, 1200);
    } else {
      this.ui.startTutorialPrompt(this.tutorialStep);
    }
  }

  tutorialTick() {
    if (this.tutorialDone || this.tutorialStep < 0) return;
    const p = this.world.player;
    const need = this.tutorialSteps[this.tutorialStep];
    if (need === "move" && Math.abs(p.vx) > 1) this.advanceTutorial("move");
    else if (need === "jump" && p.state === State.TAKEOFF) this.advanceTutorial("jump");
    else if (need === "jumpkick" && p.state === State.JUMPKICK) this.advanceTutorial("jumpkick");
    else if (need === "swap" && p.twin === "nova") { /* handled in onTwinSwapped */ }
  }

  togglePause() {
    if (this.state === "play") {
      this.state = "pause";
      this.beat.pause();
      this.pauseIdx = 0;
      const buf = Assets.audio.mus_pause;
      if (buf) {
        const src = this.ctx0.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(this.audio.musicGain);
        src.start();
        this.pauseSrc = src;
      }
    } else if (this.state === "pause") {
      this.state = "play";
      this.beat.resume();
      if (this.pauseSrc) { try { this.pauseSrc.stop(); } catch (e) {} this.pauseSrc = null; }
    }
  }

  // ============ main loop ============
  loop(ts) {
    requestAnimationFrame(t => this.loop(t));
    const dtRaw = Math.min((ts - (this._lastTs || ts)) / 1000, 0.05);
    this._lastTs = ts;
    this.time += dtRaw;
    this._fpsAcc += dtRaw; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    Input.beginFrame();

    // QA autopilot injects input BEFORE the frame consumes it
    if (this.qaAutopilot) this.qaAutopilot(dtRaw);

    // hitstop (global freeze for impact)
    let dt = dtRaw;
    if (this.hitstop > 0) { this.hitstop -= dtRaw; dt = 0; }

    switch (this.state) {
      case "boot": this.drawBoot(ctx); break;
      case "menu": this.updateMenu(dtRaw); this.drawMenu(ctx); break;
      case "intro": this.updateIntro(dtRaw); this.drawIntro(ctx); break;
      case "play": this.updatePlay(dt, dtRaw); this.drawPlay(ctx); break;
      case "pause": this.drawPlay(ctx); this.drawPause(ctx); break;
      case "results": this.drawPlay(ctx); this.drawResults(ctx); break;
      case "campaign_end": this.drawCampaignEnd(ctx); break;
    }

    Input.endFrame();
  }

  // ============ states ============
  drawBoot(ctx) {
    ctx.fillStyle = "#0a0a12"; ctx.fillRect(0, 0, Game.W, Game.H);
    ctx.fillStyle = "#8f96a8";
    ctx.font = "6px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    const dots = ".".repeat(1 + Math.floor(this.time * 2) % 3);
    ctx.fillText("LOADING MINDLESS" + dots, Game.W / 2, Game.H / 2);
    if (this.bootProgress !== undefined) {
      ctx.fillStyle = "#3ce088";
      ctx.fillRect(Game.W / 2 - 40, Game.H / 2 + 10, 80 * this.bootProgress, 3);
      ctx.strokeStyle = "#3a3f52";
      ctx.strokeRect(Game.W / 2 - 40.5, Game.H / 2 + 10.5, 80, 3);
    }
    ctx.textAlign = "left";
  }

  updateMenu(dt) {
    if (Input.justPressed("KeyW") || Input.justPressed("ArrowUp")) { this.menuIdx = (this.menuIdx + 3) % 4; this.audio.play("click", { volume: 0.4 }); }
    if (Input.justPressed("KeyS") || Input.justPressed("ArrowDown")) { this.menuIdx = (this.menuIdx + 1) % 4; this.audio.play("click", { volume: 0.4 }); }
    if (Input.enterPressed() || Input.attackPressed()) this.menuSelect();
  }

  menuSelect() {
    this.audio.play("click", { pitch: 1.3 });
    switch (this.menuIdx) {
      case 0: this.startIntro(); break;
      case 1: this.continueCampaign(); break;
      case 2: this.beginCampaign(true); break;   // stage select = training quick start
      case 3: this.openSettings = !this.openSettings; break;
    }
  }

  drawMenu(ctx) {
    const t = this.time;
    // animated backdrop: city + logo (authentic intro vibe)
    const g = ctx.createLinearGradient(0, 0, 0, Game.H);
    g.addColorStop(0, "#0d0a18"); g.addColorStop(0.6, "#1c1230"); g.addColorStop(1, "#0a0810");
    ctx.fillStyle = g; ctx.fillRect(0, 0, Game.W, Game.H);
    if (Assets.images.city_back) {
      const back = Assets.images.city_back;
      const bw = 150;
      ctx.globalAlpha = 0.55;
      for (let x = -((t * 4) % bw) - bw; x < Game.W + bw; x += bw) {
        ctx.drawImage(back, x, Game.H - 78, bw, bw * (back.height / back.width));
      }
      ctx.globalAlpha = 1;
    }
    // scanlines
    if (!Game.qaMode && Game.graphicsLevel !== "low") {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < Game.H; y += 3) ctx.fillRect(0, y, Game.W, 1);
    }
    // logo (compact, clear of the menu)
    const logo = Assets.images.logo;
    if (logo) {
      const lw = 74, lh = lw * (logo.height / logo.width);
      const bob = Math.sin(t * 1.4) * 1.5;
      ctx.drawImage(logo, Game.W / 2 - lw / 2, 10 + bob, lw, lh);
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = "14px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("MINDLESS", Game.W / 2, 30);
      ctx.textAlign = "left";
    }
    // menu on its own dark panel for readability
    const items = ["NEW GAME", "CONTINUE", "QUICK PLAY", "SETTINGS"];
    this.ui.drawPanel(ctx, Game.W / 2 - 46, 62, 92, 50, 0.72);
    ctx.font = "6px 'Press Start 2P', monospace";
    items.forEach((it, i) => {
      const y = 74 + i * 11;
      const sel = i === this.menuIdx;
      ctx.fillStyle = sel ? "#ffd24a" : "#aeb6c8";
      ctx.textAlign = "center";
      if (sel) { ctx.fillStyle = "#3a3416"; ctx.fillRect(Game.W / 2 - 42, y - 7, 84, 9); ctx.fillStyle = "#ffd24a"; }
      ctx.fillText((sel ? "> " : "") + it, Game.W / 2, y);
    });
    ctx.textAlign = "left";
    ctx.font = "4px 'Press Start 2P', monospace";
    ctx.fillStyle = "#555c6b";
    ctx.fillText("A KONTRAŬ MENSO PRODUCTION — RECREATION BUILD", 4, Game.H - 6);
    if (this.openSettings) this.drawSettings(ctx);
  }

  drawSettings(ctx) {
    const s = SaveData.data.settings;
    const w = 130, h = 46;
    const x = Game.W / 2 - w / 2, y = 40;
    this.ui.drawPanel(ctx, x, y, w, h, 0.92);
    ctx.font = "5px 'Press Start 2P', monospace";
    ctx.fillStyle = "#e8ecf4";
    ctx.fillText("SETTINGS", x + 6, y + 6);
    ctx.fillStyle = "#8f96a8";
    ctx.fillText(`MUSIC VOL: ${Math.round(s.musicVol * 100)}%  (Q/E)`, x + 6, y + 16);
    ctx.fillText(`SFX VOL:   ${Math.round(s.sfxVol * 100)}%  (Z/X)`, x + 6, y + 24);
    ctx.fillText(`REDUCED FLASH: ${s.reducedFlash ? "ON" : "OFF"} (F)`, x + 6, y + 32);
    ctx.fillStyle = "#555c6b";
    ctx.fillText("ESC TO CLOSE", x + 6, y + 40);
    if (Input.justPressed("KeyQ")) { s.musicVol = U.clamp(s.musicVol - 0.1, 0, 1); this.audio.musicGain.gain.value = s.musicVol; SaveData.save(); }
    if (Input.justPressed("KeyR")) { s.musicVol = U.clamp(s.musicVol + 0.1, 0, 1); this.audio.musicGain.gain.value = s.musicVol; SaveData.save(); }
    if (Input.justPressed("KeyZ")) { s.sfxVol = U.clamp(s.sfxVol - 0.1, 0, 1); this.audio.sfxGain.gain.value = s.sfxVol; SaveData.save(); }
    if (Input.justPressed("KeyV")) { s.sfxVol = U.clamp(s.sfxVol + 0.1, 0, 1); this.audio.sfxGain.gain.value = s.sfxVol; SaveData.save(); }
    if (Input.justPressed("KeyF")) { s.reducedFlash = !s.reducedFlash; SaveData.save(); }
    if (Input.pausePressed()) this.openSettings = false;
  }

  updateIntro(dt) {
    const intro = this.intro;
    if (!intro.musicStarted) {
      intro.musicStarted = true;
      const buf = Assets.audio.mus_intro;
      if (buf) {
        this.beat.setBpm(130);
        this.beat.startSongs(buf, null, 0);
      }
    }
    if (Input.enterPressed() && (intro.t > 1)) { this.finishIntro(); return; }
    if (intro.slide >= INTRO_SLIDES.length) { this.finishIntro(); return; }
    const slide = INTRO_SLIDES[intro.slide];
    const textIdx = slide.lines[Math.min(intro.line, slide.lines.length - 1)];
    const full = INTRO_TEXTS[textIdx];
    intro.t += dt;
    if (intro.chars < full.length) {
      intro.chars = Math.min(full.length, Math.floor(intro.t * 30));
      if (Input.attackPressed() || Input.enterPressed()) intro.chars = full.length;
    } else {
      intro.wait += dt;
      if (intro.wait > 1.1 || Input.attackPressed() || Input.enterPressed()) {
        intro.line++;
        intro.t = 0; intro.wait = 0; intro.chars = 0;
        if (intro.line >= slide.lines.length) {
          intro.slide++;
          intro.line = 0;
          if (intro.slide >= INTRO_SLIDES.length) { this.finishIntro(); return; }
        }
      }
    }
  }

  finishIntro() {
    this.beat.stopSongs(true);
    this.beginCampaign(false);
  }

  drawIntro(ctx) {
    const intro = this.intro;
    if (!intro || intro.slide >= INTRO_SLIDES.length) return;
    const slide = INTRO_SLIDES[intro.slide];
    const img = Assets.images[slide.img];
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, Game.W, Game.H);
    if (img) ctx.drawImage(img, 0, 0, Game.W, Game.H);
    const textIdx = slide.lines[intro.line];
    const full = INTRO_TEXTS[textIdx];
    const shown = full.slice(0, intro.chars);
    // text band
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, Game.H - 26, Game.W, 26);
    ctx.font = "6px 'Press Start 2P', monospace";
    ctx.fillStyle = "#e8ecf4";
    this.ui.wrapText(ctx, shown, 8, Game.H - 18, Game.W - 16, 9);
    ctx.font = "4px 'Press Start 2P', monospace";
    ctx.fillStyle = "#555c6b";
    ctx.textAlign = "right";
    ctx.fillText("ENTER: SKIP", Game.W - 4, Game.H - 4);
    ctx.textAlign = "left";
    // beat pulse on the band
    const phase = (this.beat.getHeardSongPositionSec() % this.beat.secPerBeat) / this.beat.secPerBeat;
    ctx.fillStyle = `rgba(255,210,74,${0.6 - phase * 0.5})`;
    ctx.fillRect(0, Game.H - 26, Game.W, 1);
  }

  updatePlay(dt, dtRaw) {
    if (Input.pausePressed()) { this.togglePause(); return; }
    if (this.ui.dialogue) {
      if (Input.attackPressed() || Input.enterPressed()) this.ui.advanceDialogue();
      if (Input.justPressed("KeyS")) {
        const d = this.ui.dialogue;
        this.ui.dialogue = null;
        if (d.onDone) d.onDone();
      }
      this.ui.update(dtRaw);
      return;
    }
    this.world.update(dt);
    this.ui.update(dtRaw);
    this.tutorialTick();
    // dialogue triggers queued by world events
    if (this.beatFlashT > 0) this.beatFlashT -= dtRaw;
  }

  drawPlay(ctx) {
    const t = this.time;
    ctx.save();
    if (!Game.qaMode && SaveData.data.settings.reducedFlash === false && this.beatFlashT > 0 && Game.graphicsLevel === "ultra") {
      ctx.fillStyle = `rgba(255,255,255,${this.beatFlashT * 0.35})`;
      ctx.fillRect(0, 0, Game.W, Game.H);
    }
    this.world.draw(ctx, t);
    this.ui.drawHUD(ctx);
    this.ui.drawBeatGradeFlash(ctx);
    this.ui.drawDialogue(ctx);
    // vignette (ultra)
    if (Game.graphicsLevel === "ultra" && !Game.qaMode) {
      const vg = ctx.createRadialGradient(Game.W / 2, Game.H / 2, Game.H * 0.45, Game.W / 2, Game.H / 2, Game.H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, Game.W, Game.H);
    }
    if (SaveData.data.settings.showFps || Game.qaMode) {
      ctx.font = "5px monospace";
      ctx.fillStyle = "#7dff8f";
      ctx.fillText(this.fps + " FPS", 3, Game.H - 8);
    }
    ctx.restore();
  }

  drawPause(ctx) {
    ctx.fillStyle = "rgba(4,4,10,0.72)";
    ctx.fillRect(0, 0, Game.W, Game.H);
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", Game.W / 2, 44);
    ctx.font = "5px 'Press Start 2P', monospace";
    const items = ["RESUME (ESC)", "RESTART STAGE (R)", "MAIN MENU (M)"];
    items.forEach((it, i) => {
      ctx.fillStyle = "#8f96a8";
      ctx.fillText(it, Game.W / 2, 64 + i * 10);
    });
    ctx.textAlign = "left";
    if (Input.justPressed("KeyR")) {
      if (this.pauseSrc) { try { this.pauseSrc.stop(); } catch (e) {} }
      this.state = "play";
      this.loadStage(this.stageKey);
    }
    if (Input.justPressed("KeyM")) {
      if (this.pauseSrc) { try { this.pauseSrc.stop(); } catch (e) {} }
      this.beat.stopSongs(true);
      this.state = "menu";
      this.playMenuMusic();
    }
  }

  drawResults(ctx) {
    const r = this.results;
    ctx.fillStyle = "rgba(4,4,10,0.78)";
    ctx.fillRect(0, 0, Game.W, Game.H);
    ctx.textAlign = "center";
    ctx.font = "9px 'Press Start 2P', monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText("STAGE CLEAR", Game.W / 2, 34);
    ctx.font = "6px 'Press Start 2P', monospace";
    ctx.fillStyle = "#8fb4ff";
    ctx.fillText(r.def.name, Game.W / 2, 48);
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillStyle = "#e8ecf4";
    ctx.fillText(U.fmtTime(this.run.elapsedSeconds), Game.W / 2, 66);
    if (r.def.bpm) {
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#8f96a8";
      ctx.fillText("RESCUES: " + this.run.rescueCount, Game.W / 2, 78);
    }
    if (r.isNewBest) {
      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = Math.floor(this.time * 3) % 2 ? "#ffd24a" : "#fff";
      ctx.fillText("NEW BEST!", Game.W / 2, 90);
    } else if (r.prev !== undefined) {
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#8f96a8";
      ctx.fillText("BEST " + U.fmtTime(r.prev), Game.W / 2, 90);
    }
    // grade by rescues (competitive clarity)
    if (this.run.competitive) {
      ctx.font = "5px 'Press Start 2P', monospace";
      const grade = this.run.rescueCount === 0 ? "S" : this.run.rescueCount === 1 ? "A" : this.run.rescueCount <= 3 ? "B" : "C";
      const gcol = { S: "#ffd24a", A: "#7dff8f", B: "#7ab4ff", C: "#8f96a8" }[grade];
      ctx.fillStyle = gcol;
      ctx.fillText("RANK " + grade, Game.W / 2, 100);
    }
    const last = this.campaignIndex >= CAMPAIGN.length - 1;
    ctx.font = "5px 'Press Start 2P', monospace";
    ctx.fillStyle = Math.floor(this.time * 1.5) % 2 ? "#ffd24a" : "#555c6b";
    ctx.fillText(last ? "ENTER: FINISH" : "ENTER: NEXT STAGE", Game.W / 2, Game.H - 14);
    ctx.textAlign = "left";
    if (Input.enterPressed() || Input.attackPressed()) {
      this.audio.play("click", { pitch: 1.2 });
      if (last) {
        this.state = "campaign_end";
        this.campaignSummary = { rescues: this.run.rescueCount };
      } else {
        this.campaignIndex++;
        this.loadStage(CAMPAIGN[this.campaignIndex]);
      }
    }
  }

  drawCampaignEnd(ctx) {
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, Game.W, Game.H);
    const logo = Assets.images.logo;
    ctx.textAlign = "center";
    if (logo) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(logo, Game.W / 2 - 60, 22, 120, 120 * (logo.height / logo.width));
      ctx.globalAlpha = 1;
    }
    ctx.font = "6px 'Press Start 2P', monospace";
    ctx.fillStyle = "#7dff8f";
    ctx.fillText("THE SYSTEM IS BROKEN.", Game.W / 2, 92);
    ctx.fillStyle = "#e8ecf4";
    ctx.fillText("THE WORLD IS MINDLESS.", Game.W / 2, 104);
    ctx.font = "5px 'Press Start 2P', monospace";
    ctx.fillStyle = "#8f96a8";
    ctx.fillText("KONTRAŬ MENSO PREVAILS", Game.W / 2, 118);
    ctx.textAlign = "left";
    if (Input.enterPressed()) {
      this.state = "menu";
      this.playMenuMusic();
    }
  }
}

// =====================================================================
// Boot
// =====================================================================
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  // Hi-DPI: render at native res, scale via CSS with pixelated upscale
  function fit() {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / Game.W, window.innerHeight / Game.H)));
    canvas.style.width = Game.W * scale + "px";
    canvas.style.height = Game.H * scale + "px";
  }
  window.addEventListener("resize", fit);
  fit();

  const game = new Game(canvas);
  window.MINDLESS = game;                 // debug/QA handle
  Game.game = game;
  Input.init(canvas);
  game.boot();
  requestAnimationFrame(t => game.loop(t));

  // first-gesture audio unlock
  const unlock = () => {
    if (game.ctx0 && game.ctx0.state === "suspended") game.ctx0.resume();
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
});
