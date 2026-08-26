// Momentum character controller. Fixed 240 Hz substeps, swept raycast collision,
// slope physics, loop sticking, rails, wallrun, homing/stomp attacks, boost, quick-step.
import * as THREE from 'three';

const V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const UP = V(0,1,0);
const FIXED = 1/240;
const GRAV = 32;
const RADIUS = 0.55;

const TUNE = {
  runTop: 23, runAccel: 46, brakeDecel: 68,
  boostTop: 41, boostAccel: 95,
  airAccel: 30, airTopGain: 26,
  jumpVel: 13.2, jumpHoldG: 0.52, coyote: 0.1, jumpBuffer: 0.14,
  friction: 1.6, downhillFriction: 0.25,
  turnAssist: 3.4,
  stickDist: 0.62, minLoopSpeed: 12.5,  hardMax: 66,
  quickStepV: 13, qsCooldown: 0.38,
  homingRange: 30, homingSpeed: 36,
  stompV: -44,
};

export class Player {
  constructor(world, audio) {
    this.world = world;
    this.audio = audio;
    this.pos = V(0,5,0);
    this.vel = V();
    this.up = V(0,1,0);
    this.state = 'air';
    this.grounded = false;
    this.groundNormal = V(0,1,0);
    this.grind = null;
    this.wall = null;
    this.hp = 3; this.maxHp = 3;
    this.boost = 100;
    this.invuln = 0;
    this.dead = false;
    this.attacking = false;
    this.attackTimer = 0;
    this.homingTarget = null;
    this.stomping = false;
    this.drifting = false;
    this.turnRate = 0;
    this.moveYaw = 0; this.hasDir = false;
    this.chainCombo = 0; this.comboTimer = 0;
    this._coyote = 0; this._jumpBuf = 0; this._jumpHeld=false; this._jumpTime=99;
    this._qsCdL = 0; this._qsCdR = 0; this._attackCd = 0; this._homingCd = 0;
    this._wallRunT = 0;
    this.justLanded = false;
    this.standingOn = null;
    this.maxSpeedSeen = 0;
    this.onSpringCooldown = 0;
    this.spawnFallback = V(0,5,0);
    this.checkpointPos = null;
    this.frozen = false;
    this.events = { land:[], spring:[], dash:[], enemy:[], hurt:[], gem:[], volt:[], checkpoint:[], goal:[], die:[], boostfx:[] };
    this.ctx = { level: {updrafts:[], movers:[], springs:[], dashPanels:[], checkpoints:[], gems:[], volts:[], killZ:-60}, enemies:{list:[]}, fx:null, director:null };
  }
  emit(name, data){ const arr=this.events[name]; for(const f of arr) f(data); }
  on(name,f){ this.events[name].push(f); }

  respawn(pos){
    this.pos.copy(pos || this.checkpointPos || this.spawnFallback);
    this.pos.y += RADIUS + 0.3;
    this.vel.set(0,0,0);
    this.state='air'; this.grounded=false; this.attacking=false; this.stomping=false;
    this.grind=null; this.wall=null; this.invuln=1.2; this.dead=false; this.hp=this.maxHp;
    this.boost=Math.max(this.boost,50);
    this._goalHit=false;
  }

  hurt(fromPos){
    if (this.invuln>0 || this.dead) return false;
    this.hp--;
    this.invuln = 1.6;
    const away = this.pos.clone().sub(fromPos); away.y=0;
    if (away.lengthSq()<0.01) away.set(0,0,1);
    away.normalize();
    this.vel.copy(away.multiplyScalar(11)); this.vel.y = 8;
    this.state='air'; this.grounded=false; this.grind=null;
    this.chainCombo = 0;
    this.audio?.hit();
    this.emit('hurt',{hp:this.hp});
    if (this.hp<=0) { this.dead=true; this.emit('die',{}); }
    return true;
  }

  addBoost(x){ this.boost = Math.min(100, this.boost+x); }

