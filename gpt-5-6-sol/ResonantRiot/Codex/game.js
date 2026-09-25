(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1440;
  const H = 900;
  const WORLD = { left: 70, right: 1370, top: 175, bottom: 700 };
  const COLORS = {
    ink: '#0d0920',
    paper: '#fff8e8',
    cyan: '#55f3e0',
    pink: '#ff4dba',
    orange: '#ffb347',
    lime: '#d7ff6a',
    violet: '#846cff',
    blue: '#6d9bff',
    red: '#ff627d',
    muted: '#b7b0d5'
  };
  const MOVE_KEYS = new Set(['light', 'heavy', 'launch']);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const formatScore = value => String(Math.max(0, Math.floor(value))).padStart(6, '0');

  const dom = {
    stage: document.getElementById('stage'),
    title: document.getElementById('title-screen'),
    brief: document.getElementById('brief-screen'),
    hud: document.getElementById('hud'),
    pause: document.getElementById('pause-screen'),
    result: document.getElementById('result-screen'),
    start: document.getElementById('start-button'),
    briefButton: document.getElementById('brief-button'),
    resume: document.getElementById('resume-button'),
    replay: document.getElementById('replay-button'),
    playerStatus: document.getElementById('player-status'),
    playerHp: document.getElementById('player-hp-fill'),
    score: document.getElementById('score'),
    grade: document.getElementById('grade'),
    combo: document.getElementById('combo'),
    comboType: document.getElementById('combo-type'),
    flow: document.getElementById('flow-fill'),
    flowText: document.getElementById('flow-text'),
    abilityText: document.getElementById('ability-text'),
    bpm: document.getElementById('bpm-label'),
    section: document.getElementById('section-label'),
    timingLabel: document.getElementById('timing-label'),
    timingDelta: document.getElementById('timing-delta'),
    beatTrack: document.getElementById('beat-track'),
    chapter: document.getElementById('chapter-label'),
    chapterTitle: document.getElementById('chapter-title'),
    bossHud: document.getElementById('boss-hud'),
    bossHp: document.getElementById('boss-hp-fill'),
    bossPhase: document.getElementById('boss-phase'),
    callout: document.getElementById('callout'),
    flash: document.getElementById('flash'),
    resultEyebrow: document.getElementById('result-eyebrow'),
    resultTitle: document.getElementById('result-title'),
    resultCopy: document.getElementById('result-copy'),
    resultScore: document.getElementById('result-score'),
    resultCombo: document.getElementById('result-combo'),
    resultAccuracy: document.getElementById('result-accuracy'),
    resultGrade: document.getElementById('result-grade'),
    resultUnlock: document.getElementById('result-unlock'),
    touch: document.getElementById('touch-controls')
  };

  const audio = {
    context: null,
    music: null,
    track: 'resonant_riot_loop.wav',
    startedAt: 0,
    fallbackClock: 0,
    fallback: false,
    async unlock() {
      if (!this.context) {
        try {
          this.context = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
          this.context = null;
        }
      }
      if (this.context?.state === 'suspended') await this.context.resume().catch(() => {});
      if (!this.music) {
        this.music = new Audio();
        this.music.loop = true;
        this.music.preload = 'auto';
        this.music.addEventListener('canplay', () => { this.fallback = false; });
        this.music.addEventListener('error', () => { this.fallback = true; });
      }
      this.music.src = `assets/audio/${this.track}`;
      this.music.load();
      try {
        await this.music.play();
        this.fallback = false;
      } catch (error) {
        this.fallback = true;
      }
      this.startedAt = this.now();
    },
    now() {
      if (!this.music || this.fallback) return this.fallbackClock;
      return Number.isFinite(this.music.currentTime) ? this.music.currentTime : this.fallbackClock;
    },
    setTrack(track) {
      if (this.track === track) return;
      this.track = track;
      this.unlock();
    },
    updateFallback(dt) { this.fallbackClock += dt; },
    blip(frequency = 440, duration = .08, type = 'square', volume = .025) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .72), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + .02);
    },
    impact(judgment, heavy = false) {
      const base = judgment === 'PERFECT' ? 660 : judgment === 'GOOD' ? 520 : 320;
      this.blip(base * (heavy ? .55 : 1), heavy ? .16 : .08, heavy ? 'sawtooth' : 'square', heavy ? .045 : .025);
    },
    guard() { this.blip(180, .2, 'sawtooth', .035); },
    ui() { this.blip(760, .06, 'sine', .018); }
  };

  const game = {
    state: 'title',
    time: 0,
    realTime: 0,
    lastFrame: performance.now(),
    paused: false,
    stage: 0,
    stageTime: 0,
    encounterIndex: 0,
    transition: 0,
    stageStarted: false,
    bossDefeated: false,
    nextBeat: 0,
    lastBeat: -1,
    beatPulse: 0,
    beatFlash: 0,
    timingHits: 0,
    timingTotal: 0,
    accuracyTotal: 0,
    screenShake: 0,
    hitstop: 0,
    timeScale: 1,
    lastJudgment: '',
    lastJudgmentTime: 0,
    objective: 'Find the pulse',
    targetEnemy: null,
    input: { up: false, down: false, left: false, right: false },
    touchInput: { up: false, down: false, left: false, right: false },
    particles: [],
    rings: [],
    slashes: [],
    floaters: [],
    projectiles: [],
    enemies: [],
    hazards: [],
    player: null,
    boss: null,
    camera: { x: W / 2, y: H / 2, zoom: 1 },
    transitionNotice: '',
    endReason: ''
  };

  const beatConfig = {
    'resonant_riot_loop.wav': { bpm: 120, beat: .5, sections: ['INTRO', 'GROOVE', 'GROOVE', 'GROOVE', 'BUILD', 'BUILD', 'BREAKDOWN', 'DROP', 'GROOVE', 'GROOVE', 'GROOVE', 'BREAK', 'DROP', 'GROOVE', 'BUILD', 'CLIMAX', 'CLIMAX', 'CLIMAX', 'CLIMAX', 'DROP', 'DROP', 'DROP', 'DROP', 'OUTRO'] },
    'boss_whisper_kill_loop.wav': { bpm: 144, beat: .4166666667, sections: ['INTRO', 'INTRO', 'PULSE', 'PULSE', 'BUILD', 'BUILD', 'CHORUS', 'CHORUS', 'BREAK', 'CHORUS', 'CHORUS', 'PULSE', 'PULSE', 'BUILD', 'BUILD', 'CLIMAX', 'CLIMAX', 'CLIMAX', 'CLIMAX', 'DROP', 'DROP', 'DROP', 'DROP', 'DROP', 'DROP', 'OUTRO', 'OUTRO'] }
  };

  function currentBeat() {
    const config = beatConfig[audio.track] || beatConfig['resonant_riot_loop.wav'];
    const time = audio.now();
    const beat = time / config.beat;
    const nearest = Math.round(beat);
    return { time, beat, nearest, delta: (beat - nearest) * config.beat, phase: beat - Math.floor(beat), config };
  }

  function judge() {
    const rhythm = currentBeat();
    const abs = Math.abs(rhythm.delta);
    let label = 'OFF BEAT';
    if (abs <= .065) label = 'PERFECT';
    else if (abs <= .14) label = 'GOOD';
    game.timingTotal += 1;
    game.accuracyTotal += label === 'PERFECT' ? 1 : label === 'GOOD' ? .72 : .18;
    if (label !== 'OFF BEAT') game.timingHits += 1;
    game.lastJudgment = label;
    game.lastJudgmentTime = game.realTime;
    return { label, delta: rhythm.delta, rhythm };
  }

  function createPlayer() {
    return {
      x: 700, y: 510, z: 0, vx: 0, vy: 0,
      radius: 25, hp: 100, maxHp: 100, speed: 355,
      facing: 1, moveTime: 0, idleTime: 0,
      action: null, actionQueue: [], actionCooldown: 0,
      comboIndex: 0, comboTimer: 0, combo: 0, maxCombo: 0,
      flow: 0, score: 0, hitCount: 0, damageTaken: 0,
      invulnerable: 0, dodgeTimer: 0, dodgeCooldown: 0,
      parryWindow: 0, parrySuccess: 0, heavyCooldown: 0,
      launched: false, launchedTimer: 0, lastMove: '',
      overdriveUnlocked: false, overdriveActive: 0, hurtFlash: 0,
      trail: [], win: false
    };
  }

  function spawnEnemy(kind, x, y, overrides = {}) {
    const specs = {
      pulse: { hp: 52, radius: 23, speed: 115, color: COLORS.pink, name: 'PULSE DRONE', attackRange: 100, score: 180 },
      echo: { hp: 42, radius: 22, speed: 75, color: COLORS.blue, name: 'ECHO CASTER', attackRange: 360, score: 230 },
      sable: { hp: 118, radius: 33, speed: 72, color: COLORS.orange, name: 'SABLE WARDEN', attackRange: 122, score: 420 },
      lance: { hp: 72, radius: 25, speed: 150, color: COLORS.violet, name: 'LANCE SPRINTER', attackRange: 190, score: 300 }
    };
    const spec = specs[kind];
    const enemy = {
      id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
      kind, x, y, z: 0, vx: 0, vy: 0, ...spec, maxHp: spec.hp,
      state: 'approach', timer: rand(.2, .8), attackAt: 0, telegraph: 0,
      attackDuration: 0, hitDone: false, stun: 0, knockback: 0,
      guard: 0, guardCycle: rand(2, 4), phase: 0, flash: 0,
      alive: true, launch: 0, lastHitBeat: -1, ...overrides
    };
    game.enemies.push(enemy);
    return enemy;
  }

  function spawnBoss() {
    game.boss = {
      kind: 'boss', x: 900, y: 390, z: 0, vx: 0, vy: 0,
      radius: 76, hp: 520, maxHp: 520, speed: 42, color: COLORS.violet,
      name: 'THE QUIET ENGINE', state: 'entrance', timer: 2.8, attackAt: 0,
      telegraph: 0, attackDuration: 0, hitDone: false, stun: 0, knockback: 0,
      guard: 0, guardCycle: 5, phase: 1, flash: 0, alive: true,
      launch: 0, lastHitBeat: -1, attackPattern: 0
    };
  }

  function resetRun() {
    game.time = 0;
    game.realTime = 0;
    game.stage = 0;
    game.stageTime = 0;
    game.encounterIndex = 0;
    game.transition = 0;
    game.stageStarted = false;
    game.bossDefeated = false;
    game.nextBeat = 0;
    game.lastBeat = -1;
    game.beatPulse = 0;
    game.beatFlash = 0;
    game.timingHits = 0;
    game.timingTotal = 0;
    game.accuracyTotal = 0;
    game.screenShake = 0;
    game.hitstop = 0;
    game.timeScale = 1;
    game.lastJudgment = '';
    game.targetEnemy = null;
    game.particles = [];
    game.rings = [];
    game.slashes = [];
    game.floaters = [];
    game.projectiles = [];
    game.enemies = [];
    game.hazards = [];
    game.boss = null;
    game.player = createPlayer();
    audio.setTrack('resonant_riot_loop.wav');
    audio.fallbackClock = 0;
    updateHud();
  }

  function showScreen(screen) {
    [dom.title, dom.brief, dom.pause, dom.result].forEach(node => node.classList.add('hidden'));
    if (screen) screen.classList.remove('hidden');
  }

  function setCallout(text, duration = 1.2, color = COLORS.cyan) {
    game.calloutText = text;
    game.calloutTime = duration;
    dom.callout.textContent = text;
    dom.callout.style.color = color;
    dom.callout.classList.remove('hidden');
  }

  function startTitle() {
    game.state = 'title';
    showScreen(dom.title);
    dom.hud.classList.add('hidden');
    dom.touch.classList.add('hidden');
    game.player = createPlayer();
  }

  async function startBrief() {
    await audio.unlock();
    audio.ui();
    game.state = 'brief';
    showScreen(dom.brief);
    dom.hud.classList.add('hidden');
    dom.touch.classList.add('hidden');
  }

  async function startRun() {
    await audio.unlock();
    audio.ui();
    resetRun();
    game.state = 'play';
    showScreen(null);
    dom.hud.classList.remove('hidden');
    dom.touch.classList.remove('hidden');
    beginStage(0);
  }

  function beginStage(stage) {
    game.stage = stage;
    game.stageTime = 0;
    game.stageStarted = false;
    game.bossDefeated = false;
    game.transition = 1.1;
    game.enemies = [];
    game.projectiles = [];
    game.hazards = [];
    if (stage === 0) {
      game.objective = 'Break the first response';
      game.chapter = '01 // CALIBRATE THE CHORUS';
      game.chapterTitle = 'First resonance';
      spawnEnemy('pulse', 890, 450);
      spawnEnemy('echo', 1110, 570);
      spawnEnemy('pulse', 1010, 290, { attackRange: 130 });
      setCallout('FIND THE PULSE', 1.8, COLORS.cyan);
    } else if (stage === 1) {
      game.objective = 'Switch targets and keep the chain';
      game.chapter = '02 // PAINT THE CROSSING';
      game.chapterTitle = 'A city in chorus';
      spawnEnemy('pulse', 820, 300);
      spawnEnemy('pulse', 1010, 540);
      spawnEnemy('echo', 1180, 390);
      spawnEnemy('lance', 600, 580);
      spawnEnemy('sable', 850, 430);
      setCallout('VARIETY KEEPS THE COLOR', 1.8, COLORS.orange);
    } else {
      game.objective = 'Silence the engine';
      game.chapter = '03 // THE QUIET ENGINE';
      game.chapterTitle = 'Final transmission';
      audio.setTrack('boss_whisper_kill_loop.wav');
      spawnBoss();
      setCallout('THE QUIET ENGINE', 2.2, COLORS.pink);
    }
    updateHud();
  }

  function stageClear() {
    if (game.stage === 0) {
      game.player.overdriveUnlocked = true;
      game.player.flow = Math.max(game.player.flow, 52);
      setCallout('OVERDRIVE UNLOCKED', 2, COLORS.lime);
      game.transition = 2.4;
      game.objective = 'The crossing is listening';
    } else if (game.stage === 1) {
      game.transition = 3.0;
      game.objective = 'The Engine is broadcasting';
      setCallout('THE ENGINE HEARD YOU', 2, COLORS.pink);
    } else {
      finishRun(true);
    }
  }

  function finishRun(victory) {
    game.state = 'result';
    game.endReason = victory ? 'victory' : 'defeat';
    showScreen(dom.result);
    dom.hud.classList.add('hidden');
    dom.touch.classList.add('hidden');
    const accuracy = game.timingTotal ? Math.round((game.accuracyTotal / game.timingTotal) * 100) : 0;
    const grade = getGrade();
    dom.resultEyebrow.textContent = victory ? 'TRANSMISSION COMPLETE' : 'SIGNAL LOST';
    dom.resultTitle.innerHTML = victory ? 'LUMA IS <em>LOUD</em>' : 'LUMA IS <em>WAITING</em>';
    dom.resultCopy.textContent = victory ? 'The murals are singing again. The Quiet Engine is only a whisper.' : 'The Hush took the last color. The next run starts with a brighter pulse.';
    dom.resultScore.textContent = formatScore(game.player.score);
    dom.resultCombo.textContent = game.player.maxCombo;
    dom.resultAccuracy.textContent = `${accuracy}%`;
    dom.resultGrade.textContent = grade;
    dom.resultUnlock.innerHTML = victory ? 'UNLOCKED // <b>Rainline Dash</b> · your next dash paints a longer echo' : 'KEEP MOVING // <b>Off-beat still lands</b> · read the next phrase and rejoin the chorus';
    game.player.win = victory;
  }

  function getGrade() {
    const accuracy = game.timingTotal ? game.accuracyTotal / game.timingTotal : 0;
    const style = game.player.maxCombo / 35;
    if (accuracy > .78 && style > .72) return 'S';
    if (accuracy > .6 && style > .5) return 'A';
    if (accuracy > .4 && style > .3) return 'B';
    if (game.player.score > 2200) return 'C';
    return 'D';
  }

  function getInput() {
    const i = game.input;
    const t = game.touchInput;
    return { x: (i.right || t.right ? 1 : 0) - (i.left || t.left ? 1 : 0), y: (i.down || t.down ? 1 : 0) - (i.up || t.up ? 1 : 0) };
  }

  function getTarget(range = 116) {
    if (!game.player) return null;
    const candidates = game.enemies.filter(enemy => enemy.alive).map(enemy => ({ enemy, d: dist(game.player, enemy) })).sort((a, b) => a.d - b.d);
    if (candidates[0] && candidates[0].d < range) return candidates[0].enemy;
    if (candidates[0] && candidates[0].d < 190) return candidates[0].enemy;
    return null;
  }

  function addParticles(x, y, z, color, count = 10, power = 1) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 170) * power;
      game.particles.push({ x, y, z, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * .5, vz: rand(30, 180) * power, life: rand(.3, .8), maxLife: .8, color, size: rand(3, 9) });
    }
  }

  function addRing(x, y, z, color, size = 80, width = 5) {
    game.rings.push({ x, y, z, color, size, width, life: .45, maxLife: .45 });
  }

  function addFloater(x, y, z, text, color, size = 16) {
    game.floaters.push({ x, y, z, text, color, size, life: .85, maxLife: .85 });
  }

  function flash(kind) {
    dom.flash.className = 'flash';
    void dom.flash.offsetWidth;
    dom.flash.classList.add(kind);
  }

  function impact(x, y, z, color, judgment = 'OFF BEAT', power = 1) {
    addParticles(x, y, z, color, judgment === 'PERFECT' ? 18 : 10, power);
    addRing(x, y, z, judgment === 'PERFECT' ? COLORS.lime : color, judgment === 'PERFECT' ? 130 : 80, judgment === 'PERFECT' ? 7 : 4);
    addFloater(x, y, z + 44, judgment, judgment === 'PERFECT' ? COLORS.lime : judgment === 'GOOD' ? COLORS.cyan : COLORS.orange, judgment === 'PERFECT' ? 18 : 13);
    game.screenShake = Math.max(game.screenShake, (judgment === 'PERFECT' ? 10 : 5) * power);
    game.hitstop = Math.max(game.hitstop, judgment === 'PERFECT' ? .065 : .035);
    audio.impact(judgment, power > 1.2);
  }

  function addScore(base, judgment, move) {
    const timingBonus = judgment === 'PERFECT' ? 1.8 : judgment === 'GOOD' ? 1.25 : 1;
    const varietyBonus = move !== game.player.lastMove ? 1.18 : .78;
    const flowBonus = 1 + game.player.flow / 180;
    const points = Math.round(base * timingBonus * varietyBonus * flowBonus);
    game.player.score += points;
    game.player.hitCount += 1;
    game.player.flow = clamp(game.player.flow + (judgment === 'PERFECT' ? 9 : judgment === 'GOOD' ? 5 : 2) + (move !== game.player.lastMove ? 4 : -2), 0, 100);
    game.player.lastMove = move;
  }

  function setAction(action, judgmentResult) {
    const player = game.player;
    if (!player || player.actionCooldown > 0 && action !== 'dodge' && action !== 'parry') return;
    const judgment = judgmentResult || judge();
    if (action === 'light') {
      player.comboIndex = player.comboTimer > 0 ? (player.comboIndex + 1) % 3 : 0;
      player.comboTimer = 1.15;
      player.action = { type: 'light', t: 0, duration: .34, impactAt: judgment.label === 'PERFECT' ? .07 : .11, damage: 14 + player.comboIndex * 4, range: 102, color: player.comboIndex === 2 ? COLORS.pink : COLORS.cyan, move: ['SWIPE', 'CROSS', 'RIPPLE'][player.comboIndex], judgment, hitDone: false };
      player.actionCooldown = .28;
      player.facing = getTarget(180) ? (getTarget(180).x >= player.x ? 1 : -1) : player.facing;
      addScore(90 + player.comboIndex * 18, judgment.label, player.action.move);
    } else if (action === 'heavy') {
      if (player.heavyCooldown > 0) return;
      player.action = { type: 'heavy', t: 0, duration: .56, impactAt: .27, damage: 34, range: 132, color: COLORS.orange, move: 'PULSE BREAK', judgment, hitDone: false, heavy: true };
      player.heavyCooldown = .9;
      player.actionCooldown = .5;
      addScore(220, judgment.label, 'PULSE BREAK');
    } else if (action === 'launch') {
      player.action = { type: 'launch', t: 0, duration: .62, impactAt: .3, damage: 24, range: 118, color: COLORS.violet, move: 'LIFT', judgment, hitDone: false };
      player.actionCooldown = .52;
      addScore(180, judgment.label, 'LIFT');
    } else if (action === 'dodge') {
      player.action = { type: 'dodge', t: 0, duration: .42, impactAt: .06, move: 'DASH', judgment, hitDone: false };
      player.actionCooldown = .18;
      player.dodgeCooldown = .68;
      player.invulnerable = .25;
      const move = getInput();
      if (move.x || move.y) { player.facing = move.x || 0; player.vx = move.x * 680; player.vy = move.y * 680; }
      else { player.vx = player.facing * 680; }
      addScore(70, judgment.label, 'DASH');
      audio.blip(230, .1, 'sine', .018);
    } else if (action === 'parry') {
      player.action = { type: 'parry', t: 0, duration: .46, impactAt: .08, move: 'PARRY', judgment, hitDone: false };
      player.parryWindow = .24;
      player.actionCooldown = .34;
      addScore(55, judgment.label, 'PARRY');
    } else if (action === 'overdrive') {
      if (!player.overdriveUnlocked || player.flow < 60 || player.overdriveActive > 0) return;
      player.overdriveActive = 3.2;
      player.flow = 0;
      player.action = { type: 'overdrive', t: 0, duration: .65, impactAt: .15, move: 'OVERDRIVE', judgment, hitDone: false, color: COLORS.lime };
      addScore(450, judgment.label, 'OVERDRIVE');
      setCallout('OVERDRIVE', 1, COLORS.lime);
    }
  }

  function damagePlayer(amount, sourceX, sourceY) {
    const player = game.player;
    if (!player || player.invulnerable > 0 || player.win || game.state !== 'play') return;
    if (player.parryWindow > 0) {
      player.parryWindow = 0;
      player.parrySuccess = .75;
      const judgment = judge();
      addScore(300, judgment.label, 'COUNTER WINDOW');
      impact(player.x, player.y - 28, 20, COLORS.lime, judgment.label, 1.5);
      game.screenShake = 16;
      return;
    }
    player.hp = clamp(player.hp - amount, 0, player.maxHp);
    player.damageTaken += amount;
    player.flow = clamp(player.flow - 18, 0, 100);
    player.combo = 0;
    player.comboIndex = 0;
    player.comboTimer = 0;
    player.invulnerable = .55;
    player.hurtFlash = .22;
    player.vx += (player.x < sourceX ? -1 : 1) * 260;
    player.vy += (player.y < sourceY ? -1 : 1) * 120;
    game.screenShake = 20;
    game.hitstop = .12;
    flash('hit');
    addParticles(player.x, player.y - 28, 20, COLORS.red, 18, 1.2);
    addFloater(player.x, player.y - 55, 65, `-${Math.round(amount)}`, COLORS.red, 18);
    audio.blip(90, .2, 'sawtooth', .045);
    if (player.hp <= 0) finishRun(false);
  }

  function hitEnemy(enemy, damage, judgment, move, options = {}) {
    if (!enemy.alive) return;
    const beat = currentBeat().nearest;
    const beatBonus = beat === enemy.lastHitBeat ? 1.18 : 1;
    enemy.lastHitBeat = beat;
    const guardMultiplier = enemy.guard > 0 && !options.breaksGuard ? .18 : 1;
    if (options.breaksGuard && enemy.guard > 0) enemy.guard = 0;
    const total = Math.round(damage * guardMultiplier * beatBonus * (judgment === 'PERFECT' ? 1.4 : judgment === 'GOOD' ? 1.15 : 1));
    enemy.hp -= total;
    enemy.stun = Math.max(enemy.stun, options.heavy ? .75 : .28);
    enemy.knockback = options.knockback || 120;
    enemy.flash = .16;
    if (options.launch) { enemy.launch = 1; enemy.z = 1; }
    game.targetEnemy = enemy;
    impact(enemy.x, enemy.y - enemy.radius - 8, enemy.z, options.color || (judgment === 'PERFECT' ? COLORS.lime : COLORS.cyan), judgment, options.heavy ? 1.45 : 1);
    addFloater(enemy.x, enemy.y - enemy.radius - 32, enemy.z + 60, String(total), options.color || COLORS.paper, options.heavy ? 20 : 14);
    addScore((enemy.score || 120) * .42, judgment, move);
    game.player.combo += 1;
    game.player.maxCombo = Math.max(game.player.maxCombo, game.player.combo);
    game.player.comboTimer = 2.5;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.z = enemy.launch ? 2 : .2;
      addParticles(enemy.x, enemy.y - enemy.radius, enemy.z + 20, options.color || enemy.color, enemy.launch ? 28 : 20, 1.4);
      addRing(enemy.x, enemy.y, enemy.z, COLORS.paper, 150, 6);
      addFloater(enemy.x, enemy.y - enemy.radius - 50, enemy.z + 80, 'RESONANCE BROKEN', COLORS.lime, 14);
      game.player.flow = clamp(game.player.flow + 12, 0, 100);
      game.screenShake = Math.max(game.screenShake, 15);
      if (judgment === 'PERFECT') addScore(280, judgment, 'PULSE FINISH');
    }
  }

  function resolvePlayerAction() {
    const player = game.player;
    const action = player.action;
    if (!action || action.hitDone || action.t < action.impactAt) return;
    action.hitDone = true;
    const target = getTarget(action.range);
    const hitList = game.enemies.filter(enemy => enemy.alive && dist(player, enemy) < action.range + enemy.radius);
    if (action.type === 'overdrive') {
      hitList.forEach(enemy => hitEnemy(enemy, action.damage || 48, action.judgment.label, 'OVERDRIVE', { color: COLORS.lime, heavy: true, breaksGuard: true, knockback: 240 }));
      if (game.boss?.alive && dist(player, game.boss) < 520) hitBoss(action.damage || 48, action.judgment.label, 'OVERDRIVE', COLORS.lime, true);
      addRing(player.x, player.y, 10, COLORS.lime, 390, 12);
      game.screenShake = 28;
      game.hitstop = .15;
      flash('boss');
      return;
    }
    if (action.type === 'parry') {
      addRing(player.x, player.y - 20, 20, COLORS.cyan, 110, 5);
      return;
    }
    if (action.type === 'dodge') {
      addRing(player.x, player.y, 8, COLORS.cyan, 90, 3);
      return;
    }
    if (!hitList.length && !game.boss?.alive) return;
    if (action.type === 'launch') {
      hitList.forEach(enemy => hitEnemy(enemy, action.damage, action.judgment.label, action.move, { color: COLORS.violet, heavy: true, breaksGuard: true, knockback: 100, launch: true }));
      player.launched = true;
      player.launchedTimer = .35;
      player.z = 12;
      addRing(player.x, player.y, 8, COLORS.violet, 180, 7);
      return;
    }
    hitList.forEach(enemy => hitEnemy(enemy, action.damage, action.judgment.label, action.move, { color: action.color, heavy: action.heavy, breaksGuard: action.heavy, knockback: action.heavy ? 210 : 100 }));
    if (game.boss?.alive && dist(player, game.boss) < action.range + game.boss.radius) hitBoss(action.damage, action.judgment.label, action.move, action.color, action.heavy);
    if (action.type === 'heavy' && hitList.some(enemy => enemy.guard > 0)) { audio.guard(); addFloater(target.x, target.y - 55, 90, 'GUARD BROKEN', COLORS.orange, 14); }
    if (action.type === 'light' && player.comboIndex === 2) {
      game.slashes.push({ x: player.x, y: player.y, z: 12, color: COLORS.pink, life: .28, maxLife: .28, angle: player.facing * .25 });
    }
  }

  function hitBoss(damage, judgment, move, color, heavy) {
    const boss = game.boss;
    if (!boss || !boss.alive) return;
    if (boss.guard > 0 && boss.phase === 1 && !heavy) {
      addFloater(boss.x, boss.y - boss.radius - 30, 120, 'GUARDED', COLORS.muted, 15);
      audio.guard();
      return;
    }
    const total = Math.round(damage * (judgment === 'PERFECT' ? 1.45 : judgment === 'GOOD' ? 1.15 : 1));
    boss.hp = clamp(boss.hp - total, 0, boss.maxHp);
    boss.flash = .2;
    boss.stun = Math.max(boss.stun, heavy ? .55 : .2);
    impact(boss.x, boss.y - boss.radius - 12, boss.z, color, judgment, heavy ? 1.4 : 1);
    addFloater(boss.x, boss.y - boss.radius - 45, 130, String(total), COLORS.orange, heavy ? 22 : 16);
    addScore(310, judgment, move);
    game.player.combo += 1;
    game.player.maxCombo = Math.max(game.player.maxCombo, game.player.combo);
    if (boss.hp <= 0) {
      boss.alive = false;
      game.bossDefeated = true;
      game.player.score += 2500;
      addParticles(boss.x, boss.y - 50, 90, COLORS.lime, 80, 2.5);
      addRing(boss.x, boss.y, 0, COLORS.lime, 500, 18);
      addFloater(boss.x, boss.y - 110, 180, 'THE ENGINE IS SILENT', COLORS.lime, 24);
      setCallout('THE CITY ANSWERS', 2.4, COLORS.lime);
      game.transition = 3.5;
      game.objective = 'Let the last color bloom';
    }
  }

  function nextBeatDelay(offset = .06) {
    const rhythm = currentBeat();
    const distance = 1 - rhythm.phase;
    return Math.max(.04, distance * rhythm.config.beat + offset);
  }

  function enemyAttack(enemy, kind = 'melee') {
    if (enemy.state === 'telegraph' || enemy.state === 'attack') return;
    const rhythm = currentBeat();
    const delay = kind === 'projectile' ? nextBeatDelay(.1) : nextBeatDelay(.08);
    enemy.state = 'telegraph';
    enemy.timer = delay;
    enemy.attackDuration = kind === 'projectile' ? .18 : kind === 'dash' ? .3 : .24;
    enemy.attackAt = rhythm.time + delay;
    enemy.hitDone = false;
    enemy.attackPattern = (enemy.attackPattern || 0) + 1;
    if (kind === 'projectile') audio.blip(250, .08, 'sawtooth', .012);
  }

  function updateEnemies(dt) {
    const player = game.player;
    for (const enemy of game.enemies) {
      if (!enemy.alive) { enemy.z = lerp(enemy.z, 0, dt * 2); continue; }
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.guard = Math.max(0, enemy.guard - dt);
      enemy.guardCycle -= dt;
      if (enemy.guardCycle <= 0) {
        enemy.guardCycle = rand(2.2, 4.2);
        if (enemy.kind === 'sable' || enemy.kind === 'pulse' && Math.random() < .25) enemy.guard = 1.05;
      }
      if (enemy.launch > 0) {
        enemy.launch = Math.max(0, enemy.launch - dt);
        enemy.z = lerp(enemy.z, 0, dt * 3);
        continue;
      }
      const deltaX = player.x - enemy.x;
      const deltaY = player.y - enemy.y;
      const distanceToPlayer = Math.hypot(deltaX, deltaY);
      if (enemy.state === 'telegraph') {
        enemy.timer -= dt;
        if (enemy.timer <= 0) {
          enemy.state = 'attack';
          enemy.timer = enemy.attackDuration;
          if (enemy.kind === 'echo') {
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            game.projectiles.push({ x: enemy.x, y: enemy.y - 18, z: 26, vx: Math.cos(angle) * 300, vy: Math.sin(angle) * 300, life: 2.4, color: COLORS.blue, owner: enemy });
            audio.blip(180, .16, 'sawtooth', .025);
          } else if (enemy.kind === 'lance' || enemy.kind === 'pulse') {
            const direction = Math.hypot(deltaX, deltaY) || 1;
            enemy.vx = deltaX / direction * 430;
            enemy.vy = deltaY / direction * 430;
          }
        }
      } else if (enemy.state === 'attack') {
        enemy.timer -= dt;
        if (!enemy.hitDone && enemy.kind !== 'echo' && distanceToPlayer < enemy.attackRange + player.radius) {
          enemy.hitDone = true;
          damagePlayer(enemy.kind === 'sable' ? 18 : enemy.kind === 'lance' ? 13 : 11, enemy.x, enemy.y);
          impact(enemy.x + deltaX * .18, enemy.y + deltaY * .18, 22, enemy.color, 'OFF BEAT', .7);
        }
        if (enemy.timer <= 0) {
          enemy.state = 'approach';
          enemy.timer = rand(.25, .75);
        }
      } else if (enemy.stun <= 0) {
        const ideal = enemy.attackRange * (enemy.kind === 'echo' ? .7 : .52);
        const direction = distanceToPlayer || 1;
        if (distanceToPlayer > ideal) {
          const speed = enemy.speed * (enemy.kind === 'pulse' ? 1 : .75);
          enemy.x += deltaX / direction * speed * dt;
          enemy.y += deltaY / direction * speed * dt;
        } else if (enemy.kind === 'sable' && distanceToPlayer < ideal * .75) {
          enemy.x -= deltaX / direction * 50 * dt;
          enemy.y -= deltaY / direction * 50 * dt;
        }
        if (enemy.timer <= 0 && distanceToPlayer < enemy.attackRange + 38) {
          enemyAttack(enemy, enemy.kind === 'echo' ? 'projectile' : enemy.kind === 'lance' || enemy.kind === 'pulse' ? 'dash' : 'melee');
        }
      }
      enemy.x = clamp(enemy.x, WORLD.left + enemy.radius, WORLD.right - enemy.radius);
      enemy.y = clamp(enemy.y, WORLD.top + enemy.radius, WORLD.bottom - enemy.radius);
      enemy.vx *= Math.pow(.02, dt);
      enemy.vy *= Math.pow(.02, dt);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
    }
  }

  function updateBoss(dt) {
    const boss = game.boss;
    if (!boss) return;
    if (!boss.alive) {
      boss.y = lerp(boss.y, 490, dt * .4);
      boss.z = lerp(boss.z, -20, dt);
      return;
    }
    boss.flash = Math.max(0, boss.flash - dt);
    boss.stun = Math.max(0, boss.stun - dt);
    boss.guard = Math.max(0, boss.guard - dt);
    if (boss.phase === 1 && boss.hp <= boss.maxHp * .5) {
      boss.phase = 2;
      boss.guard = 0;
      boss.state = 'phase';
      boss.timer = 1.25;
      game.player.flow = Math.min(100, game.player.flow + 25);
      game.screenShake = 35;
      flash('boss');
      setCallout('PHASE 02 // OVEREXPOSURE', 2, COLORS.pink);
      addRing(boss.x, boss.y, 10, COLORS.pink, 600, 20);
      addParticles(boss.x, boss.y - 40, 80, COLORS.pink, 55, 2);
      audio.setTrack('boss_whisper_kill_loop.wav');
      audio.blip(90, .6, 'sawtooth', .06);
      updateHud();
    }
    if (boss.state === 'entrance') {
      boss.timer -= dt;
      boss.y = lerp(boss.y, 365, dt * 2);
      if (boss.timer <= 0) { boss.state = 'approach'; boss.timer = .6; }
      return;
    }
    if (boss.state === 'phase') {
      boss.timer -= dt;
      boss.y = lerp(boss.y, 365, dt * 2);
      if (boss.timer <= 0) { boss.state = 'approach'; boss.timer = .3; }
      return;
    }
    if (boss.stun > 0) return;
    const player = game.player;
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const d = Math.hypot(dx, dy) || 1;
    if (boss.state === 'telegraph') {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        boss.state = 'attack';
        boss.timer = boss.phase === 2 ? .34 : .48;
        boss.hitDone = false;
        const pattern = boss.attackPattern++ % (boss.phase === 2 ? 4 : 3);
        if (pattern === 0) {
          boss.vx = dx / d * (boss.phase === 2 ? 520 : 380);
          boss.vy = dy / d * (boss.phase === 2 ? 520 : 380);
          boss.attackPattern = 1;
        } else if (pattern === 1) {
          for (let i = -1; i <= 1; i += 1) {
            const angle = Math.atan2(dy, dx) + i * .23;
            game.projectiles.push({ x: boss.x, y: boss.y - 18, z: 30, vx: Math.cos(angle) * 290, vy: Math.sin(angle) * 290, life: 2.3, color: boss.phase === 2 ? COLORS.pink : COLORS.violet, owner: boss, radial: true });
          }
        } else if (pattern === 2) {
          boss.guard = boss.phase === 2 ? .55 : 1.05;
          addFloater(boss.x, boss.y - 110, 160, boss.phase === 2 ? 'OPEN THE CORE' : 'SHELL ONLINE', COLORS.muted, 14);
        } else {
          game.hazards.push({ x: boss.x, y: 360, width: 1100, age: 0, duration: .8, phase: boss.phase });
          addFloater(boss.x, boss.y - 140, 180, 'QUIET WAVE', COLORS.pink, 18);
        }
      }
    } else if (boss.state === 'attack') {
      boss.timer -= dt;
      if (!boss.hitDone && boss.attackPattern % 4 !== 2 && d < boss.radius + 76) {
        boss.hitDone = true;
        damagePlayer(boss.phase === 2 ? 16 : 12, boss.x, boss.y);
      }
      if (boss.timer <= 0) { boss.state = 'approach'; boss.timer = boss.phase === 2 ? .65 : 1.05; }
    } else {
      const distance = d < 145 ? -1 : 1;
      boss.x += dx / d * boss.speed * distance * dt;
      boss.y += dy / d * boss.speed * distance * dt;
      boss.x = clamp(boss.x, WORLD.left + 100, WORLD.right - 100);
      boss.y = clamp(boss.y, WORLD.top + 60, WORLD.bottom - 60);
      boss.timer -= dt;
      if (boss.timer <= 0) {
        boss.state = 'telegraph';
        const patternDelay = boss.phase === 2 ? .42 : .7;
        boss.timer = patternDelay;
        boss.telegraph = 1;
      }
    }
    boss.vx *= Math.pow(.02, dt);
    boss.vy *= Math.pow(.02, dt);
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
  }

  function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i -= 1) {
      const shot = game.projectiles[i];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0 || shot.x < 0 || shot.x > W || shot.y < 0 || shot.y > H) { game.projectiles.splice(i, 1); continue; }
      const hitRadius = shot.owner === game.boss ? 58 : 30;
      if (dist(shot, game.player) < hitRadius) {
        damagePlayer(shot.owner === game.boss ? 12 : 9, shot.x, shot.y);
        addParticles(shot.x, shot.y, shot.z, shot.color, 10, .9);
        game.projectiles.splice(i, 1);
      }
    }
  }

  function updateHazards(dt) {
    for (let i = game.hazards.length - 1; i >= 0; i -= 1) {
      const hazard = game.hazards[i];
      hazard.age += dt;
      if (!hazard.hit && hazard.age > hazard.duration * .45) {
        hazard.hit = true;
        if (Math.abs(game.player.x - hazard.x) < hazard.width * .5) damagePlayer(10, hazard.x, hazard.y);
        addRing(hazard.x, hazard.y, 10, COLORS.pink, hazard.width, 8);
      }
      if (hazard.age > hazard.duration) game.hazards.splice(i, 1);
    }
  }

  function updatePlayer(dt) {
    const player = game.player;
    if (!player || game.state !== 'play') return;
    player.actionCooldown = Math.max(0, player.actionCooldown - dt);
    player.heavyCooldown = Math.max(0, player.heavyCooldown - dt);
    player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.parryWindow = Math.max(0, player.parryWindow - dt);
    player.parrySuccess = Math.max(0, player.parrySuccess - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    player.overdriveActive = Math.max(0, player.overdriveActive - dt);
    if (player.comboTimer <= 0 && player.combo > 0) { player.combo = 0; player.comboIndex = 0; }
    if (!player.overdriveActive) player.flow = clamp(player.flow - dt * 1.35, 0, 100);
    const input = getInput();
    if (!player.action || player.action.type === 'dodge' && player.action.t > .14) {
      const moving = input.x !== 0 || input.y !== 0;
      if (moving) {
        const length = Math.hypot(input.x, input.y) || 1;
        const speed = player.overdriveActive > 0 ? player.speed * 1.35 : player.speed;
        player.vx = lerp(player.vx, input.x / length * speed, .24);
        player.vy = lerp(player.vy, input.y / length * speed * .72, .24);
        player.facing = input.x < 0 ? -1 : 1;
        player.moveTime += dt * 8;
      } else {
        player.vx *= Math.pow(.04, dt);
        player.vy *= Math.pow(.04, dt);
        player.idleTime += dt * 2;
      }
    } else {
      player.moveTime += dt * 2;
    }
    player.x = clamp(player.x + player.vx * dt, WORLD.left + player.radius, WORLD.right - player.radius);
    player.y = clamp(player.y + player.vy * dt, WORLD.top + player.radius, WORLD.bottom - player.radius);
    if (player.action) {
      player.action.t += dt;
      if (player.action.t >= player.action.duration) player.action = null;
      else resolvePlayerAction();
    }
    if (player.launchedTimer > 0) {
      player.launchedTimer -= dt;
      player.z = lerp(player.z, 0, dt * 8);
      if (player.launchedTimer <= 0) player.launched = false;
    } else {
      player.z = lerp(player.z, 0, dt * 8);
    }
    player.trail.push({ x: player.x, y: player.y, z: player.z, life: .18, color: player.overdriveActive > 0 ? COLORS.lime : COLORS.cyan });
    if (player.trail.length > 18) player.trail.shift();
  }

  function updateEffects(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 220 * dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
    for (let i = game.rings.length - 1; i >= 0; i -= 1) { const r = game.rings[i]; r.life -= dt; r.size += dt * 210; if (r.life <= 0) game.rings.splice(i, 1); }
    for (let i = game.slashes.length - 1; i >= 0; i -= 1) { const s = game.slashes[i]; s.life -= dt; if (s.life <= 0) game.slashes.splice(i, 1); }
    for (let i = game.floaters.length - 1; i >= 0; i -= 1) { const f = game.floaters[i]; f.life -= dt; f.y -= dt * 28; if (f.life <= 0) game.floaters.splice(i, 1); }
    game.screenShake = Math.max(0, game.screenShake - dt * 36);
    game.hitstop = Math.max(0, game.hitstop - dt);
    game.beatPulse = Math.max(0, game.beatPulse - dt * 3.5);
    game.beatFlash = Math.max(0, game.beatFlash - dt * 4);
    if (game.calloutTime > 0) { game.calloutTime -= dt; if (game.calloutTime <= 0) dom.callout.classList.add('hidden'); }
  }

  function updateBeat() {
    const rhythm = currentBeat();
    if (rhythm.nearest !== game.lastBeat && rhythm.nearest >= 0) {
      game.lastBeat = rhythm.nearest;
      game.nextBeat = rhythm.nearest + 1;
      game.beatPulse = 1;
      game.beatFlash = 1;
      if (game.state === 'play') audio.blip(rhythm.nearest % 4 === 0 ? 440 : 330, .035, 'sine', .008);
    }
    const trackWidth = dom.beatTrack.clientWidth || 480;
    const phase = rhythm.phase;
    dom.beatTrack.querySelectorAll('.beat-mark').forEach(mark => { mark.style.left = `${((Number(mark.dataset.beat) - rhythm.beat) * 70 + 50)}%`; });
    const existing = dom.beatTrack.querySelectorAll('.beat-mark').length;
    const desired = 7;
    if (existing < desired) {
      for (let i = existing; i < desired; i += 1) {
        const mark = document.createElement('span'); mark.className = 'beat-mark'; mark.dataset.beat = String(Math.floor(rhythm.beat) + i); dom.beatTrack.appendChild(mark);
      }
    }
    const marks = dom.beatTrack.querySelectorAll('.beat-mark');
    marks.forEach(mark => { const beat = Number(mark.dataset.beat); if (Math.abs(beat - rhythm.beat) < .15) mark.classList.add('hit'); else mark.classList.remove('hit'); });
    const sectionIndex = Math.floor(rhythm.beat / 4) % 24;
    dom.bpm.textContent = `${rhythm.config.bpm} BPM`;
    dom.section.textContent = rhythm.config.sections[sectionIndex] || 'GROOVE';
  }

  function updateStage(dt) {
    if (!game.player) return;
    game.stageTime += dt;
    if (game.transition > 0) {
      game.transition -= dt;
      if (game.transition <= 0) {
        if (game.stageStarted) {
          if (game.stage === 0) beginStage(1);
          else if (game.stage === 1) beginStage(2);
        } else {
          game.stageStarted = true;
        }
      }
      return;
    }
    game.stageStarted = true;
    if (game.stage < 2) {
      const alive = game.enemies.filter(enemy => enemy.alive).length;
      if (alive === 0 && game.stageStarted && game.stageTime > 1.4) stageClear();
    } else if (game.boss && !game.boss.alive && game.bossDefeated && game.boss.y > 450) {
      finishRun(true);
    }
  }

  function updateHud() {
    const player = game.player;
    if (!player) return;
    dom.playerStatus.textContent = player.hp <= 0 ? 'LOST' : player.overdriveActive > 0 ? 'OVERDRIVE' : player.parryWindow > 0 ? 'PARRY' : 'READY';
    dom.playerHp.style.width = `${player.hp / player.maxHp * 100}%`;
    dom.score.textContent = formatScore(player.score);
    dom.combo.textContent = player.combo;
    dom.comboType.textContent = player.combo > 0 ? player.lastMove || 'MOVE / STRIKE / REPEAT' : 'MOVE / STRIKE / REPEAT';
    dom.flow.style.width = `${player.flow}%`;
    dom.flowText.textContent = `${Math.round(player.flow)}%`;
    dom.abilityText.textContent = player.overdriveUnlocked ? (player.flow >= 60 ? 'O // OVERDRIVE READY' : 'OVERDRIVE CHARGING') : 'CLEAR FIRST ENCOUNTER TO UNLOCK';
    dom.grade.textContent = getGrade();
    if (game.boss) {
      dom.bossHud.classList.remove('hidden');
      dom.bossHp.style.width = `${game.boss.hp / game.boss.maxHp * 100}%`;
      dom.bossPhase.textContent = game.boss.phase === 1 ? 'PHASE 01 / SIGNAL SHELL' : 'PHASE 02 / OVEREXPOSURE';
    } else dom.bossHud.classList.add('hidden');
  }

  function drawRoundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
  }

  function drawBackground() {
    const beat = game.beatPulse;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#100c26'); bg.addColorStop(.48, game.stage === 2 ? '#211044' : '#151039'); bg.addColorStop(1, '#090615');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * .52, H * .4, 40, W * .52, H * .4, 740);
    glow.addColorStop(0, `rgba(85,243,224,${.08 + beat * .05})`); glow.addColorStop(.45, 'rgba(132,108,255,.06)'); glow.addColorStop(1, 'rgba(9,6,21,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = .48;
    for (let i = 0; i < 18; i += 1) {
      const x = 30 + i * 82;
      const h = 80 + (i % 5) * 36;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,77,186,.12)' : 'rgba(85,243,224,.08)';
      ctx.fillRect(x, 115 - h, 44, h);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      for (let r = 0; r < 4; r += 1) ctx.fillRect(x + 7, 125 - h + r * 20, 30, 3);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(85,243,224,${.18 + beat * .12})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 170); ctx.lineTo(W, 170); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 11; i += 1) { const x = i * W / 10; ctx.beginPath(); ctx.moveTo(x, 180); ctx.lineTo(x - 130, 760); ctx.stroke(); }
    for (let i = 0; i < 7; i += 1) { const y = 205 + i * 78; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    drawWorldFloor(beat);
  }

  function drawWorldFloor(beat) {
    const floor = ctx.createLinearGradient(0, 180, 0, H);
    floor.addColorStop(0, 'rgba(21,14,57,.5)'); floor.addColorStop(1, 'rgba(7,5,20,.92)');
    ctx.fillStyle = floor; ctx.fillRect(0, 170, W, H - 170);
    ctx.save();
    ctx.globalAlpha = .36 + beat * .18;
    for (let i = 0; i < 12; i += 1) {
      const x = 92 + i * 110;
      const y = 225 + (i % 3) * 110;
      const color = i % 4 === 0 ? COLORS.pink : i % 3 === 0 ? COLORS.orange : COLORS.cyan;
      ctx.fillStyle = color; ctx.globalAlpha = .08 + beat * .06;
      ctx.fillRect(x, y, 6 + (i % 3) * 4, 80);
      ctx.globalAlpha = .28 + beat * .1; ctx.fillRect(x + 18, y + 35, 3, 42);
    }
    ctx.restore();
    const glowY = 688;
    const glow = ctx.createLinearGradient(0, glowY - 100, 0, glowY + 30);
    glow.addColorStop(0, 'rgba(255,77,186,0)'); glow.addColorStop(.6, `rgba(255,77,186,${.05 + beat * .05})`); glow.addColorStop(1, 'rgba(255,77,186,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, glowY - 100, W, 130);
  }

  function drawShadow(x, y, radius, alpha = .35) {
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.beginPath(); ctx.ellipse(x, y + radius * .75, radius * 1.15, radius * .35, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawPlayer() {
    const p = game.player;
    if (!p) return;
    const bob = Math.sin(p.idleTime * 2 + p.moveTime) * 3;
    const action = p.action;
    const attacking = action && ['light', 'heavy', 'launch', 'overdrive'].includes(action.type);
    const dodge = action?.type === 'dodge';
    drawShadow(p.x, p.y, p.radius * (dodge ? .7 : 1), p.invulnerable > 0 ? .18 : .38);
    p.trail.forEach((trail, index) => { if (index < p.trail.length - 1 && p.overdriveActive > 0) { ctx.save(); ctx.globalAlpha = trail.life / .18 * .2; ctx.fillStyle = trail.color; ctx.beginPath(); ctx.arc(trail.x, trail.y - p.z - 10, p.radius * .6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } });
    ctx.save();
    ctx.translate(p.x, p.y - p.z + bob);
    const lean = dodge ? -p.facing * 13 : attacking ? p.facing * 7 : 0;
    ctx.rotate(lean * .012);
    if (p.invulnerable > 0) ctx.globalAlpha = .48 + Math.sin(game.realTime * 30) * .22;
    ctx.fillStyle = p.hurtFlash > 0 ? COLORS.red : p.overdriveActive > 0 ? COLORS.lime : COLORS.paper;
    ctx.strokeStyle = p.overdriveActive > 0 ? COLORS.lime : COLORS.cyan;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-19, -64, 38, 61, 15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#20164e';
    ctx.beginPath(); ctx.roundRect(-14, -56, 28, 23, 9); ctx.fill();
    ctx.fillStyle = p.overdriveActive > 0 ? COLORS.lime : COLORS.cyan;
    ctx.beginPath(); ctx.arc(0, -46, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.overdriveActive > 0 ? COLORS.lime : COLORS.pink;
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    const arm = attacking ? (action.type === 'heavy' ? -1.05 : -1.45) : Math.sin(p.moveTime) * .25;
    ctx.beginPath(); ctx.moveTo(-13, -40); ctx.lineTo(-24, -24); ctx.lineTo(-38, -32 - arm * 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, -40); ctx.lineTo(25, -24); ctx.lineTo(38, -30 - arm * 13); ctx.stroke();
    ctx.strokeStyle = p.overdriveActive > 0 ? COLORS.lime : COLORS.orange; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(-16 + p.facing * 10, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -7); ctx.lineTo(16 + p.facing * 10, 8); ctx.stroke();
    if (attacking) {
      ctx.save(); ctx.globalAlpha = .72; ctx.strokeStyle = action.color || COLORS.cyan; ctx.lineWidth = 8; ctx.lineCap = 'round';
      const progress = action.t / action.duration;
      ctx.beginPath(); ctx.arc(p.facing * 5, -35, 42 + progress * 22, -1.1 + p.facing * .3, 1.25 + p.facing * .25); ctx.stroke(); ctx.restore();
    }
    if (action?.type === 'parry' && p.parryWindow > 0) { ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 3; ctx.globalAlpha = p.parryWindow / .24; ctx.beginPath(); ctx.arc(0, -30, 62, -1.4, 1.4); ctx.stroke(); }
    ctx.restore();
    if (p.parrySuccess > 0) { ctx.save(); ctx.globalAlpha = p.parrySuccess / .75; ctx.strokeStyle = COLORS.lime; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y - 30, 85, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }

  function drawEnemy(enemy) {
    if (!enemy) return;
    const color = enemy.flash > 0 ? COLORS.paper : enemy.color;
    const telegraphing = enemy.state === 'telegraph';
    const attack = enemy.state === 'attack';
    const bob = Math.sin(game.realTime * 4 + enemy.x) * 2;
    drawShadow(enemy.x, enemy.y, enemy.radius, .32);
    ctx.save();
    ctx.translate(enemy.x, enemy.y - enemy.z + bob);
    if (telegraphing) { ctx.globalAlpha = .35 + Math.sin(game.realTime * 26) * .25; ctx.fillStyle = COLORS.pink; ctx.beginPath(); ctx.arc(0, -enemy.radius, enemy.radius + 20, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (enemy.guard > 0) { ctx.strokeStyle = COLORS.orange; ctx.lineWidth = 4; ctx.globalAlpha = .6 + Math.sin(game.realTime * 15) * .25; ctx.beginPath(); ctx.arc(0, -enemy.radius, enemy.radius + 14, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.fillStyle = color; ctx.strokeStyle = enemy.kind === 'sable' ? COLORS.paper : COLORS.ink; ctx.lineWidth = 3;
    if (enemy.kind === 'pulse') {
      ctx.beginPath(); ctx.moveTo(0, -enemy.radius * 1.35); ctx.lineTo(enemy.radius, -enemy.radius * .25); ctx.lineTo(enemy.radius * .58, enemy.radius); ctx.lineTo(-enemy.radius * .58, enemy.radius); ctx.lineTo(-enemy.radius, -enemy.radius * .25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.paper; ctx.beginPath(); ctx.arc(0, -enemy.radius * .4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-enemy.radius * .7, -enemy.radius * .3); ctx.lineTo(-enemy.radius * 1.2, -enemy.radius * .8); ctx.moveTo(enemy.radius * .7, -enemy.radius * .3); ctx.lineTo(enemy.radius * 1.2, -enemy.radius * .8); ctx.stroke();
    } else if (enemy.kind === 'echo') {
      ctx.beginPath(); ctx.ellipse(0, -enemy.radius * .65, enemy.radius * .72, enemy.radius, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.paper; ctx.fillRect(-8, -enemy.radius * .9, 16, 4); ctx.fillRect(-8, -enemy.radius * .45, 16, 4);
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -enemy.radius * .65, enemy.radius * 1.28, 0, Math.PI * 2); ctx.stroke();
    } else if (enemy.kind === 'sable') {
      ctx.beginPath(); ctx.roundRect(-enemy.radius, -enemy.radius * 1.35, enemy.radius * 2, enemy.radius * 2.05, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.ink; ctx.fillRect(-enemy.radius * .55, -enemy.radius * .7, enemy.radius * 1.1, 7);
      ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-enemy.radius * .6, -enemy.radius * .3); ctx.lineTo(enemy.radius * .55, -enemy.radius * .3); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -enemy.radius * 1.35); ctx.lineTo(enemy.radius * .7, 0); ctx.lineTo(0, enemy.radius * 1.15); ctx.lineTo(-enemy.radius * .7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.paper; ctx.beginPath(); ctx.arc(0, -2, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (attack) { ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -enemy.radius, enemy.radius + 24, -.8, .8); ctx.stroke(); }
    ctx.restore();
    if (telegraphing) { ctx.save(); ctx.fillStyle = COLORS.paper; ctx.font = '800 11px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('READ THE BEAT', enemy.x, enemy.y - enemy.radius - 34); ctx.restore(); }
    if (enemy.hp < enemy.maxHp) { drawWorldBar(enemy.x - 34, enemy.y - enemy.radius - 22, 68, 5, enemy.hp / enemy.maxHp, color); }
  }

  function drawBoss() {
    const boss = game.boss;
    if (!boss) return;
    const color = boss.flash > 0 ? COLORS.paper : boss.phase === 2 ? COLORS.pink : COLORS.violet;
    const bob = Math.sin(game.realTime * 2.4) * 4;
    drawShadow(boss.x, boss.y, boss.radius, .5);
    ctx.save(); ctx.translate(boss.x, boss.y - boss.z + bob);
    if (boss.state === 'telegraph') { ctx.globalAlpha = .22 + Math.sin(game.realTime * 28) * .2; ctx.fillStyle = COLORS.pink; ctx.beginPath(); ctx.arc(0, -boss.radius, boss.radius + 30, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#17113b'; ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(-boss.radius, -boss.radius * 1.35, boss.radius * 2, boss.radius * 2.05, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -boss.radius * .55, boss.radius * .48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(0, -boss.radius * .55, boss.radius * .24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(i * 22, -boss.radius * .05); ctx.lineTo(i * 22, boss.radius * .65); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, -boss.radius * .55, boss.radius * .7, -1.1, 1.1); ctx.stroke();
    if (boss.phase === 2) { ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -boss.radius * .55, boss.radius * .86 + Math.sin(game.realTime * 8) * 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    if (boss.state === 'telegraph') { ctx.fillStyle = COLORS.paper; ctx.font = '900 13px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('COUNTER THE NEXT PHRASE', boss.x, boss.y - boss.radius - 48); }
  }

  function drawWorldBar(x, y, w, h, value, color) {
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(value, 0, 1), h);
  }

  function drawProjectiles() {
    game.projectiles.forEach(shot => {
      ctx.save(); ctx.globalAlpha = clamp(shot.life, 0, 1); ctx.fillStyle = shot.color; ctx.shadowColor = shot.color; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(shot.x, shot.y - shot.z, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha *= .5; ctx.beginPath(); ctx.arc(shot.x - shot.vx * .035, shot.y - shot.vy * .035, 14, 0, Math.PI * 2); ctx.strokeStyle = shot.color; ctx.stroke(); ctx.restore();
    });
    game.hazards.forEach(hazard => { ctx.save(); ctx.globalAlpha = .12 + hazard.age / hazard.duration * .2; ctx.fillStyle = COLORS.pink; ctx.fillRect(0, hazard.y - 7, W, 14); ctx.restore(); });
  }

  function drawEffects() {
    game.rings.forEach(ring => { ctx.save(); ctx.globalAlpha = ring.life / ring.maxLife; ctx.strokeStyle = ring.color; ctx.lineWidth = ring.width; ctx.beginPath(); ctx.ellipse(ring.x, ring.y - ring.z, ring.size, ring.size * .35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
    game.slashes.forEach(slash => { ctx.save(); ctx.globalAlpha = slash.life / slash.maxLife; ctx.strokeStyle = slash.color; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(slash.x - 72 * slash.angle, slash.y - slash.z - 58); ctx.quadraticCurveTo(slash.x + 20, slash.y - slash.z, slash.x + 90 * slash.angle, slash.y - slash.z + 30); ctx.stroke(); ctx.restore(); });
    game.particles.forEach(p => { ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 9; ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size * p.life / p.maxLife, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    game.floaters.forEach(f => { ctx.save(); ctx.globalAlpha = f.life / f.maxLife; ctx.fillStyle = f.color; ctx.font = `900 ${f.size}px Trebuchet MS`; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y - f.z); ctx.restore(); });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const shakeX = game.screenShake ? rand(-game.screenShake, game.screenShake) : 0;
    const shakeY = game.screenShake ? rand(-game.screenShake * .55, game.screenShake * .55) : 0;
    ctx.save(); ctx.translate(shakeX, shakeY);
    drawBackground();
    drawProjectiles();
    game.enemies.filter(enemy => enemy.alive || enemy.z > .05).sort((a, b) => a.y - b.y).forEach(drawEnemy);
    drawPlayer();
    drawBoss();
    drawEffects();
    ctx.restore();
    if (game.player?.overdriveActive > 0) { ctx.fillStyle = `rgba(215,255,106,${.04 + Math.sin(game.realTime * 8) * .02})`; ctx.fillRect(0, 0, W, H); }
    if (game.state === 'play' && game.player?.invulnerable > 0 && Math.floor(game.realTime * 18) % 2 === 0) { ctx.fillStyle = 'rgba(255,98,125,.05)'; ctx.fillRect(0, 0, W, H); }
  }

  function frame(now) {
    const rawDt = Math.min(.05, (now - game.lastFrame) / 1000);
    game.lastFrame = now;
    game.realTime += rawDt;
    if (game.state === 'play' && !game.paused) {
      if (audio.fallback) audio.updateFallback(rawDt);
      const scaled = rawDt * (game.hitstop > 0 ? .15 : 1);
      game.time += scaled;
      game.timeScale = game.hitstop > 0 ? .15 : 1;
      updateBeat();
      updatePlayer(scaled);
      updateEnemies(scaled);
      updateBoss(scaled);
      updateProjectiles(scaled);
      updateHazards(scaled);
      updateStage(scaled);
      updateEffects(rawDt);
      updateHud();
    } else if (game.state === 'title' || game.state === 'brief' || game.state === 'result') {
      game.time += rawDt;
      game.beatPulse = Math.max(0, game.beatPulse - rawDt * 2);
      if (game.state !== 'pause') updateEffects(rawDt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  function actionFromKey(key) {
    if (key === 'j' || key === 'z') return 'light';
    if (key === 'k' || key === 'x') return 'heavy';
    if (key === 'l' || key === 'shift') return 'launch';
    if (key === ' ') return 'dodge';
    if (key === 'i' || key === 'e') return 'parry';
    if (key === 'o' || key === 'q') return 'overdrive';
    return null;
  }

  function bindInput() {
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (key === 'enter') {
        if (game.state === 'title') { event.preventDefault(); startBrief(); }
        else if (game.state === 'brief') { event.preventDefault(); startRun(); }
        else if (game.state === 'result') { event.preventDefault(); resetRun(); startRun(); }
        return;
      }
      if (key === 'p' || key === 'escape') {
        event.preventDefault();
        if (game.state === 'play') { game.paused = !game.paused; dom.pause.classList.toggle('hidden', !game.paused); }
        return;
      }
      if (game.state !== 'play' || game.paused) return;
      if (key === 'w' || key === 'arrowup') game.input.up = true;
      if (key === 's' || key === 'arrowdown') game.input.down = true;
      if (key === 'a' || key === 'arrowleft') game.input.left = true;
      if (key === 'd' || key === 'arrowright') game.input.right = true;
      const action = actionFromKey(key);
      if (action) { event.preventDefault(); setAction(action); }
    });
    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') game.input.up = false;
      if (key === 's' || key === 'arrowdown') game.input.down = false;
      if (key === 'a' || key === 'arrowleft') game.input.left = false;
      if (key === 'd' || key === 'arrowright') game.input.right = false;
    });
    canvas.addEventListener('pointerdown', event => {
      if (game.state !== 'play' || game.paused) return;
      setAction(event.button === 2 ? 'heavy' : 'light');
    });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    dom.touch.querySelectorAll('[data-action]').forEach(button => {
      const action = button.dataset.action;
      const down = event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); if (['up', 'down', 'left', 'right'].includes(action)) game.touchInput[action] = true; else setAction(action); };
      const up = event => { event.preventDefault(); if (['up', 'down', 'left', 'right'].includes(action)) game.touchInput[action] = false; };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
    });
    dom.start.addEventListener('click', startBrief);
    dom.briefButton.addEventListener('click', startRun);
    dom.resume.addEventListener('click', () => { game.paused = false; dom.pause.classList.add('hidden'); });
    dom.replay.addEventListener('click', () => { resetRun(); startRun(); });
  }

  function resizeCanvas() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = dom.stage.getBoundingClientRect();
    canvas.width = Math.max(640, Math.floor(rect.width * ratio));
    canvas.height = Math.max(400, Math.floor(rect.height * ratio));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function init() {
    bindInput();
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    startTitle();
    window.ResonantRiot = {
      game,
      startRun,
      setAction,
      input: game.input,
      touchInput: game.touchInput,
      snapshot() {
        return {
          state: game.state,
          stage: game.stage,
          transition: game.transition,
          player: game.player ? { hp: game.player.hp, score: game.player.score, combo: game.player.combo, maxCombo: game.player.maxCombo, flow: game.player.flow, overdriveUnlocked: game.player.overdriveUnlocked } : null,
          enemies: game.enemies.map(enemy => ({ kind: enemy.kind, hp: enemy.hp, alive: enemy.alive, state: enemy.state })),
          boss: game.boss ? { hp: game.boss.hp, phase: game.boss.phase, alive: game.boss.alive, state: game.boss.state } : null,
          timingTotal: game.timingTotal,
          accuracyTotal: game.accuracyTotal,
          musicTime: audio.now(),
          track: audio.track,
          bpm: currentBeat().config.bpm
        };
      },
    };
    requestAnimationFrame(frame);
  }

  init();
})();
