import * as THREE from 'three';
import { CFG, RARITY, CONSUMABLES } from './config.js';
import { S } from './state.js';
import { WEAPONS } from './weapons.js';
import { POIS, getMapCanvas } from './terrain.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);
let els = {};
let mapCanvasBig = null;
const dmgNumbers = [];
const toasts = [];
let hitmarkT = 0;
let hurtT = 0;
let castBar = null;

export function initUI() {
  els = {
    lobby: $('lobby'), playBtn: $('playBtn'), qualitySel: $('qualitySel'),
    sensSlider: $('sensSlider'), sensVal: $('sensVal'),
    hud: $('hud'),
    hpFill: $('hpFill'), hpNum: $('hpNum'),
    shFill: $('shFill'), shNum: $('shNum'),
    matsWood: $('matsWood'), matsBrick: $('matsBrick'), matsMetal: $('matsMetal'),
    hotbar: $('hotbar'),
    ammoBox: $('ammoBox'), magCount: $('magCount'), reserveCount: $('reserveCount'),
    aliveNum: $('aliveNum'), killsNum: $('killsNum'),
    minimap: $('minimap'),
    stormPill: $('stormPill'), stormLabel: $('stormLabel'), stormTimer: $('stormTimer'),
    crosshair: $('crosshair'),
    interact: $('interact'),
    killfeed: $('killfeed'),
    announceEl: $('announce'), announceMain: $('announceMain'), announceSub: $('announceSub'),
    vignetteHurt: $('vignetteHurt'), vignetteStorm: $('vignetteStorm'),
    buildBanner: $('buildBanner'),
    toasts: $('toasts'),
    pause: $('pause'),
    resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
    sensSlider2: $('sensSlider2'), volSlider: $('volSlider'),
    invX: $('invX'), invY: $('invY'),
    deathScreen: $('deathScreen'), deathPlace: $('deathPlace'), deathKills: $('deathKills'),
    againBtn: $('againBtn'), spectateBtn: $('spectateBtn'),
    victoryScreen: $('victoryScreen'), victoryStats: $('victoryStats'),
    victoryAgainBtn: $('victoryAgainBtn'),
    compass: $('compass'),
    bigMapWrap: $('bigMapWrap'), bigMap: $('bigMap'),
    castbar: $('castbar'), castfill: $('castfill'), castlabel: $('castlabel'),
    reloadBar: $('reloadBar'), reloadFill: $('reloadFill'),
    fpsCounter: $('fpsCounter'),
    scopeOverlay: $('scopeOverlay'),
  };

  els.playBtn.addEventListener('click', () => S.emit('playClicked'));
  els.resumeBtn.addEventListener('click', () => S.emit('resumeClicked'));
  els.quitBtn.addEventListener('click', () => location.reload());
  els.againBtn.addEventListener('click', () => playAgain());
  els.spectateBtn.addEventListener('click', () => S.emit('spectateClicked'));
  els.victoryAgainBtn.addEventListener('click', () => playAgain());
  els.qualitySel.addEventListener('change', () => S.emit('qualityChanged', { value: els.qualitySel.value }));
  els.sensSlider.addEventListener('input', () => {
    S.settings.sens = parseFloat(els.sensSlider.value);
    els.sensVal.textContent = S.settings.sens.toFixed(2);
    if (els.sensSlider2) els.sensSlider2.value = els.sensSlider.value;
  });
  els.sensSlider2?.addEventListener('input', () => {
    S.settings.sens = parseFloat(els.sensSlider2.value);
    els.sensVal.textContent = S.settings.sens.toFixed(2);
    els.sensSlider.value = els.sensSlider2.value;
  });
  els.volSlider?.addEventListener('input', () => S.emit('volumeChanged', { value: parseFloat(els.volSlider.value) }));
  els.invX?.addEventListener('change', () => { S.settings.invertX = els.invX.checked; });
  els.invY?.addEventListener('change', () => { S.settings.invertY = els.invY.checked; });

  S.events.addEventListener('kill', (e) => addKillfeed(e.detail));
  S.events.addEventListener('toast', (e) => addToast(e.detail.text));
  S.events.addEventListener('hitmark', () => { hitmarkT = 0.18; });
  S.events.addEventListener('playerHurt', () => { hurtT = 0.5; });
  S.events.addEventListener('inventoryChanged', () => renderHotbar());
  S.events.addEventListener('slotChanged', () => renderHotbar());
  S.events.addEventListener('ammoChanged', () => updateAmmoUI());
  S.events.addEventListener('mats', () => updateMatsUI());
  S.events.addEventListener('castStarted', (e) => startCastBar(e.detail.dur));
  S.events.addEventListener('castEnded', () => endCastBar());
  S.events.addEventListener('reloadStarted', (e) => startReloadBar(e.detail.dur));
  S.events.addEventListener('buildChanged', () => updateBuildBanner());
  S.events.addEventListener('announce', (e) => announce(e.detail.text, e.detail.sub, e.detail.time));
  S.events.addEventListener('playerDied', () => showDeath());
  S.events.addEventListener('victory', () => showVictory());

  renderHotbar();
  updateMatsUI();
}

