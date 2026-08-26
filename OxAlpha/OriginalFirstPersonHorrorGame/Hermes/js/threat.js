/* HOLLOW SIGNAL — the Choir: blind hunter that tracks sound */
(function(){
"use strict";
const HG = window.HG;
const M = HG.M, Maps = HG.Maps;
const CS = Maps.CS;

/* BFS flow field over walkable cells toward a target cell */
const GW=Maps.GW, GH=Maps.GH;
const _flow=new Int16Array(GW*GH);
function computeFlow(f,tx,ty){
  _flow.fill(-1);
  if(!HG.world||HG.world.navBlocked(f,tx,ty)) return false;
  const q=[ty*GW+tx]; _flow[ty*GW+tx]=0;
  let head=0;
  while(head<q.length){
    const cur=q[head++]; const cx=cur%GW, cy=(cur/GW)|0; const d=_flow[cur];
    const nb=[[cx,cy-1],[cx,cy+1],[cx-1,cy],[cx+1,cy]];
    for(const [nx,ny] of nb){
      if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
      const ni=ny*GW+nx;
      if(_flow[ni]!==-1) continue;
      if(HG.world.navBlocked(f,nx,ny)) continue;
      _flow[ni]=d+1; q.push(ni);
    }
  }
  return true;
}
function flowDir(f,x,y){ // best downhill neighbor direction
  const here=_flow[y*GW+x]; if(here<=0) return null;
  let best=null,bd=here;
  for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]){
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=GW||ny>=GH) continue;
    const d=_flow[ny*GW+nx];
    if(d>=0&&d<bd){bd=d;best=[dx,dy];}
  }
  return best;
}

/* ---------------- build the body ---------------- */
function buildBody(){
  const g=new THREE.Group();
  const skin=new THREE.MeshStandardMaterial({color:0xcfc4b6,roughness:.85,emissive:0x1a1712,emissiveIntensity:.5});
  const dark=new THREE.MeshStandardMaterial({color:0x14100e,roughness:.9});
  // legs
  const legL=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,1.25,8),skin);
  const legR=legL.clone();
  legL.position.set(-.11,.62,0); legR.position.set(.11,.62,0);
  // torso — elongated
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.14,.19,.95,10),skin);
  torso.position.y=1.68;
  // shoulders
  const sh=new THREE.Mesh(new THREE.BoxGeometry(.52,.12,.16),skin);
  sh.position.y=2.08;
  // arms — far too long
  const armL=new THREE.Group(); const armR=new THREE.Group();
  for(const [arm,sx] of [[armL,-1],[armR,1]]){
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.72,8),skin);
    upper.position.y=-.36;
    const fore=new THREE.Mesh(new THREE.CylinderGeometry(.032,.042,.78,8),skin);
    fore.position.y=-1.06;
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.05,7,6),dark);
    hand.position.y=-1.48; hand.scale.set(1,1.7,1);
    arm.add(upper,fore,hand);
    arm.position.set(sx*.27,2.06,0);
  }
  // neck + head — smooth, featureless except sunk eyes
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,.22,8),skin);
  neck.position.y=2.24;
  const head=new THREE.Group();
  const skull=new THREE.Mesh(new THREE.SphereGeometry(.13,12,10),skin);
  skull.scale.set(.86,1.28,.92);
  head.add(skull);
  for(const sx of [-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.02,6,5),dark);
    eye.position.set(sx*.055,.02,.105);
    head.add(eye);
  }
  head.position.y=2.47;
  head.rotation.z=.16;
  g.add(legL,legR,torso,sh,armL,armR,neck,head);
  return {g,legL,legR,armL,armR,head,torso};
}

