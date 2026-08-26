/* HOLLOW SIGNAL — core: namespace, math, input, settings */
(function(){
"use strict";
const HG = window.HG = window.HG || {};

/* ---------------- math ---------------- */
const M = HG.M = {
  clamp:(v,a,b)=>v<a?a:v>b?b:v,
  lerp:(a,b,t)=>a+(b-a)*t,
  smooth:(a,b,t)=>a+(b-a)*(t*t*(3-2*t)),
  // frame-rate independent exponential approach
  damp:(a,b,rate,dt)=>M.lerp(a,b,1-Math.exp(-rate*dt)),
  rand:(a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a),
  randi:(a,b)=>Math.floor(M.rand(a,b+1)),
  pick:arr=>arr[Math.floor(Math.random()*arr.length)],
  dist2:(ax,az,bx,bz)=>{const dx=ax-bx,dz=az-bz;return dx*dx+dz*dz;},
  dist:(ax,az,bx,bz)=>Math.hypot(ax-bx,az-bz),
  angDiff:(a,b)=>{let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;},
};

/* ---------------- settings (persisted) ---------------- */
const SET_KEY = "hollowsignal.settings.v1";
const settings = HG.settings = {
  volume:.8, brightness:1, sens:1, subtitles:true, headbob:true,
  load(){
    try{
      const raw = localStorage.getItem(SET_KEY);
      if(raw) Object.assign(this, JSON.parse(raw));
    }catch(e){}
  },
  save(){
    try{ localStorage.setItem(SET_KEY, JSON.stringify({
      volume:this.volume, brightness:this.brightness, sens:this.sens,
      subtitles:this.subtitles, headbob:this.headbob }));
    }catch(e){}
  },
};
settings.load();

/* ---------------- input ---------------- */
const Input = HG.Input = {
  keys:Object.create(null),
  pressed:Object.create(null),   // consumed once per frame
  mouseDX:0, mouseDY:0,
  pointerLocked:false,
  dragLook:false,                // fallback when pointer lock unavailable
  _dragging:false,
  enabled:false,                 // gameplay input gate

  init(canvas){
    window.addEventListener('keydown', e=>{
      if(e.repeat) return;
      const k = e.code;
      this.keys[k]=true; this.pressed[k]=true;
      // block browser scroll/search quirks for game keys
      if(["Tab","Space","ArrowUp","ArrowDown","KeyE","KeyF","KeyC"].includes(k) && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', e=>{ this.keys[e.code]=false; });
    window.addEventListener('blur', ()=>{ this.keys=Object.create(null); });

    document.addEventListener('pointerlockchange', ()=>{
      this.pointerLocked = document.pointerLockElement === canvas;
      if(!this.pointerLocked && this.enabled){
        HG.onPointerLockLost && HG.onPointerLockLost();
      }
    });
    document.addEventListener('pointerlockerror', ()=>{ this.pointerLocked=false; });

    document.addEventListener('mousemove', e=>{
      if(this.pointerLocked){ this.mouseDX += e.movementX||0; this.mouseDY += e.movementY||0; }
      else if(this.dragLook && this._dragging && this.enabled){
        this.mouseDX += e.movementX ?? 0; this.mouseDY += e.movementY ?? 0;
      }
    });
    canvas.addEventListener('mousedown', e=>{
      if(!this.enabled) return;
      if(!this.pointerLocked){
        try{ canvas.requestPointerLock(); }catch(err){}
        // if lock never engages we still allow drag-look
        setTimeout(()=>{ if(!this.pointerLocked) this.dragLook=true; }, 350);
      }
      this._dragging = true;
      if(this.pressed === null) {}
      this.pressed['MouseDown']=true;
    });
    window.addEventListener('mouseup', ()=>{ this._dragging=false; });

    // prevent context menu during play
    canvas.addEventListener('contextmenu', e=>{ if(this.enabled) e.preventDefault(); });
  },

  lockPointer(canvas){
    if(document.pointerLockElement !== canvas){
      try{ const p = canvas.requestPointerLock(); if(p&&p.catch)p.catch(()=>{}); }catch(e){}
    }
  },
  unlockPointer(){
    try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  },

  down(code){ return !!this.keys[code]; },
  hit(code){ return !!this.pressed[code]; },
  endFrame(){ this.pressed = Object.create(null); this.mouseDX=0; this.mouseDY=0; },
};

/* ---------------- tiny tween/timer helpers ---------------- */
HG.timers = [];
HG.after = function(t, fn){ HG.timers.push({t, fn}); return fn; };
HG.tickTimers = function(dt){
  const list = HG.timers; HG.timers = [];
  for(const tm of list){
    tm.t -= dt;
    if(tm.t<=0){ tm.fn(); } else { HG.timers.push(tm); }
  }
};
HG.clearTimers = function(){ HG.timers = []; };

})();
