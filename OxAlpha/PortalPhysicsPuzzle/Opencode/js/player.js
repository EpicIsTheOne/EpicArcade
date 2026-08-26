import * as THREE from 'three';
import { CFG } from './config.js';
import { Body, moveAndCollide } from './physics.js';
import { clamp, DEG } from './utils.js';
import { audio } from './audio.js';

const _eul=new THREE.Euler(0,0,0,'YXZ');
const _fwd=new THREE.Vector3(), _right=new THREE.Vector3(), _wish=new THREE.Vector3();

export class Player {
  constructor(world,camera){
    this.world=world;
    this.camera=camera;
    this.body=new Body(new THREE.Vector3(CFG.PLAYER_HALF.x,CFG.PLAYER_HALF.y,CFG.PLAYER_HALF.z));
    this.body.isPlayer=true;
    this.yaw=0; this.pitch=0;
    this.held=null;          // carried cube entity
    this.stepDist=0;
    this.wasGrounded=true;
    this.landVel=0;
    this.frozen=false;
    this.dead=false;
    this.spawnPos=new THREE.Vector3();
    this.spawnYaw=0;
  }
  get pos(){ return this.body.pos; }
  eyePos(out=new THREE.Vector3()){
    return out.copy(this.body.pos).setY(this.body.pos.y+CFG.EYE_HEIGHT-CFG.PLAYER_HALF.y);
  }
  // body.pos is the CENTER of the capsule; spawn helpers set feet position.
  setFeet(x,y,z){ this.body.pos.set(x,y+CFG.PLAYER_HALF.y,z); }
  feetY(){ return this.body.pos.y-CFG.PLAYER_HALF.y; }
  forward(out=new THREE.Vector3()){
    const cp=Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw)*cp,Math.sin(this.pitch),-Math.cos(this.yaw)*cp);
  }

  respawn(){
    this.setFeet(this.spawnPos.x,this.spawnPos.y,this.spawnPos.z);
    this.body.vel.set(0,0,0);
    this.yaw=this.spawnYaw; this.pitch=0;
    this.dropHeld(true);
    this.dead=false;
  }

  dropHeld(silent=false){
    if(!this.held)return;
    const c=this.held;
    c.carried=false;
    c.body.vel.copy(this.forward()).multiplyScalar(2.2).add(_wish.set(0,1.4,0));
    this.held=null;
    if(!silent) audio.blip(300,.07,.14,'triangle');
  }

  tryGrab(cubes,useTargets){
    // pedestal buttons take priority over cubes
    if(useTargets&&useTargets.length){
      const eye=this.eyePos(), dir=this.forward();
      for(const t of useTargets){
        if(!t.available||t.cooldown>0)continue;
        _wish.copy(t.pos).setY(t.pos.y+1.12).sub(eye);
        const d=_wish.length();
        if(d<t.range){
          _wish.normalize();
          if(_wish.dot(dir)>0.82){ t.press(); return true; }
        }
      }
    }
    if(this.held){ this.dropHeld(); return true; }
    const eye=this.eyePos(),dir=this.forward();
    let best=null,bd=CFG.GRAB_DIST;
    for(const c of cubes){
      if(c.carried||c.dead)continue;
      _wish.copy(c.body.pos).sub(eye);
      const d=_wish.length();
      if(d<bd){
        _wish.normalize();
        const aim=_wish.dot(dir);
        if(aim>0.55&&(!this.losCheck||this.losCheck(eye,_wish,d))){ best=c; bd=d; }
      }
    }
    if(best){
      best.carried=true;
      best.spin.multiplyScalar(0.2);
      this.held=best;
      audio.blip(760,.06,.18,'triangle');
      return true;
    }
    return false;
  }

  update(dt,input,portals){
    if(this.dead)return;
    const b=this.body;
    b.prevPos=b.prevPos||new THREE.Vector3();
    b.prevPos.copy(b.pos);

    // ---- look ----
    this.yaw  -= input.lookDX;
    this.pitch+= input.lookDY;
    input.lookDX=0;input.lookDY=0;
    this.pitch=clamp(this.pitch,-89*DEG,89*DEG);

    // ---- movement ----
    const K=input.keys;
    const f=this.forward(_fwd); f.y=0;
    if(f.lengthSq()<1e-6)f.set(0,0,-1);
    f.normalize();
    // right = fwd rotated -90° about Y: yaw=0 -> fwd(0,0,-1) -> right(1,0,0)
    _right.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));

    let ix=(K['KeyD']?1:0)-(K['KeyA']?1:0);
    let iz=(K['KeyW']?1:0)-(K['KeyS']?1:0);
    if(this.frozen){ix=0;iz=0;}
    _wish.set(0,0,0).addScaledVector(f,iz).addScaledVector(_right,ix);
    const hasInput=_wish.lengthSq()>1e-6;
    if(hasInput)_wish.normalize();

    if(b.onGround){
      const target=_wish.clone().multiplyScalar(CFG.WALK_SPEED);
      const k=Math.min(1,CFG.GROUND_ACCEL*dt);
      b.vel.x+=(target.x-b.vel.x)*k;
      b.vel.z+=(target.z-b.vel.z)*k;
      if(!hasInput){
        const fr=Math.exp(-CFG.GROUND_FRICTION*dt);
        b.vel.x*=fr;b.vel.z*=fr;
      }
      if(K['Space']&&!this.frozen){
        b.vel.y=CFG.JUMP_VEL;
        b.onGround=false;
        audio.thud(.08,120);
      }
    }else{
      b.vel.x+=_wish.x*CFG.AIR_ACCEL*dt*CFG.WALK_SPEED;
      b.vel.z+=_wish.z*CFG.AIR_ACCEL*dt*CFG.WALK_SPEED;
    }
    b.vel.y-=CFG.GRAVITY*dt;
    if(b.vel.y<CFG.MAX_FALL)b.vel.y=CFG.MAX_FALL;

    const fallSpeed=b.vel.y;
    moveAndCollide(this.world,b,dt,true);

    // landing feedback
    if(b.onGround&&!this.wasGrounded&&fallSpeed<-7){
      audio.thud(clamp(-fallSpeed/34,.1,.4));
      this.landDip=clamp(-fallSpeed/30,0,.22);
    }
    this.wasGrounded=b.onGround;
    if(this.landDip>0)this.landDip=Math.max(0,this.landDip-dt*0.9);

    // footsteps
    if(b.onGround){
      this.stepDist+=Math.hypot(b.vel.x,b.vel.z)*dt;
      if(this.stepDist>2.3){this.stepDist=0;if(hasInput)audio.thud(.05,70);}
    }

    // ---- portals ----
    portals.onBodyMoved(this.body,null,this);

    // ---- camera ----
    const eye=this.eyePos();
    this.camera.position.copy(eye);
    if(this.landDip)this.camera.position.y-=this.landDip*0.35;
    _eul.set(this.pitch,this.yaw,0);
    this.camera.quaternion.setFromEuler(_eul);
  }
}