  // ================= main tick =================
  tick(dt, input, camYaw) {
    if (this.frozen) return;
    let acc = Math.min(dt, 0.06);
    while (acc > 1e-6) {
      const h = Math.min(FIXED, acc);
      this.step(h, input, camYaw);
      acc -= h;
    }
    this.postFrame(input, camYaw);
  }

  step(h, input, camYaw) {
    const lvl = this.ctx.level;
    this.invuln = Math.max(0, this.invuln - h);
    this._attackCd = Math.max(0,this._attackCd-h);
    this._homingCd = Math.max(0,this._homingCd-h);
    this._qsCdL = Math.max(0,this._qsCdL-h); this._qsCdR = Math.max(0,this._qsCdR-h);
    this.comboTimer -= h; if (this.comboTimer<=0 && this.chainCombo>0) this.chainCombo=0;
    if (this.onSpringCooldown>0) this.onSpringCooldown -= h;
    if (input.hit('jump')) this._jumpBuf = TUNE.jumpBuffer;

    if (this.state==='grind') { this.grindStep(h); return; }

    let ix = (input.down('right')?1:0) - (input.down('left')?1:0);
    let iz = (input.down('fwd')?1:0) - (input.down('back')?1:0);
    const inputMag = Math.min(1, Math.hypot(ix,iz));
    let dirWorld = V();
    if (inputMag>0.01) {
      const f = V(-Math.sin(camYaw),0,-Math.cos(camYaw));
      const r = V(-f.z,0,f.x);
      dirWorld.addScaledVector(f, iz).addScaledVector(r, ix);
      if (dirWorld.lengthSq()>0) dirWorld.normalize();
    }
    const hasInput = inputMag>0.01;
    this.hasDir = this.vel.lengthSq()>1;

    const boosting = input.down('boost') && this.boost>0 && !this.dead;
    if (boosting) {
      this.boost = Math.max(0, this.boost - h*26);
      if (!this._wasBoost) { this.audio?.boost(); this._wasBoost=true; this.emit('boostfx',{}); }
    } else { this._wasBoost=false; this.boost = Math.min(100, this.boost + h*6.5); }

    if (this.state==='wallrun') { this.wallStep(h, input); }
    else {
      this.handleJump(h,input);
      if (this.grounded) this.groundMove(h, input, dirWorld, hasInput, boosting);
      else this.airMove(h, dirWorld, hasInput, boosting);
      this.handleAttack(h,input,camYaw);
    }

    this.sweepMove(h);
    if (this.state!=='wallrun') this.groundCheck(h);

    const sp = this.vel.length();
    if (sp>this.maxSpeedSeen) this.maxSpeedSeen=sp;
  }

  handleJump(h,input){
    this._jumpBuf -= h;
    this._coyote = this.grounded ? TUNE.coyote : this._coyote - h;
    if (this._jumpBuf>0 && this._coyote>0 && !this.attacking){
      this.vel.addScaledVector(this.up, TUNE.jumpVel * (this.grounded?1:0.92));
      this.grounded=false; this.state='air';
      this._coyote=0; this._jumpBuf=0; this._jumpTime=0; this.standingOn=null;
      this.audio?.jump();
      this.ctx.fx?.burst(this.pos.clone().addScaledVector(this.up,-RADIUS*.7), 6, 0x9fefff, 3, .25);
    }
    this._jumpTime += h;
    this._jumpHeld = input.down('jump');
  }