const Threat = HG.Threat = {
  state:'dormant',        // dormant | stalk | investigate | hunt | search | banished
  floor:1,
  x:0,z:0,
  yaw:0,
  body:null,
  speed:0,
  targetCell:null,
  repathT:0,
  alertT:0,               // remaining awareness
  lastKnown:null,
  wanderT:0,
  stepAccum:0,
  animT:0,
  twitchT:1,
  fearLevel:0,
  active:false,

  init(scene){
    this.body=buildBody();
    this.body.g.visible=false;
    scene.add(this.body.g);
  },

  spawnAt(x,z,floor=1){
    this.x=x;this.z=z;this.floor=floor;
    this.state='stalk';
    this.active=true;
    this.alertT=0;
    this.lastKnown=null;
    this.body.g.visible=true;
    this.syncBody();
  },
  banish(){ this.state='dormant'; this.active=false; this.body.g.visible=false; },
  relocate(x,z){ this.x=x;this.z=z; },

  hearNoise(x,z,radius,floor,strong=false){
    if(!this.active) return;
    if(floor!==this.floor) return;
    // generator hum masks noise nearby
    let r=radius;
    if(HG.Game&&HG.Game.genOn){
      const gd=M.dist(x,z,HG.world.generatorCenter.x,HG.world.generatorCenter.z);
      if(gd<9) r*=.45;
    }
    const d=M.dist(this.x,this.z,x,z);
    if(d<r+(strong?6:0)){
      this.lastKnown={x,z};
      if(this.state!=='hunt'){
        this.state='investigate';
        this.targetCell=null;
      }
      this.alertT=Math.max(this.alertT, strong?9:5.5);
    }
  },

  update(dt,player){
    if(!this.active){ this.fearLevel=M.damp(this.fearLevel,0,2,dt); return; }

    const pd=M.dist(this.x,this.z,player.x,player.z);
    const sameFloor=player.floor===this.floor;

    /* ---------- senses ---------- */
    if(sameFloor){
      // proximity sense: it feels air displacement
      const proxR=player.moving?(player.crouching?2.2:3.4):1.35;
      if(pd<proxR){
        this.acquire(player);
      } else {
        this.hearNoise(player.x,player.z,player.noiseRadius,player.floor,false);
      }
      if(HG.lastNoise && performance.now()-HG.lastNoise.t<400){
        this.hearNoise(HG.lastNoise.x,HG.lastNoise.z,HG.lastNoise.r,HG.lastNoise.floor,true);
        HG.lastNoise=null;
      }
    }

    /* ---------- state machine ---------- */
    switch(this.state){
      case 'stalk':{
        this.speed=1.55;
        this.wanderT-=dt;
        if(!this.targetCell||this.wanderT<=0||this.reachedTarget()){
          // drift through the facility, biased loosely toward the player's half
          const bias=sameFloor?.65:.35;
          let tc;
          if(Math.random()<bias&&sameFloor){
            tc=this.randCellNear(Maps.toC(player.x),Maps.toR(player.z),10);
          } else {
            tc=this.randCellNear(Maps.toC(this.x),Maps.toR(this.z),8);
          }
          this.setTarget(tc);
          this.wanderT=M.rand(6,11);
        }
        break;
      }
      case 'investigate':{
        this.speed=3.1;
        if(this.lastKnown&&!this.targetCell){
          this.setTarget([Maps.toC(this.lastKnown.x),Maps.toR(this.lastKnown.z)]);
        }
        if(!this.lastKnown||this.reachedTarget()){
          this.state='search'; this.wanderT=M.rand(5,8); this.targetCell=null;
        }
        break;
      }
      case 'hunt':{
        this.speed=4.9;
        this.alertT-=dt;
        if(sameFloor){
          this.setTargetLive([Maps.toC(player.x),Maps.toR(player.z)],dt);
          this.lastKnown={x:player.x,z:player.z};
        } else {
          if(this.lastKnown) this.setTargetLive([Maps.toC(this.lastKnown.x),Maps.toR(this.lastKnown.z)],dt);
        }
        if(this.alertT<=0){
          this.state='search'; this.wanderT=M.rand(6,9);
          HG.Audio.setFear(.25);
        }
        break;
      }
      case 'search':{
        this.speed=2.1;
        this.wanderT-=dt;
        if(!this.targetCell||this.reachedTarget()||this.wanderT<=0){
          const base=this.lastKnown||{x:this.x,z:this.z};
          this.setTarget(this.randCellNear(Maps.toC(base.x),Maps.toR(base.z),5));
          this.wanderT=M.rand(4,7);
        }
        if(this.wanderT<=-M.rand(0,2)){ this.state='stalk'; this.lastKnown=null; }
        break;
      }
    }

    /* ---------- movement along flow field ---------- */
    this.moveAlongPath(dt);

    /* ---------- kill ---------- */
    if(sameFloor&&pd<1.25&&player.floor===this.floor){
      HG.Game.playerCaught();
    }

    /* ---------- presentation ---------- */
    this.animT+=dt*(this.speed>0?this.speed*.42:1);
    this.animate(dt,pd);
    this.syncBody();

    /* audio: steps + breath */
    if(this.speed>.2&&this.movedDist>.001){
      this.stepAccum+=this.movedDist;
      const stride=this.speed>3?1.35:1.7;
      if(this.stepAccum>stride){
        this.stepAccum=0;
        HG.Audio.play('mstep',{vol:M.clamp(1.3-pd/26,.15,1)});
      }
    }
    this.breathT=(this.breathT||0)-dt;
    if(pd<12&&(this.breathT||0)<=0){
      this.breathT=M.rand(3.5,6);
      HG.Audio.play('breath',{vol:M.clamp(1-pd/14,.1,.9)});
    }

    /* fear output */
    let fear=0;
    if(sameFloor){
      if(this.state==='hunt') fear=M.clamp(1.15-pd/20,0,1);
      else if(pd<10) fear=M.clamp(.55-pd/22,0,.55);
    }
    this.fearLevel=M.damp(this.fearLevel,fear,fear>this.fearLevel?6:1.2,dt);
    HG.Audio.setFear(Math.max(HG.Audio._fearTarget||0,this.fearLevel));
  },

  acquire(player){
    const wasHunt=this.state==='hunt';
    this.state='hunt';
    this.alertT=Math.max(this.alertT,7.5);
    this.lastKnown={x:player.x,z:player.z};
    this.targetCell=null;
    if(!wasHunt){
      HG.Audio.play('roar');
      HG.UI&&HG.UI.subtitle('[a layered chorus of voices tears the air]',3);
    }
  },

  setTarget(cell){ if(cell){ this.targetCell=cell; computeFlow(this.floor,cell[0],cell[1]); this.repathT=.5; } },
  setTargetLive(cell,dt){
    this.repathT-=dt;
    if(this.targetCell&&(this.targetCell[0]!==cell[0]||this.targetCell[1]!==cell[1])&&this.repathT<=0){
      this.setTarget(cell);
    } else if(!this.targetCell){ this.setTarget(cell); }
  },
  reachedTarget(){
    if(!this.targetCell) return true;
    return M.dist(this.x,this.z,Maps.cx(this.targetCell[0]),Maps.cz(this.targetCell[1]))<1.0;
  },
  randCellNear(cx,cy,r){
    for(let i=0;i<24;i++){
      const x=cx+Math.round(M.rand(-r,r)), y=cy+Math.round(M.rand(-r,r));
      if(x<1||y<1||x>=GW-1||y>=GH-1) continue;
      if(!HG.world.navBlocked(this.floor,x,y)) return [x,y];
    }
    return [Maps.toC(this.x),Maps.toR(this.z)];
  },
  moveAlongPath(dt){
    const ox=this.x, oz=this.z;
    if(!this.targetCell){ this.idleSway(dt); this.movedDist=0; return; }
    const ccx=Maps.toC(this.x),ccy=Maps.toR(this.z);
    const dir=flowDir(this.floor,ccx,ccy);
    let wx,wz;
    if(dir){
      wx=Maps.cx(ccx+dir[0]); wz=Maps.cz(ccy+dir[1]);
    } else {
      wx=Maps.cx(this.targetCell[0]); wz=Maps.cz(this.targetCell[1]);
    }
    const dx=wx-this.x,dz=wz-this.z,d=Math.hypot(dx,dz);
    if(d>.05){
      const vx=dx/d*this.speed,vz=dz/d*this.speed;
      let nx=M.clamp(this.x+vx*dt,CS*.4,(GW-.4)*CS);
      let nz=M.clamp(this.z+vz*dt,CS*.4,(GH-.4)*CS);
      // fine collision against props (circle)
      const solids=HG.world.querySolids(this.floor,this.x,this.z,.5);
      for(const s of solids){
        const qx=M.clamp(nx,s.x0,s.x1),qz=M.clamp(nz,s.z0,s.z1);
        const ddx=nx-qx,ddz=nz-qz,d2=ddx*ddx+ddz*ddz;
        if(d2<.45*.45&&d2>1e-8){
          const dd=Math.sqrt(d2);
          nx+=ddx/dd*(.45-dd); nz+=ddz/dd*(.45-dd);
        }
      }
      // axis-separated wall check
      if(this.wallFree(this.floor,nx,this.z)) this.x=nx;
      if(this.wallFree(this.floor,this.x,nz)) this.z=nz;
      // face movement dir
      const wantYaw=Math.atan2(dx,dz);
      this.yaw+=M.angDiff(this.yaw,wantYaw)*Math.min(1,8*dt);
    }
    this.movedDist=M.hypot? Math.hypot(this.x-ox,this.z-oz) : M.dist(this.x,this.z,ox,oz);
    // door forcing: near a closed unlocked door → slam it open
    for(const id in HG.world.doors){
      const dr=HG.world.doors[id];
      if(dr.f!==this.floor||dr.sealed||dr.open) continue;
      if(M.dist(this.x,this.z,dr.baseX,dr.baseZ)<1.6){ dr.forceOpen(); }
    }
  },
  wallFree(f,x,z){
    const c0=Maps.toC(x-.4),c1=Maps.toC(x+.4),r0=Maps.toR(z-.4),r1=Maps.toR(z+.4);
    for(let r=r0;r<=r1;r++)for(let cc=c0;cc<=c1;cc++){
      if(!Maps.isFloorCell(f,cc,r)) return false;
    }
    return true;
  },
  idleSway(dt){ this.animT+=dt*.7; },

  animate(dt,pd){
    const b=this.body;
    const t=this.animT;
    const swingAmp=this.speed>3?.95:(this.speed>.3?.55:.12);
    b.legL.rotation.x=Math.sin(t)*swingAmp*.7;
    b.legR.rotation.x=-Math.sin(t)*swingAmp*.7;
    b.armL.rotation.x=-Math.sin(t)*swingAmp*.85;
    b.armR.rotation.x=Math.sin(t)*swingAmp*.85;
    b.armL.rotation.z=.1+Math.sin(t*.5)*.05;
    b.armR.rotation.z=-.1-Math.sin(t*.5)*.05;
    // torso sway
    b.torso.rotation.z=Math.sin(t*.5)*.05;
    // head: slow tracking twitch
    this.twitchT-=dt;
    if(this.twitchT<=0){ this.twitchT=M.rand(.7,2.6); this._tw={x:M.rand(-.4,.4),y:M.rand(-.9,.9)}; }
    if(this._tw){
      b.head.rotation.x=M.damp(b.head.rotation.x,this._tw.x,4,dt);
      b.head.rotation.y=M.damp(b.head.rotation.y,this._tw.y,4,dt);
    }
    // whole-body jitter when very close
    if(pd<5&&this.state==='hunt'){
      b.g.position.x+= (Math.random()-.5)*.01;
      b.g.position.z+= (Math.random()-.5)*.01;
    }
  },
  syncBody(){
    const b=this.body.g;
    b.position.set(this.x,(this.floor===0?0:-6),this.z);
    b.rotation.y=this.yaw;
  },
};

})();
