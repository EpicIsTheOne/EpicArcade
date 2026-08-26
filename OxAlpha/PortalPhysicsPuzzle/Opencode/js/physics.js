import * as THREE from 'three';

let _nextId = 1;

export class Collider {
  constructor(min,max,tag='world'){
    this.id=_nextId++;
    this.min=min.clone(); this.max=max.clone();
    this.tag=tag;              // 'world' | 'door' | 'platform' | 'panel'
    this.enabled=true;
    this.mesh=null;
  }
  overlaps(min,max){
    return this.enabled &&
      min.x<=this.max.x && max.x>=this.min.x &&
      min.y<=this.max.y && max.y>=this.min.y &&
      min.z<=this.max.z && max.z>=this.min.z;
  }
}

// Dynamic AABB body (player uses one; cubes use one + orientation mesh).
export class Body {
  constructor(half){
    this.half=half.clone();
    this.pos=new THREE.Vector3();
    this.vel=new THREE.Vector3();
    this.onGround=false;
    this.groundCol=null;
    this.suppress=new Set();   // collider ids to ignore (portal walls)
    this.isPlayer=false;
    this.lastImpact=0;
    this.teleported=false;
  }
  aabbMin(out=new THREE.Vector3()){ return out.copy(this.pos).sub(this.half); }
  aabbMax(out=new THREE.Vector3()){ return out.copy(this.pos).add(this.half); }
}

const _min=new THREE.Vector3(), _max=new THREE.Vector3();
const STEP_H=0.34;

function overlap1D(a0,a1,b0,b1){ return a0<=b1 && a1>=b0; }

// Move body along one axis with collision clamping.
function sweepAxis(world,body,axis,delta){
  if(delta===0) return false;
  const p=body.pos;
  p[axis]+=delta;
  _min.copy(p).sub(body.half); _max.copy(p).add(body.half);
  let hit=false;
  for(const c of world.colliders){
    if(!c.enabled) continue;
    if(body.suppress.has(c.id)) continue;
    if(!overlap1D(_min.x,_max.x,c.min.x,c.max.x)) continue;
    if(!overlap1D(_min.y,_max.y,c.min.y,c.max.y)) continue;
    if(!overlap1D(_min.z,_max.z,c.min.z,c.max.z)) continue;
    if(delta>0) p[axis]=c.min[axis]-body.half[axis]-1e-4;
    else        p[axis]=c.max[axis]+body.half[axis]+1e-4;
    if(axis==='y'){
      if(delta<0){ body.onGround=true; body.groundCol=c; }
      body.vel.y=0;
    }else{
      body.lastImpact=Math.abs(body.vel[axis]);
      body.vel[axis]=0;
    }
    _min.copy(p).sub(body.half); _max.copy(p).add(body.half);
    hit=true;
  }
  return hit;
}

// Player-only: climb small ledges instead of stopping dead.
function tryStepUp(world,body,axis,delta){
  const savedPos=body.pos.clone(), savedVel=body.vel.clone();
  const startY=savedPos.y;

  body.pos.y+=STEP_H+0.01;                       // raise clear of ledge
  if(sweepAxis(world,body,'y',-0.001)){ /* ceiling above */ }
  const blockedHoriz=sweepAxis(world,body,axis,delta);
  if(blockedHoriz && body.vel[axis]===0){
    body.pos.copy(savedPos); body.vel.copy(savedVel);
    return false;
  }
  const grounded=sweepAxis(world,body,'y',-(STEP_H+0.06)); // settle down
  const landedAtReasonableHeight = body.pos.y>=startY-0.02 && body.pos.y<=startY+STEP_H+0.03;
  if(grounded && landedAtReasonableHeight){
    body.onGround=true;
    return true;
  }
  body.pos.copy(savedPos); body.vel.copy(savedVel);
  return false;
}

export function moveAndCollide(world,body,dt,isPlayer=false){
  body.onGround=false; body.groundCol=null;
  const steps=Math.max(1,Math.ceil(dt/0.008));
  const sdt=dt/steps;
  for(let i=0;i<steps;i++){
    for(const axis of ['x','z']){
      let d=body.vel[axis]*sdt;
      if(d===0) continue;
      const start=body.pos[axis];
      const vBefore=body.vel[axis];
      sweepAxis(world,body,axis,d);
      const blocked=vBefore!==0&&body.vel[axis]===0&&Math.abs(body.pos[axis]-start)<Math.abs(d)*0.999;
      if(blocked&&isPlayer){
        const sx=body.pos.x,sz=body.pos.z,svx=body.vel.x,svz=body.vel.z,sy=body.pos.y;
        body.pos[axis]=start;
        body.vel[axis]=vBefore;
        const ok=tryStepUp(world,body,axis,d);
        if(!ok){
          body.pos.set(sx,sy,sz);
          body.vel.x=svx;body.vel.z=svz;
          sweepAxis(world,body,axis,d);
        }
      }
    }
    sweepAxis(world,body,'y',body.vel.y*sdt);
  }
}

export function pointInCollider(p,c){
  return p.x>=c.min.x&&p.x<=c.max.x&&p.y>=c.min.y&&p.y<=c.max.y&&p.z>=c.min.z&&p.z<=c.max.z;
}
export function standingOn(body,col){ return body.onGround&&body.groundCol===col; }
