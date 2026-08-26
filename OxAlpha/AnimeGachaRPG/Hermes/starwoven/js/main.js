// STARWOVEN — bootstrap, story engine, input wiring, persistence
"use strict";
import { freshSave, loadSave, persist, wipeSave, markDirty } from './save.js';
import { CHAR_BY_ID, ZONES, STORY, DIALOGUE, NPC_BARKS, BOUNTY } from './data.js';
import { Game } from './game.js';
import { GachaService } from './gacha.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { sigil } from './art.js';

const qs = new URLSearchParams(location.search);
const AUTOTEST = qs.get('autotest') === '1';
const $ = (sel, root = document) => root.querySelector(sel);

// ------------------------------------------------------------------ boot
let save = loadSave();
const isNew = !save;
if (!save) { save = freshSave(); if (AUTOTEST && qs.get('seed')) save.seed = parseInt(qs.get('seed'), 10); }

const cv = $('#game');
const game = new Game(cv, save, {
  onMusic: t => audio.playMusic(t),
  onSfx: n => audio.sfx(n),
  onToast: m => ui.toast(m),
  onBossBar: b => ui.setBossBar(b),
  onPartyChanged: () => { ui._partySig = null; ui._abSig = null; },
  onPartyWipe: () => showWipe(),
  onEvent: ev => onGameEvent(ev),
  onOpenLoom: () => { flags.loomTouched = true; checkStep0(); ui.openSummon(); },
  onNpc: id => talkTo(id),
  onPortal: to => travelTo(to),
});

// starter kit for a fresh save
if (isNew) {
  save.roster['orion'] = { lvl: 1, xp: 0, asc: 0, dupes: 0 };
  save.team = ['orion', null, null];
}

const gacha = new GachaService(save);
const flags = { talkedSelene: false, loomTouched: false };

const ui = new UI({
  game, save, gacha,
  hooks: {
    onSfx: n => audio.sfx(n),
    onPanelClosed: () => unfreeze(),
    onPauseGame: v => freeze(v),
    onVolumes: () => audio.setVolumes(save.settings.music, save.settings.sfx),
    onSwitchTo: i => switchTo(i),
    onTeamChanged: () => { game.buildParty(); placeParty(); },
    onGachaDone: () => { persist(save); unfreeze(); refreshQuestHUD(); },
    onWipeSave: () => { wipeSave(); location.reload(); },
    onQuitToTitle: () => { persist(save); showTitle(); },
    getBountyInfo: () => ({ need: bountyNeed(), have: bountyHave(), reward: BOUNTY.rewardStar }),
  },
});

// ------------------------------------------------------------------ state
let started = false;
function freeze(v) { if (v) game.state = 'frozen'; else if (game.state === 'frozen') game.state = 'explore'; }
function unfreeze() { freeze(false); }
function placeParty() {
  const act = game.active;
  if (!act) return;
  game.party.forEach((u, i) => { u.x = act.x + (i - 1) * 46; u.y = act.y + 14; });
}
function switchTo(i) {
  if (!game.party[i] || game.party[i].hp <= 0 || i === game.activeIdx || game.switchCd > 0) return;
  game.activeIdx = i; game.switchCd = .6;
  game.active.iframes = Math.max(game.active.iframes, .5);
  audio.sfx('switchChar');
  ui._partySig = null; ui._abSig = null;
}

// ------------------------------------------------------------------ story
function bountyNeed() { return BOUNTY.base + (save.flags?.bountyDone || 0) * BOUNTY.grow; }
function bountyHave() { return save.flags?.bountyKills || 0; }

function onGameEvent(ev) {
  const st = STORY[save.story.step];
  // bounty progress
  if (ev.type === 'kill') {
    save.flags = save.flags || {};
    save.flags.bountyKills = (save.flags.bountyKills || 0) + 1;
    if (save.flags.bountyKills >= bountyNeed()) {
      save.flags.bountyKills = 0; save.flags.bountyDone = (save.flags.bountyDone || 0) + 1;
      save.currencies.star += BOUNTY.rewardStar; save.currencies.mote += BOUNTY.rewardMote;
      audio.sfx('questDone');
      ui.toast(`Bounty complete! +${BOUNTY.rewardStar} ✦ +${BOUNTY.rewardMote} ✧`);
      refreshQuestHUD();
    }
    markDirty();
  }
  if (!st) return;
  let complete = false;
  if (st.obj.kills && ev.type === 'kill' && ev.zone === st.obj.kills.zone) {
    flags.stepKills = (flags.stepKills || 0) + 1;
    if (flags.stepKills >= st.obj.kills.n) complete = true;
    refreshQuestHUD();
  }
  if (st.obj.chest && ev.type === 'chest' && ev.chest === st.obj.chest) complete = true;
  if (st.obj.boss && ev.type === 'boss' && ev.boss === st.obj.boss) complete = true;
  if (st.obj.beacons != null && ev.type === 'beacon') {
    const zs = save.zones['tidecall'] || {};
    const lit = Object.keys(zs.beacons || {}).length;
    refreshQuestHUD();
    if (lit >= st.obj.beacons) complete = true;
  }
  if (st.obj.anchors != null && ev.type === 'anchor') {
    const zs = save.zones['umbrahollow'] || {};
    refreshQuestHUD();
    if (Object.keys(zs.anchors || {}).length >= st.obj.anchors) complete = true;
  }
  // guard: never schedule twice for the same step (overkill events must not cascade)
  if (complete && !flags._completing) {
    flags._completing = true;
    setTimeout(() => { flags._completing = false; completeStep(); }, 400);
  }
}