  groundMove(h, input, dirWorld, hasInput, boosting){
    const n = this.groundNormal;
    const gProj = V(0,-GRAV,0).addScaledVector(n, GRAV*(n.y));
    this.vel.addScaledVector(gProj, h);

    const top = boosting ? TUNE.boostTop : TUNE.runTop;
    if (hasInput){
      const d = dirWorld.clone().addScaledVector(n, -dirWorld.dot(n)).normalize();
      const vAlong = this.vel.dot(d);
      const acc = (boosting? TUNE.boostAccel : TUNE.runAccel);
      if (vAlong < top) {
        const add = Math.min(acc*h, top - vAlong);
        this.vel.addScaledVector(d, add);
      } else if (vAlong > top*1.02 && !boosting) {
        this.vel.addScaledVector(d, -(vAlong-top) * Math.min(1,h*2.2));
      }
      const sp = this.vel.length();
      if (sp>6){
        const vh = this.vel.clone(); vh.y=0;
        const dh = dirWorld.clone(); dh.y=0; dh.normalize();
        const cur = Math.atan2(vh.x, vh.z);
        const want = Math.atan2(dh.x, dh.z);
        let dd = want-cur; while(dd>Math.PI)dd-=2*Math.PI; while(dd<-Math.PI)dd+=2*Math.PI;
        const maxTurn = TUNE.turnAssist*h*(boosting?0.75:1);
        const t = THREE.MathUtils.clamp(dd, -maxTurn, maxTurn);
        this.drifting = Math.abs(dd)>0.5 && sp>17;
        if (Math.abs(dd)>0.001){
          const rot = new THREE.Quaternion().setFromAxisAngle(UP, t);
          const vh2 = vh.applyQuaternion(rot);
          this.vel.x = vh2.x; this.vel.z = vh2.z;
          this.turnRate = t/Math.max(h,1e-4)/60;
        }
      } else this.drifting=false;
    } else {
      this.drifting=false;
      if (input.down('back')){
        const sp=this.vel.length();
        const dec=Math.min(sp, TUNE.brakeDecel*h);
        if(sp>0) this.vel.addScaledVector(this.vel.clone().normalize(), -dec);
      } else {
        const fric = (n.y<0.98 ? TUNE.downhillFriction : TUNE.friction);
        const sp=this.vel.length();
        if (sp>0.01){
          const dec = Math.min(sp, fric*h*Math.max(4,sp*0.6));
          this.vel.addScaledVector(this.vel.clone().normalize(), -dec);
        } else this.vel.set(0,0,0);
      }
    }
    const vn = this.vel.dot(n);
    if (vn<0) this.vel.addScaledVector(n, -vn);
  }

  airMove(h, dirWorld, hasInput, boosting){
    let g = GRAV;
    if (this.vel.dot(this.up)>0 && this._jumpHeld && this._jumpTime<0.28) g*=TUNE.jumpHoldG;
    for (const u of this.ctx.level.updrafts){
      if (this.pos.x>=u.min.x&&this.pos.x<=u.max.x&&this.pos.y>=u.min.y&&this.pos.y<=u.max.y&&this.pos.z>=u.min.z&&this.pos.z<=u.max.z) g -= u.accel;
    }
    this.vel.y -= g*h;
    if (hasInput){
      const d = dirWorld;
      const vh = V(this.vel.x,0,this.vel.z);
      const vAlong = vh.dot(d);
      if (vAlong < TUNE.airTopGain || boosting) this.vel.addScaledVector(d, TUNE.airAccel*h);
    }
    const sp = this.vel.length();
    if (sp>TUNE.hardMax) this.vel.multiplyScalar(TUNE.hardMax/sp);
  }

  handleAttack(h,input,camYaw){
    if (input.hit('attack')){
      if (this.grounded){
        if (this._attackCd<=0){
          this._attackCd=0.8; this.attacking=true; this.attackTimer=0.5;
          const f = V(-Math.sin(camYaw),0,-Math.cos(camYaw));
          const sp = Math.max(Math.hypot(this.vel.x,this.vel.z)*0.9, 16);
          this.vel.x=f.x*sp; this.vel.z=f.z*sp;
          this.audio?.homing();
        }
      } else if (this._homingCd<=0){
        const tgt = this.findHomingTarget(camYaw);
        if (tgt){
          this.homingTarget=tgt; this.attacking=true; this.attackTimer=1.2; this._homingCd=0.55;
          this.audio?.homing();
        } else if (this._attackCd<=0){
          this._attackCd=0.5; this.attacking=true; this.attackTimer=0.22;
          const f = V(-Math.sin(camYaw),0,-Math.cos(camYaw));
          this.vel.addScaledVector(f, 9);
          this.audio?.quickStep();
        }
      }
    }
    if (this.attacking && this.homingTarget){
      const t=this.homingTarget;
      if (!t || t.destroyed){ this.homingTarget=null; }
      else{
        const to = t.pos.clone().sub(this.pos);
        const d=to.length();
        if (d<1.7){ this.hitEnemy(t); this.homingTarget=null; }
        else{
          to.normalize();
          this.vel.copy(to.multiplyScalar(TUNE.homingSpeed));
        }
      }
    }
    if (this.attacking){ this.attackTimer-=h; if(this.attackTimer<=0){this.attacking=false;this.homingTarget=null;} }

    if (input.hit('stomp') && !this.grounded && !this.stomping){
      this.stomping=true; this.attacking=true; this.attackTimer=2.0;
      this.vel.x*=0.25; this.vel.z*=0.25; this.vel.y=TUNE.stompV;
      this.audio?.stomp();
    }
  }

