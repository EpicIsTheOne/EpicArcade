/* ZENITH RUN · procedural audio (WebAudio, no assets) · ox-alpha piagent run-01 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};
let ctx = null, master = null, musicGain = null, sfxGain = null, windGain = null, windSrc = null;
let muted = localStorage.getItem('zr1_mute') === '1';
let musicOn = localStorage.getItem('zr1_music') !== '0';
let slideNode = null, musicTimer = null, barIdx = 0;

function now(){ return ctx.currentTime; }

function ensure(){
  if (ctx) return true;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.16 : 0; musicGain.connect(master);
    startWind(); startMusic();
  }catch(e){ ctx = null; return false; }
  return true;
}

function noiseBuffer(sec){
  const b = ctx.createBuffer(1, Math.max(1,(ctx.sampleRate*sec)|0), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return b;
}

/* ---- wind loop ---- */
function startWind(){
  windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuffer(2); windSrc.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=480; bp.Q.value=0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  windSrc.connect(bp); bp.connect(windGain); windGain.connect(master); windSrc.start();
}
ZR.audio.setWind = function(v){ if (windGain) windGain.gain.setTargetAtTime(Math.min(0.22, v*0.22), now(), 0.15); };

/* ---- generic voices ---- */
function blip(f0, f1, dur, type, vol, delay){
  if (!ensure()) return;
  const t = now() + (delay||0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type||'square';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30,f1), t+dur);
  g.gain.setValueAtTime(vol||0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+dur+0.02);
}
function whoosh(dur, f0, f1, vol){
  if (!ensure()) return;
  const t = now();
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur+0.05);
  const f = ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1;
  f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol||0.25,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t+dur+0.05);
}

/* ---- game sfx ---- */
ZR.audio.unlock = function(){ ensure(); if (ctx && ctx.state==='suspended') ctx.resume(); };
ZR.audio.jump     = function(){ blip(300, 640, 0.16, 'square', 0.12); };
ZR.audio.wallJump = function(){ blip(220, 520, 0.14, 'square', 0.12); whoosh(0.18, 900, 2400, 0.14); };
ZR.audio.dash     = function(){ whoosh(0.28, 500, 3800, 0.34); blip(180,90,0.2,'sawtooth',0.08); };
ZR.audio.land     = function(i){ whoosh(0.12+i*0.05, 300, 120, 0.16+i*0.12); };
ZR.audio.step     = function(){ whoosh(0.05, 700, 400, 0.05); };
ZR.audio.bonk     = function(){ blip(160, 70, 0.18, 'sawtooth', 0.16); };
ZR.audio.bounce   = function(){ blip(200, 900, 0.28, 'sine', 0.24); };
ZR.audio.gate     = function(){ blip(700, 1500, 0.12, 'sine', 0.13); blip(1050,2100,0.12,'sine',0.09,0.03); };
ZR.audio.checkpoint= function(){ [660,880].forEach((f,i)=>blip(f,f,0.14,'triangle',0.2,i*0.09)); blip(1320,1320,0.2,'sine',0.12,0.19); };
ZR.audio.death    = function(){ blip(420,60,0.5,'sawtooth',0.22); whoosh(0.4,800,150,0.2); };
ZR.audio.finish   = function(){
  [523,659,784,1047,1319].forEach((f,i)=>blip(f,f,0.32,'triangle',0.22,i*0.11));
  whoosh(0.8,600,3200,0.18);
};
ZR.audio.uiClick  = function(){ blip(500,700,0.07,'sine',0.1); };
ZR.audio.slideStart = function(){
  if (!ensure() || slideNode) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(1.5); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=650;
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.14, now(), 0.04);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start();
  slideNode = {s,g};
};
ZR.audio.slideStop = function(){
  if (!slideNode) return;
  const n = slideNode; slideNode = null;
  n.g.gain.setTargetAtTime(0, now(), 0.06);
  setTimeout(()=>{ try{n.s.stop();}catch(e){} }, 300);
};

/* ---- tiny ambient music: slow pad progression + sparse pluck ---- */
const CHORDS = [[220,261.6,329.6],[174.6,220,261.6],[196,246.9,293.7],[164.8,207.7,246.9]];
function padChord(freqs, t, dur){
  freqs.forEach(fr=>{
    [0,3].forEach(det=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='triangle'; o.frequency.value=fr/2; o.detune.value=det;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(0.05,t+dur*0.35);
      g.gain.linearRampToValueAtTime(0.0001,t+dur);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
      o.connect(lp); lp.connect(g); g.connect(musicGain); o.start(t); o.stop(t+dur+0.1);
    });
  });
}
function pluck(fr, t){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type='sine'; o.frequency.value=fr*2;
  g.gain.setValueAtTime(0.09,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.9);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t+1);
}
function scheduleBar(){
  if (!ctx) return;
  const t = now()+0.1, dur = 3.2;
  padChord(CHORDS[barIdx % 4], t, dur+1.2);
  if (barIdx % 2 === 1){
    const root = CHORDS[(barIdx>>1) % 4];
    pluck(root[2]/2, t+0.4); pluck(root[1], t+1.6); pluck(root[2], t+2.6);
  }
  barIdx++;
}
function startMusic(){
  scheduleBar(); musicTimer = setInterval(scheduleBar, 3200);
}

ZR.audio.setMuted = function(m){
  muted = m; localStorage.setItem('zr1_mute', m?'1':'0');
  if (master) master.gain.setTargetAtTime(m?0:0.9, now(), 0.05);
};
ZR.audio.isMuted = function(){ return muted; };
ZR.audio.setMusic = function(on){
  musicOn = on; localStorage.setItem('zr1_music', on?'1':'0');
  if (musicGain) musicGain.gain.setTargetAtTime(on?0.16:0, now(), 0.2);
};
ZR.audio.musicOn = function(){ return musicOn; };
ZR.audio.duck = function(on){ if (musicGain) musicGain.gain.setTargetAtTime((on?0.05:(musicOn?0.16:0)), now(), 0.2); };
})();
