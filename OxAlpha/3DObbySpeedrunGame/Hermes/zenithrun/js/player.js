/* ZENITH RUN · character controller (the star of the show) · ox-alpha piagent run-01
   Custom AABB kinematic physics: run / jump (coyote+buffer+variable) / air control /
   dash / slide / wall-jump / momentum preservation. Fixed-step driven by main. */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};
const V3 = function(x,y,z){ return new THREE.Vector3(x,y,z); };

const CFG = {
  gravity: 34, maxFall: 42,
  runMax: 12.5, groundAccelRate: 11, groundStopDrag: 9, groundMomentumDrag: 1.15,
  steerRot: 3.2,
  airAccel: 46, airMax: 13.2,
  jumpVel: 13.8, coyote: 0.12, jbuf: 0.14, jumpCut: 0.5,
  wallJumpUp: 12.4, wallJumpOut: 11.5, wallKeep: 0.62, wallWindow: 0.13, wallSteerLock: 0.15,
  dashSpeed: 26, dashTime: 0.16, dashCd: 0.85, dashExitMin: 18, dashExitMax: 27,
  slideBoost: 2.6, slideBoostMul: 1.12, slideMax: 19.5, slideDrag: 0.5, slideSteer: 1.8,
  slideEnterMin: 5.2, slideEndMin: 4.4,
  stepH: 0.55, hx: 0.42, hyStand: 0.9, hySlide: 0.45,
  bounceVel: 23.5
};

function Player(events){
  this.events = events || {};
  this.pos = V3(0,3,0); this.vel = V3(0,0,0);
  this.hy = CFG.hyStand;
  this.grounded = false; this.groundRef = null;
  this.coyoteT = 0; this.jbufT = 0; this.jumpCutDone = false;
  this.wallN = V3(0,0,0); this.wallT = 99; this.steerLock = 0;
  this.dashT = 0; this.dashCdT = 0; this.dashDir = V3(0,0,1); this.preDashSpeed = 0;
  this.sliding = false; this.slideCd = 0;
  this.fallPeak = 0; this.stepDist = 0; this.bonkCd = 0;
  this.heading = Math.PI; // visual yaw
  this.squash = 0; this.stretch = 0;
  this.spawnAt(V3(0,3,0));

  /* ---------- visuals ---------- */
  const g = new THREE.Group();                 // feet-origin rig
  this.bodyG = new THREE.Group();              // squash/lean target
  const bodyMat = new THREE.MeshLambertMaterial({color:0x2ee6ff});
  const darkMat = new THREE.MeshLambertMaterial({color:0x12203f});
  const visorMat = new THREE.MeshBasicMaterial({color:0xffffff});
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.82,0.6), bodyMat);
  body.position.y = 0.41; body.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.22,0.1), visorMat);
  visor.position.set(0,0.56,0.31);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.34,0.24), darkMat); legL.position.set(-0.18,0.17,0);
  const legR = legL.clone(); legR.position.x = 0.18;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.5,0.2), bodyMat); armL.position.set(-0.46,0.5,0); armL.castShadow=true;
  const armR = armL.clone(); armR.position.x = 0.46;
  this.bodyG.add(body,visor,legL,legR,armL,armR);
  this.legs=[legL,legR]; this.arms=[armL,armR];
  g.add(this.bodyG);
  this.mesh = g;
  this.visorMat = visorMat;

  this._tmp1 = V3(0,0,0); this._wish = V3(0,0,0);
}

Player.prototype.spawnAt = function(p){
  this.pos.copy(p); this.vel.set(0,0,0);
  this.hy = CFG.hyStand;
  this.grounded=false; this.groundRef=null;
  this.dashT=0; this.dashCdT=0; this.sliding=false; this.slideCd=0;
  this.coyoteT=0; this.jbufT=0; this.wallT=99; this.steerLock=0;
  this.fallPeak=0;
};

Object.defineProperty(Player.prototype,'hspeed',{ get:function(){ return Math.hypot(this.vel.x,this.vel.z); }});

/* ------------------- collision helpers ------------------- */
Player.prototype._aabb = function(out, px,py,pz,hx,hy){
  out.min.set(px-hx, py-hy, pz-hx); out.max.set(px+hx, py+hy, pz+hx);
  return out;
};
Player.prototype._overlapSolid = function(box, cb){
  const cols = ZR.course.colliders;
  for (let i=0;i<cols.length;i++){
    const c = cols[i];
    if (c.type==='hazard') continue;
    if (box.max.x<=c.min.x||box.min.x>=c.max.x||box.max.y<=c.min.y||box.min.y>=c.max.y||box.max.z<=c.min.z||box.min.z>=c.max.z) continue;
    if (cb && cb(c)) return true;
  }
  return false;
};

