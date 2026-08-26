/* ZENITH RUN · particles/trail/speedlines · ox-alpha piagent run-01 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};

/* ---------- pooled GPU particles ---------- */
const MAX = 900;
function ParticleSystem(scene){
  const geo = new THREE.BufferGeometry();
  this.pos  = new Float32Array(MAX*3);
  this.col  = new Float32Array(MAX*3);
  this.attr = new Float32Array(MAX*2); // life01, size
  this.vel  = new Float32Array(MAX*3);
  this.life = new Float32Array(MAX);   // remaining
  this.tlife= new Float32Array(MAX);   // total
  this.grav = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(this.pos,3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(this.col,3));
  geo.setAttribute('aAttr',    new THREE.BufferAttribute(this.attr,2));
  const mat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:[
      'attribute vec3 aColor; attribute vec2 aAttr;',
      'varying vec3 vC; varying float vA;',
      'void main(){ vC=aColor; vA=aAttr.x;',
      ' vec4 mv=modelViewMatrix*vec4(position,1.0);',
      ' gl_PointSize=aAttr.y*(180.0/-mv.z)*(0.35+0.65*vA);',
      ' gl_Position=projectionMatrix*mv; }'
    ].join('\n'),
    fragmentShader:[
      'varying vec3 vC; varying float vA;',
      'void main(){ float d=length(gl_PointCoord-vec2(0.5));',
      ' if(d>0.5) discard;',
      ' gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.12,d)); }'
    ].join('\n')
  });
  this.points = new THREE.Points(geo, mat);
  this.points.frustumCulled = false;
  this.cursor = 0;
  this.alive = 0;
  scene.add(this.points);
}
ParticleSystem.prototype.spawn = function(o){
  // o: {p:[x,y,z], n, spread, vel:[x,y,z], vspread, color(s hex[]), size, life, grav}
  const n = o.n||8;
  const colors = o.color||[0xffffff];
  const tmp = new THREE.Color();
  for (let k=0;k<n;k++){
    const i = this.cursor; this.cursor=(this.cursor+1)%MAX;
    const i3=i*3;
    const sp = o.spread!==undefined?o.spread:0.5;
    this.pos[i3]  = o.p[0]+(Math.random()*2-1)*sp;
    this.pos[i3+1]= o.p[1]+(Math.random()*2-1)*sp;
    this.pos[i3+2]= o.p[2]+(Math.random()*2-1)*sp;
    const vs = o.vspread!==undefined?o.vspread:2;
    this.vel[i3]  =(o.vel?o.vel[0]:0)+(Math.random()*2-1)*vs;
    this.vel[i3+1]=(o.vel?o.vel[1]:0)+(Math.random()*2-1)*vs;
    this.vel[i3+2]=(o.vel?o.vel[2]:0)+(Math.random()*2-1)*vs;
    tmp.set(colors[(Math.random()*colors.length)|0]);
    this.col[i3]=tmp.r; this.col[i3+1]=tmp.g; this.col[i3+2]=tmp.b;
    this.tlife[i]=this.life[i]=(o.life||0.6)*(0.6+Math.random()*0.7);
    this.attr[i*2+1]=(o.size||6)*(0.7+Math.random()*0.6);
    this.grav[i]=(o.grav!==undefined?o.grav:9);
  }
};
ParticleSystem.prototype.update = function(dt){
  let alive=0;
  for (let i=0;i<MAX;i++){
    if (this.life[i]<=0){ this.attr[i*2]=0; continue; }
    alive++;
    this.life[i]-=dt;
    const i3=i*3;
    this.vel[i3+1]-=this.grav[i]*dt;
    this.vel[i3]*=(1-1.6*dt); this.vel[i3+2]*=(1-1.6*dt);
    this.pos[i3]+=this.vel[i3]*dt; this.pos[i3+1]+=this.vel[i3+1]*dt; this.pos[i3+2]+=this.vel[i3+2]*dt;
    this.attr[i*2]=Math.max(0,this.life[i]/this.tlife[i]);
  }
  this.alive=alive;
  const g=this.points.geometry;
  g.attributes.position.needsUpdate=true;
  g.attributes.aColor.needsUpdate=true;
  g.attributes.aAttr.needsUpdate=true;
};

/* ---------- speed trail ribbon ---------- */
const TRAIL_N = 44;
function Trail(scene){
  const geo = new THREE.BufferGeometry();
  this.pts = new Float32Array(TRAIL_N*3);
  this.count = 0;
  geo.setAttribute('position', new THREE.BufferAttribute(this.pts,3));
  this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color:0x40e8ff, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false}));
  this.line.frustumCulled=false;
  this.head = new THREE.Vector3();
  this.active = false;
  scene.add(this.line);
}
Trail.prototype.push = function(p){
  // shift back
  for (let i=TRAIL_N-1;i>0;i--){
    this.pts[i*3]=this.pts[(i-1)*3]; this.pts[i*3+1]=this.pts[(i-1)*3+1]; this.pts[i*3+2]=this.pts[(i-1)*3+2];
  }
  this.pts[0]=p.x; this.pts[1]=p.y; this.pts[2]=p.z;
  if (this.count<TRAIL_N) this.count++;
  const g=this.line.geometry;
  g.setDrawRange(0,this.count);
  g.attributes.position.needsUpdate=true;
};
Trail.prototype.clear = function(){
  this.count=0; this.line.geometry.setDrawRange(0,0);
};
Trail.prototype.show = function(v){
  this.line.visible=v;
  if(!v) this.clear();
};

/* ---------- screen-space speed lines ---------- */
function SpeedLines(){
  this.cv = document.getElementById('speedlines');
  this.ctx = this.cv.getContext('2d');
  this.intensity = 0;
  this.streaks = [];
  for(let i=0;i<26;i++) this.streaks.push({a:Math.random()*Math.PI*2, r0:0.5+Math.random()*0.4, len:0.12+Math.random()*0.22, w:1+Math.random()*2, ph:Math.random()});
}
SpeedLines.prototype.resize = function(){
  this.cv.width = window.innerWidth; this.cv.height = window.innerHeight;
};
SpeedLines.prototype.update = function(dt, intensity, tSec){
  this.intensity = intensity;
  const cv=this.cv, ctx=this.ctx;
  if (intensity<=0.02){ cv.style.opacity=0; return; }
  cv.style.opacity = Math.min(0.85,intensity);
  const W=cv.width,H=cv.height,cx=W/2,cy=H*0.46,R=Math.hypot(W,H)/2;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.75)';
  ctx.lineCap='round';
  for (const s of this.streaks){
    const flow=(tSec*1.6+s.ph)%1;
    const r1=R*(s.r0+flow*0.25), r0=r1-R*s.len*R*0.22;
    ctx.globalAlpha=intensity*0.5*(1-flow*0.5);
    ctx.lineWidth=s.w;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(s.a)*r0, cy+Math.sin(s.a)*r0*0.86);
    ctx.lineTo(cx+Math.cos(s.a)*r1, cy+Math.sin(s.a)*r1*0.86);
    ctx.stroke();
  }
  ctx.globalAlpha=1;
};

ZR.fx = {
  ParticleSystem, Trail, SpeedLines,
  flash(color, alpha, fadeMs){
    const el=document.getElementById('flash');
    el.style.transition='none';
    el.style.opacity=Math.min(1,alpha);
    el.style.background='radial-gradient(ellipse at center,transparent 35%,'+(color||'#ff2450')+' 150%)';
    requestAnimationFrame(()=>{ el.style.transition='opacity '+((fadeMs||450)/1000)+'s ease'; el.style.opacity=0; });
  }
};
})();
