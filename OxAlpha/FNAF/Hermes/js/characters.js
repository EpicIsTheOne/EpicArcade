// characters.js — loads GLB animatronics, rebuilds runtime rigs from named joints,
// drives procedural animation (idle, walk, lunge, vent crawl, scamper, marionette float).
'use strict';
WD.characters = (() => {
  const DEFS = {
    orv:    { file:'assets/characters/orv.glb',    name:'Orv the Bear', scale:1.0 },
    rivets: { file:'assets/characters/rivets.glb', name:'Rivets',       scale:1.0 },
    sera:   { file:'assets/characters/sera.glb',   name:'Madame Sera',  scale:1.0 },
    bolt:   { file:'assets/characters/bolt.glb',   name:'Bolt the Clown', scale:1.0 },
    wonder: { file:'assets/characters/wonder.glb', name:'Wonder-0',     scale:1.0 },
  };
  const cache = {};
  function load(id){
    if(cache[id]) return cache[id];
    cache[id] = new Promise((res, rej)=>{
      WD.loader.load(DEFS[id].file, (gltf)=>{
        const root = gltf.scene;
        // collect joints by name
        const J = {};
        root.traverse(o=>{
          if(o.name) J[o.name] = o;
          if(o.isMesh){
            o.castShadow = true;
            o.frustumCulled = false;
            if(o.material){ o.material.metalness = Math.min(o.material.metalness===undefined?0:o.material.metalness, 1);
              if(o.material.map === null && o.material.color === undefined) o.material.color = new THREE.Color(0x888888); }
          }
        });
        res({ root, J });
      }, undefined, (e)=>rej(e));
    });
    return cache[id];
  }
  // Build a Character instance: cloned scene + joint map + animator
  class Char {
    constructor(id, glb){
      this.id = id; this.def = DEFS[id];
      this.root = glb.root.clone(true);
      this.J = {};
      const srcJ = glb.J;
      this.root.traverse(o=>{ if(o.name && srcJ[o.name]) this.J[o.name] = o; });
      // store rest poses for procedural animation
      this.rest = {};
      for(const k in this.J) this.rest[k] = this.J[k].position.clone();
      // eye emissives we can pulse at runtime (by material name)
      this.eyeMats = [];
      this.root.traverse(o=>{
        if(o.isMesh && o.material){
          const mats = Array.isArray(o.material)? o.material : [o.material];
          mats.forEach(m=>{ if(m.emissive && m.emissiveIntensity > 1.5) this.eyeMats.push(m); });
        }
      });
      this.phase = Math.random()*10;
      this.mode = 'idle';
      this.modeT = 0;
    }
    setMode(m){ if(this.mode!==m){ this.mode=m; this.modeT=0; } }
    // dt seconds; speed factor for walking cycles
    animate(dt, speed=1){
      this.modeT += dt; const t = this.modeT; this.phase += dt*speed;
      const p = this.phase, J = this.J, R = this.rest;
      const setP = (k, dx,dy,dz)=>{ if(R[k]) J[k].position.set(R[k].x+dx, R[k].y+dy, R[k].z+dz); };
      const setR = (k,x,y,z)=>{ if(J[k]) J[k].rotation.set(x,y,z); };
      switch(this.mode){
        case 'walk': {
          const s = Math.sin(p*4.4), c = Math.cos(p*4.4);
          for(const side of [-1,1]){
            const ph = side<0? 0 : Math.PI;
            const sw = Math.sin(p*4.4+ph);
            setR(`Hips`, 0.04*Math.sin(p*8.8), 0, 0);
            const hipK = `${this.defKey||''}`;
          }
          // per-character leg joint naming handled by suffix maps below
          this._limbs(p);
          break; }
        case 'idle': this._idle(dt); break;
        case 'lunge': {
          const k = Math.min(1, t/0.45);           // fast raise
          setR('Head', 0.16*k + Math.sin(t*40)*0.03, Math.sin(t*30)*0.04, 0); // face level, into lens
          this._arms(-2.2*k, -0.5*k);
          this._jaw(0.85*k + Math.abs(Math.sin(t*30))*0.15);
          break; }
        case 'vent': {
          const s = Math.sin(p*6);
          setR('Head', 0.35, 0, 0);
          this._arms(-0.7 + s*0.25, 0.3);
          this._jaw(0.25 + Math.abs(s)*0.2);
          break; }
        case 'scamper': {
          const s = Math.sin(p*11);
          this._limbs(p*2.4, true);
          setR('Head', 0.18 + s*0.06, Math.sin(p*5.5)*0.12, 0);
          break; }
        case 'float': {
          const b = Math.sin(t*1.7);
          if(R.Hips) J.Hips.position.y = R.Hips.y + b*0.07;
          setR('Head', Math.sin(t*0.9)*0.14, Math.sin(t*0.6)*0.3, Math.sin(t*1.3)*0.1);
          this._arms(-0.35+b*0.08, -0.15);
          this._jaw(0.12+b*0.1);
          break; }
        case 'stare': {
          setR('Head', 0, Math.sin(t*0.7)*0.22, 0);
          this._jaw(0.06+Math.abs(Math.sin(t*0.4))*0.05);
          break; }
      }
    }
    _limbs(p, fast=false){
      const sp = fast? 11 : 4.4;
      const names = this._names || (this._names = {
        legs: Object.keys(this.J).filter(n=>/Hip[LR]$/.test(n)),
        knees: Object.keys(this.J).filter(n=>/Knee/.test(n)),
        shoulders: Object.keys(this.J).filter(n=>/Shoulder|SawHub|ClawHub|ShBall/.test(n)) &&
                   Object.keys(this.J).filter(n=>/Shoulder[LR]|SawHub|ClawHub$/.test(n)),
        elbows: Object.keys(this.J).filter(n=>/Elbow|Wrist/.test(n)),
        head: Object.keys(this.J).find(n=>/Head$/.test(n)),
        jaw: Object.keys(this.J).find(n=>/Jaw$/.test(n)),
      });
      const swingA = fast? 0.75 : 0.55;
      names.legs.forEach((h,i)=>{
        const ph = i%2 ? Math.PI : 0;
        const sw = Math.sin(p*sp+ph)*swingA;
        if(this.J[h]) this.J[h].rotation.x = sw;
        const knee = names.knees.find(k=>k.startsWith(h.slice(0,-1)));
        if(knee) this.J[knee].rotation.x = Math.max(0, -sw)*1.3;
      });
      names.shoulders.forEach((sh,i)=>{
        const ph = i%2 ? 0 : Math.PI;
        this.J[sh].rotation.x = -Math.sin(p*sp+ph)*swingA*0.7 - 0.15;
      });
      if(names.head) this.J[names.head].rotation.x = 0.05+Math.sin(p*sp*2)*0.03;
      if(names.jaw) this.J[names.jaw].rotation.x = 0.08+Math.abs(Math.sin(p*sp))*0.10;
    }
    _idle(dt){
      const p=this.modeT, J=this.J, R=this.rest;
      const breathe = Math.sin(p*1.6);
      if(R.Hips) J.Hips.position.y = R.Hips.y + breathe*0.02;
      const headK = Object.keys(J).find(k=>/Head$/.test(k));
      if(headK) J[headK].rotation.set(Math.sin(p*0.5)*0.05, Math.sin(p*0.23)*0.28, 0);
      const jawK = Object.keys(J).find(k=>/Jaw$/.test(k));
      if(jawK) J[jawK].rotation.x = 0.05 + Math.abs(Math.sin(p*0.31))*0.06;
      // subtle arm sway
      Object.keys(J).filter(k=>/Shoulder[LR]|SawHub|ClawHub$/.test(k)).forEach((k,i)=>{
        J[k].rotation.x = -0.12 + Math.sin(p*0.8+i*2.1)*0.05;
      });
    }
    _arms(rx, spreadZ){
      const J=this.J;
      Object.keys(J).filter(k=>/Shoulder[LR]|SawHub|ClawHub$/.test(k)).forEach(k=>{
        J[k].rotation.x = rx;
      });
    }
    _jaw(open){
      const k = Object.keys(this.J).find(n=>/Jaw$/.test(n));
      if(k) this.J[k].rotation.x = open;
    }
    pulseEyes(v){ this.eyeMats.forEach(m=>{ m.userData._base = m.userData._base ?? m.emissiveIntensity;
      m.emissiveIntensity = m.userData._base * v; }); }
  }
  async function buildAll(){
    const out = {};
    await Promise.all(Object.keys(DEFS).map(async id=>{
      const glb = await load(id);
      out[id] = new Char(id, glb);
    }));
    return out;
  }
  return { load, buildAll, DEFS };
})();