/* ------------------- main fixed-step update ------------------- */
Player.prototype.update = function(dt, input, camYaw){
  const ev = this.events, T = this._tmp1;

  /* timers */
  this.coyoteT -= dt; this.jbufT -= dt; this.dashCdT -= dt; this.slideCd -= dt;
  this.wallT += dt; this.steerLock -= dt; this.bonkCd -= dt;

  /* buffered jump */
  if (input.jumpPressed()) this.jbufT = CFG.jbuf;

  /* wish direction (camera-relative) */
  const ax = input.axis();
  const sy=Math.sin(camYaw), cy=Math.cos(camYaw);
  this._wish.set(ax.x*cy + ax.z*sy, 0, -ax.x*sy + ax.z*cy);
  const wish = this._wish;
  const hasInput = ax.mag > 0;

  /* ---- slide state ---- */
  const sp = this.hspeed;
  if (!this.sliding && this.grounded && input.slideHeld() && sp > CFG.slideEnterMin && this.slideCd<=0){
    this.sliding = true;
    const ns = Math.min(sp*CFG.slideBoostMul + CFG.slideBoost, CFG.slideMax);
    if (sp>0.01){ this.vel.x *= ns/sp; this.vel.z *= ns/sp; }
    this.hy = CFG.hySlide;
    ev.slideStart && ev.slideStart();
  }
  if (this.sliding && (!input.slideHeld() || (!this.grounded && this.vel.y<-3) || (this.hspeed<CFG.slideEndMin && this.grounded))){
    this.tryStand() ; // may refuse if ceiling
    if (!this.sliding){ this.slideCd = 0.22; ev.slideStop && ev.slideStop(); }
  }

  /* ---- dash ---- */
  if (input.dashPressed() && this.dashCdT<=0 && this.dashT<=0){
    this.dashDir.copy(hasInput?wish:V3(Math.sin(this.heading),0,Math.cos(this.heading))).normalize();
    this.preDashSpeed = Math.max(this.hspeed, 0);
    this.dashT = CFG.dashTime; this.dashCdT = CFG.dashCd;
    this.vel.y = 0;
    if (this.sliding){ this.sliding=false; this.hy=CFG.hyStand; ev.slideStop && ev.slideStop(); }
    ev.dash && ev.dash(this.dashDir);
  }

  if (this.dashT>0){
    this.dashT -= dt;
    this.vel.x = this.dashDir.x*CFG.dashSpeed;
    this.vel.z = this.dashDir.z*CFG.dashSpeed;
    this.vel.y = 0;
    if (this.dashT<=0){
      const ex = Math.min(CFG.dashExitMax, Math.max(this.preDashSpeed*0.98, CFG.dashExitMin));
      this.vel.x = this.dashDir.x*ex; this.vel.z = this.dashDir.z*ex;
    }
  } else {
    /* ---- horizontal control ---- */
    if (this.grounded){
      if (this.sliding){
        const d = Math.exp(-CFG.slideDrag*dt);
        this.vel.x*=d; this.vel.z*=d;
        this._steer(wish, hasInput, CFG.slideSteer*dt);
      } else if (hasInput){
        if (sp <= CFG.runMax){
          const tx=wish.x*CFG.runMax, tz=wish.z*CFG.runMax;
          const t = 1-Math.exp(-CFG.groundAccelRate*dt);
          this.vel.x += (tx-this.vel.x)*t; this.vel.z += (tz-this.vel.z)*t;
        } else {
          const d = Math.exp(-CFG.groundMomentumDrag*dt);
          this.vel.x*=d; this.vel.z*=d;
          this._steer(wish, true, CFG.steerRot*dt);
        }
      } else {
        const d = Math.exp(-CFG.groundStopDrag*dt);
        this.vel.x*=d; this.vel.z*=d;
      }
    } else {
      /* air: project-accelerate (keeps momentum, allows redirect) */
      if (hasInput && this.steerLock<=0){
        const cur = this.vel.x*wish.x + this.vel.z*wish.z;
        if (cur < CFG.airMax){
          const add = Math.min(CFG.airAccel*dt, CFG.airMax-cur);
          this.vel.x += wish.x*add; this.vel.z += wish.z*add;
        } else {
          this._steer(wish, true, CFG.steerRot*0.8*dt);
        }
      }
      this.vel.y -= CFG.gravity*dt;
      if (this.vel.y < -CFG.maxFall) this.vel.y = -CFG.maxFall;
      if (this.vel.y < this.fallPeak) this.fallPeak = this.vel.y; // most negative
    }

    /* ---- jumping ---- */
    if (this.jbufT>0){
      if (this.grounded || this.coyoteT>0){
        this.jbufT=0; this.coyoteT=0;
        const keepSlideJump = this.sliding;
        this.vel.y = CFG.jumpVel*(keepSlideJump?0.96:1);
        if (keepSlideJump){ this.sliding=false; this.tryStand(true); ev.slideStop && ev.slideStop(); }
        this.jumpCutDone=false;
        ev.jump && ev.jump(keepSlideJump);
      } else if (this.wallT < CFG.wallWindow){
        /* wall jump */
        this.jbufT=0;
        const n=this.wallN;
        const tx=this.vel.x - n.x*(this.vel.x*n.x+this.vel.z*n.z);
        const tz=this.vel.z - n.z*(this.vel.x*n.x+this.vel.z*n.z);
        this.vel.x = n.x*CFG.wallJumpOut + tx*CFG.wallKeep;
        this.vel.z = n.z*CFG.wallJumpOut + tz*CFG.wallKeep;
        this.vel.y = CFG.wallJumpUp;
        this.steerLock = CFG.wallSteerLock;
        this.jumpCutDone=false;
        this.wallT=99;
        ev.wallJump && ev.wallJump(n);
      }
    }
    /* variable jump height */
    if (!input.jumpHeld() && this.vel.y>4 && !this.jumpCutDone){
      this.vel.y*=CFG.jumpCut; this.jumpCutDone=true;
    }
  }

  /* ---- carried by moving platform ---- */
  if (this.groundRef && this.groundRef.delta){
    this.pos.add(this.groundRef.delta);
  }

  /* ---- integrate + collide ---- */
  const box = {min:V3(0,0,0), max:V3(0,0,0)};
  const wasGrounded = this.grounded;
  this.grounded=false; this.groundRef=null;

  // X axis
  this.pos.x += this.vel.x*dt;
  this._aabb(box, this.pos.x, this.pos.y, this.pos.z, CFG.hx, this.hy);
  this._resolveAxis(box,'x');
  // Z axis
  this.pos.z += this.vel.z*dt;
  this._aabb(box, this.pos.x, this.pos.y, this.pos.z, CFG.hx, this.hy);
  this._resolveAxis(box,'z');
  // Y axis
  this.pos.y += this.vel.y*dt;
  this._aabb(box, this.pos.x, this.pos.y, this.pos.z, CFG.hx, this.hy);
  this._resolveAxisY(box);

  /* ground probe (coyote ledges) */
  if (!this.grounded && this.vel.y<=0.01){
    T.set(this.pos.x, this.pos.y-this.hy-0.07, this.pos.z);
    this._aabb(box, this.pos.x, this.pos.y-this.hy-0.07, this.pos.z, CFG.hx*0.85, 0.06);
    let hit=null;
    this._overlapSolid(box,function(c){ if(c.max.y<=this.pos.y-this.hy+0.05) {hit=c; return true;} }.bind(this));
    if (hit){
      this.pos.y = hit.max.y + this.hy;
      this.vel.y = 0;
      this.grounded = true; this.groundRef = hit;
    }
  }

  /* landing */
  if (this.grounded && !wasGrounded){
    const impact = -this.fallPeak;
    this.coyoteT=0;
    if (impact>4) ev.land && ev.land(Math.min(1,(impact-4)/26));
    this.fallPeak = 0;
  }
  if (this.grounded){
    this.coyoteT = CFG.coyote;
    this.wallT = 99;
    if (this.vel.y<0) this.vel.y=0;
    if (!wasGrounded) this.fallPeak=0;
  } else if (wasGrounded){
    this.coyoteT = CFG.coyote; // walked off ledge
  }

  /* footsteps */
  if (this.grounded && !this.sliding && this.hspeed>4){
    this.stepDist += this.hspeed*dt;
    if (this.stepDist>2.6){ this.stepDist=0; ev.step && ev.step(); }
  }

  /* heading for visuals */
  if (this.hspeed>0.8){
    const target = Math.atan2(this.vel.x, this.vel.z);
    let d = target-this.heading;
    while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
    this.heading += d*Math.min(1, 14*dt);
  }
};

