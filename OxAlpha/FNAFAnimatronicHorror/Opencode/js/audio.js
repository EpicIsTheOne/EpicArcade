import {clamp, rand, pick} from './utils.js';

class SFX{
  constructor(){ this.ok=false; this.muted=false; this.vol=0.8; this._loops=new Set(); }
  init(){
    if(this.ok) return;
    const AC = window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value=-18; comp.ratio.value=6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = 2*this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    this.ok=true;
    this._roomTone();
  }
  resume(){ if(this.ok && this.ctx.state==='suspended') this.ctx.resume(); }
  setVolume(v){ this.vol=v; if(this.ok) this.master.gain.setTargetAtTime(this.muted?0:v,this.ctx.currentTime,.05); }
  setMuted(m){ this.muted=m; if(this.ok) this.master.gain.setTargetAtTime(m?0:this.vol,this.ctx.currentTime,.05); }

  _out(pan=0){
    const g=this.ctx.createGain();
    if(this.ctx.createStereoPanner){
      const p=this.ctx.createStereoPanner();
      p.pan.value=clamp(pan,-1,1);
      g.connect(p); p.connect(this.master);
    }else g.connect(this.master);
    return g;
  }
  _noise({dur=.2,f=1200,q=1,type='bandpass',vol=.5,pan=0,a=.005,curve=3}={}){
    if(!this.ok)return;
    const t=this.ctx.currentTime;
    const src=this.ctx.createBufferSource(); src.buffer=this.noiseBuf; src.loop=true;
    const flt=this.ctx.createBiquadFilter(); flt.type=type; flt.frequency.value=f; flt.Q.value=q;
    const env=this.ctx.createGain();
    env.gain.setValueAtTime(0,t);
    env.gain.linearRampToValueAtTime(vol,t+a);
    env.gain.exponentialRampToValueAtTime(.0001,t+dur);
    src.connect(flt);flt.connect(env);env.connect(this._out(pan));
    src.start(t); src.stop(t+dur+.05);
  }
  _tone({f=440,f2=null,type='sine',dur=.3,vol=.4,pan=0,a=.01,detune=0}={}){
    if(!this.ok)return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t);
    if(f2!=null) o.frequency.exponentialRampToValueAtTime(Math.max(f2,1),t+dur);
    o.detune.value=detune;
    const env=this.ctx.createGain();
    env.gain.setValueAtTime(0,t);
    env.gain.linearRampToValueAtTime(vol,t+a);
    env.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(env);env.connect(this._out(pan));
    o.start(t);o.stop(t+dur+.05);
  }

  _roomTone(){
    const t=this.ctx.currentTime;
    const src=this.ctx.createBufferSource();src.buffer=this.noiseBuf;src.loop=true;
    const lp=this.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=140;
    const g=this.ctx.createGain();g.gain.value=.05;
    src.connect(lp);lp.connect(g);g.connect(this.master);
    src.start(t);
    const hum=this.ctx.createOscillator();hum.type='sawtooth';hum.frequency.value=58;
    const hlp=this.ctx.createBiquadFilter();hlp.type='lowpass';hlp.frequency.value=110;
    const hg=this.ctx.createGain();hg.gain.value=.016;
    hum.connect(hlp);hlp.connect(hg);hg.connect(this.master);
    hum.start(t);
    const lfo=this.ctx.createOscillator();lfo.frequency.value=.07;
    const lg=this.ctx.createGain();lg.gain.value=.012;
    lfo.connect(lg);lg.connect(g.gain);
    lfo.start(t);
  }
  fanLoop(on){
    if(!this.ok)return;
    if(on && !this.fan){
      const src=this.ctx.createBufferSource();src.buffer=this.noiseBuf;src.loop=true;
      const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=260;bp.Q.value=1.4;
      const g=this.ctx.createGain();g.gain.value=0;
      g.gain.setTargetAtTime(.05,this.ctx.currentTime,.6);
      src.connect(bp);bp.connect(g);g.connect(this.master);
      src.start();
      const wob=this.ctx.createOscillator();wob.frequency.value=14;
      const wg=this.ctx.createGain();wg.gain.value=40;
      wob.connect(wg);wg.connect(bp.frequency);wob.start();
      this.fan={src,g,wob};
    }else if(!on && this.fan){
      const f=this.fan;this.fan=null;
      f.g.gain.setTargetAtTime(0,this.ctx.currentTime,.25);
      setTimeout(()=>{try{f.src.stop();f.wob.stop();}catch(e){}},900);
    }
  }
  distGain(dist){ return clamp(1.6/(1+dist*dist*.045),0,1); }

  uiClick(){this._tone({f:1400,type:'square',dur:.04,vol:.08});}
  monitorUp(){this._noise({dur:.28,f:900,q:.7,vol:.35});this._tone({f:180,f2:340,type:'triangle',dur:.22,vol:.18});}
  monitorDown(){this._noise({dur:.22,f:700,q:.7,vol:.3});this._tone({f:320,f2:150,type:'triangle',dur:.2,vol:.15});}
  camSwitch(){this._noise({dur:.13,f:2400,q:.5,vol:.42});}
  staticBurst(dur=0.4){this._noise({dur,f:3000,q:.3,type:'highpass',vol:.4});}

  doorMove(open,pan=0){
    this._noise({dur:.34,f:open?500:380,q:1.2,vol:.5,pan});
    this._tone({f:open?90:70,f2:open?150:52,type:'square',dur:.32,vol:.3,pan});
    if(!open) setTimeout(()=>{this._noise({dur:.09,f:200,q:1,vol:.65,pan});},290);
  }
  bang(side){
    const pan=side==='L'?-.8:.8;
    this._noise({dur:.24,f:130,q:1,type:'lowpass',vol:.95,pan});
    this._tone({f:64,f2:38,type:'sine',dur:.4,vol:.8,pan});
    setTimeout(()=>{this._noise({dur:.16,f:220,q:1,type:'lowpass',vol:.6,pan});},110);
    this._tone({f:520,f2:480,type:'square',dur:.5,vol:.07,pan});
  }
  footstep(dist=4,pan=0){
    const v=.5*this.distGain(dist);
    this._noise({dur:.11,f:rand(160,240),q:1.6,type:'lowpass',vol:v,pan});
    this._tone({f:rand(70,95),type:'sine',dur:.09,vol:v*.8,pan});
  }
  servo(dist=4,pan=0,dur=.5){
    const v=.4*this.distGain(dist);
    for(let i=0;i<3;i++){
      setTimeout(()=>this._tone({f:rand(700,1900),f2:rand(300,900),type:'sawtooth',dur:dur/3,vol:v*.5,pan}),i*dur*280);
    }
    this._noise({dur:dur*.7,f:2600,q:2,vol:v*.35,pan});
  }
  ventScratch(pan=0){
    let n=randi(3,5);
    const iv=setInterval(()=>{
      this._noise({dur:.09,f:rand(1800,3600),q:3,type:'bandpass',vol:.3,pan});
      if(--n<=0)clearInterval(iv);
    },rand(120,200));
  }
  hatchClang(pan=0){
    this._tone({f:820,f2:600,type:'square',dur:.12,vol:.3,pan});
    this._noise({dur:.2,f:900,q:2,vol:.55,pan});
  }
  snareZap(pan=0){
    this._tone({f:2200,f2:180,type:'sawtooth',dur:.3,vol:.5,pan});
    this._noise({dur:.25,f:4000,q:.6,type:'highpass',vol:.45,pan});
    setTimeout(()=>this._tone({f:140,type:'square',dur:.25,vol:.35,pan}),120);
  }
  giggle(dist=6,pan=0){
    const v=.5*this.distGain(dist);
    const base=rand(620,720);
    [0,.14,.26,.36].forEach((d,i)=>{
      setTimeout(()=>this._tone({f:base*(1+i*.06),f2:base*(1+i*.06)*.82,type:'triangle',dur:.1,vol:v,pan,detune:rand(-30,30)}),d*1000);
    });
  }
  clang(dist=8,pan=0){
    const v=.5*this.distGain(dist);
    this._tone({f:rand(900,1300),type:'square',dur:.4,vol:v*.4,pan});
    this._tone({f:rand(1700,2300),type:'sine',dur:.5,vol:v*.3,pan});
    this._noise({dur:.3,f:2000,q:2,vol:v*.5,pan});
  }
  breathLoop(side){
    if(!this.ok)return null;
    const pan=side==='L'?-.85:.85;
    const g=this.ctx.createGain();g.gain.value=0;g.connect(this._out(pan));
    let alive=true;
    const tick=()=>{
      if(!alive)return;
      const t=this.ctx.currentTime;
      const src=this.ctx.createBufferSource();src.buffer=this.noiseBuf;src.loop=true;
      const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=420;bp.Q.value=.8;
      const e=this.ctx.createGain();
      e.gain.setValueAtTime(0,t);
      e.gain.linearRampToValueAtTime(.16,t+.55);
      e.gain.linearRampToValueAtTime(0,t+1.25);
      src.connect(bp);bp.connect(e);e.connect(g);
      src.start(t);src.stop(t+1.4);
      setTimeout(tick,1750+rand(-250,350));
    };
    g.gain.setTargetAtTime(1,this.ctx.currentTime,.4);
    tick();
    return {stop(){alive=false;if(sfx.ok)g.gain.setTargetAtTime(0,sfx.ctx.currentTime,.15);}};
  }

  lullabyStart(dist=10,pan=0){
    if(!this.ok)return {stop(){},setDist(){}};
    const notes=[76,74,71,67,69,71,64,62,64,67,69,71,69,67,64,62];
    let i=0,alive=true,distRef=dist;
    const g=this.ctx.createGain();g.gain.value=.9;g.connect(this._out(pan));
    const step=()=>{
      if(!alive)return;
      const f=440*Math.pow(2,(notes[i%notes.length]-69)/12);
      const v=.3*this.distGain(distRef);
      this._tone({f,type:'triangle',dur:.9,vol:v});
      this._tone({f:f*2,type:'sine',dur:.7,vol:v*.3});
      i++;
      this.lbTimer=setTimeout(step,430);
    };
    step();
    return {
      stop(){alive=false;clearTimeout(this.lbTimer??undefined);clearTimeout(globalThis.__lb);if(g)g.gain.setTargetAtTime(0,sfx.ctx.currentTime,.3);},
      setDist(d){distRef=d;}
    };
  }
  powerDown(){
    this._tone({f:220,f2:30,type:'sawtooth',dur:1.6,vol:.5});
    this._noise({dur:1.2,f:400,q:.6,type:'lowpass',vol:.4});
  }
  musicBoxLoop(){
    if(!this.ok)return {stop(){}};
    const mel=[72,76,79,76,72,76,84,79,72,76,79,83,81,79,76,72];
    let i=0,alive=true;
    const step=()=>{
      if(!alive)return;
      const f=440*Math.pow(2,(mel[i%mel.length]-69)/12);
      this._tone({f,type:'triangle',dur:1.1,vol:.22,detune:-6});
      this._tone({f:f*.5,type:'sine',dur:1.3,vol:.12});
      i++;
      globalThis.__mb=setTimeout(step,460);
    };
    step();
    return {stop(){alive=false;clearTimeout(globalThis.__mb);}};
  }
  whisper(){
    this._noise({dur:1.4,f:rand(900,1400),q:6,type:'bandpass',vol:.28,pan:rand(-.8,.8),a:.4});
    setTimeout(()=>this._noise({dur:1.1,f:rand(700,1100),q:6,type:'bandpass',vol:.24,pan:rand(-.8,.8),a:.3}),700);
  }
  screech(kind='strix'){
    if(kind==='selene'){
      this._tone({f:1180,f2:340,type:'sawtooth',dur:1.1,vol:.6});
      this._tone({f:1770,f2:520,type:'square',dur:1.0,vol:.4,detune:20});
      this._noise({dur:1.1,f:2800,q:.8,vol:.5});
    }else if(kind==='rusty'){
      this._tone({f:420,f2:90,type:'sawtooth',dur:1.2,vol:.75});
      this._tone({f:210,f2:60,type:'square',dur:1.2,vol:.6});
      this._noise({dur:.9,f:800,q:.7,vol:.7});
    }else if(kind==='scamper'){
      for(let i=0;i<7;i++)setTimeout(()=>this._tone({f:rand(1500,3400),f2:rand(400,900),type:'square',dur:.12,vol:.5}),i*70);
      this._noise({dur:.8,f:3200,q:.7,vol:.5});
    }else{
      for(let i=0;i<5;i++)setTimeout(()=>this._tone({f:rand(600,900)*(1+i*.21),f2:120,type:'sawtooth',dur:.9,vol:.5,detune:rand(-40,40)}),i*40);
      this._tone({f:80,f2:36,type:'sine',dur:1.4,vol:.9});
      this._noise({dur:1.2,f:2200,q:.5,vol:.65});
    }
  }
  chime(){
    const notes=[84,88,91,96];
    notes.forEach((n,i)=>setTimeout(()=>{
      this._tone({f:440*Math.pow(2,(n-69)/12),type:'sine',dur:1.6,vol:.4});
      this._tone({f:440*Math.pow(2,(n-69)/12)*2,type:'sine',dur:1.2,vol:.15});
    },i*260));
    setTimeout(()=>{this._tone({f:196,type:'triangle',dur:2.5,vol:.2});this._tone({f:294,type:'triangle',dur:2.5,vol:.15});},1050);
  }
  typeTick(){this._tone({f:rand(1900,2300),type:'square',dur:.018,vol:.05});}
  alarmLow(){
    this.alarmInt=setInterval(()=>this._tone({f:392,f2:330,type:'square',dur:.28,vol:.12}),1000);
  }
  stopAlarm(){clearInterval(this.alarmInt);}
  powerWarnBeep(){this._tone({f:1046,type:'square',dur:.07,vol:.1});}
  hallLightOn(side){
    const pan=side==='L'?-.8:.8;
    this._noise({dur:.06,f:3400,q:1,vol:.25,pan});
    this._tone({f:120,type:'sawtooth',dur:.5,vol:.05,pan});
  }
  ventFlash(){this._noise({dur:.08,f:2800,q:1,vol:.3});}
  lurePlay(roomPos){
    const dist=roomPos?Math.hypot(roomPos.x,roomPos.z-14):8;
    const pan=clamp((roomPos?roomPos.x:0)/10,-1,1)*.8;
    this.giggle(dist,pan);
    setTimeout(()=>this.giggle(dist*1.2,pan),650);
    this._tone({f:660,type:'sine',dur:.4,vol:.2*this.distGain(dist)});
  }
  eclipseSting(){
    this._tone({f:66,f2:60,type:'sine',dur:2.2,vol:.5});
    this._noise({dur:1.6,f:120,q:8,type:'bandpass',vol:.3,a:.5});
    this.whisper();
  }
}

export const sfx = new SFX();
