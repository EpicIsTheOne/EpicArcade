/* ZENITH RUN · course builder + dynamic elements · ox-alpha piagent run-01
   Sections: Docks → Hops → Dash Gates → Wall Canyon → Slide Trench →
             Mover Gauntlet → Zenith Tower → Sky Bridge → Summit Finish */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};
const V3 = function(x,y,z){ return new THREE.Vector3(x,y,z); };

/* ---------- shared materials / helpers ---------- */
const MATS = {};
function lamb(h){ return MATS[h] || (MATS[h]=new THREE.MeshLambertMaterial({color:h})); }
function basic(h){ return MATS['b'+h] || (MATS['b'+h]=new THREE.MeshBasicMaterial({color:h})); }

let stripeTex = null;
function getStripeTex(){
  if (stripeTex) return stripeTex;
  const cv=document.createElement('canvas'); cv.width=cv.height=64;
  const c=cv.getContext('2d');
  c.fillStyle='#1a1030'; c.fillRect(0,0,64,64);
  c.strokeStyle='#ff2f7d'; c.lineWidth=13;
  for(let i=-64;i<128;i+=32){ c.beginPath(); c.moveTo(i,64); c.lineTo(i+64,0); c.stroke(); }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping;
  stripeTex=t; return t;
}
function textPlane(text, w, h, opts){
  opts=opts||{};
  const scale=3;
  const cv=document.createElement('canvas'); cv.width=w*scale; cv.height=h*scale;
  const c=cv.getContext('2d');
  c.fillStyle=opts.bg||'rgba(8,12,30,0.92)'; c.fillRect(0,0,cv.width,cv.height);
  c.strokeStyle=opts.border||'#40e8ff'; c.lineWidth=8*scale/3;
  c.strokeRect(4*scale/3*2,4*scale/3*2,cv.width-4*scale/3*4,cv.height-4*scale/3*4);
  c.fillStyle=opts.fg||'#40e8ff';
  c.font='900 '+((opts.size||0.42)*cv.height)+'px "Segoe UI",Sans-serif';
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(text, cv.width/2, cv.height/2+(opts.size||0.42)*cv.height*0.05);
  const t=new THREE.CanvasTexture(cv);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide}));
  return m;
}

function Course(){
  this.group = new THREE.Group();
  this.colliders = [];   // {min,max,type:'solid'|'hazard',bounce,delta,ref,name}
  this.movers = [];      // {col, base, amp, axis, omega, phase, prev}
  this.rotors = [];      // {hub:[x,y,z], segs:[{mesh,col,r}], angle, omega}
  this.sweepers = [];    // {mesh,col,z,y0,x0,amp,omega,phase}
  this.gates = [];       // {p,n,r,mesh,cd, hitFlash}
  this.checkpoints = []; // {p, spawn, ring, disc, active, index, matRing}
  this.boosts = [];      // {min,max}
  this.finishTrigger = null; this.finishFx = null;
  this.bobbers = [];     // decor islands bobbing
  this.killY = -22;
  this.spawnPoint = V3(0,1.5,-6);
  this.time = 0;
}

Course.prototype._solid = function(mesh, name){
  mesh.geometry.computeBoundingBox();
  mesh.updateMatrixWorld();
  const bb = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  const col = {min:bb.min, max:bb.max, type:'solid', bounce:false, delta:null, ref:null, name:name||'solid'};
  this.colliders.push(col);
  return col;
};
Course.prototype.plat = function(topY, cx, cz, w, d, o){
  o=o||{};
  const th = o.thick!==undefined?o.thick:(topY>20?1.6:1.2);
  const geo = new THREE.BoxGeometry(w,th,d);
  const m = new THREE.Mesh(geo, lamb(o.color||0x39466e));
  m.position.set(cx, topY-th/2, cz);
  m.castShadow=true; m.receiveShadow=true;
  this.group.add(m);
  const col=this._solid(m,'plat');
  /* lighter top slab */
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w-0.25,0.14,d-0.25), lamb(o.top||0x5a6ea6));
  slab.position.set(cx, topY+0.001, cz);
  slab.receiveShadow=true;
  this.group.add(slab);
  /* neon trim strips on long edges */
  if (o.trim!==false && Math.min(w,d)>=4){
    const tm = basic(o.trimColor||0x40e8ff);
    const mk=(x,z,sx,sz)=>{ const s=new THREE.Mesh(new THREE.BoxGeometry(sx,0.07,sz),tm); s.position.set(x,topY+0.06,z); this.group.add(s); };
    if (w>=d){ mk(cx-w/2+0.12,cz,0.24,d-0.5); mk(cx+w/2-0.12,cz,0.24,d-0.5); }
    else { mk(cx,cz-d/2+0.12,w-0.5,0.24); mk(cx,cz+d/2-0.12,w-0.5,0.24); }
  }
  return col;
};
Course.prototype.box = function(cx,cy,cz,w,h,d,color,o){
  o=o||{};
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), color===null?null:lamb(color));
  if(o.stripe){ m.material=new THREE.MeshLambertMaterial({map:getStripeTex()}); }
  m.position.set(cx,cy,cz);
  m.castShadow=!o.noShadow; m.receiveShadow=!o.noShadow;
  this.group.add(m);
  let col=null;
  if(!o.deco){ col=this._solid(m,o.name); if(o.hazard){ col.type='hazard'; } if(o.bounce){ col.bounce=true; } }
  return {mesh:m, col};
};