Player.prototype._steer = function(wish, hasInput, maxAngle){
  if (!hasInput || this.hspeed<0.5) return;
  const cur = Math.atan2(this.vel.x, this.vel.z);
  const tgt = Math.atan2(wish.x, wish.z);
  let d = tgt-cur; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
  const rot = Math.max(-maxAngle, Math.min(maxAngle, d));
  const a = cur+rot, s = this.hspeed;
  this.vel.x = Math.sin(a)*s; this.vel.z = Math.cos(a)*s;
};

Player.prototype._resolveAxis = function(box, axis){
  const self=this;
  this._overlapSolid(box, function(c){
    const feet = self.pos.y-self.hy;
    /* step-up attempt */
    const rise = c.max.y - feet;
    if (rise>0 && rise<=CFG.stepH && (self.grounded || self.coyoteT>0)){
      const test = {min:V3(0,0,0),max:V3(0,0,0)};
      self._aabb(test, self.pos.x, c.max.y+self.hy+0.02, self.pos.z, CFG.hx, self.hy);
      let blocked=false;
      self._overlapSolid(test,function(c2){ if(c2!==c){blocked=true;return true;} return false; });
      if (!blocked){ self.pos.y = c.max.y+self.hy+0.001; return false; }
    }
    if (axis==='x'){
      const push = (self.pos.x < (c.min.x+c.max.x)/2) ? (c.min.x-(self.pos.x+CFG.hx)) : (c.max.x-(self.pos.x-CFG.hx));
      self.pos.x += push;
      self.wallN.set(-Math.sign(push),0,0); self.wallT=0;
      self.vel.x = 0;
    } else {
      const push = (self.pos.z < (c.min.z+c.max.z)/2) ? (c.min.z-(self.pos.z+CFG.hx)) : (c.max.z-(self.pos.z-CFG.hx));
      self.pos.z += push;
      self.wallN.set(0,0,-Math.sign(push)); self.wallT=0;
      self.vel.z = 0;
    }
    self._aabb(box, self.pos.x, self.pos.y, self.pos.z, CFG.hx, self.hy);
    return false;
  });
};

