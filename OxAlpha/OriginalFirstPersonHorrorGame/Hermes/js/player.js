/* HOLLOW SIGNAL — player: movement, collision, flashlight, head bob, noise */
(function(){
"use strict";
const HG = window.HG;
const M = HG.M, Maps = HG.Maps;
const CS = Maps.CS;

const EYE_STAND=1.62, EYE_CROUCH=.98, RADIUS=.36;

const Player = HG.Player = {
  x:0,z:0,y:0,floor:0,
  yaw:0,pitch:0,
  velX:0,velZ:0,
  crouching:false,sprinting:false,moving:false,speed2d:0,
  bobT:0,bobAmp:0,
  stepAccum:0,
  noiseRadius:0,
  flashOn:false,flashFlicker:1,fear:0,
  frozen:false,           // during fades/sequences
  cam:null,camPitch:null,camYaw:null,flash:null,flashTarget:true,

  init(camera){
    this.cam=camera;
    const rig=new THREE.Group();          // yaw
    this.camYaw=rig;
    const pitchG=new THREE.Group();       // pitch
    this.camPitch=pitchG;
    const rollG=new THREE.Group();        // subtle roll for dread effects
    this.roll=rollG;
    rig.add(pitchG); pitchG.add(rollG); rollG.add(camera);
    HG.scene.add(rig);

    // flashlight (child of pitch so it follows view)
    const spot=new THREE.SpotLight(0xffe9c4, 0, 26, .46, .55, 1.4);
    spot.position.set(.16,-.12,.05);
    spot.target.position.set(.02,-.18,-3);
    const cookie=HG.Textures.get('flashCookie');
    if(cookie){ spot.map=cookie; }
    pitchG.add(spot); pitchG.add(spot.target);
    this.flash=spot;
  },

  place(x,z,yaw,f){
    this.x=x;this.z=z;this.yaw=yaw;this.pitch=0;this.floor=f;
    this.velX=this.velZ=0;
    this.syncCam(0);
  },

  syncCam(dt){
    this.camYaw.rotation.y=this.yaw;
    this.camPitch.rotation.x=this.pitch;
    const targetEye = this.crouching?EYE_CROUCH:EYE_STAND;
    this.eyeH = this.eyeH===undefined?targetEye:M.damp(this.eyeH,targetEye,10,dt||.016);
    // head bob
    let oy=0,ox=0;
    if(HG.settings.headbob && !this.frozen){
      oy=Math.sin(this.bobT*2)*this.bobAmp*.045;
      ox=Math.cos(this.bobT)*this.bobAmp*.03;
    }
    this.cam.position.set(ox,this.eyeH+oy,0);
    this.camYaw.position.set(this.x,this.floor===0?0:-6,this.z);
  },

  update(dt,input){
    if(this.frozen){ this.speed2d=0; this.noiseRadius=0; this.syncCam(dt); return; }

    /* ---- look ---- */
    const sens=.0021*(HG.settings.sens||1);
    this.yaw   -= input.mouseDX*sens;
    this.pitch -= input.mouseDY*sens;
    this.pitch = M.clamp(this.pitch,-1.35,1.35);
    // keyboard look fallback
    if(input.down('ArrowLeft'))  this.yaw+=1.8*dt;
    if(input.down('ArrowRight')) this.yaw-=1.8*dt;
    if(input.down('ArrowUp'))    this.pitch=M.clamp(this.pitch+1.2*dt,-1.35,1.35);
    if(input.down('ArrowDown'))  this.pitch=M.clamp(this.pitch-1.2*dt,-1.35,1.35);

    /* ---- move intent ---- */
    let fx=0,fz=0;
    if(input.down('KeyW')||input.down('KeyNumpad8')) fz-=1;
    if(input.down('KeyS')||input.down('KeyNumpad2')) fz+=1;
    if(input.down('KeyA')) fx-=1;
    if(input.down('KeyD')) fx+=1;
    const wantMove=(fx!==0||fz!==0);
    this.crouching = input.down('KeyC');
    this.sprinting = (input.down('ShiftLeft')||input.down('ShiftRight')) && wantMove && !this.crouching;
    const speed = this.crouching?1.5:(this.sprinting?5.7:3.15);

    let ax=0,az=0;
    if(wantMove){
      const len=Math.hypot(fx,fz); fx/=len; fz/=len;
      // forward F=(-sin yaw,-cos yaw), right R=(cos yaw,-sin yaw) in world XZ
      const s=Math.sin(this.yaw), c=Math.cos(this.yaw);
      ax=((-s)*fz + c*fx)*speed;
      az=((-c)*fz + (-s)*fx)*speed;
    }
    // smooth accel
    const accel=wantMove?11:13;
    this.velX=M.damp(this.velX,ax,accel,dt);
    this.velZ=M.damp(this.velZ,az,accel,dt);

    /* ---- collide & slide ---- */
    this.moveWithCollision(dt);

    const sp2=this.velX*this.velX+this.velZ*this.velZ;
    this.speed2d=Math.sqrt(sp2);
    this.moving=this.speed2d>.25;

    /* ---- bob + steps ---- */
    const spdN=M.clamp(this.speed2d/5.7,0,1);
    this.bobAmp=M.damp(this.bobAmp, this.moving?(this.crouching?.35:.65+.5*spdN):0, 8, dt);
    this.bobT += dt*(4.4+spdN*4.2)*(this.crouching?.6:1);
    if(this.moving){
      this.stepAccum += this.speed2d*dt;
      const stride=this.crouching?1.15:(this.sprinting?1.9:1.5);
      if(this.stepAccum>stride){
        this.stepAccum=0;
        HG.Audio.play('footstep',{surf:this.floor===1?'metal':'conc'});
        if(this.sprinting) this.emitNoise(18);
      }
    }
    /* ---- noise footprint (threat hearing) ---- */
    if(!this.moving) this.noiseRadius=0;
    else if(this.crouching) this.noiseRadius=2.6;
    else if(this.sprinting) this.noiseRadius=19;
    else this.noiseRadius=8.5;

    /* ---- flashlight ---- */
    if(input.hit('KeyF')){
      this.flashOn=!this.flashOn;
      HG.Audio.play('clunk',{vol:.6});
      HG.UI && HG.UI.toast(this.flashOn?'flashlight on':'flashlight off',900);
    }
    const fearFlicker = this.fear>0 ?
      (Math.random()<this.fear*.14 ? M.rand(.15,.6) : 1-Math.random()*this.fear*.25) : 1;
    this.flashFlicker=M.damp(this.flashFlicker,fearFlicker,26,dt);
    this.flash.intensity = this.flashOn? (2.3*this.flashFlicker):M.damp(this.flash.intensity,0,20,dt);

    this.syncCam(dt);
  },

  emitNoise(radius){ // one-shot noises (doors etc.) — threat checks these
    HG.lastNoise={x:this.x,z:this.z,r:radius,t:performance.now(),floor:this.floor};
  },

  moveWithCollision(dt){
    const f=this.floor;
    const solids=HG.world.querySolids(f,this.x,this.z,RADIUS+.6);
    let nx=this.x+this.velX*dt;
    // X axis
    if(!this.blocked(f,nx,this.z,solids)) this.x=nx;
    else { this.velX*=.2; this.slideAxis('x',f,solids); }
    // Z axis
    let nz=this.z+this.velZ*dt;
    if(!this.blocked(f,this.x,nz,solids)) this.z=nz;
    else { this.velZ*=.2; this.slideAxis('z',f,solids); }
    this.clampToFloor(f);
  },
  slideAxis(axis,f,solids){
    // nudge out of shallow penetrations along the moving axis
    for(const s of solids){
      const cxp=M.clamp(this.x,s.x0,s.x1), czp=M.clamp(this.z,s.z0,s.z1);
      const dx=this.x-cxp, dz=this.z-czp;
      const d2=dx*dx+dz*dz;
      if(d2<RADIUS*RADIUS&&d2>1e-6){
        const d=Math.sqrt(d2), push=(RADIUS-d);
        this.x+=dx/d*push; this.z+=dz/d*push;
      } else if(d2<=1e-6){
        // inside: push toward nearest edge
        const l=this.x-s.x0, r=s.x1-this.x, t=this.z-s.z0, b=s.z1-this.z;
        const m=Math.min(l,r,t,b);
        if(m===l)this.x=s.x0-RADIUS; else if(m===r)this.x=s.x1+RADIUS;
        else if(m===t)this.z=s.z0-RADIUS; else this.z=s.z1+RADIUS;
      }
    }
  },
  blocked(f,x,z,solids){
    // grid walls
    const c0=Maps.toC(x-RADIUS),c1=Maps.toC(x+RADIUS),r0=Maps.toR(z-RADIUS),r1=Maps.toR(z+RADIUS);
    for(let r=r0;r<=r1;r++)for(let cc=c0;cc<=c1;cc++){
      if(!Maps.isFloorCell(f,cc,r)){
        // circle vs cell AABB
        const bx0=cc*CS,bz0=r*CS,bx1=bx0+CS,bz1=bz0+CS;
        const px=M.clamp(x,bx0,bx1),pz=M.clamp(z,bz0,bz1);
        const dx=x-px,dz=z-pz;
        if(dx*dx+dz*dz<RADIUS*RADIUS) return true;
      }
    }
    for(const s of solids){
      const px=M.clamp(x,s.x0,s.x1),pz=M.clamp(z,s.z0,s.z1);
      const dx=x-px,dz=z-pz;
      if(dx*dx+dz*dz<RADIUS*RADIUS) return true;
    }
    return false;
  },
  clampToFloor(f){
    // keep inside map bounds
    this.x=M.clamp(this.x,CS*.5,(Maps.GW-.5)*CS);
    this.z=M.clamp(this.z,CS*.5,(Maps.GH-.5)*CS);
  },

  /* face a point (used by death cam) */
  lookAtPoint(px,pz,dt,rate=6){
    const want=Math.atan2(-(px-this.x),-(pz-this.z));
    this.yaw+=M.angDiff(this.yaw,want)*Math.min(1,rate*dt);
  },
};

})();