  findHomingTarget(camYaw){
    const list = this.ctx.enemies.list;
    let best=null,bestD=TUNE.homingRange;
    const vh = V(this.vel.x,0,this.vel.z);
    const facing = vh.lengthSq()>0.01 ? vh.clone().normalize() : V(-Math.sin(camYaw??0),0,-Math.cos(camYaw??0));
    for (const e of list){
      if (e.destroyed||e.harmless) continue;
      const to=e.pos.clone().sub(this.pos);
      const d=to.length();
      if (d>bestD) continue;
      to.normalize();
      if (to.dot(facing)>0.05 || to.y<-0.35 || d<8){
        best=e;bestD=d;
      }
    }
    return best;
  }

  hitEnemy(e){
    if (e.destroyed) return;
    if (e.isHazardOnly || e.invuln){ this.hurt(e.pos); return; }
    e.destroy(this);
    this.chainCombo++; this.comboTimer=2.4;
    this.audio?.enemyPop();
    this.emit('enemy',{combo:this.chainCombo, pos:e.pos.clone()});
    if (!this.grounded){ this.vel.y=Math.max(this.vel.y, 10.5); this.attacking=false; this.stomping=false; }
  }

  quickStep(side, camYaw){
    const cdKey = side==='left'?'_qsCdL':'_qsCdR';
    if (this[cdKey]>0 || this.dead) return;
    this[cdKey]=TUNE.qsCooldown;
    const f = V(-Math.sin(camYaw),0,-Math.cos(camYaw));
    const r = V(-f.z,0,f.x).multiplyScalar(side==='left'?-1:1);
    this.vel.addScaledVector(r, TUNE.quickStepV);
    this.audio?.quickStep();
    this.ctx?.fx?.burst(this.pos.clone(), 6, 0xaff6ff, 4,.2);
  }

  // ---------- wallrun ----------
  wallStep(h, input){
    this._wallRunT-=h;
    const n=this.wall.normal;
    this.vel.y -= GRAV*0.16*h;
    const tan = V(-n.z,0,n.x);
    const spSign = Math.sign(this.vel.dot(tan))||1;
    const sp = Math.abs(this.vel.dot(tan));
    const newSp = Math.max(8, sp - 2*h);
    this.vel.copy(tan.multiplyScalar(spSign*newSp)).addScaledVector(n, 0.5);
    if (input.hit('jump')||this._jumpBuf>0){
      this._jumpBuf=0;
      this.vel.addScaledVector(n, 10.5); this.vel.y=Math.max(this.vel.y, 8.4);
      this.state='air'; this.wall=null;
      this.audio?.jump();
      return;
    }
    if (this._wallRunT<=0 || newSp<7){ this.state='air'; this.wall=null; }
  }
  tryWallrun(){
    if (this.grounded) return false;
    const vh = V(this.vel.x,0,this.vel.z);
    const sp=vh.length();
    if (sp<10) return false;
    vh.normalize();
    for (const side of [1,-1]){
      const sd = V(-vh.z,0,vh.x).multiplyScalar(side);
      const hit = this.world.raycast(this.pos.x,this.pos.y,this.pos.z, sd.x,sd.y,sd.z, RADIUS+0.42);
      if (hit && Math.abs(hit.ny)<0.35){
        const tan=V(-hit.nz,0,hit.nx);
        if (Math.abs(vh.dot(tan))>0.55){
          this.state='wallrun'; this.wall={normal:V(hit.nx,hit.ny,hit.nz)}; this._wallRunT=2.0;
          return true;
        }
      }
    }
    return false;
  }