/* ---------- movers ---------- */
Course.prototype.mover = function(topY,cx,cz,w,d, axis, amp, omega, phase){
  const th=0.9;
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,th,d), lamb(0x7a4fa0));
  const slab=new THREE.Mesh(new THREE.BoxGeometry(w-0.3,0.12,d-0.3), basic(0xffb347));
  slab.position.y=th/2+0.06; m.add(slab);
  m.castShadow=true;m.receiveShadow=true;
  const cy=axis==='y' ? (topY+amp-th/2) : (topY-th/2); // y-axis: topY is the LOW point
  m.position.set(cx,cy,cz);
  this.group.add(m);
  const bb={min:V3(cx-w/2,cy-th/2,cz-d/2), max:V3(cx+w/2,cy+th/2,cz+d/2)};
  const col={min:bb.min,max:bb.max,type:'solid',bounce:false,delta:V3(0,0,0),ref:null,name:'mover'};
  this.colliders.push(col);
  const mv={mesh:m,col,base:V3(cx,cy,cz),axis,amp,omega,phase,prev:V3(cx,cy,cz),topOffset:th/2,topY:topY,
            pos:V3(cx,cy,cz)};
  col.ref=mv;
  this.movers.push(mv);
  return mv;
};
Course.prototype._updateMover = function(mv,t){
  const off=Math.sin(t*mv.omega+mv.phase)*mv.amp;
  mv.prev.copy(mv.pos);
  mv.pos.copy(mv.base);
  if(mv.axis==='x') mv.pos.x+=off; else mv.pos.y+=off;
  mv.col.delta.subVectors(mv.pos,mv.prev);
  mv.mesh.position.copy(mv.pos);
  mv.col.min.set(mv.pos.x-mv.mesh.geometry.parameters.width/2, mv.pos.y-mv.mesh.geometry.parameters.height/2, mv.pos.z-mv.mesh.geometry.parameters.depth/2);
  mv.col.max.set(mv.pos.x+mv.mesh.geometry.parameters.width/2, mv.pos.y+mv.mesh.geometry.parameters.height/2, mv.pos.z+mv.mesh.geometry.parameters.depth/2);
};

/* ---------- rotor ---------- */
Course.prototype.rotor = function(cx, floorY, cz, segs, radiusStep, omega){
  this.box(cx, floorY+1.5, cz, 1.5, 3, 1.5, 0x2a3152, {name:'hub'}); // solid hub pillar
  const cap=new THREE.Mesh(new THREE.SphereGeometry(0.95,10,8), basic(0xff2f7d));
  cap.position.set(cx,floorY+3.15,cz); this.group.add(cap);
  const r={hub:[cx,floorY,cz], angle:Math.random()*6, omega, segs:[], y:floorY+0.85};
  for(let i=0;i<segs;i++){
    const rr=(i+1)*radiusStep;
    const m=new THREE.Mesh(new THREE.BoxGeometry(radiusStep*0.94,0.85,radiusStep*0.94),
      new THREE.MeshLambertMaterial({map:getStripeTex()}));
    m.castShadow=true; this.group.add(m);
    const half=radiusStep*0.47;
    const col={min:V3(0,0,0),max:V3(0,0,0),type:'hazard',bounce:false,delta:null,ref:r,name:'rotorseg'};
    this.colliders.push(col);
    r.segs.push({mesh:m,col,rr,half});
  }
  this.rotors.push(r);
  return r;
};
Course.prototype._updateRotor = function(r,dt){
  r.angle+=r.omega*dt;
  const [cx,,cz]=r.hub, y=r.y;
  for(const s of r.segs){
    const x=cx+Math.cos(r.angle)*s.rr, z=cz+Math.sin(r.angle)*s.rr;
    s.mesh.position.set(x,y,z);
    s.mesh.rotation.y=-r.angle;
    s.col.min.set(x-s.half,y-0.42,z-s.half);
    s.col.max.set(x+s.half,y+0.42,z+s.half);
  }
};