function checkStep0() {
  const st = STORY[save.story.step];
  if (st && st.id === 0 && flags.talkedSelene && flags.loomTouched) setTimeout(() => completeStep(), 600);
}
function completeStep() {
  const st = STORY[save.story.step];
  if (!st) return;
  save.currencies.star += st.give;
  audio.sfx('questDone');
  ui.toast(`Thread woven: ${st.name} — +${st.give} ✦`);
  save.story.step++;
  flags.stepKills = 0;
  persist(save);
  refreshQuestHUD();
  if (st.dlgKey === 'step7') {
    // final boss handled below via epilogue trigger on regent death
  }
  if (st.id === 7) {
    setTimeout(() => ui.say(DIALOGUE.epilogue, () => {
      ui.toast('Chapter One complete. The sky is yours to weave.');
      persist(save);
    }), 800);
  }
}
function refreshQuestHUD() {
  const st = STORY[save.story.step];
  if (!st) {
    ui.setQuest(`<div class="qb"><span class="qb-tag">CHAPTER COMPLETE</span><div class="qb-obj">Free hunt — bounties at the board. More threads fall nightly…</div></div>`);
    return;
  }
  let prog = '';
  if (st.obj.kills) prog = ` (${Math.min(flags.stepKills || 0, st.obj.kills.n)}/${st.obj.kills.n})`;
  if (st.obj.beacons != null) { const lit = Object.keys((save.zones['tidecall'] || {}).beacons || {}).length; prog = ` (${Math.min(lit, st.obj.beacons)}/${st.obj.beacons})`; }
  if (st.obj.anchors != null) { const des = Object.keys((save.zones['umbrahollow'] || {}).anchors || {}).length; prog = ` (${Math.min(des, st.obj.anchors)}/${st.obj.anchors})`; }
  ui.setQuest(`<div class="qb"><span class="qb-tag">MAIN · ${st.name}</span><div class="qb-obj">${st.obj.text}${prog}</div></div>`);
}

// ------------------------------------------------------------------ npc/talk
function talkTo(id) {
  if (id === 'selene') {
    if (save.story.step === 0 && !flags.talkedSelene) {
      flags.talkedSelene = true;
      ui.say(DIALOGUE.intro, () => { checkStep0(); refreshQuestHUD(); persist(save); });
    } else {
      const st = STORY[save.story.step];
      if (st && DIALOGUE[st.dlgKey] && (st.id !== 0)) {
        ui.say(DIALOGUE[st.dlgKey], () => persist(save));
        if (st.id > 0 && !flags['dlg' + st.id]) { flags['dlg' + st.id] = true; }
      } else {
        ui.say([{ who: 'Selene', portrait: 'selene', text: NPC_BARKS.selene[Math.floor(Math.random() * NPC_BARKS.selene.length)] }]);
      }
    }
  } else if (id === 'toma') {
    ui.say([
      { who: 'Marshal Toma', portrait: 'toma', text: `Bounty\'s simple: thin the Hollow — ${bountyHave()}/${bountyNeed()} down. Board pays ${BOUNTY.rewardStar} Starpieces a run. Get out there, Weaver.` },
    ]);
  } else if (id === 'maro') {
    ui.say([{ who: 'Maro', portrait: 'maro', text: NPC_BARKS.maro[Math.floor(Math.random() * NPC_BARKS.maro.length)] }]);
  }
}
function travelTo(to) {
  audio.sfx('portal');
  game.loadZone(to);
  ui.showZoneBanner(ZONES[to].name, ZONES[to].sub);
  persist(save);
}

function showWipe() {
  ui.closePanel(true);
  const p = document.createElement('div');
  p.className = 'wipe-overlay';
  p.innerHTML = `<div class="wipe-box"><h3>The thread goes dark…</h3>
    <p>Your Stellars have fallen. The Loom catches you gently.</p>
    <button class="btn gold" id="btn-revive">Return to Lumen Haven</button></div>`;
  document.body.append(p);
  $('#btn-revive', p).onclick = () => { p.remove(); audio.sfx('uiConfirm'); game.reviveAtHaven(); };
}