  // ---------- swept movement ----------
  sweepMove(h){
    let remaining = this.vel.length()*h;
    const speed = this.vel.length();
    if (speed<1e-7) return;
    const dirN = this.vel.clone().divideScalar(speed);
    let iter=0;
    const maxStep=0.22;
    while (remaining>1e-6 && iter++<8){
      const stepLen=Math.min(maxStep,remaining);
      const castLen=stepLen+RADIUS*0.9;
      const hit = this.world.raycast(this.pos.x-dirN.x*RADIUS*0.2, this.pos.y-dirN.y*RADIUS*0.2, this.pos.z-dirN.z*RADIUS*0.2,
        dirN.x,dirN.y,dirN.z, castLen);
      if (hit){
        const free=Math.max(0, hit.t-RADIUS*0.88);
        this.pos.addScaledVector(dirN, free);
        remaining-=free;
        const n=V(hit.nx,hit.ny,hit.nz);
        const vn=this.vel.dot(n);
        if (vn<0){
          this.vel.addScaledVector(n,-vn*1.02);
          this.vel.multiplyScalar(0.985);
        }
        remaining=Math.min(remaining, this.vel.length()*h);
        const l=this.vel.length();
        if(l>1e-6) dirN.copy(this.vel).divideScalar(l); else break;
      } else {
        this.pos.addScaledVector(dirN, stepLen);
        remaining-=stepLen;
      }
    }
  }

  // ---------- ground detection / snapping ----------
  groundCheck(h){
    const stick = this.grounded? TUNE.stickDist : 0.09;
    const d = this.up.clone().multiplyScalar(-1);
    const hit = this.world.raycast(this.pos.x,this.pos.y,this.pos.z, d.x,d.y,d.z, RADIUS+stick);
    if (hit){
      const n=V(hit.nx,hit.ny,hit.nz);
      // centripetal-style stick gate: need more speed the more inverted the surface
      const invert = Math.max(0, -n.y);
      const required = TUNE.minLoopSpeed + invert * 11;
      const sp=this.vel.length();
      const canStick = n.y>0.25 || sp>required;
      if (!this.grounded && !canStick){ this.becomeAirborne(h); this.tryWallrun(); return; }
      const gap = hit.t-RADIUS;
      if (gap<=stick){
        this.pos.addScaledVector(d, gap>0? gap : 0);
        if (!this.grounded){
          const impact = -this.vel.dot(n);
          this.grounded=true; this.state='ground';
          this.justLanded = true;
          if (impact>4){
            this.audio?.land();
            if (this.stomping){ this.stompImpact(); }
            else this.ctx?.fx?.burst(this.pos.clone().addScaledVector(n,-RADIUS), Math.min(14,3+impact|0), 0xcfefff, 4,.3);
          }
          if (this.stomping){ this.stompImpact(); }
          this.attacking=false; this.homingTarget=null;
        } else {
          this.justLanded=false;
        }
        this.stomping=false;
        this.up.lerp(n, Math.min(1, h*16)).normalize();
        this.groundNormal.copy(n);
        const vn=this.vel.dot(this.up);
        if (vn<0) this.vel.addScaledVector(this.up,-vn);
        this.standingOn=null;
      } else {
        if (this.grounded && hit.t < RADIUS+TUNE.stickDist*2){
          this.pos.addScaledVector(d, hit.t-RADIUS);
          this.justLanded=false;
        } else { this.becomeAirborne(h); this.tryWallrun(); }
      }
    } else {
      this.becomeAirborne(h);
      this.tryWallrun();
    }
  }
  becomeAirborne(h){
    if (this.grounded){ this.grounded=false; if(this.state==='ground') this.state='air'; }
    else if (this.state!=='wallrun') this.state='air';
    this.up.lerp(UP, Math.min(1,h*4)).normalize();
  }