/* ---------- sweeper (deadly sliding wall) ---------- */
Course.prototype.sweeper = function(z, floorTop, w, h, amp, omega, phase){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.7), new THREE.MeshLambertMaterial({
    map:getStripeTex(), emissive:0xff2f7d, emissiveIntensity:0.35}));
  m.position.set(0,floorTop+h/2+0.05,z);
  m.castShadow=true; this.group.add(m);
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(w-0.4,h-0.4),
    new THREE.MeshBasicMaterial({color:0xff5ea8,transparent:true,opacity:0.35,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  m.add(glow);
  const col={min:V3(-w/2,m.position.y-h/2,z-0.35),max:V3(w/2,m.position.y+h/2,z+0.35),type:'hazard',bounce:false,delta:null,ref:null,name:'sweeper'};
  this.colliders.push(col);
  const sw={mesh:m,col,z,amp,omega,phase,x0:0,w,h,yC:m.position.y};
  col.ref=sw;
  this.sweepers.push(sw);
  return sw;
};
Course.prototype._updateSweeper=function(sw,t){
  const x=Math.sin(t*sw.omega+sw.phase)*sw.amp;
  sw.mesh.position.x=x;
  sw.col.min.x=x-sw.w/2; sw.col.max.x=x+sw.w/2;
};

/* ---------- checkpoint ---------- */
Course.prototype.checkpoint = function(x,topY,z,label){
  const g=new THREE.Group();
  const ringMat=new THREE.MeshBasicMaterial({color:0x40e8ff});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.17,10,36),ringMat);
  ring.position.y=2.2; ring.rotation.y=Math.PI/2; // facing along X? face travel dir (+Z): rotate
  ring.rotation.set(0,0,0); ring.rotation.x=0; ring.rotation.y=0; ring.rotation.z=0;
  ring.position.y=2.3;
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,0.18,28), lamb(0x274062));
  disc.position.y=0.1; disc.receiveShadow=true;
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,26,8,1,true),
    new THREE.MeshBasicMaterial({color:0x40e8ff,transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,
      depthWrite:false,side:THREE.DoubleSide}));
  beam.position.y=13;
  const lbl=textPlane(label||'CHECKPOINT',3.4,1.0,{fg:'#40e8ff',size:0.5,border:'#40e8ff'});
  lbl.position.set(0,4.4,-2.4); lbl.rotation.y=Math.PI;
  g.add(ring,disc,beam,lbl);
  g.position.set(x,topY,z);
  this.group.add(g);
  const cp={p:V3(x,topY,z), spawn:V3(x,topY+1.1,z), ring, disc, beamMat:beam.material, active:false,
            index:this.checkpoints.length, ringMat, label, _discMat:disc.material};
  this.checkpoints.push(cp);
  return cp;
};

/* ---------- dash gate ring ---------- */
Course.prototype.gate = function(x,y,z,r){
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(r,0.28,10,40), basic(0xff5ea8));
  const inner=new THREE.Mesh(new THREE.TorusGeometry(r*0.82,0.08,8,40), basic(0xffc94d));
  g.add(ring,inner);
  g.position.set(x,y,z);
  this.group.add(g);
  this.gates.push({p:V3(x,y,z), n:V3(0,0,1), r:r*0.92, mesh:g, cd:0});
};