Player.prototype._resolveAxisY = function(box){
  const ev=this.events, self=this;
  this._overlapSolid(box, function(c){
    if (self.vel.y<=0 && self.pos.y >= (c.min.y+c.max.y)/2){
      /* landed */
      self.pos.y = c.max.y + self.hy;
      if (c.bounce){
        self.vel.y = CFG.bounceVel;
        self.dashCdT = 0; // refresh dash on bounce
        self.grounded=false;
        ev.bounce && ev.bounce(c);
      } else {
        self.vel.y = 0;
        self.grounded = true; self.groundRef = c;
      }
    } else if (self.vel.y>0){
      self.pos.y = c.min.y - self.hy - 0.001;
      if (self.vel.y>6 && self.bonkCd<=0){ ev.bonk && ev.bonk(); self.bonkCd=0.4; }
      self.vel.y = 0;
    }
    self._aabb(box, self.pos.x, self.pos.y, self.pos.z, CFG.hx, self.hy);
    return false;
  });
};

Player.prototype.tryStand = function(force){
  const test = {min:V3(0,0,0),max:V3(0,0,0)};
  this._aabb(test, this.pos.x, this.pos.y + (CFG.hyStand-this.hy)+0.02, this.pos.z, CFG.hx, CFG.hyStand);
  let blocked=false;
  this._overlapSolid(test,function(){blocked=true;return true;});
  if (force) blocked=false;
  if (!blocked){ this.sliding=false; this.hy=CFG.hyStand; return true; }
  return false;
};

/* hazard touch test (called by main after move) */
Player.prototype.touchingHazard = function(){
  const cols = ZR.course.colliders;
  for (let i=0;i<cols.length;i++){
    const c=cols[i];
    if (c.type!=='hazard') continue;
    if (this.pos.x+CFG.hx>c.min.x && this.pos.x-CFG.hx<c.max.x &&
        this.pos.y+this.hy>c.min.y && this.pos.y-this.hy<c.max.y &&
        this.pos.z+CFG.hx>c.min.z && this.pos.z-CFG.hx<c.max.z) return c;
  }
  return null;
};

/* ------------------- visual animation ------------------- */
Player.prototype.updateVisual = function(dt){
  const g = this.mesh, b = this.bodyG;
  g.position.set(this.pos.x, this.pos.y-this.hy, this.pos.z);
  b.rotation.y = this.heading;

  /* squash & stretch springs */
  let targetSquash = 0;
  if (!this.grounded && this.vel.y>6) targetSquash = -0.14;
  this.squash += (targetSquash-this.squash)*Math.min(1,8*dt);
  b.scale.set(1+this.squash*0.7, 1-this.squash, 1+this.squash*0.7);

  /* lean into acceleration */
  const leanZ = Math.max(-0.3,Math.min(0.3, this.hspeed*0.016));
  b.rotation.x = this.sliding ? -1.05 : leanZ*0.6;
  if (this.dashT>0){
    const roll = (1-(this.dashT/CFG.dashTime))*Math.PI*2;
    b.rotation.x = roll; // flip!
  }
  b.position.y = this.sliding ? 0.12 : 0;
  const stride = (this.grounded && this.hspeed>1) ? Math.sin(performance.now()*0.012*this.hspeed*0.14)*0.6 : 0;
  this.legs[0].rotation.x = stride; this.legs[1].rotation.x = -stride;
  this.arms[0].rotation.x = -stride*0.8; this.arms[1].rotation.x = stride*0.8;
  this.visorMat.color.setHex(this.dashT>0?0xffe94d : (this.sliding?0xa8ff5e:0xffffff));
};

ZR.Player = Player;
ZR.PLAYER_CFG = CFG;
})();