  stompImpact(){
    this.stomping=false; this.attacking=false;
    this.vel.y=Math.max(this.vel.y, 7.5);
    this.audio?.stomp();
    this.ctx?.fx?.ring(this.pos.clone().addScaledVector(this.up,-RADIUS*.5), this.up.clone(), 0x9fefff);
    for (const e of this.ctx.enemies.list){
      if (!e.destroyed && e.pos.distanceTo(this.pos)<5.2) this.hitEnemy(e);
    }
    this.ctx?.director?.shake(0.35);
  }

  // ---------- grinding ----------
  tryGrind(){
    const nr=this.world.nearestRail(this.pos, 1.25);
    if (!nr) return false;
    const t=nr.tangent;
    let along=this.vel.dot(t);
    if (along<0){ t.multiplyScalar(-1); along=-along; }
    this.grind={rail:nr.rail, seg:nr.seg, u:nr.u, tangent:t.clone(), speed:Math.max(along, 9)};
    this.state='grind'; this.grounded=false; this.attacking=false; this.stomping=false;
    this.pos.copy(nr.point).add(V(0,RADIUS*0.72,0));
    this.audio?.quickStep();
    return true;
  }
  grindStep(h){
    const g=this.grind;
    const pts=g.rail.pts;
    let seg=g.seg, u=g.u;
    let dist=g.speed*h;
    let guard=0;
    while(dist>0 && guard++<40){
      const a=pts[seg], b=pts[seg+1];
      const segLen=a.distanceTo(b);
      const remain=(1-u)*segLen;
      if (dist<remain){ u+=dist/segLen; dist=0; }
      else { dist-=remain; if(seg<pts.length-2){seg++;u=0;} else {u=1;dist=0;} }
    }
    g.seg=seg;g.u=u;
    const a=pts[seg], b=pts[seg+1];
    const p=a.clone().lerp(b,u);
    const tan=b.clone().sub(a).normalize();
    if (tan.dot(g.tangent)<0) tan.negate();
    g.tangent.lerp(tan,0.4).normalize();
    g.speed += (-GRAV*g.tangent.y)*h*1.15;
    g.speed -= g.speed*0.03*h;
    g.speed=Math.max(6,g.speed);
    this.pos.copy(p).add(V(0,RADIUS*0.72,0));
    this.vel.copy(g.tangent).multiplyScalar(g.speed);
    this.up.lerp(UP,Math.min(1,h*10)).normalize();
    this.moveYaw=Math.atan2(g.tangent.x,g.tangent.z);
    this.hasDir=true;
    if (this._jumpBuf>0){
      this._jumpBuf=0;
      this.endGrind(false,true);
    } else if ((seg>=pts.length-2&&u>=1)){ this.endGrind(true,false); }
    else if (g.speed<6){ this.endGrind(false,false); }
  }
  endGrind(atEnd, jump){
    const v=this.grind? this.grind.speed:0;
    const t=this.grind? this.grind.tangent.clone():V(0,0,1);
    this.grind=null; this.state='air';
    if (jump){ this.vel.copy(t.multiplyScalar(v)); this.vel.y=Math.max(this.vel.y,TUNE.jumpVel*0.95); this.audio?.jump(); this._coyote=0; }
    else this.vel.copy(t.multiplyScalar(v));
  }

