// audio.js — fully procedural WebAudio engine: ambience, positional tells, music box,
// doors, screams. No external files.
'use strict';
WD.audio = (() => {
  let ctx=null, master=null, comp=null, convolver=null, wetGain=null;
  const noiseBufs = {};
  const loops = {};
  const posNodes = {};   // per-room panner for spatial events
  let started=false;

  function init(){
    if(ctx) return true;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
    }catch(e){ return false; }
    master = ctx.createGain(); master.gain.value = WD.state.settings.volume;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=20; comp.ratio.value=8;
    master.connect(comp); comp.connect(ctx.destination);
    // small reverb (generated impulse)
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(2.2, 3.5);
    wetGain = ctx.createGain(); wetGain.gain.value=0.18;
    convolver.connect(wetGain); wetGain.connect(master);
    // noise buffers
    noiseBufs.white = makeNoise(2, 'white');
    noiseBufs.pink  = makeNoise(4, 'pink');
    // room panners
    for(const r of WD.ROOM_LIST){
      const c = roomXY(r);
      const p = ctx.createPanner();
      p.panningModel='HRTF'; p.distanceModel='exponential'; p.refDistance=3; p.rolloffFactor=1.6;
      if(c) p.setPosition(c[0]*0.25, -1.2, (c[1]-16)*0.22);   // office at origin
      p.connect(master); p.connect(convolver);
      posNodes[r]=p;
    }
    started=true;
    return true;
  }
  function resume(){ if(ctx && ctx.state==='suspended') ctx.resume(); }
  function setVolume(v){ if(master) master.gain.value=v; }

  function makeNoise(sec, kind){
    const n = Math.floor(ctx.sampleRate*sec);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<n;i++){
      const w=Math.random()*2-1;
      if(kind==='pink'){ b0=0.99765*b0+w*0.0990460; b1=0.96300*b1+w*0.2965164; b2=0.57000*b2+w*1.0526913;
        d[i]=(b0+b1+b2+w*0.1848)*0.25; }
      else d[i]=w;
    }
    return buf;
  }
  function makeImpulse(sec, decay){
    const n=Math.floor(ctx.sampleRate*sec);
    const buf=ctx.createBuffer(2,n,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
      for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,decay); }
    return buf;
  }

  function roomXY(r){
    const A=WD.worldAnchors||{};
    if(A[r]) return [A[r].pos[0], A[r].pos[2]];
    return { door_l:[-1.9,13.6], door_e:[1.9,13.6], vent_n:[-8.5,-13], vent_s:[-11.5,6],
      office:[0,16.5] }[r] || null;
  }

  // ---------- primitive voices ----------
  function env(g, t0, a, peak, d, sus=0){
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002), t0+a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus,0.0001), t0+a+d);
  }
  function blip(freq, dur, {type='sine', vol=0.3, dest=null, slide=null, when=0}={}){
    if(!ctx) return;
    const t0=ctx.currentTime+when;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t0);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide), t0+dur);
    o.connect(g); g.connect(dest||master);
    env(g,t0,0.01,vol,dur);
    o.start(t0); o.stop(t0+dur+0.1);
  }
  function noiseHit({dur=0.2, vol=0.4, freq=800, q=1, type='bandpass', dest=null, when=0}={}){
    if(!ctx) return;
    const t0=ctx.currentTime+when;
    const src=ctx.createBufferSource(); src.buffer=noiseBufs.white; src.loop=true;
    const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=ctx.createGain();
    src.connect(f); f.connect(g); g.connect(dest||master);
    env(g,t0,0.005,vol,dur);
    src.start(t0); src.stop(t0+dur+0.15);
  }
  function servo({dur=0.5, vol=0.14, dest=null, pitch=90}={}){
    if(!ctx) return;
    const t0=ctx.currentTime;
    const o=ctx.createOscillator(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    o.type='sawtooth'; o.frequency.setValueAtTime(pitch,t0);
    o.frequency.linearRampToValueAtTime(pitch*0.8, t0+dur);
    f.type='lowpass'; f.frequency.value=900;
    o.connect(f); f.connect(g); g.connect(dest||master);
    env(g,t0,0.03,vol,dur,0.0001);
    o.start(t0); o.stop(t0+dur+0.05);
    // mechanical chatter
    for(let i=0;i<4;i++) noiseHit({dur:0.03, vol:vol*0.5, freq:2400+Math.random()*1200,
      q:6, dest:dest||master, when:i*dur/4});
  }

  // ---------- named events ----------
  function event(kind, room, charId, opt={}){
    if(!started && !init()) return;
    const dest = posNodes[room] || master;
    switch(kind){
      case 'steps': {
        const n = opt.n||4;
        for(let i=0;i<n;i++){
          noiseHit({dur:0.09, vol:0.30, freq:110+Math.random()*60, q:2.5, dest, when:i*0.42});
          blip(55+Math.random()*10, 0.08, {type:'triangle', vol:0.16, dest, when:i*0.42});
        }
        break; }
      case 'crawl': {
        for(let i=0;i<6;i++) noiseHit({dur:0.07, vol:0.24, freq:900+Math.random()*700, q:4,
          dest, when:i*0.28});
        servo({dur:0.9, vol:0.10, dest});
        break; }
      case 'skitter': {
        for(let i=0;i<10;i++) noiseHit({dur:0.03, vol:0.16, freq:1800+Math.random()*1600,
          q:8, dest, when:i*(0.06+Math.random()*0.05)});
        break; }
      case 'knock': {
        for(let i=0;i<3;i++){
          noiseHit({dur:0.10, vol:0.5, freq:140, q:1.5, dest, when:i*0.34});
          blip(70, 0.1, {type:'square', vol:0.22, dest, when:i*0.34});
        }
        break; }
      case 'slam': {
        noiseHit({dur:0.35, vol:0.85, freq:90, q:1, type:'lowpass', dest});
        blip(45, 0.3, {type:'square', vol:0.4, dest, slide:30});
        break; }
      case 'vent_bang': {
        for(let i=0;i<2;i++){
          noiseHit({dur:0.16, vol:0.62, freq:300+Math.random()*200, q:2, dest, when:i*0.5});
          blip(130, 0.12, {type:'square', vol:0.3, dest, when:i*0.5, slide:80});
        }
        break; }
      case 'music': {
        const notes=[523,587,659,784,880];
        notes.forEach((f,i)=>blip(f*(opt.detune||1), 0.22,
          {type:'triangle', vol:0.20, dest, when:i*0.19}));
        break; }
      case 'musicbox_stop': {
        [392,370,349,330].forEach((f,i)=>blip(f*0.5, 0.4,
          {type:'triangle', vol:0.22, dest:master, when:i*0.3}));
        break; }
      case 'whisper': {
        noiseHit({dur:1.4, vol:0.30, freq:5200, q:0.6, dest});
        noiseHit({dur:1.1, vol:0.20, freq:2800, q:0.8, dest, when:0.25});
        break; }
      case 'retreat':
        servo({dur:0.8, vol:0.12, dest, pitch:120}); break;
      case 'charge':
        servo({dur:1.2, vol:0.2, dest, pitch:150});
        noiseHit({dur:1.0, vol:0.3, freq:500, q:1, dest});
        break;
      case 'door_move':
        servo({dur:0.55, vol:0.26, dest:master, pitch:70});
        noiseHit({dur:0.4, vol:0.3, freq:220, q:1, dest:master});
        break;
      case 'cam_switch':
        noiseHit({dur:0.09, vol:0.22, freq:3200, q:1.4, dest:master});
        blip(1400,0.05,{type:'square',vol:0.06,dest:master});
        break;
      case 'monitor_up':
        noiseHit({dur:0.22, vol:0.3, freq:1800, q:0.8, dest:master});
        blip(220,0.15,{type:'sine',vol:0.12,dest:master,slide:440});
        break;
      case 'click':
        blip(2600,0.02,{type:'square',vol:0.10,dest:master});
        break;
      case 'error':
        blip(180,0.18,{type:'square',vol:0.2,dest:master});
        blip(140,0.22,{type:'square',vol:0.2,dest:master,when:0.12});
        break;
      case 'lure':
        [660,880,990].forEach((f,i)=>blip(f,0.3,{type:'sine',vol:0.25,
          dest:posNodes[opt.room]||master, when:i*0.22}));
        break;
      case 'seal':
        servo({dur:0.7, vol:0.3, dest:master, pitch:60});
        noiseHit({dur:0.5,vol:0.35,freq:180,q:1,dest:master,when:0.2});
        break;
      case 'power_down':
        blip(300,1.6,{type:'sawtooth',vol:0.3,dest:master,slide:40});
        noiseHit({dur:1.2,vol:0.2,freq:400,q:0.7,dest:master});
        break;
      case 'chime':
        [784,988,1175].forEach((f,i)=>blip(f,0.5,{type:'sine',vol:0.2,dest:master,when:i*0.16}));
        break;
      case 'hour_chime':
        blip(392,0.8,{type:'sine',vol:0.22,dest:master});
        blip(523,0.9,{type:'sine',vol:0.18,dest:master,when:0.4});
        break;
      case 'tape_voice': {
        // lo-fi answering machine garble: filtered warble pulses
        for(let i=0;i<7;i++){
          const t0=i*0.31;
          noiseHit({dur:0.16+Math.random()*0.12, vol:0.16, freq:700+Math.random()*900,
            q:3, dest:master, when:t0});
          blip(140+Math.random()*80, 0.14, {type:'sawtooth', vol:0.05, dest:master, when:t0});
        }
        break; }
      case 'jumpscare': scream(opt.charId||'orv'); break;
    }
  }

  function scream(charId){
    if(!ctx) return;
    const t0=ctx.currentTime;
    // layered shriek: detuned saws + noise + sub drop
    [1,1.48,2.51].forEach((m,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sawtooth';
      o.frequency.setValueAtTime(180*m,t0);
      o.frequency.exponentialRampToValueAtTime(90*m, t0+1.0);
      o.frequency.linearRampToValueAtTime(140*m, t0+1.3);
      const f=ctx.createBiquadFilter(); f.type='bandpass';
      f.frequency.setValueAtTime(1200,t0); f.frequency.exponentialRampToValueAtTime(600,t0+1.2);
      f.Q.value=2;
      o.connect(f); f.connect(g); g.connect(master);
      env(g,t0,0.02,0.34,1.3);
      o.start(t0); o.stop(t0+1.5);
    });
    noiseHit({dur:1.2, vol:0.5, freq:2500, q:0.7});
    blip(60,1.4,{type:'square',vol:0.5,slide:28});
    // metallic impact tail
    for(let i=0;i<5;i++) noiseHit({dur:0.2, vol:0.3, freq:300+Math.random()*2500, q:5,
      when:0.9+i*0.12});
  }

  // ---------- looping beds ----------
  function startLoops(){
    if(!started && !init()) return;
    if(loops.running) return; loops.running=true;
    // electrical hum
    const hum=ctx.createOscillator(), hg=ctx.createGain();
    hum.type='sawtooth'; hum.frequency.value=50;
    const hf=ctx.createBiquadFilter(); hf.type='lowpass'; hf.frequency.value=140;
    hum.connect(hf); hf.connect(hg); hg.connect(master);
    hg.gain.value=0.035; hum.start();
    loops.hum={o:hum,g:hg};
    // ventilation whoosh (filtered pink noise with slow LFO)
    const vs=ctx.createBufferSource(); vs.buffer=noiseBufs.pink; vs.loop=true;
    const vf=ctx.createBiquadFilter(); vf.type='bandpass'; vf.frequency.value=380; vf.Q.value=0.6;
    const vg=ctx.createGain(); vg.gain.value=0.05;
    const lfo=ctx.createOscillator(), lg=ctx.createGain();
    lfo.frequency.value=0.07; lg.gain.value=0.025;
    lfo.connect(lg); lg.connect(vg.gain);
    vs.connect(vf); vf.connect(vg); vg.connect(master);
    vs.start(); lfo.start();
    loops.vent={s:vs,g:vg};
    // distant carnival drone — slow minor chords far away
    const chordG=ctx.createGain(); chordG.gain.value=0.0; chordG.connect(master);
    const oscs=[110,130.8,164.8].map(f=>{
      const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=f;
      const og=ctx.createGain(); og.gain.value=0.33;
      o.connect(og); og.connect(chordG); o.start(); return o;
    });
    const clfo=ctx.createOscillator(), cg=ctx.createGain();
    clfo.frequency.value=0.023; cg.gain.value=0.012;
    clfo.connect(cg); cg.connect(chordG.gain); clfo.start();
    chordG.gain.value=0.012;
    loops.drone={oscs, g:chordG};
  }
  function stopLoops(){
    if(!loops.running) return; loops.running=false;
    try{ for(const k of ['hum','vent','drone']){
      const L=loops[k]; if(!L) continue;
      if(L.o) L.o.stop(); if(L.s) L.s.stop();
      if(L.oscs) L.oscs.forEach(o=>o.stop());
    }}catch(e){}
    loops.hum=loops.vent=loops.drone=null;
  }
  // music box loop while winding / playing
  let boxTimer=null;
  function musicBox(on){
    if(on && !boxTimer){
      let mi=-1;
      const step=()=>{
        const mel=[659,784,880,784,659,587,523,587];
        const f=mel[(mi=(mi+1)%mel.length)];
        blip(f,0.35,{type:'triangle',vol:0.05,dest:master});
        blip(f*2,0.2,{type:'sine',vol:0.02,dest:master});
      };
      boxTimer={ id:setInterval(step,430), i:()=>mi };
    } else if(!on && boxTimer){ clearInterval(boxTimer.id); boxTimer=null; }
  }

  function status(){
    return { started, ctxState: ctx? ctx.state:'none',
      loops: loops.running? ['hum','vent','drone']:[], box: !!boxTimer };
  }
  window.addEventListener('pointerdown', ()=>{ resume(); }, {passive:true});
  window.addEventListener('keydown', ()=>{ resume(); }, {passive:true});
  return { init, resume, event, startLoops, stopLoops, musicBox, status, setVolume };
})();