function playAgain() {
  sessionStorage.setItem('skyfall_autostart', '1');
  location.reload();
}

export function hideLobby() {
  els.lobby.style.display = 'none';
  els.hud.style.display = 'block';
}

export function showPause(show) {
  els.pause.style.display = show ? 'flex' : 'none';
}

function showDeath() {
  setTimeout(() => {
    els.deathScreen.style.display = 'flex';
    els.deathPlace.textContent = `#${S.match.placement} of ${CFG.TOTAL_PLAYERS}`;
    els.deathKills.textContent = `${S.match.kills} elimination${S.match.kills === 1 ? '' : 's'}`;
  }, 900);
}

function showVictory() {
  sfxVictory();
  els.victoryScreen.style.display = 'flex';
  els.victoryStats.textContent = `${S.match.kills} elimination${S.match.kills === 1 ? '' : 's'} · ${aliveText()}`;
}
function aliveText() { return `${CFG.TOTAL_PLAYERS} players`; }
function sfxVictory() {
  import('./audio.js').then(a => a.sfx.victory());
}

export function announce(text, sub = '', time = 2.5) {
  els.announceMain.textContent = text;
  els.announceSub.textContent = sub;
  els.announceEl.style.display = 'block';
  clearTimeout(els._annTimer);
  els._annTimer = setTimeout(() => { els.announceEl.style.display = 'none'; }, time * 1000);
}

function addKillfeed({ victim, killer, byPlayer, remaining }) {
  const div = document.createElement('div');
  div.className = 'kill-entry' + (byPlayer ? ' by-player' : '');
  div.innerHTML = `<span class="k">${esc(killer)}</span><span class="x"> ⟶ </span><span class="v">${esc(victim)}</span>`;
  els.killfeed.prepend(div);
  while (els.killfeed.children.length > 6) els.killfeed.lastChild.remove();
  setTimeout(() => div.remove(), 8000);
  if (byPlayer) announce(`ELIMINATED ${victim.toUpperCase()}`, `${remaining} players remain`, 1.8);
}

function esc(s) {
  return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function addToast(text) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  els.toasts.appendChild(div);
  while (els.toasts.children.length > 5) els.toasts.firstChild.remove();
  setTimeout(() => div.remove(), 2200);
}

export function renderHotbar() {
  const p = S.player;
  if (!p) return;
  let html = '';
  for (let i = 0; i < 6; i++) {
    const item = p.slots[i];
    let inner = '';
    let cls = 'slot';
    let key = i === 0 ? '1' : String(i + 1);
    if (item) {
      if (item.cat === 'pickaxe') {
        inner = `<div class="slot-icon pickaxe"></div>`;
        cls += ' pickaxe-slot';
      } else if (item.cat === 'weapon') {
        const r = RARITY[item.rarity || 0];
        cls += ' has-item';
        inner = `<div class="slot-icon" style="--rc:${r.color}"></div><span class="slot-ammo">${item.mag}</span><span class="slot-name" style="color:${r.color}">${WEAPONS[item.defId].name}</span>`;
      } else if (item.cat === 'consumable') {
        cls += ' has-item consumable-slot';
        const def = CONSUMABLES[item.id];
        inner = `<div class="slot-icon cons" style="--cc:${def.color}"></div><span class="slot-count">x${item.count}</span><span class="slot-name">${def.name}</span>`;
      }
    }
    if (i === p.sel) cls += ' active';
    html += `<div class="${cls}" data-idx="${i}"><span class="slot-key">${key}</span>${inner}</div>`;
  }
  els.hotbar.innerHTML = html;
  updateAmmoUI();
}

export function updateAmmoUI() {
  const p = S.player;
  if (!p) return;
  const item = p.slots[p.sel];
  if (item && item.cat === 'weapon') {
    const w = WEAPONS[item.defId];
    els.ammoBox.style.display = 'block';
    els.magCount.textContent = item.mag;
    els.reserveCount.textContent = p.ammo[w.ammo] ?? 0;
  } else {
    els.ammoBox.style.display = 'none';
  }
}

export function updateMatsUI() {
  const p = S.player;
  if (!p) return;
  els.matsWood.textContent = p.mats.wood;
  els.matsBrick.textContent = p.mats.brick;
  els.matsMetal.textContent = p.mats.metal;
}