// ------------------------------------------------------------------ input
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  game.keys[k] = true;
  if (!started) return;
  if (k === 'escape') {
    if (document.querySelector('.summon-overlay')) return;
    if (ui.panelOpen) ui.closePanel(); else ui.openPause();
    return;
  }
  if (k === 'h') { ui.openHelp(); return; }
  if (game.state !== 'explore') {
    if (k === 'f' && !ui.dlg.classList.contains('hidden')) ui._advanceDlg();
    return;
  }
  if (ui.panelOpen) return;
  switch (k) {
    case 'e': game.castSkill(game.active); break;
    case 'q': game.castUlt(game.active); break;
    case 'f': game.tryInteract(); break;
    case ' ': game.dodge(game.active); e.preventDefault(); break;
    case '1': switchTo(0); break;
    case '2': switchTo(1); break;
    case '3': switchTo(2); break;
    case 'v': ui.openSummon(); break;
    case 'c': ui.openRoster(); break;
    case 't': ui.openTeam(); break;
    case 'j': ui.openJournal(); break;
  }
});
addEventListener('keyup', e => { game.keys[e.key.toLowerCase()] = false; });
cv.addEventListener('mousemove', e => { game.mouse.x = e.clientX; game.mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => { if (e.button === 0) game.mouse.down = true; });
addEventListener('mouseup', () => { game.mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// ------------------------------------------------------------------ title
function showTitle() {
  game.stop();
  started = false;
  hideAllOverlays();
  const t = $('#title');
  t.classList.remove('hidden');
  const bgc = $('#title-bg');
  drawTitleBg(bgc);
  const hasSave = !!loadSave();
  $('#btn-continue').classList.toggle('hidden', !hasSave);
  $('#title').onclick = e => {
    audio.init(); audio.resume();
    audio.setVolumes(save.settings.music, save.settings.sfx);
  };
  $('#btn-new').onclick = () => {
    audio.init(); audio.resume(); audio.setVolumes(save.settings.music, save.settings.sfx);
    audio.sfx('uiConfirm');
    if (hasSave) { wipeSave(); save = freshSave(); }
    startNewGame();
  };
  $('#btn-continue').onclick = () => {
    audio.init(); audio.resume(); audio.sfx('uiConfirm');
    startLoadedGame();
  };
}
function hideAllOverlays() {
  document.querySelectorAll('.panel-root,.dialogue,.wipe-overlay,.summon-overlay,.toasts')
    ?.forEach(() => {});
  ui.closePanel(true);
  ui.showHUD(false);
  ui.dlg.classList.add('hidden');
}
function beginCommon() {
  $('#title').classList.add('hidden');
  started = true;
  game.buildParty();
  game.loadZone('haven');
  game.start();
  ui.showHUD(true);
  ui.showZoneBanner(ZONES.haven.name, ZONES.haven.sub);
  refreshQuestHUD();
  setInterval(() => { if (started) persist(save); }, 12000);
  if (!AUTOTEST) setTimeout(() => ui.openHelp(), 1200); // discoverability on first spawn
}
function startNewGame() {
  save.seenIntro = true;
  persist(save);
  beginCommon();
  setTimeout(() => {
    // Selene delivers the intro in person: this counts as having met her.
    flags.talkedSelene = true;
    ui.say(DIALOGUE.intro, () => { checkStep0(); refreshQuestHUD(); persist(save); });
  }, 700);
}
function startLoadedGame() {
  beginCommon();
}

// animated title backdrop
function drawTitleBg(cvs) {
  const ctx = cvs.getContext('2d');
  cvs.width = innerWidth; cvs.height = innerHeight;
  let raf;
  const stars = Array.from({ length: 140 }, () => ({
    x: Math.random() * cvs.width, y: Math.random() * cvs.height,
    r: Math.random() * 1.6 + .3, ph: Math.random() * 9, sp: .3 + Math.random() * 1.2,
  }));
  const threads = Array.from({ length: 12 }, (_, i) => i);
  const t0 = performance.now();
  const loop = now => {
    if ($('#title').classList.contains('hidden')) { cancelAnimationFrame(raf); return; }
    const t = (now - t0) / 1000;
    const W = cvs.width, H = cvs.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b081e'); g.addColorStop(.6, '#151034'); g.addColorStop(1, '#1a1038');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = .35 + Math.sin(t * s.sp * 2 + s.ph) * .3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, (s.y + t * 8 * s.sp) % H, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const i of threads) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,215,107,.10)' : 'rgba(180,140,255,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-50, H * (.08 + i * .08));
      ctx.bezierCurveTo(W * .3, H * (.05 + i * .085) + Math.sin(t + i) * 24, W * .7, H * (.11 + i * .075) - Math.cos(t + i) * 24, W + 50, H * (.06 + i * .08));
      ctx.stroke();
    }
    sigil(ctx, W / 2, H * .30, 34, 'rgba(255,233,173,.5)', 2, .8);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ go
window.SW = { game, save, ui, gacha, audio, flags: { get AUTOTEST() { return AUTOTEST; } } };
showTitle();

// QA niceties
setInterval(() => { if (started) ui.tickHUD(); }, 100);
addEventListener('resize', () => { void cv; });
