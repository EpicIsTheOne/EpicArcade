import { settings } from './config.js';

// Central input hub. Real DOM events feed the same state the debug/test
// API writes to, so automated play exercises the exact gameplay path.
export class Input {
  constructor(){
    this.keys = Object.create(null);
    this.lookDX = 0; this.lookDY = 0;
    this.listeners = {};   // name -> fn
    this.locked = false;
    this.captureNextClick = false;
    this._el = null;

    this._onKeyDown = e=>{
      if(e.repeat) return;
      this.keys[e.code]=true;
      this.emit('key',e.code);
      if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = e=>{ this.keys[e.code]=false; };
    this._onMouseMove = e=>{
      if(!this.locked) return;
      const s=0.0022*settings.sens;
      const mx=e.movementX||0, my=e.movementY||0;
      // Default: mouse right -> turn right, mouse up -> look up.
      this.lookDX += (settings.invX?-mx:mx)*s;
      this.lookDY += (settings.invY?my:-my)*s;
    };
    this._onMouseDown = e=>{
      if(!this.locked) return;
      if(e.button===0) this.emit('fire','blue');
      else if(e.button===2) this.emit('fire','orange');
    };
    this._onContext = e=>e.preventDefault();
    this._onLockChange = ()=>{
      const was=this.locked;
      this.locked = document.pointerLockElement===this._el;
      if(was && !this.locked) this.emit('unlock');
    };
  }
  attach(el){
    this._el=el;
    window.addEventListener('keydown',this._onKeyDown);
    window.addEventListener('keyup',this._onKeyUp);
    window.addEventListener('mousemove',this._onMouseMove);
    window.addEventListener('mousedown',this._onMouseDown);
    window.addEventListener('contextmenu',this._onContext);
    document.addEventListener('pointerlockchange',this._onLockChange);
  }
  detach(){
    window.removeEventListener('keydown',this._onKeyDown);
    window.removeEventListener('keyup',this._onKeyUp);
    window.removeEventListener('mousemove',this._onMouseMove);
    window.removeEventListener('mousedown',this._onMouseDown);
    window.removeEventListener('contextmenu',this._onContext);
    document.removeEventListener('pointerlockchange',this._onLockChange);
  }
  on(name,fn){ (this.listeners[name] ||= []).push(fn); }
  emit(name,...args){ (this.listeners[name]||[]).forEach(f=>f(...args)); }

  requestLock(){
    if(this.locked || !this._el) return Promise.resolve(true);
    try{
      const p=this._el.requestPointerLock({unadjustedMovement:true});
      return p instanceof Promise ? p.catch(()=>false) : Promise.resolve(true);
    }catch(e){ return Promise.resolve(false); }
  }
  releaseLock(){ if(document.pointerLockElement) document.exitPointerLock(); }

  clearKeys(){ for(const k in this.keys) this.keys[k]=false; }

  // ---- debug / automation surface (mirrors real events) ----
  debugSetKey(code,down){ this.keys[code]=!!down; if(down)this.emit('key',code); }
  debugLook(dxDeg,dyDeg){
    const s=1; this.lookDX += dxDeg*Math.PI/180*s; this.lookDY += dyDeg*Math.PI/180*s;
  }
  debugFire(which){ this.emit('fire',which); }
}
