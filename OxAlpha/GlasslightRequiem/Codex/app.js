const canvas = document.getElementById('stage');
const context = canvas.getContext('2d', { alpha: false });
const audio = document.getElementById('audio');
const intro = document.getElementById('intro');
const hud = document.getElementById('hud');
const endCard = document.getElementById('endCard');
const beginButton = document.getElementById('begin');
const pauseButton = document.getElementById('pause');
const replayButton = document.getElementById('replay');
const progress = document.getElementById('progress');
const markers = document.getElementById('markers');
const timecode = document.getElementById('timecode');
const actLabel = document.getElementById('actLabel');
const chapterIndex = document.getElementById('chapterIndex');
const chapterTitle = document.getElementById('chapterTitle');
const chapterText = document.getElementById('chapterText');
const resonanceValue = document.getElementById('resonanceValue');
const progressWrap = document.querySelector('.progress-wrap');

const SECTION_TEXT = {
  waking: ['I', 'WAKING GLASS', 'A dormant lattice remembers the shape of a flame.'],
  ember: ['II', 'EMBER CURRENT', 'A pulse learns to travel through the dark.'],
  choir: ['III', 'CHOIR OF LINES', 'Every struck note becomes a room with walls.'],
  fracture: ['IV', 'THE FRACTURE', 'The pressure finds the one seam that can open.'],
  afterglow: ['V', 'AFTERGLOW', 'The world is quieter, but not empty.'],
  'ember-return': ['VI', 'EMBER RETURN', 'The surviving light chooses to move again.'],
};

const palette = {
  waking: { bg: ['#081116', '#102a2b'], glass: '#8fe3cb', ember: '#f35f39', count: 34 },
  ember: { bg: ['#100c0e', '#351a18'], glass: '#9bc8bb', ember: '#ff6334', count: 54 },
  choir: { bg: ['#090d16', '#1c1b2f'], glass: '#b5d7d4', ember: '#ff8050', count: 76 },
  fracture: { bg: ['#16070b', '#3d1119'], glass: '#f2c0a4', ember: '#ff3e27', count: 88 },
  afterglow: { bg: ['#07100f', '#102422'], glass: '#9adbc8', ember: '#ff9160', count: 28 },
  'ember-return': { bg: ['#0d0b0d', '#361a1c'], glass: '#b3d6ce', ember: '#ff4f2d', count: 64 },
};

const score = {
  duration: 96.90322580645162,
  beat: 60 / 124,
  sections: [
    { id: 'waking', start: 0, end: 15.4839 },
    { id: 'ember', start: 15.4839, end: 30.9677 },
    { id: 'choir', start: 30.9677, end: 54.1935 },
    { id: 'fracture', start: 54.1935, end: 61.9355 },
    { id: 'afterglow', start: 61.9355, end: 77.4194 },
    { id: 'ember-return', start: 77.4194, end: 92.9032 },
  ],
  events: [
    { time: 7.742, type: 'firstPulse', strength: .48 },
    { time: 15.484, type: 'emberIgnite', strength: .68 },
    { time: 29.032, type: 'emberIgnite', strength: .9 },
    { time: 30.968, type: 'choirOpen', strength: .78 },
    { time: 46.452, type: 'choirSurge', strength: .94 },
    { time: 54.194, type: 'fracture', strength: 1 },
    { time: 61.935, type: 'afterglow', strength: .42 },
    { time: 77.419, type: 'emberReturn', strength: 1 },
    { time: 89.032, type: 'resolve', strength: .28 },
  ],
};

const sectionEnergy = { waking: .18, ember: .48, choir: .72, fracture: .96, afterglow: .38, 'ember-return': .88 };

let width = 0;
let height = 0;
let pixelRatio = 1;
let started = false;
let ended = false;
let lastTime = performance.now();
let currentSection = '';
let currentBeatIndex = -1;
let impact = 0;
let beatPulse = 0;
let resonance = 0.5;
let targetResonance = 0.5;
let audioContext = null;
let analyser = null;
let frequencyData = null;
let sourceNode = null;
let sourceStartedAt = 0;
let sourceOffset = 0;
let sourcePaused = false;
let sourceLoaded = false;
let interactionPulse = 0;
let visualTime = 0;
let particles = [];
let shards = [];
let rings = [];
let stars = [];
let spine = [];
let seenEvents = new Set();
let lastFrameStats = { fps: 0, samples: 0, started: performance.now() };
let glowCanvas = null;
let glowContext = null;

