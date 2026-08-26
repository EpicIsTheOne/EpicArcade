// Synthesized audio — no external assets. Unlocked on first user gesture.
export class AudioSys {
  constructor(){
    this.ctx=null; this.master=null; this.unlocked=false;
    this.ambientNodes=[];
  }
  ensure(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return false;
      this.ctx=new AC();
      this.master=this.ctx.createGain();
      this.master.gain.value=0.8;
      this.master.connect(this.ctx.destination);
    }
    if(this.ctx.state==='suspended') this.ctx.resume();
    this.unlocked=true;
    return true;
  }
  setVolume(v){ if(this.master) this.master.gain.value=v; }

  _noiseBuf(dur=1){
    const sr=this.ctx.sampleRate, b=this.ctx.createBuffer(1,sr*dur,sr), d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    return b;
  }
  _env(gainNode,t0,a,peak,dur){
    const g=gainNode.gain;
    g.setValueAtTime(0.0001,t0);
    g.exponentialRampToValueAtTime(Math.max(peak,0.0001),t0+a);
    g.exponentialRampToValueAtTime(0.0001,t0+dur);
  }

  // --- one-shots ---
  blip(freq=880,dur=.09,vol=.25,type='sine'){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.value=freq;this._env(g,t,.005,vol,dur);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+dur+.02);
  }
  shoot(blue=true){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.type='sawtooth';
    o.frequency.setValueAtTime(blue?340:260,t);
    o.frequency.exponentialRampToValueAtTime(blue?1250:980,t+.13);
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=6;
    f.frequency.setValueAtTime(600,t); f.frequency.exponentialRampToValueAtTime(1800,t+.12);
    this._env(g,t,.008,.30,.22);
    o.connect(f).connect(g).connect(this.master);o.start(t);o.stop(t+.26);
    this.blip(blue?1400:1050,.05,.1,'triangle');
  }
  deny(){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.type='square'; o.frequency.setValueAtTime(160,t); o.frequency.linearRampToValueAtTime(90,t+.18);
    this._env(g,t,.005,.16,.2);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+.22);
  }
  whoosh(dir=1){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const src=c.createBufferSource(); src.buffer=this._noiseBuf(.4);
    const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.4;
    f.frequency.setValueAtTime(dir>0?300:2400,t);
    f.frequency.exponentialRampToValueAtTime(dir>0?2400:300,t+.28);
    const g=c.createGain(); this._env(g,t,.02,.34,.34);
    src.connect(f).connect(g).connect(this.master);src.start(t);src.stop(t+.4);
  }
  thud(vol=.3,freq=95){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(38,t+.14);
    this._env(g,t,.004,vol,.17);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+.2);
  }
  doorSlide(open=true){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const src=c.createBufferSource(); src.buffer=this._noiseBuf(.6);
    const f=c.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(open?500:900,t);
    f.frequency.linearRampToValueAtTime(open?900:500,t+.5);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.14,t+.08);
    g.gain.exponentialRampToValueAtTime(.0001,t+.55);
    src.connect(f).connect(g).connect(this.master);src.start(t);src.stop(t+.6);
    this.thud(.18,70);
  }
  buttonDown(on=true){ this.blip(on?520:360,.08,.22,'triangle'); if(on)this.blip(1040,.06,.12,'sine'); }
  chime(base=660){
    if(!this.unlocked)return;
    [0,4,7].forEach((s,i)=>setTimeout(()=>this.blip(base*Math.pow(2,s/12),.35,.16,'sine'),i*110));
  }
  zap(){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const src=c.createBufferSource(); src.buffer=this._noiseBuf(.35);
    const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=1200;
    const g=c.createGain();this._env(g,t,.005,.4,.32);
    src.connect(f).connect(g).connect(this.master);src.start(t);src.stop(t+.36);
    this.blip(140,.3,.3,'sawtooth');
  }
  ding(){ this.chime(880); }
  success(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.blip(f,.28,.2,'triangle'),i*130)); }
  fizzleItem(){
    if(!this.unlocked)return; const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(900,t);o.frequency.exponentialRampToValueAtTime(120,t+.25);
    const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=2000;
    this._env(g,t,.005,.2,.28);
    o.connect(f).connect(g).connect(this.master);o.start(t);o.stop(t+.3);
  }

  // --- ambience ---
  startAmbient(intensity=1, alert=false){
    if(!this.unlocked || this._amb) return;
    const c=this.ctx;
    const src=c.createBufferSource(); src.buffer=this._noiseBuf(2); src.loop=true;
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=alert?420:240;
    const g=c.createGain(); g.gain.value=.045*intensity;
    src.connect(lp).connect(g).connect(this.master); src.start();
    const hum=c.createOscillator(); hum.type='sawtooth'; hum.frequency.value=alert?58:49;
    const hg=c.createGain(); hg.gain.value=.012*intensity;
    const hf=c.createBiquadFilter(); hf.type='lowpass'; hf.frequency.value=140;
    hum.connect(hf).connect(hg).connect(this.master); hum.start();
    const lfo=c.createOscillator(); lfo.frequency.value=.11;
    const lg=c.createGain(); lg.gain.value=.015*intensity;
    lfo.connect(lg).connect(g.gain); lfo.start();
    this._amb={src,hum,lfo,g,hg};
  }
  stopAmbient(){
    if(!this._amb)return;
    try{ this._amb.src.stop(); this._amb.hum.stop(); this._amb.lfo.stop(); }catch(e){}
    this._amb=null;
  }
}
export const audio = new AudioSys();
