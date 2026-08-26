// Procedural WebAudio sound effects + ambience. No external assets.
import { B } from './blocks.js';

export class AudioSys {
  constructor(){
    this.ctx=null;
    this.master=null;
    this.enabled=true;
    this.lastStep=0;
    this._noiseBuf=null;
    this.rainGain=null;
    this.muffle=false;
    this._lp=null;
  }
  ensure(){
    if(this.ctx)return true;
    try{
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();
      this.master.gain.value=0.55;
      this._lp=this.ctx.createBiquadFilter();
      this._lp.type='lowpass';
      this._lp.frequency.value=19000;
      const comp=this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this._lp);
      this._lp.connect(this.ctx.destination);
      const len=this.ctx.sampleRate*1.2;
      this._noiseBuf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
      const d=this._noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.startRain();
      return true;
    }catch(e){this.enabled=false;return false;}
  }
  startRain(){
    const c=this.ctx;
    const src=c.createBufferSource();
    src.buffer=this._noiseBuf;
    src.loop=true;
    const f=c.createBiquadFilter();
    f.type='highpass';f.frequency.value=1200;
    this.rainGain=c.createGain();
    this.rainGain.gain.value=0;
    src.connect(f);f.connect(this.rainGain);this.rainGain.connect(this.master);
    src.start();
  }
  setRain(a){
    if(!this.ctx||!this.rainGain)return;
    this.rainGain.gain.linearRampToValueAtTime(a*0.14,this.ctx.currentTime+0.9);
  }
  setMuffle(m){
    if(!this.ctx)return;
    this.muffle=m;
    this._lp.frequency.linearRampToValueAtTime(m?620:19000,this.ctx.currentTime+0.25);
    this.master.gain.linearRampToValueAtTime(m?0.4:0.55,this.ctx.currentTime+0.25);
  }
  resume(){ if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume(); }

  noise(dur,freq,vol,type='bandpass',q=1){
    if(!this.ensure())return;
    const c=this.ctx,t=c.currentTime;
    const src=c.createBufferSource();
    src.buffer=this._noiseBuf;
    src.playbackRate.value=0.7+Math.random()*0.6;
    const f=c.createBiquadFilter();
    f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=c.createGain();
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(f);f.connect(g);g.connect(this.master);
    src.start(t,Math.random()*0.5);
    src.stop(t+dur+0.05);
  }
  tone(freq,dur,vol,type='square',slide){
    if(!this.ensure())return;
    const c=this.ctx,t=c.currentTime;
    const o=c.createOscillator();
    o.type=type;o.frequency.setValueAtTime(freq,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(24,slide),t+dur);
    const g=c.createGain();
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g);g.connect(this.master);
    o.start(t);o.stop(t+dur+0.05);
  }

  play(name,arg){
    if(!this.ensure())return;
    switch(name){
      case 'step':{
        const now=performance.now();
        if(now-this.lastStep<170)return;
        this.lastStep=now;
        if(arg===B.GRASS||arg===B.LEAVES)this.noise(0.09,650+Math.random()*250,0.11,'bandpass',0.8);
        else if(arg===B.SAND||arg===B.GRAVEL)this.noise(0.1,1500,0.09,'bandpass',0.7);
        else if(arg===B.LOG||arg===B.PLANKS)this.tone(150+Math.random()*40,0.07,0.07,'triangle',110);
        else if(arg===B.WOOL)this.noise(0.08,420,0.07,'lowpass');
        else this.noise(0.06,1050+Math.random()*400,0.09,'bandpass',2);
        break;
      }
      case 'dig':this.noise(0.08,850+(typeof arg==='number'?(arg%7)*160:300),0.13,'bandpass',1.6);break;
      case 'break':this.noise(0.18,520,0.22,'lowpass');this.tone(170,0.1,0.09,'triangle',70);break;
      case 'break2':this.tone(320,0.16,0.16,'sawtooth',90);this.noise(0.12,2200,0.12,'highpass');break;
      case 'place':this.tone(185,0.07,0.14,'triangle',130);this.noise(0.05,700,0.07);break;
      case 'hurt':this.tone(270,0.2,0.22,'sawtooth',120);break;
      case 'fall':this.noise(0.24,280,0.26,'lowpass');break;
      case 'pop':this.tone(500,0.08,0.14,'sine',900);break;
      case 'hit':this.noise(0.09,480,0.18,'bandpass',1.2);this.tone(130,0.08,0.12,'square',80);break;
      case 'mobhurt':this.tone(140,0.2,0.17,'sawtooth',75);break;
      case 'hitanimal':this.tone(240,0.13,0.15,'triangle',150);break;
      case 'eat':this.noise(0.07,430+Math.random()*240,0.12,'bandpass',1.3);break;
      case 'click':this.tone(700,0.04,0.09,'square');break;
      case 'fuse':this.noise(1.35,3300,0.14,'highpass');break;
      case 'explode':this.noise(0.85,130,0.8,'lowpass');this.tone(66,0.5,0.45,'sine',30);break;
      case 'splash':this.noise(0.3,950,0.24,'lowpass',0.8);break;
      case 'chest':this.noise(0.13,480,0.14,'bandpass',1.5);this.tone(310,0.09,0.08,'triangle',380);break;
      case 'thunder':this.noise(1.7,210,0.75,'lowpass');setTimeout(()=>this.noise(1.1,120,0.5,'lowpass'),180);break;
      case 'levelup':this.tone(520,0.1,0.12,'sine');setTimeout(()=>this.tone(780,0.14,0.12,'sine'),100);break;
    }
  }
  mob(type,dist){
    const v=Math.max(0.03,0.3*(1-dist/22));
    switch(type){
      case 'zombie':this.tone(92+Math.random()*28,0.5,v*1.1,'sawtooth',60);this.noise(0.35,230,0.5*v,'lowpass');break;
      case 'creeper':if(Math.random()<0.35)this.noise(0.4,2600,v*0.45,'highpass');break;
      case 'pig':this.tone(290+Math.random()*70,0.14,v,'sawtooth',380);break;
      case 'cow':this.tone(125+Math.random()*20,0.5,v*0.9,'sawtooth',88);break;
      case 'sheep':this.tone(420,0.32,v*0.8,'sawtooth',360);setTimeout(()=>this.tone(395,0.28,v*0.6,'sawtooth',340),140);break;
      case 'chicken':this.tone(840+Math.random()*200,0.09,v*0.65,'square',600);break;
    }
  }
}