const random = (min = 0, max = 1) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = (value) => value * value * (3 - 2 * value);
const rgba = (hex, alpha) => {
  const [red, green, blue] = hexToRgb(hex);
  const safeAlpha = Number.isFinite(alpha) ? alpha : 1;
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
};

function hexToRgb(hex) {
  const value = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid palette color: ${hex}`);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function setupCanvas() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  glowCanvas = document.createElement('canvas');
  glowCanvas.width = Math.max(1, Math.floor(width * pixelRatio));
  glowCanvas.height = Math.max(1, Math.floor(height * pixelRatio));
  glowContext = glowCanvas.getContext('2d');
  buildScene();
}

function buildScene() {
  const rng = Math.random;
  particles = Array.from({ length: 180 }, (_, index) => ({
    angle: rng() * Math.PI * 2,
    radius: random(.12, 1.3),
    depth: random(.2, 1),
    size: random(.3, 1.9),
    offset: rng() * Math.PI * 2,
    seed: rng() * 100,
    hue: index % 5 === 0 ? 'ember' : 'glass',
  }));
  shards = Array.from({ length: 22 }, (_, index) => ({
    angle: (index / 22) * Math.PI * 2 + random(-.12, .12),
    inner: random(.13, .23),
    outer: random(.29, .38),
    width: random(.008, .026),
    seed: rng() * 30,
  }));
  rings = Array.from({ length: 8 }, (_, index) => ({ index, seed: rng() * 10 }));
  stars = Array.from({ length: 90 }, () => ({ x: rng(), y: rng(), size: random(.2, 1.5), alpha: random(.15, .8), seed: rng() * 20 }));
  spine = Array.from({ length: 14 }, (_, index) => ({ x: index / 13, seed: rng() * 10 }));
}

function getSection(time) {
  const selected = score.sections.find((section) => time >= section.start && time < section.end) || score.sections[score.sections.length - 1];
  return { ...selected, energy: sectionEnergy[selected.id] ?? .4 };
}

function getSectionProgress(time, section) {
  return clamp((time - section.start) / Math.max(.001, section.end - section.start), 0, 1);
}

function getAudioTime() {
  if (!started || !audioContext) return 0;
  if (sourcePaused) return sourceOffset;
  return clamp(sourceOffset + Math.max(0, audioContext.currentTime - sourceStartedAt), 0, score.duration);
}

function formatTime(value) {
  const safe = Math.max(0, Math.floor(value));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function updateAudioAnalysis() {
  if (!analyser || !frequencyData) return;
  analyser.getByteFrequencyData(frequencyData);
  let total = 0;
  for (let index = 0; index < frequencyData.length; index += 1) total += frequencyData[index];
  const average = total / frequencyData.length / 255;
  beatPulse = lerp(beatPulse, average, .14);
  const transportPlaying = sourceLoaded ? !sourcePaused : !audio.paused;
  if (started && transportPlaying) {
    const beatPosition = audio.currentTime / score.beat;
    const beatIndex = Math.floor(beatPosition);
    if (beatIndex !== currentBeatIndex) {
      currentBeatIndex = beatIndex;
      beatPulse = Math.max(beatPulse, .32);
      interactionPulse += .08;
    }
  }
}

function setSectionUI(section) {
  if (currentSection === section.id) return;
  currentSection = section.id;
  const copy = SECTION_TEXT[section.id];
  chapterIndex.textContent = copy[0];
  chapterTitle.textContent = copy[1];
  chapterText.textContent = copy[2];
  actLabel.textContent = `${copy[0]} · ${copy[1]}`;
  chapterCard.classList.remove('chapter-shift');
  void chapterCard.offsetWidth;
  chapterCard.classList.add('chapter-shift');
}

const chapterCard = document.getElementById('chapterCard');

function updateHud(time) {
  const section = getSection(time);
  setSectionUI(section);
  const percentage = clamp(time / score.duration * 100, 0, 100);
  progress.style.width = `${percentage}%`;
  timecode.textContent = `${formatTime(time)} / ${formatTime(score.duration)}`;
  progressWrap.setAttribute('aria-valuenow', String(Math.round(percentage)));
  const active = score.events.filter((event) => event.time <= time);
  const latest = active[active.length - 1];
  if (latest) resonanceValue.textContent = latest.type === 'fracture' ? 'UNBOUND' : latest.type === 'emberReturn' ? 'ALIGNED' : 'AWAKENED';
}

function updateEvents(time) {
  for (let index = 0; index < score.events.length; index += 1) {
    const event = score.events[index];
    if (time >= event.time && !seenEvents.has(index)) {
      seenEvents.add(index);
      impact = Math.max(impact, event.strength);
      interactionPulse += event.strength * .8;
      if (event.type === 'fracture' || event.type === 'emberReturn') {
        resonance = Math.max(resonance, .94);
        targetResonance = .9;
      }
    }
  }
}

async function makeAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = .82;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
  if (sourceLoaded) return;
  try {
    const response = await fetch('music/Glasslight_Requiem_preview.mp3');
    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
    const encoded = await response.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(encoded);
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = decoded;
    sourceNode.connect(analyser);
    sourceNode.onended = () => {
      if (sourcePaused || getAudioTime() < score.duration - .12) return;
      ended = true;
      hud.hidden = true;
      endCard.hidden = false;
    };
    sourceLoaded = true;
  } catch (error) {
    sourceLoaded = false;
    sourceNode = null;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function startSourceFrom(offset) {
  if (!audioContext || !sourceNode || !sourceLoaded) return;
  const buffer = sourceNode.buffer;
  try { sourceNode.stop(); } catch (error) { }
  sourceNode.disconnect();
  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = buffer;
  sourceOffset = clamp(offset, 0, Math.max(0, score.duration - .01));
  sourceStartedAt = audioContext.currentTime;
  sourcePaused = false;
  sourceNode.connect(analyser);
  sourceNode.start(0, sourceOffset);
}

function beginExperience() {
  sourceOffset = 0;
  sourcePaused = false;
  if (sourceNode) {
    try { sourceNode.stop(); } catch (error) { }
  }
  makeAudioContext().then(() => {
    sourceOffset = 0;
    if (sourceLoaded) startSourceFrom(0);
    else audio.play().catch(() => {});
  });
  started = true;
  ended = false;
  seenEvents.clear();
  currentBeatIndex = -1;
  intro.classList.add('is-hidden');
  hud.hidden = false;
  endCard.hidden = true;
}

function replayExperience() {
  seenEvents.clear();
  currentBeatIndex = -1;
  ended = false;
  endCard.hidden = true;
  hud.hidden = false;
  if (sourceLoaded) startSourceFrom(0);
  else {
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function pauseExperience() {
  if (!started) return;
  if (sourceLoaded) {
    if (sourcePaused) {
      startSourceFrom(sourceOffset);
    } else {
      sourceOffset = getAudioTime();
      sourcePaused = true;
      try { sourceNode.stop(); } catch (error) { }
    }
    pauseButton.textContent = 'Ⅱ';
  } else {
    if (audio.paused) {
      audio.play().catch(() => {});
      pauseButton.textContent = 'Ⅱ';
    } else {
      audio.pause();
      pauseButton.textContent = '▶';
    }
  }
}

function seekFromPointer(event) {
  const rect = progressWrap.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const target = ratio * score.duration;
  if (sourceLoaded) startSourceFrom(target);
  else audio.currentTime = target;
  visualTime = target;
  impact = Math.max(impact, .12);
}

function handlePointer(event) {
  if (!started || ended) return;
  const normalizedX = event.clientX / Math.max(width, 1);
  const normalizedY = event.clientY / Math.max(height, 1);
  targetResonance = clamp(.5 + Math.sin(normalizedX * Math.PI) * .22 - Math.abs(normalizedY - .5) * .15, .18, .92);
  interactionPulse = Math.max(interactionPulse, .1);
  if (event.type === 'pointerdown' && event.target === canvas) interactionPulse = Math.max(interactionPulse, .25);
}

function addMarkers() {
  markers.innerHTML = score.events.map((event) => `<i style="left:${clamp(event.time / score.duration * 100, 0, 100)}%"></i>`).join('');
}

function drawBackground(time, section, sectionProgress, colors) {
  const phase = time / score.duration;
  const pulse = Math.max(beatPulse, impact);
  const glow = .1 + section.energy * .12 + pulse * .12;
  const gradient = context.createRadialGradient(width * .5, height * .5, 0, width * .5, height * .5, Math.max(width, height) * .72);
  gradient.addColorStop(0, rgba(colors.bg[1], .88 + glow * .1));
  gradient.addColorStop(.34, rgba(colors.bg[0], .96));
  gradient.addColorStop(1, '#030507');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const sideGlow = context.createLinearGradient(0, 0, width, 0);
  sideGlow.addColorStop(0, rgba(colors.ember, .04 + section.energy * .04));
  sideGlow.addColorStop(.5, 'rgba(0,0,0,0)');
  sideGlow.addColorStop(1, rgba(colors.glass, .035 + section.energy * .035));
  context.fillStyle = sideGlow;
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = .22 + section.energy * .18;
  for (const star of stars) {
    const twinkle = .55 + .45 * Math.sin(time * 1.7 + star.seed);
    context.fillStyle = `rgba(183, 220, 211, ${star.alpha * twinkle * .55})`;
    context.fillRect(star.x * width, star.y * height, star.size, star.size);
  }
  context.restore();
  const haze = context.createLinearGradient(0, height * .3, 0, height);
  haze.addColorStop(0, 'rgba(0,0,0,0)');
  haze.addColorStop(1, `rgba(1, 4, 6, ${.28 + (1 - section.energy) * .16})`);
  context.fillStyle = haze;
  context.fillRect(0, 0, width, height);
  context.save();
  context.globalAlpha = .06 + section.energy * .05;
  context.strokeStyle = colors.glass;
  context.lineWidth = 1;
  for (let index = 0; index < 6; index += 1) {
    const offset = ((phase * .16 + index / 6) % 1) * width;
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset - width * .2, height);
    context.stroke();
  }
  context.restore();
}

function drawSpine(time, section, sectionProgress, colors) {
  const centerX = width * .5;
  const top = height * .18;
  const bottom = height * .83;
  const total = bottom - top;
  context.save();
  context.lineCap = 'round';
  const segments = spine.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const pointA = spine[index];
    const pointB = spine[index + 1];
    const xA = centerX + (pointA.x - .5) * width * .22 + Math.sin(time * .45 + pointA.seed) * width * .018;
    const yA = top + pointA.x * total;
    const xB = centerX + (pointB.x - .5) * width * .22 + Math.sin(time * .45 + pointB.seed) * width * .018;
    const yB = top + pointB.x * total;
    const segmentProgress = (index + 1) / segments;
    const reveal = clamp((sectionProgress + .12) * (1 + section.energy * .8) - segmentProgress * .3, 0, 1);
    const gradient = context.createLinearGradient(xA, yA, xB, yB);
    gradient.addColorStop(0, rgba(colors.glass, .08 + reveal * .32));
    gradient.addColorStop(.5, rgba(colors.ember, .08 + reveal * .5 + beatPulse * .16));
    gradient.addColorStop(1, rgba(colors.glass, .04 + reveal * .25));
    context.strokeStyle = gradient;
    context.lineWidth = 1 + reveal * 2.6 + impact * 3;
    context.shadowBlur = 8 + reveal * 22;
    context.shadowColor = colors.ember;
    context.beginPath();
    context.moveTo(xA, yA);
    context.bezierCurveTo(
      xA + Math.sin(time * .7 + pointA.seed) * 32,
      (yA + yB) * .5,
      xB + Math.cos(time * .6 + pointB.seed) * 32,
      (yA + yB) * .5,
      xB,
      yB,
    );
    context.stroke();
  }
  for (let index = 0; index < spine.length; index += 1) {
    const point = spine[index];
    const y = top + point.x * total;
    const x = centerX + (point.x - .5) * width * .22 + Math.sin(time * .45 + point.seed) * width * .018;
    const glow = .3 + beatPulse * .55 + (index % 3 === 0 ? resonance * .2 : 0);
    context.fillStyle = rgba(colors.ember, glow);
    context.shadowColor = colors.ember;
    context.shadowBlur = 12 + glow * 22;
    context.beginPath();
    context.arc(x, y, 1.4 + beatPulse * 2.4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawLattice(time, section, sectionProgress, colors) {
  const centerX = width * .5;
  const centerY = height * .53;
  const radius = Math.min(width, height) * (.24 + section.energy * .08);
  const fracture = section.id === 'fracture' ? 1 : 0;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(Math.sin(time * .12) * .06);
  context.globalAlpha = .2 + section.energy * .44;
  context.shadowBlur = 15 + section.energy * 20;
  for (let index = 0; index < shards.length; index += 1) {
    const shard = shards[index];
    const wobble = Math.sin(time * .35 + shard.seed) * .012;
    const open = fracture ? .018 + impact * .1 : 0;
    const inner = radius * (shard.inner + open);
    const outer = radius * (shard.outer + open * .5);
    const angle = shard.angle + wobble;
    const angle2 = angle + shard.width;
    context.fillStyle = index % 3 === 0 ? rgba(colors.ember, .55) : rgba(colors.glass, .38);
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.lineTo(Math.cos(angle2) * outer, Math.sin(angle2) * outer);
    context.lineTo(Math.cos(angle2) * inner, Math.sin(angle2) * inner);
    context.closePath();
    context.fill();
    context.strokeStyle = rgba(index % 4 === 0 ? colors.ember : colors.glass, .28 + beatPulse * .3);
    context.lineWidth = .7 + impact * 2.4;
    context.stroke();
  }
  context.rotate(-Math.sin(time * .12) * .06);
  const halo = context.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
  halo.addColorStop(0, rgba(colors.ember, .18 + impact * .32));
  halo.addColorStop(.24, rgba(colors.ember, .08 + impact * .12));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRings(time, section, sectionProgress, colors) {
  const centerX = width * .5;
  const centerY = height * .53;
  const base = Math.min(width, height);
  context.save();
  for (const ring of rings) {
    const cycle = (time * (.018 + ring.index * .003) + ring.seed) % 1;
    const opacity = (1 - cycle) * (.08 + section.energy * .2);
    const radius = base * (.12 + cycle * .55);
    context.strokeStyle = rgba(ring.index % 2 ? colors.ember : colors.glass, opacity);
    context.lineWidth = .6 + (1 - cycle) * (1.2 + impact);
    context.setLineDash(ring.index % 2 ? [2, 11] : []);
    context.beginPath();
    context.ellipse(centerX, centerY, radius, radius * (.48 + section.energy * .08), Math.sin(time * .05 + ring.seed) * .2, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawParticles(time, section, colors) {
  const centerX = width * .5;
  const centerY = height * .53;
  const base = Math.min(width, height);
  const flow = section.id === 'afterglow' ? .28 : .56;
  context.save();
  for (const particle of particles) {
    if (particle.depth > .4 && section.energy < .35) continue;
    const orbit = particle.angle + time * flow * (.35 + particle.depth * .45);
    const breath = 1 + Math.sin(time * (.8 + particle.depth) + particle.offset) * (.025 + resonance * .025);
    const radius = base * particle.radius * breath;
    const x = centerX + Math.cos(orbit) * radius * (section.id === 'fracture' ? 1.15 : .9);
    const y = centerY + Math.sin(orbit) * radius * .55;
    const depthAlpha = .18 + particle.depth * .52;
    const color = particle.hue === 'ember' ? colors.ember : colors.glass;
    context.fillStyle = rgba(color, depthAlpha * (.35 + resonance * .45 + beatPulse * .2));
    const size = particle.size * (1 + beatPulse * .7 + impact * .8);
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
}

function drawEmber(time, section, sectionProgress, colors) {
  const centerX = width * .5 + Math.sin(time * .35) * width * .018 * resonance;
  const centerY = height * .53 + Math.cos(time * .28) * height * .012 * resonance;
  const pulse = 1 + beatPulse * .34 + impact * .55;
  const radius = Math.min(width, height) * (.022 + section.energy * .018) * pulse;
  context.save();
  context.globalCompositeOperation = 'screen';
  if (glowContext) {
    const glowRadius = radius * 4.5;
    const textureRadius = Math.min(glowCanvas.width, glowCanvas.height) * .18;
    glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowContext.save();
    glowContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const gradient = glowContext.createRadialGradient(0, 0, 0, 0, 0, textureRadius);
    gradient.addColorStop(0, 'rgba(255,246,220,.98)');
    gradient.addColorStop(.08, rgba(colors.ember, .98));
    gradient.addColorStop(.35, rgba(colors.ember, .34));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    glowContext.translate(centerX, centerY);
    glowContext.scale(glowRadius / textureRadius, glowRadius / textureRadius);
    glowContext.fillStyle = gradient;
    glowContext.beginPath();
    glowContext.arc(0, 0, textureRadius, 0, Math.PI * 2);
    glowContext.fill();
    glowContext.restore();
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = .9;
    context.drawImage(glowCanvas, 0, 0, width, height);
    context.restore();
  }
  context.fillStyle = 'rgba(255, 249, 225, .96)';
  context.beginPath();
  context.arc(centerX, centerY, radius * .32, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawFractureLines(time, section, colors) {
  if (section.id !== 'fracture' && section.id !== 'ember-return') return;
  const centerX = width * .5;
  const centerY = height * .53;
  const radius = Math.min(width, height) * .42;
  const active = section.id === 'fracture' ? impact : resonance;
  context.save();
  context.globalAlpha = .18 + active * .42;
  context.strokeStyle = colors.ember;
  context.lineWidth = 1 + active * 2.2;
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2 + time * .015;
    const length = radius * (.25 + .2 * (index % 3) + active * .28);
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * radius * .1, centerY + Math.sin(angle) * radius * .1);
    context.lineTo(centerX + Math.cos(angle + .08) * length, centerY + Math.sin(angle + .08) * length * .62);
    context.stroke();
  }
  context.restore();
}

function drawTitleOrbit(time, section, sectionProgress, colors) {
  if (section.id !== 'waking' && section.id !== 'afterglow') return;
  const centerX = width * .5;
  const centerY = height * .53;
  const base = Math.min(width, height);
  context.save();
  context.translate(centerX, centerY);
  context.rotate(-.16 + Math.sin(time * .08) * .04);
  context.globalAlpha = .36 + section.energy * .26;
  context.strokeStyle = rgba(colors.glass, .6);
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(0, 0, base * .34, base * .12, .1, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = rgba(colors.ember, .48);
  context.beginPath();
  context.ellipse(0, 0, base * .28, base * .1, -.1, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawFrame(time, section, colors) {
  const sectionProgress = getSectionProgress(time, section);
  drawBackground(time, section, sectionProgress, colors);
  drawRings(time, section, sectionProgress, colors);
  drawTitleOrbit(time, section, sectionProgress, colors);
  drawSpine(time, section, sectionProgress, colors);
  drawLattice(time, section, sectionProgress, colors);
  drawParticles(time, section, colors);
  drawFractureLines(time, section, colors);
  drawEmber(time, section, sectionProgress, colors);
  if (section.id === 'fracture') {
    context.save();
    context.globalAlpha = .12 + impact * .25;
    context.fillStyle = colors.ember;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
}

function updateLoop(now) {
  const delta = Math.min(.05, (now - lastTime) / 1000);
  lastTime = now;
  visualTime += delta;
  updateAudioAnalysis();
  const time = getAudioTime();
  const section = getSection(time);
  impact = Math.max(0, impact - delta * 1.8);
  interactionPulse = Math.max(0, interactionPulse - delta * 1.5);
  resonance = lerp(resonance, targetResonance, .045);
  if (time > 0) updateEvents(time);
  if (started) updateHud(time);
  drawFrame(visualTime, section, palette[section.id] || palette.waking);
  const filmTime = getAudioTime();
  if (started && filmTime >= score.duration - .035 && !ended) {
    ended = true;
    hud.hidden = true;
    endCard.hidden = false;
    canvas.classList.add('is-ended');
  }
  lastFrameStats.samples += 1;
  if (now - lastFrameStats.started > 1000) {
    lastFrameStats.fps = lastFrameStats.samples * 1000 / (now - lastFrameStats.started);
    lastFrameStats.samples = 0;
    lastFrameStats.started = now;
  }
  requestAnimationFrame(updateLoop);
}

function setupEvents() {
  beginButton.addEventListener('click', beginExperience);
  replayButton.addEventListener('click', replayExperience);
  pauseButton.addEventListener('click', pauseExperience);
  progressWrap.addEventListener('pointerdown', seekFromPointer);
  window.addEventListener('pointermove', handlePointer, { passive: true });
  window.addEventListener('resize', setupCanvas, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && started && !ended) {
      event.preventDefault();
      pauseExperience();
    }
    if (event.key.toLowerCase() === 'r' && started) replayExperience();
  });
  audio.addEventListener('ended', () => {
    if (sourceLoaded) return;
    ended = true;
    hud.hidden = true;
    endCard.hidden = false;
  });
  addMarkers();
  setupCanvas();
  requestAnimationFrame(updateLoop);
}

window.__glasslight = {
  get started() { return started; },
  get ended() { return ended; },
  get time() { return getAudioTime(); },
  get fps() { return lastFrameStats.fps; },
  get section() { return currentSection; },
  get sourceLoaded() { return sourceLoaded; },
  beginExperience,
  pauseExperience,
  replayExperience,
  seek(time) {
    const target = clamp(Number(time) || 0, 0, score.duration - .01);
    if (sourceLoaded) startSourceFrom(target);
    else audio.currentTime = target;
    visualTime = target;
    return getAudioTime();
  },
};

setupEvents();
