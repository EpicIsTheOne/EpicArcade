/* ZENITH RUN · PB ghost recording/playback · ox-alpha piagent run-01 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};
const KEY='zr1_best_v1';
const DT=0.05, MAXS=7000;

function Recorder(){ this.samples=[]; this.lastT=-1; this.on=false; }
Recorder.prototype.start=function(){ this.samples=[]; this.lastT=-1; this.on=true; };
Recorder.prototype.stop=function(){ this.on=false; return this.samples; };
Recorder.prototype.tick=function(t,p,yaw){
  if(!this.on) return;
  if(this.samples.length>=MAXS) return;
  if(t-this.lastT>=DT){ this.lastT=t; this.samples.push([+t.toFixed(3),+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2),+yaw.toFixed(2)]); }
};

function GhostRig(scene){
  const mat=new THREE.MeshBasicMaterial({color:0x40e8ff,transparent:true,opacity:0.28,depthWrite:false});
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.82,0.6),mat); body.position.y=0.41;
  const visor=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.22,0.1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.5}));
  visor.position.set(0,0.56,0.31);
  const legs=[-0.18,0.18].map(x=>{const l=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.34,0.24),mat);l.position.set(x,0.17,0);return l;});
  g.add(body,visor,legs[0],legs[1]);
  g.visible=false;
  scene.add(g);
  this.g=g; this.data=null; this.enabled=true;
}
GhostRig.prototype.load=function(samples){ this.data=samples&&samples.length>2?samples:null; };
GhostRig.prototype.has=function(){ return !!this.data; };
GhostRig.prototype.seek=function(t){
  const d=this.data;
  if(!d||!this.enabled){ this.g.visible=false; return; }
  if(t<=d[0][0]||t>=d[d.length-1][0]+0.4){ this.g.visible = t<d[0][0]; return; }
  // binary search
  let lo=0,hi=d.length-1;
  while(lo<hi-1){ const mid=(lo+hi)>>1; if(d[mid][0]<=t)lo=mid; else hi=mid; }
  const a=d[lo],b=d[hi];
  const f=Math.min(1,Math.max(0,(t-a[0])/Math.max(0.0001,b[0]-a[0])));
  this.g.visible=true;
  this.g.position.set(a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f, a[3]+(b[3]-a[3])*f);
  let dyaw=b[4]-a[4];
  while(dyaw>Math.PI)dyaw-=Math.PI*2; while(dyaw<-Math.PI)dyaw+=Math.PI*2;
  this.g.rotation.y=a[4]+dyaw*f;
};

function loadBest(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw) return null;
    const o=JSON.parse(raw);
    if(!o||typeof o.time!=='number'||!o.samples) return null;
    return o;
  }catch(e){ return null; }
}
function saveBest(time,splits,samples){
  try{
    // cap storage: decimate samples if huge
    let s=samples;
    while(s.length>1 && JSON.stringify(s).length>2200000){
      s=s.filter((_,i)=>i%2===0);
    }
    localStorage.setItem(KEY, JSON.stringify({time,splits,samples:s,v:1}));
    return true;
  }catch(e){ return false; }
}
function clearBest(){ try{localStorage.removeItem(KEY);}catch(e){} }

ZR.ghost={
  Recorder, GhostRig, loadBest, saveBest, clearBest
};
})();