/* ---------- boost strip (floor arrow that speeds you up) ---------- */
Course.prototype.boostStrip = function(x,topY,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w-1,d),
    new THREE.MeshBasicMaterial({color:0xa8ff5e,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.position.set(x,topY+0.03,z);
  this.group.add(m);
  for(let i=0;i<3;i++){
    const ar=textPlane('»',0.8,0.8,{bg:'rgba(0,0,0,0)',border:'rgba(0,0,0,0)',fg:'#a8ff5e',size:0.8});
    ar.rotation.x=-Math.PI/2; ar.position.set(x-w/4+i*(w/3), topY+0.04, z);
    this.group.add(ar);
  }
  this.boosts.push({min:V3(x-w/2,topY,z-d/2),max:V3(x+w/2,topY+1.6,z+d/2)});
};

/* ---------- bounce pad ---------- */
Course.prototype.pad = function(x,topY,z){
  const base=this.box(x,topY+0.15,z,2.6,0.3,2.6,0x1c2a52,{name:'padbase'});
  const pil=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.25,0.55,18), lamb(0x86e82e));
  pil.position.set(x,topY+0.55,z); pil.castShadow=true;
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.5,0.6,4), basic(0xd6ff9e));
  arrow.position.set(x,topY+1.05,z);
  this.group.add(pil,arrow);
  const col={min:V3(x-1.05,topY+0.18,z-1.05),max:V3(x+1.05,topY+0.6,z+1.05),type:'solid',bounce:true,delta:null,ref:null,name:'bounce'};
  this.colliders.push(col);
  return {pil,arrow};
};