export function spawnDamageNumber(worldPos, amount, kind) {
  if (dmgNumbers.length > 24) {
    const old = dmgNumbers.shift();
    old.el.remove();
  }
  const el = document.createElement('div');
  el.className = 'dmg-num ' + (kind || '');
  el.textContent = Math.round(amount);
  document.getElementById('hud').appendChild(el);
  dmgNumbers.push({ el, pos: worldPos.clone(), life: 0.9, vy: 60 });
}

const _projV = new THREE.Vector3();
const _camDirTmp = new THREE.Vector3();
const _relTmp = new THREE.Vector3();

export function updateHUD(dt, camera, stormInfo) {
  const p = S.player;
  if (!p) return;

  els.hpFill.style.width = `${clamp(p.hp, 0, 100)}%`;
  els.hpNum.textContent = Math.ceil(p.hp);
  els.shFill.style.width = `${clamp(p.shield, 0, 100)}%`;
  els.shNum.textContent = Math.ceil(p.shield);

  els.aliveNum.textContent = S.match.alive;
  els.killsNum.textContent = S.match.kills;

  if (hitmarkT > 0) {
    hitmarkT -= dt;
    els.crosshair.classList.add('hitmark');
    if (hitmarkT <= 0) els.crosshair.classList.remove('hitmark');
  }

  hurtT = Math.max(0, hurtT - dt);
  els.vignetteHurt.style.opacity = hurtT > 0 ? Math.min(0.85, hurtT * 1.6) : 0;

  const inStorm = stormInfo && !stormInfo.inside && S.match.state === 'playing';
  els.vignetteStorm.style.opacity = inStorm ? 0.55 : 0;

  const bloomPx = 4 + (p.bloom || 0) * 2600 * (p.ads ? 0.3 : 1);
  els.crosshair.style.setProperty('--gap', `${Math.min(bloomPx, 30)}px`);
  els.crosshair.style.display = (p.ads && p.activeWeaponDef?.scope && S.match.state === 'playing') ? 'none' : 'block';
  els.scopeOverlay.style.display = (p.ads && p.activeWeaponDef?.scope && S.match.state === 'playing') ? 'block' : 'none';

  if (castBar) {
    castBar.t += dt;
    const k = clamp(castBar.t / castBar.total, 0, 1);
    els.castfill.style.width = `${k * 100}%`;
    if (k >= 1) endCastBar();
  }

  drawMinimap(stormInfo);
  drawCompass();

  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.life -= dt;
    d.pos.y += d.vy * dt;
    d.vy *= (1 - dt * 2);
    if (d.life <= 0) {
      d.el.remove();
      dmgNumbers.splice(i, 1);
      continue;
    }
    _projV.set(d.pos.x, d.pos.y, d.pos.z);
    const camDir = _camDirTmp.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const rel = _relTmp.subVectors(d.pos, camera.position);
    if (rel.dot(camDir) < 0) { d.el.style.opacity = 0; continue; }
    _projV.project(camera);
    const sx = (_projV.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_projV.y * 0.5 + 0.5) * window.innerHeight;
    d.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%)`;
    d.el.style.opacity = Math.min(1, d.life * 2.5);
  }

  els.fpsCounter.textContent = `${Math.round(S.fps)} FPS`;
}

function startCastBar(total) {
  castBar = { t: 0, total };
  els.castbar.style.display = 'block';
  els.castlabel.textContent = 'Using…';
}
function endCastBar() {
  castBar = null;
  els.castbar.style.display = 'none';
}
function startReloadBar(dur) {
  els.reloadBar.style.display = 'block';
  els.reloadFill.style.transition = 'none';
  els.reloadFill.style.width = '0%';
  requestAnimationFrame(() => {
    els.reloadFill.style.transition = `width ${dur}s linear`;
    els.reloadFill.style.width = '100%';
  });
  setTimeout(() => { els.reloadBar.style.display = 'none'; }, dur * 1000 + 120);
}

export function setInteract(label) {
  if (label) {
    els.interact.innerHTML = `<b>[E]</b> ${esc(label)}`;
    els.interact.style.display = 'block';
  } else {
    els.interact.style.display = 'none';
  }
}

function updateBuildBanner() {
  const mode = S.build.mode;
  if (!mode) {
    els.buildBanner.style.display = 'none';
    return;
  }
  els.buildBanner.style.display = 'block';
  els.buildBanner.innerHTML = `BUILDING · <b>${mode.toUpperCase()}</b> · <b style="color:#c9a86a">${S.build.mat.toUpperCase()}</b> <span class="dim">(Q/F/V/B pieces · X material · G edit · RMB exit)</span>`;
}

function worldToMap(x, z, size) {
  const mx = ((x / CFG.WORLD_SIZE) + 0.5) * size;
  const mz = ((z / CFG.WORLD_SIZE) + 0.5) * size;
  return [mx, mz];
}

let mmCtx = null;
function drawMinimap(stormInfo) {
  const cv = els.minimap;
  if (!mmCtx) mmCtx = cv.getContext('2d');
  const size = cv.width;
  const src = getMapCanvas();
  mmCtx.clearRect(0, 0, size, size);
  mmCtx.drawImage(src, 0, 0, size, size);

  const st = S.storm;
  if (st) {
    const [cx, cz] = worldToMap(st.cur.cx, st.cur.cz, size);
    mmCtx.strokeStyle = '#ffffff';
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath(); mmCtx.arc(cx, cz, (st.cur.r / CFG.WORLD_SIZE) * size, 0, Math.PI * 2); mmCtx.stroke();
    if (st.nextPreview && st.mode === 'wait') {
      const [nx, nz] = worldToMap(st.nextPreview.cx, st.nextPreview.cz, size);
      mmCtx.strokeStyle = '#ffffff88';
      mmCtx.setLineDash([3, 3]);
      mmCtx.beginPath(); mmCtx.arc(nx, nz, (st.nextPreview.r / CFG.WORLD_SIZE) * size, 0, Math.PI * 2); mmCtx.stroke();
      mmCtx.setLineDash([]);
    }
    mmCtx.fillStyle = 'rgba(180,77,240,0.28)';
    mmCtx.fillRect(0, 0, size, size);
    mmCtx.save();
    mmCtx.globalCompositeOperation = 'destination-out';
    mmCtx.beginPath(); mmCtx.arc(cx, cz, (st.cur.r / CFG.WORLD_SIZE) * size, 0, Math.PI * 2); mmCtx.fill();
    mmCtx.restore();
  }

  const p = S.player;
  if (p) {
    const [px, pz] = worldToMap(p.pos.x, p.pos.z, size);
    mmCtx.save();
    mmCtx.translate(px, pz);
    mmCtx.rotate(-p.yaw);
    mmCtx.fillStyle = '#ffffff';
    mmCtx.strokeStyle = '#00000099';
    mmCtx.beginPath();
    mmCtx.moveTo(0, -6); mmCtx.lineTo(4.4, 5); mmCtx.lineTo(-4.4, 5);
    mmCtx.closePath();
    mmCtx.fill(); mmCtx.stroke();
    mmCtx.restore();
  }

  const busInfo = window.__busInfo;
  if (busInfo && busInfo.active && busInfo.pos) {
    const [bx, bz] = worldToMap(busInfo.pos.x, busInfo.pos.z, size);
    mmCtx.fillStyle = '#ffd24d';
    mmCtx.beginPath(); mmCtx.arc(bx, bz, 4, 0, Math.PI * 2); mmCtx.fill();
  }
}

function drawCompass() {
  const cv = els.compass;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const p = S.player;
  if (!p) return;
  const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  for (const [name, ang] of dirs) {
    let rel = ang - yawDeg;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;
    if (Math.abs(rel) > 70) continue;
    const x = w / 2 + rel * (w / 150);
    ctx.fillStyle = name.length === 1 ? '#ffffff' : '#ffffffaa';
    ctx.fillText(name, x, h - 4);
  }
}

export function showBigMap(show) {
  els.bigMapWrap.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const cv = els.bigMap;
  const size = Math.min(window.innerHeight * 0.75, window.innerWidth * 0.75);
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.drawImage(getMapCanvas(), 0, 0, size, size);
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  for (const poi of POIS) {
    const [x, z] = worldToMap(poi.x, poi.z, size);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000aa';
    ctx.lineWidth = 3;
    ctx.strokeText(poi.name, x, z);
    ctx.fillText(poi.name, x, z);
  }
  const st = S.storm;
  if (st) {
    const [cx, cz] = worldToMap(st.cur.cx, st.cur.cz, size);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cz, (st.cur.r / CFG.WORLD_SIZE) * size, 0, Math.PI * 2); ctx.stroke();
    if (st.nextPreview) {
      const [nx, nz] = worldToMap(st.nextPreview.cx, st.nextPreview.cz, size);
      ctx.strokeStyle = '#ffffff88'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(nx, nz, (st.nextPreview.r / CFG.WORLD_SIZE) * size, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const p = S.player;
  if (p) {
    const [px, pz] = worldToMap(p.pos.x, p.pos.z, size);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill();
  }
}

export function updateStormPill(storm) {
  if (!storm || S.match.state === 'lobby') {
    els.stormPill.style.display = 'none';
    return;
  }
  els.stormPill.style.display = 'flex';
  if (storm.mode === 'wait') {
    els.stormLabel.textContent = storm.phase < 0 ? 'STORM DEPARTING' : `ZONE ${storm.phase + 2} IN`;
  } else {
    els.stormLabel.textContent = 'STORM SHRINKING';
  }
  const t = Math.max(0, storm.timer);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  els.stormTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
}
