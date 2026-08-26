/* HOLLOW SIGNAL — audio: fully procedural WebAudio engine (no external assets) */
(function(){
"use strict";
const HG = window.HG;
const M = HG.M;

const A = HG.Audio = {
  ctx:null, master:null, sfxBus:null, ambBus:null,
  started:false,
  _noise:null,               // shared white-noise buffer
  listener:{x:0,z:0,yaw:0,floor:0},
  fear:0,                    // 0..1 drives heartbeat + dread layer
  _hbT:0,
  _loops:[],                 // persistent spatial loops
  _amb:[],                   // non-spatial ambient voices
  genOn:false,

  /* ---------- lifecycle ---------- */
  init(){
    if(this.started){ this.ctx && this.ctx.resume && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this._volCurve();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value=-20; comp.knee.value=18; comp.ratio.value=5; comp.attack.value=.004; comp.release.value=.24;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value=.9; this.ambBus.connect(this.master);

    // shared noise buffer (2s)
    const len = ctx.sampleRate*2, buf = ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    let last=0;
    for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+.02*w)/1.02; d[i]=(w*.5+last*2.5)*.5; }
    this._noise = buf;

    this.started=true;
    this._buildAmbience();
  },
  _volCurve(){ const v = HG.settings ? HG.settings.volume : .8; return Math.max(.0001, v*v); },
  applyVolume(){ if(this.master) this.master.gain.setTargetAtTime(this._volCurve(), this.ctx.currentTime, .05); },
  suspend(){ if(this.ctx&&this.ctx.state==='running') this.ctx.suspend(); },
  resume(){ if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); },
  setListener(x,z,yaw,floor){ this.listener.x=x; this.listener.z=z; this.listener.yaw=yaw; this.listener.floor=floor; },

  /* ---------- helpers ---------- */
  _out(){ return this.ctx.currentTime; },
  _noiseSrc(loop=false){ const s=this.ctx.createBufferSource(); s.buffer=this._noise; s.loop=loop; return s; },
  _env(gainNode, t0, a, peak, d, sustain=0){
    const g=gainNode.gain;
    g.setValueAtTime(.0001,t0);
    g.exponentialRampToValueAtTime(Math.max(peak,.0002), t0+a);
    g.exponentialRampToValueAtTime(Math.max(sustain,.0001), t0+a+d);
  },
  _spatialParams(pos, floor, ref){
    // returns {pan, distGain} relative to listener; different floors heavily attenuated
    const L=this.listener;
    let dx=pos.x-L.x, dz=pos.z-L.z;
    const dist=Math.hypot(dx,dz);
    const ang=-L.yaw;
    const rx = dx*Math.cos(ang)-dz*Math.sin(ang);
    const pan = M.clamp((dist>0.001?rx/dist:0)*Math.min(1,dist/2.5), -0.92, 0.92);
    let g = ref*ref/(ref*ref + dist*dist*0.62);
    if(floor!==undefined && floor!==L.floor) g*=0.12;
    return {pan, distGain:g, dist};
  },

  /* ---------- persistent spatial loops ---------- */
  makeLoop(buildFn, {pos=null, floor=0, ref=7, vol=1}={}){
    if(!this.started) return null;
    const A=this, ctx=this.ctx;
    const gain=ctx.createGain(); gain.gain.value=vol;
    const pan=ctx.createStereoPanner();
    gain.connect(pan); pan.connect(this.ambBus);
    const inner=buildFn(ctx,gain);           // builder connects sources into `gain`, may return {stop()}
    const loop={gain,pan,pos,floor,ref,baseVol:vol,inner,
      setPos(p,floor){ this.pos=p; if(floor!==undefined)this.floor=floor; },
      setVol(v,t=.2){ this.baseVol=v; gain.gain.setTargetAtTime(v,A._out(),t); },
      stop(t=.4){ try{ gain.gain.setTargetAtTime(.0001,A._out(),t); setTimeout(()=>{ inner&&inner.stop&&inner.stop(); try{gain.disconnect();pan.disconnect();}catch(e){} }, t*1000+300);}catch(e){} },
      _dead:false };
    this._loops.push(loop);
    return loop;
  },
  updateLoops(){
    for(const lp of this._loops){
      if(!lp.pos) continue;
      const {pan,distGain}=this._spatialParams(lp.pos,lp.floor,lp.ref);
      lp.pan.pan.setTargetAtTime(pan, this._out(), .06);
      lp.gain.gain.setTargetAtTime(lp.baseVol*distGain, this._out(), .08);
    }
  },

  /* ---------- global ambience ---------- */
  _buildAmbience(){
    const ctx=this.ctx, out=this.ambBus;
    // deep drone
    const droneG=ctx.createGain(); droneG.gain.value=.05; droneG.connect(out);
    for(const f of [52,52.7]){
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
      const g=ctx.createGain(); g.gain.value=.5; o.connect(g); g.connect(droneG); o.start();
    }
    // air / ventilation hiss
    const air=this._noiseSrc(true);
    const airF=ctx.createBiquadFilter(); airF.type='lowpass'; airF.frequency.value=140; airF.Q.value=.4;
    const airG=ctx.createGain(); airG.gain.value=.05;
    air.connect(airF); airF.connect(airG); airG.connect(out); air.start();
    // slow breathing LFO on air
    const lfo=ctx.createOscillator(); lfo.frequency.value=.07;
    const lfoG=ctx.createGain(); lfoG.gain.value=.02;
    lfo.connect(lfoG); lfoG.connect(airG.gain); lfo.start();

    // containment dread drone (proximity-driven)
    this.containmentLoop = this.makeLoop((c,g)=>{
      const gg=c.createGain(); gg.gain.value=1; gg.connect(g);
      const os=[];
      [63.4,64.1,95.2].forEach((f,i)=>{
        const o=c.createOscillator(); o.type=i?'triangle':'sawtooth'; o.frequency.value=f;
        const og=c.createGain(); og.gain.value=[.16,.16,.07][i];
        o.connect(og); og.connect(gg); o.start(); os.push(o);
      });
      const n=this._noiseSrc(true); const nf=c.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=920; nf.Q.value=9;
      const ng=c.createGain(); ng.gain.value=.02;
      n.connect(nf); nf.connect(ng); ng.connect(gg); n.start();
      return {stop(){ os.forEach(o=>{try{o.stop()}catch(e){}}); try{n.stop()}catch(e){} }};
    },{floor:1, ref:10, vol:0});

    // generator hum (audible once powered)
    this.genLoop = this.makeLoop((c,g)=>{
      const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=57;
      const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=210; f.Q.value=1.2;
      const og=c.createGain(); og.gain.value=.34;
      o.connect(f); f.connect(og); og.connect(g); o.start();
      const o2=c.createOscillator(); o2.type='sine'; o2.frequency.value=114;
      const o2g=c.createGain(); o2g.gain.value=.12; o2.connect(o2g); o2g.connect(g); o2.start();
      return {stop(){ try{o.stop();o2.stop()}catch(e){} }};
    },{floor:1, ref:11, vol:0});
  },

  update(dt){
    if(!this.started) return;
    this.updateLoops();

    // fear layer: heartbeat scheduling + dread riser
    this.fear = M.damp(this.fear, this._fearTarget||0, 3, dt);
    if(this.fear>.03){
      this._hbT -= dt*(0.55+this.fear*0.85);
      if(this._hbT<=0){
        this._hbT = 1;
        this._heartThump(.5+this.fear*.5);
        HG.after(.13,()=>this._heartThump(.32+this.fear*.35));
      }
    } else this._hbT=0;

    // proximity gains for special loops
    if(HG.world){
      const cd = this._distTo(HG.world.containmentCenter);
      if(this.containmentLoop) this.containmentLoop.setVol(M.clamp(1-cd/26,0,1)*.8, .3);
      const gd = this._distTo(HG.world.generatorCenter);
      if(this.genLoop) this.genLoop.setVol(this.genOn ? M.clamp(1-gd/22,0,1)*.9 : 0, .4);
    }
  },
  _distTo(p){ return p?M.dist(this.listener.x,this.listener.z,p.x,p.z):999; },
  setFear(v){ this._fearTarget=M.clamp(v,0,1); },
  _heartThump(v){
    if(!this.started) return;
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(58,t); o.frequency.exponentialRampToValueAtTime(38,t+.14);
    const g=c.createGain(); this._env(g,t,.012,v*.5,.19);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t+.3);
  },

  /* ---------------- one-shot SFX ---------------- */
  play(name, opts={}){
    if(!this.started) return;
    const fn=this['_'+name];
    if(!fn) return;
    if(opts.pan!==undefined || opts.distGain!==undefined){
      // route this shot through a temporary panner
      const c=this.ctx;
      const p=c.createStereoPanner(); p.pan.value=M.clamp(opts.pan||0,-1,1);
      const g=c.createGain(); g.gain.value=(opts.distGain!==undefined?opts.distGain:1);
      p.connect(g); g.connect(this.sfxBus);
      const old=this.sfxBus; this.sfxBus=p;
      try{ fn.call(this,opts); }
      finally{ this.sfxBus=old; }
      setTimeout(()=>{ try{p.disconnect();g.disconnect();}catch(e){} },4000);
    } else {
      fn.call(this,opts);
    }
    if(opts.sub && HG.settings.subtitles && HG.UI) HG.UI.subtitle(opts.sub, opts.subT||2.6);
  },
  playAt(name,{pos,floor,vol=1,ref=8,sub,subT}={}){
    const sp=this._spatialParams(pos,floor,ref);
    this.play(name,{pan:sp.pan, distGain:M.clamp(sp.distGain,0,1)*vol, sub, subT});
  },

  _footstep({surf='conc'}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='bandpass';
    f.frequency.value = surf==='metal'? 420+M.rand(-60,160) : 240+M.rand(-50,110);
    f.Q.value=surf==='metal'?2.2:1.1;
    const g=c.createGain(); this._env(g,t,.004,.16*M.rand(.8,1.25),.09);
    n.connect(f);f.connect(g);g.connect(this.sfxBus); n.start(t); n.stop(t+.16);
    const o=c.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(74,t); o.frequency.exponentialRampToValueAtTime(46,t+.06);
    const og=c.createGain(); this._env(og,t,.003,.09,.07);
    o.connect(og);og.connect(this.sfxBus);o.start(t);o.stop(t+.12);
  },
  _mstep({vol=1}={}){   // threat footsteps — heavy, wrong-sounding
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(52,t); o.frequency.exponentialRampToValueAtTime(30,t+.16);
    const g=c.createGain(); this._env(g,t,.006,.65*vol,.24);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t+.4);
    const n=this._noiseSrc(); const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=170;
    const ng=c.createGain(); this._env(ng,t,.004,.28*vol,.13);
    n.connect(f);f.connect(ng);ng.connect(this.sfxBus);n.start(t);n.stop(t+.25);
    // faint chitter overtone
    const o2=c.createOscillator(); o2.type='square'; o2.frequency.setValueAtTime(1300+M.rand(-300,600),t);
    const o2g=c.createGain(); this._env(o2g,t,.002,.012*vol,.05);
    o2.connect(o2g); o2g.connect(this.sfxBus); o2.start(t); o2.stop(t+.09);
  },
  _breath({vol=1}={}){ // long wet exhale — plays near threat
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.4;
    f.frequency.setValueAtTime(340,t); f.frequency.exponentialRampToValueAtTime(720,t+.9);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.11*vol,t+.35);
    g.gain.exponentialRampToValueAtTime(.0001,t+1.5);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+1.6);
  },
  _roar(){
    const c=this.ctx,t=this._out();
    const shaper=c.createWaveShaper();
    const curve=new Float32Array(256);
    for(let i=0;i<256;i++){const x=i/128-1;curve[i]=Math.tanh(x*3.2);}
    shaper.curve=curve;
    const g=c.createGain(); this._env(g,t,.03,.9,2.2,.12);
    shaper.connect(g); g.connect(this.sfxBus);
    for(const det of [0,-14,9]){
      const o=c.createOscillator(); o.type='sawtooth';
      o.frequency.setValueAtTime(96+det,t);
      o.frequency.exponentialRampToValueAtTime(43+det*.5,t+1.4);
      const og=c.createGain(); og.gain.value=.33;
      o.connect(og);og.connect(shaper);o.start(t);o.stop(t+2.6);
    }
    const n=this._noiseSrc(); const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1;
    f.frequency.setValueAtTime(260,t); f.frequency.exponentialRampToValueAtTime(90,t+1.8);
    const ng=c.createGain(); this._env(ng,t,.05,.5,2.0,.08);
    n.connect(f);f.connect(ng);ng.connect(shaper);n.start(t);n.stop(t+2.6);
    // sub impact
    const s=c.createOscillator(); s.type='sine'; s.frequency.setValueAtTime(70,t); s.frequency.exponentialRampToValueAtTime(26,t+.7);
    const sg=c.createGain(); this._env(sg,t,.01,.8,.8);
    s.connect(sg);sg.connect(this.sfxBus);s.start(t);s.stop(t+1);
  },
  _sting({kind='scare', vol=1}={}){
    const c=this.ctx,t=this._out();
    const freqs = kind==='scare' ? [233.1,246.9,466.2,493.9] : [311.1,329.6];
    for(const fq of freqs){
      const o=c.createOscillator(); o.type= kind==='scare'?'sawtooth':'triangle'; o.frequency.value=fq;
      const g=c.createGain(); this._env(g,t,.008,(kind==='scare'?.14:.06)*vol,kind==='scare'?1.6:.9);
      o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+(kind==='scare'?1.8:1.1));
    }
    const s=c.createOscillator(); s.type='sine';
    s.frequency.setValueAtTime(kind==='scare'?90:60,t); s.frequency.exponentialRampToValueAtTime(27,t+.9);
    const sg=c.createGain(); this._env(sg,t,.01,.5*vol,1.1);
    s.connect(sg);sg.connect(this.sfxBus);s.start(t);s.stop(t+1.3);
  },
  _whisper({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=6;
    f.frequency.setValueAtTime(700,t);
    f.frequency.linearRampToValueAtTime(1900,t+.5);
    f.frequency.linearRampToValueAtTime(520,t+1.4);
    f.frequency.linearRampToValueAtTime(1500,t+2.1);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.05*vol,t+.3);
    g.gain.setValueAtTime(.05*vol,t+1.6);
    g.gain.exponentialRampToValueAtTime(.0001,t+2.3);
    const trem=c.createOscillator(); trem.frequency.value=9;
    const tg=c.createGain(); tg.gain.value=.018*vol; trem.connect(tg); tg.connect(g.gain); trem.start(t); trem.stop(t+2.4);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+2.4);
  },
  _doorSlide({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=2;
    f.frequency.setValueAtTime(180,t); f.frequency.exponentialRampToValueAtTime(520,t+.55);
    const g=c.createGain(); this._env(g,t,.05,.16*vol,.6);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+.75);
    HG.after(.6,()=>this._thunk({vol:vol}));
  },
  _doorSlam({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900;
    const g=c.createGain(); this._env(g,t,.003,.55*vol,.22);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+.35);
    this._thunk({vol:1.4*vol});
  },
  _thunk({vol=1}={}){
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(64,t); o.frequency.exponentialRampToValueAtTime(34,t+.13);
    const g=c.createGain(); this._env(g,t,.004,.5*vol,.17);
    o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+.3);
  },
  _clunk({vol=1}={}){ // metal latch / relay
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='square'; o.frequency.setValueAtTime(220+M.rand(-40,40),t);
    const g=c.createGain(); this._env(g,t,.002,.1*vol,.05);
    o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+.09);
    this._thunk({vol:.7*vol});
  },
  _beep({fq=880,vol=.5}={}){
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sine'; o.frequency.value=fq;
    const g=c.createGain(); this._env(g,t,.004,.14*vol,.1);
    o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+.18);
  },
  _buzz(){
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='square'; o.frequency.value=112;
    const g=c.createGain(); this._env(g,t,.01,.16,.32);
    o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+.4);
  },
  _chime(){ // objective chime — soft, two-note, not cheerful
    const c=this.ctx,t=this._out();
    [[392,0],[523.3,.16]].forEach(([fq,dt])=>{
      const o=c.createOscillator(); o.type='triangle'; o.frequency.value=fq;
      const g=c.createGain(); this._env(g,t+dt,.01,.07,.7);
      o.connect(g);g.connect(this.sfxBus);o.start(t+dt);o.stop(t+dt+.9);
    });
  },
  _powerup(){
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(38,t); o.frequency.exponentialRampToValueAtTime(160,t+1.1);
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420;
    const g=c.createGain(); this._env(g,t,.2,.22,1.4,.06);
    o.connect(f);f.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+2);
    HG.after(.2,()=>this._clunk({vol:1.2}));
    HG.after(.55,()=>this._clunk({vol:1}));
    HG.after(.95,()=>this._clunk({vol:.8}));
  },
  _glassBang({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=1400;
    const g=c.createGain(); this._env(g,t,.002,.4*vol,.3);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+.4);
    [1244,1661,2093].forEach((fq,i)=>{
      const o=c.createOscillator(); o.type='sine'; o.frequency.value=fq*M.rand(.97,1.03);
      const og=c.createGain(); this._env(og,t+i*.02,.002,.06*vol,.4);
      o.connect(og);og.connect(this.sfxBus);o.start(t);o.stop(t+.6);
    });
    this._thunk({vol:1.2});
  },
  _creak({vol=1}={}){
    const c=this.ctx,t=this._out();
    const o=c.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(90+M.rand(0,120),t);
    o.frequency.linearRampToValueAtTime(60+M.rand(0,80),t+1.1);
    const f=c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=430; f.Q.value=7;
    const g=c.createGain(); this._env(g,t,.25,.045*vol,1.2);
    o.connect(f);f.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+1.6);
  },
  _bang({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=380;
    const g=c.createGain(); this._env(g,t,.003,.4*vol,.4);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+.5);
    this._thunk({vol:vol});
  },
  _hiss({vol=1}={}){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=3200;
    const g=c.createGain(); this._env(g,t,.06,.14*vol,1.6,.02);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+2);
  },
  _ding(){
    const c=this.ctx,t=this._out();
    [[987.8,0],[1318.5,.09]].forEach(([fq,dt])=>{
      const o=c.createOscillator(); o.type='sine'; o.frequency.value=fq;
      const g=c.createGain(); this._env(g,t+dt,.004,.16,1.4);
      o.connect(g);g.connect(this.sfxBus);o.start(t+dt);o.stop(t+dt+1.6);
    });
  },
  _radio({vol=1}={}){
    // squelch + garbled voice-like babble (amplitude-modulated filtered noise)
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1100; bp.Q.value=1.6;
    const mod=c.createOscillator(); mod.type='sine'; mod.frequency.value=0;
    const modG=c.createGain();
    // emulate syllables by scheduling gain steps
    const g=c.createGain(); g.gain.value=0;
    let tt=t+.15; this._env(g,t,.01,.06*vol,.12);
    for(let i=0;i<14;i++){ const dur=M.rand(.05,.17); g.gain.setTargetAtTime(Math.random()<.8?M.rand(.03,.09)*vol:.004, tt, .02); tt+=dur; }
    g.gain.setTargetAtTime(.0001,tt,.03);
    mod.frequency.value=M.rand(3.5,6); modG.gain.value=.35*vol;
    mod.connect(modG); modG.connect(g.gain); mod.start(t); mod.stop(tt+.5);
    n.connect(bp);bp.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(tt+.6);
    this._beep({fq:1560,vol:.4*vol});
  },
  _paper(){
    const c=this.ctx,t=this._out();
    const n=this._noiseSrc();
    const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=2600;
    const g=c.createGain(); this._env(g,t,.02,.06,.16);
    n.connect(f);f.connect(g);g.connect(this.sfxBus);n.start(t);n.stop(t+.25);
  },
  _locker(){
    this._clunk({vol:1.3}); HG.after(.18,()=>this._creak({vol:1.4}));
  },
  _valveTurn(){
    const c=this.ctx,t=this._out();
    for(let i=0;i<4;i++){
      const o=c.createOscillator(); o.type='square'; o.frequency.setValueAtTime(150+M.rand(-30,60),t+i*.22);
      const g=c.createGain(); this._env(g,t+i*.22,.003,.09,.05);
      o.connect(g);g.connect(this.sfxBus);o.start(t+i*.22);o.stop(t+i*.22+.1);
    }
  },
  _steam(){
    this._hiss({vol:1.6}); this._bang({vol:.5});
  },
  _klaxon(){
    const c=this.ctx,t=this._out();
    for(let i=0;i<3;i++){
      const o=c.createOscillator(); o.type='square'; o.frequency.value=196;
      const g=c.createGain(); this._env(g,t+i*.75,.02,.09,.5);
      o.connect(g);g.connect(this.sfxBus);o.start(t+i*.75);o.stop(t+i*.75+.7);
    }
  },
  _burstDoor(){ // containment breach
    this._bang({vol:1.6}); HG.after(.3,()=>this._clangish());
  },
  _clangish(){
    const c=this.ctx,t=this._out();
    [523,740,311].forEach((fq,i)=>{
      const o=c.createOscillator(); o.type='triangle'; o.frequency.value=fq*M.rand(.98,1.02);
      const g=c.createGain(); this._env(g,t+i*.03,.002,.08,.8);
      o.connect(g);g.connect(this.sfxBus);o.start(t);o.stop(t+1);
    });
  },
  _lunge(){
    this._roar(); HG.after(.5,()=>this._doorSlam({vol:1.6}));
  },
};

})();