/* ================================================================ BUILD */
Course.prototype.build = function(scene){
  const G=this.group;

  /* ===== S0 · START DOCKS ===== */
  this.plat(0, 0, -2, 30, 30, {});
  // start arch
  const archMat=lamb(0x223058);
  [[-11,-14],[11,-14]].forEach(p=>{ const pl=new THREE.Mesh(new THREE.BoxGeometry(0.9,9,0.9),archMat); pl.position.set(p[0],4.5,p[1]); pl.castShadow=true; G.add(pl); });
  const banner=textPlane('ZENITH RUN',16,3.2,{fg:'#ffffff',size:0.62});
  banner.position.set(0,8.6,-13.6); G.add(banner);
  const sub=textPlane('reach the summit gate',10,1.1,{fg:'#8fb0ff',size:0.4});
  sub.position.set(0,6.4,-13.6); G.add(sub);

  /* ===== S1 · HOP GAPS ===== */
  this.plat(0.5, 0, 20, 6, 6);
  this.plat(1.0, 3, 29.5, 6, 6);
  this.plat(1.5, -3, 39, 6, 6);
  this.plat(2.1, 2, 48.5, 6, 6);
  this.plat(2.7, -1, 58, 7, 7);
  this.checkpoint(-1, 2.7, 58, 'CP 1');

  /* ===== S2 · DASH RUNWAY ===== */
  this.plat(2.7, 0, 89, 12, 56);           // z 61..117
  const dashSign=textPlane('DASH!  [SHIFT]',7,1.6,{fg:'#ff5ea8',size:0.5});
  dashSign.position.set(0,6.4,63); G.add(dashSign);
  this.gate(-1.5, 2.7+3.1, 76, 3);
  this.gate( 1.5, 2.7+3.1, 92, 3);
  this.gate(-1.5, 2.7+3.1,108, 3);
  // barriers to hop
  this.box(0, 2.7+0.75, 84, 12, 1.5, 0.7, null,{stripe:true});
  this.box(0, 2.7+0.75,100, 12, 1.5, 0.7, null,{stripe:true});
  // high route: pad + floating pads
  this.pad(4.8, 2.7, 66);
  this.plat(9.5, -4.5, 78, 4, 4,{trimColor:0xffc94d});
  this.plat(11.5, 3.5, 92, 4, 4,{trimColor:0xffc94d});
  this.plat(13.5, -3.5,106, 4, 4,{trimColor:0xffc94d});

  /* ===== CP2 platform ===== */
  this.plat(2.7, 0, 124, 16, 14);          // z 117..131
  this.checkpoint(0, 2.7, 124, 'CP 2');

  /* ===== S3 · WALL CANYON ===== */
  this.box(-2.7, 2.7+7.5, 143, 1.4, 15, 26, 0x33406b);  // left wall z130..156
  this.box( 2.7, 2.7+7.5, 143, 1.4, 15, 26, 0x33406b);  // right wall
  const wallSign=textPlane('WALL-JUMP!  [SPACE on walls]',9,1.4,{fg:'#ffc94d',size:0.42});
  wallSign.position.set(0,9.5,131.8); G.add(wallSign);
  // easy ledges alternating (rises ≤2.5)
  this.plat(5.2, -1.55, 136, 2.4, 3.4,{trim:false,color:0x44548a});
  this.plat(7.4,  1.55, 142, 2.4, 3.4,{trim:false,color:0x44548a});
  this.plat(9.6, -1.55, 148, 2.4, 3.4,{trim:false,color:0x44548a});

  /* ===== CP3 platform ===== */
  this.plat(12, 0, 162, 14, 12);           // z156..168
  this.checkpoint(0, 12, 162, 'CP 3');

  /* ===== S4 · SLIDE TRENCH ===== */
  this.plat(12, 0, 183, 10, 30);           // trench floor z168..198 (flush w CP3)
  this.box(-4.85, 12.65, 183, 0.7, 1.3, 30, 0x33406b); // rails
  this.box( 4.85, 12.65, 183, 0.7, 1.3, 30, 0x33406b);
  const slideSign=textPlane('SLIDE!  [C]',6,1.4,{fg:'#a8ff5e',size:0.55});
  slideSign.position.set(0,16.2,169.5); G.add(slideSign);
  // overhead bars (clearance 1.15)
  [172,182,192].forEach(z=>this.box(0, 12+1.15+0.35, z, 10, 0.7, 0.8, null,{stripe:true}));
  // boost strips
  this.boostStrip(0,12,167.5,8,1.6);
  this.boostStrip(0,12,177,8,1.6);
  this.boostStrip(0,12,187,8,1.6);
  this.boostStrip(0,12,196,8,1.6);
  // shortcut pads over the left side
  this.plat(13.8, -7.6, 170, 3, 3,{trimColor:0xffc94d});
  this.plat(15.4, -8.4, 180, 3, 3,{trimColor:0xffc94d});
  /* landing after gap */
  this.plat(11.6, 0, 216, 14, 12);         // z210..222
  this.checkpoint(0, 11.6, 216, 'CP 4');

  /* ===== S5 · MOVER GAUNTLET ===== */
  const timeSign=textPlane('TIMING!',6,1.3,{fg:'#ffb347',size:0.55});
  timeSign.position.set(0,15.6,214); G.add(timeSign);
  this.mover(11.6, 0, 228, 5, 5, 'x', 5.5, Math.PI*2/4.6, 0);          // m0
  this.mover(12.0, 0, 237, 5, 5, 'x', 5.5, Math.PI*2/4.6, Math.PI);    // m1
  this.plat(12.4, 0, 246, 10, 8);          // mid rest z242..250
  this.plat(12.4, 0, 258, 14, 14);         // rotor arena z251..265
  this.rotor(0, 12.4, 258, 7, 1.05, Math.PI*2/3.8);
  this.mover(12.4, 0, 271, 6, 6, 'y', 5.0, Math.PI*2/6.0, -Math.PI/2); // m2 elevator 12.4..22.4
  /* CP5 arrival */
  this.plat(22.4, 0, 280, 14, 10);         // z275..285
  this.checkpoint(0, 22.4, 280, 'CP 5');

  /* ===== S6 · ZENITH TOWER ===== */
  const climbSign=textPlane('CLIMB!',6,1.3,{fg:'#40e8ff',size:0.55});
  climbSign.position.set(0,25.6,283); G.add(climbSign);
  this.box(0, 29.4, 296, 7, 26, 7, 0x2c3866);   // tower column
  const beacon=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,60,8,1,true),
    new THREE.MeshBasicMaterial({color:0x40e8ff,transparent:true,opacity:0.14,blending:THREE.AdditiveBlending,
      depthWrite:false,side:THREE.DoubleSide}));
  beacon.position.set(0,72,296); G.add(beacon);
  const spiral=[[180,24.6],[120,26.6],[60,28.6],[0,30.6],[300,32.6],[240,34.6],[180,36.6],[120,38.6]];
  spiral.forEach(sa=>{
    const a=sa[0]*Math.PI/180, r=8;
    this.plat(sa[1], Math.sin(a)*r, 296+Math.cos(a)*r, 4, 4,{trimColor:0x40e8ff});
  });
  this.pad(5, 22.4, 282);                  // tower shortcut launch
  this.plat(27.5, 12.5, 296, 3, 3,{trimColor:0xffc94d});  // outer dash route
  this.plat(33.5, -12.5, 296, 3, 3,{trimColor:0xffc94d});
  /* crown */
  this.plat(40.6, 0, 296, 15, 15);         // z288.5..303.5
  this.checkpoint(0, 40.6, 290.2, 'CP 6'); // north of tower column footprint

  /* ===== S7 · SKY BRIDGE + FINISH ===== */
  this.plat(40.6, 0, 309.75, 8, 12.5);     // z303.5..316
  this.plat(40.6, 0, 325.5, 8, 11);        // z320..331
  this.plat(40.6, 0, 340.5, 8, 11);        // z335..346
  this.sweeper(310, 40.6, 8, 3.2, 5.2, Math.PI*2/2.9, 0);
  this.sweeper(326.5, 40.6, 8, 3.2, 5.2, Math.PI*2/3.4, 2.1);
  this.sweeper(341, 40.6, 8, 3.2, 5.2, Math.PI*2/3.1, 4.2);
  const sprintSign=textPlane('FINAL SPRINT!',8,1.4,{fg:'#ff5ea8',size:0.5});
  sprintSign.position.set(0,44.4,304.5); G.add(sprintSign);
  /* summit island */
  this.plat(40.6, 0, 356, 22, 22);         // z345..367
  // finish arch
  [[-4.6],[4.6]].forEach(px=>{ const p=new THREE.Mesh(new THREE.BoxGeometry(0.9,8.5,0.9),lamb(0x223058)); p.position.set(px[0],40.6+4.25,350); p.castShadow=true; G.add(p); });
  const cross=new THREE.Mesh(new THREE.BoxGeometry(10.2,1,0.9),lamb(0x223058)); cross.position.set(0,49,350); G.add(cross);
  const finBanner=textPlane('FINISH',9,2,{fg:'#ffc94d',size:0.62});
  finBanner.position.set(0,47.4,350); finBanner.rotation.y=Math.PI; G.add(finBanner);
  const shimmer=new THREE.Mesh(new THREE.PlaneGeometry(8.4,7.6),
    new THREE.MeshBasicMaterial({color:0x40e8ff,transparent:true,opacity:0.16,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  shimmer.position.set(0,44.4,350); G.add(shimmer);
  this.finishTrigger={z:350, minX:-4.6, maxX:4.6, minY:40.6, maxY:48, crossed:false};
  this.finishShimmer=shimmer;

  /* ================= DECOR ================= */
  const islandSpots=[
    [-70,-14,60,14],[70,-10,110,17],[-90,6,190,21],[95,10,230,15],[-80,16,300,19],
    [85,20,330,23],[-100,26,380,16],[105,30,400,20],[-60,36,420,13],[70,42,430,18],
    [-130,2,150,12],[135,8,260,14]
  ];
  islandSpots.forEach(s=>{
    const g=new THREE.Group();
    const s0=s[3];
    const rock=new THREE.Mesh(new THREE.ConeGeometry(s0,s0*1.5,7), lamb(0x232c50));
    rock.rotation.x=Math.PI; rock.position.y=-s0*0.75;
    const grass=new THREE.Mesh(new THREE.CylinderGeometry(s0,s0*0.92,2.4,8), lamb(0x3f7d4e));
    grass.receiveShadow=false;
    g.add(rock,grass);
    if(Math.random()<0.7){
      const tr=new THREE.Mesh(new THREE.ConeGeometry(s0*0.22,s0*0.7,6), lamb(0x2f6640));
      tr.position.y=s0*0.28; g.add(tr);
    }
    g.position.set(s[0],s[1]-6,s[2]);
    G.add(g);
    this.bobbers.push({g,y0:s[1]-6,ph:Math.random()*6,sp:0.3+Math.random()*0.4});
  });
  const cloudMat=new THREE.MeshLambertMaterial({color:0xf4f7ff,transparent:true,opacity:0.82});
  for(let i=0;i<16;i++){
    const cl=new THREE.Mesh(new THREE.SphereGeometry(6+Math.random()*9,7,5), cloudMat);
    cl.scale.y=0.32;
    cl.position.set(-160+Math.random()*320, 8+Math.random()*70, -60+Math.random()*480);
    G.add(cl);
  }

  scene.add(G);

  /* ================= BOT PATH (used by E2E autopilot & demo) ================= */
  this.botPath=[
    {p:[0,-2]},{p:[0,20],act:'jump'},{p:[3,29.5],act:'jump'},{p:[-3,39],act:'jump'},
    {p:[2,48.5],act:'jump'},{p:[-1,58]},
    {p:[0,64]},{p:[0,76],act:'dash'},{p:[0,84],act:'jump'},{p:[0,92],act:'dash'},
    {p:[0,100],act:'jump'},{p:[0,108],act:'dash'},{p:[0,122]},
    {p:[0,133]},                       // canyon entry
    {p:[-1.4,136],act:'jump'},         // ledge hops (easy route)
    {p:[1.5,142],act:'jump'},
    {p:[-1.4,148],act:'jump'},
    {p:[0,160]},
    {p:[0,166],act:'slideOn'},
    {p:[0,196],act:'slideOff'},        // through bars riding boosts
    {p:[0,205],act:'slideJump'},       // big gap
    {p:[0,216]},
    {p:[0,220],act:'moverBoard',mi:0,boardWhenX:0,exitWhenX:4.6,jumpTo:[3.5,237]},
    {p:[3.5,237],act:'moverBoard',mi:1,boardWhenX:0,exitWhenX:4.6,jumpTo:[0,245]},
    {p:[0,248]},
    {p:[0,255],act:'hopCenter'},       // jump across rotor hub area
    {p:[0,264]},
    {p:[0,267.5],act:'elevatorRide',mi:2,jumpTo:[0,280]},
    {p:[0,281]},
    {p:[0,288],act:'jump'},            // spiral up
    {p:[6.9,292.2],act:'jump'},
    {p:[6.9,299.8],act:'jump'},
    {p:[0,304],act:'jump'},
    {p:[-6.9,299.8],act:'jump'},
    {p:[-6.9,292.2],act:'jump'},
    {p:[0,288.6],act:'jump'},
    {p:[6.9,292.2],act:'jump'},
    {p:[0,291]},                       // crown (clear of column)
    {p:[0,306],act:'jump'},            // bridge gaps
    {p:[0,312]},
    {p:[0,318.5],act:'jump'},
    {p:[0,328.5],act:'jump'},
    {p:[0,333.5],act:'jump'},
    {p:[0,343],act:'jump'},
    {p:[0,352],act:'finish'}
  ];
  this.botMovers={m0:this.movers[0],m1:this.movers[1],elev:this.movers[2]};
};

Course.prototype.update = function(dt){
  this.time += dt;
  const t=this.time;
  for(let i=0;i<this.movers.length;i++) this._updateMover(this.movers[i],t);
  for(let i=0;i<this.rotors.length;i++) this._updateRotor(this.rotors[i],dt);
  for(let i=0;i<this.sweepers.length;i++) this._updateSweeper(this.sweepers[i],t);
  for(let i=0;i<this.gates.length;i++){ const g=this.gates[i]; if(g.cd>0)g.cd-=dt;
    g.mesh.rotation.z += dt*0.8; g.mesh.children[1].rotation.z -= dt*1.7; }
  for(let i=0;i<this.checkpoints.length;i++){ const cp=this.checkpoints[i];
    const pulse=1+Math.sin(t*3+i)*0.05;
    cp.ring.scale.setScalar(cp.active?pulse*1.06:pulse); }
  for(let i=0;i<this.bobbers.length;i++){ const b=this.bobbers[i];
    b.g.position.y=b.y0+Math.sin(t*b.sp+b.ph)*1.4; b.g.rotation.y+=dt*0.02; }
  if(this.finishShimmer) this.finishShimmer.material.opacity=0.1+Math.abs(Math.sin(t*2))*0.12;
};

/* activate a checkpoint; returns true if newly activated */
Course.prototype.activateCheckpoint = function(cp){
  if (cp.active) return false;
  cp.active=true;
  cp.ringMat.color.setHex(0xa8ff5e);
  cp.beamMat.color.setHex(0xa8ff5e); cp.beamMat.opacity=0.3;
  cp.disc.material=lamb(0x2f5e46);
  return true;
};

ZR.Course = Course;
})();