  // ---------- post frame: triggers, movers, pickups ----------
  postFrame(input, camYaw){
    this._lastCamYaw=camYaw;
    const lvl=this.ctx.level;
    if (this.onSpringCooldown<=0)
    for (const s of lvl.springs){
      const d=this.pos.distanceTo(s.pos);
      if (d<s.r+RADIUS){
        this.vel.copy(s.normal).multiplyScalar(s.power);
        this.state='air'; this.grounded=false; this.grind=null;
        this.onSpringCooldown=0.3; this._jumpTime=99; this._coyote=0;
        this.audio?.spring();
        this.ctx?.fx?.burst(s.pos.clone(), 12, 0xff5c9a, 6,.4);
        this.emit('spring',{});
      }
    }
    for (const dp of lvl.dashPanels){
      const rel=this.pos.clone().sub(dp.pos);
      const lat=Math.abs(rel.x*dp.dir.z-rel.z*dp.dir.x);
      const lon=rel.x*dp.dir.x+rel.z*dp.dir.z;
      if (lat<dp.halfW+RADIUS*0.5 && Math.abs(lon)<dp.halfL && Math.abs(rel.y)<3.2){
        const cur=this.vel.length();
        const target=Math.max(cur, dp.speed);
        this.vel.copy(dp.dir).multiplyScalar(target);
        this.vel.y=Math.max(this.vel.y,0);
        if (!this._lastDash||performance.now()-this._lastDash>700){
          this._lastDash=performance.now();
          this.audio?.dashPanel();
          this.ctx?.fx?.burst(this.pos.clone(), 10, 0xffd23d, 5,.35);
          this.emit('dash',{});
        }
      }
    }
    this.standingOn=null;
    for (const m of lvl.movers){
      const c=m.mesh.position, s=m.size;
      const cx=THREE.MathUtils.clamp(this.pos.x,c.x-s.x/2,c.x+s.x/2);
      const cy=THREE.MathUtils.clamp(this.pos.y,c.y-s.y/2,c.y+s.y/2);
      const cz=THREE.MathUtils.clamp(this.pos.z,c.z-s.z/2,c.z+s.z/2);
      const dx=this.pos.x-cx, dy=this.pos.y-cy, dz=this.pos.z-cz;
      const d2=dx*dx+dy*dy+dz*dz;
      if (d2<RADIUS*RADIUS*1.15){
        const d=Math.sqrt(d2)||1e-5;
        const push=RADIUS*1.04-d;
        const nx=dx/d,ny=dy/d,nz=dz/d;
        this.pos.x+=nx*push; this.pos.y+=ny*push; this.pos.z+=nz*push;
        const vn=this.vel.x*nx+this.vel.y*ny+this.vel.z*nz;
        if (vn<0){ this.vel.x-=nx*vn; this.vel.y-=ny*vn; this.vel.z-=nz*vn; }
        if (ny>0.7&&!this.grounded&&this.vel.y<=0.5){
          this.grounded=true; this.state='ground'; this.up.set(0,1,0); this.groundNormal.set(0,1,0);
          this.justLanded=true;
        }
        if (ny>0.7){ this.standingOn=m; }
      }
    }
    if (this.standingOn){
      this.pos.addScaledVector(this.standingOn.vel, 1);
    }
    for (const cp of lvl.checkpoints){
      if (cp.done) continue;
      if (this.pos.distanceTo(cp.pos)<cp.radius+RADIUS){
        cp.done=true; this.checkpointPos=cp.pos.clone();
        this.audio?.checkpoint();
        this.emit('checkpoint',{idx:cp.idx});
        this.ctx?.fx?.ring(cp.pos.clone().add(V(0,2.5,0)), V(0,1,0), 0x7dff4f);
      }
    }
    for (const gm of lvl.gems){
      if (gm.taken) continue;
      if (this.pos.distanceTo(gm.pos)<2.4){
        gm.taken=true; gm.mesh.visible=false;
        this.audio?.gem();
        this.emit('gem',{pos:gm.pos.clone()});
        this.ctx?.fx?.burst(gm.pos.clone(), 20, 0xffd23d, 6,.6);
      }
    }
    const volts=lvl.volts;
    for (let i=0;i<volts.length;i++){
      const vt=volts[i];
      if (vt.taken) continue;
      const dx=vt.pos.x-this.pos.x, dy=vt.pos.y-this.pos.y, dz=vt.pos.z-this.pos.z;
      const rr = 2.1 + (this.attacking?1.4:0);
      if (dx*dx+dy*dy+dz*dz< rr*rr){
        vt.taken=true;
        this.addBoost(4.5);
        this.emit('volt',{pos:vt.pos});
      }
    }
    if (lvl.goalPos && this.pos.distanceTo(lvl.goalPos)<4.8 && !this._goalHit){
      this._goalHit=true;
      this.emit('goal',{});
    }
    if (this.pos.y<lvl.killZ && !this.dead){ this.dead=true; this.audio?.death(); this.emit('die',{}); }
  }
}
