// Player: FPS controls, AABB physics, mining/placing, inventory, survival stats.
import { CHUNK, HEIGHT, SEA, REACH } from './config.js';
import { B, BLOCKS, isOpaque, isSolid } from './blocks.js';
import { ITEMS } from './items.js';

export const GRAVITY=-27, JUMP_V=8.35;

export function collideMove(world,pos,vel,halfW,height,dt,onGroundOut){
  let onGround=false;
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(vel.x),Math.abs(vel.y),Math.abs(vel.z))*dt/0.42));
  const sdt=dt/steps;
  for(let s=0;s<steps;s++){
    let nx=pos.x+vel.x*sdt;
    if(hitTest(world,nx,pos.y,pos.z,halfW,height)){ nx=pos.x; vel.x=0; }
    pos.x=nx;
    let nz=pos.z+vel.z*sdt;
    if(hitTest(world,pos.y,pos.z=nz===nz?nz:nz,halfW,height)){}
    nz=pos.z+vel.z*sdt;
    if(hitTest(world,pos.x,pos.y,nz,halfW,height)){ nz=pos.z; vel.z=0; }
    pos.z=nz;
    let ny=pos.y+vel.y*sdt;
    if(hitTest(world,pos.x,ny,pos.z,halfW,height)){
      if(vel.y<0){ ny=Math.floor(ny)+1.0001; onGround=true;
        let guard=0;
        while(hitTest(world,pos.x,ny,pos.z,halfW,height)&&guard++<height+2)ny+=1;
        onGround=true;
      }
      vel.y=0;
    }
    pos.y=ny;
  }
  if(onGroundOut)onGroundOut.g=onGround;
  return onGround;
}

function hitTest(world,x,y,z,hw,h){
  const x0=Math.floor(x-hw),x1=Math.floor(x+hw);
  const y0=Math.floor(y),y1=Math.floor(y+h-0.001);
  const z0=Math.floor(z-hw),z1=Math.floor(z+hw);
  for(let yy=y0;yy<=y1;yy++)for(let zz=z0;zz<=z1;zz++)for(let xx=x0;xx<=x1;xx++){
    const b=BLOCKS[world.getBlock(xx,yy,zz)];
    if(b&&b.solid)return true;
  }
  return false;
}

export function bodyInBlock(world,pos,halfW,height,id){
  const x0=Math.floor(pos.x-halfW),x1=Math.floor(pos.x+halfW);
  const y0=Math.floor(pos.y),y1=Math.floor(pos.y+height-0.01);
  const z0=Math.floor(pos.z-halfW),z1=Math.floor(pos.z+halfW);
  for(let yy=y0;yy<=y1;yy++)for(let zz=z0;zz<=z1;zz++)for(let xx=x0;xx<=x1;xx++){
    if(world.getBlock(xx,yy,zz)===id)return true;
  }
  return false;
}

export class Player {
  constructor(world){
    this.world=world;
    this.pos={x:0,y:80,z:0};
    this.vel={x:0,y:0,z:0};
    this.yaw=0;this.pitch=0;
    this.onGround=false;
    this.mode='survival';
    this.flying=false;
    this.maxHp=20;this.hp=20;this.hunger=20;this.saturation=5;this.exhaustion=0;this.air=10;
    this.inv=new Array(36).fill(null);
    this.sel=0;
    this.mining=null;
    this.attackCd=0;this.placeCd=0;this.useCd=0;
    this.eating=null;
    this.hurtT=0;this.hurtFlash=0;
    this.fallStartY=null;
    this.spawnPoint=null;
    this.bobPhase=0;this.bobAmt=0;
    this.stepDist=0;
    this.dead=false;
    this.lastJumpTap=0;
    this.regenT=0;this.starveT=0;this.airT=0;this.lavaT=0;
  }

  eyePos(){
    return {x:this.pos.x,y:this.pos.y+1.62,z:this.pos.z};
  }
  lookDir(){
    const cp=Math.cos(this.pitch);
    return {x:-Math.sin(this.yaw)*cp,y:Math.sin(this.pitch),z:-Math.cos(this.yaw)*cp};
  }
  heldItem(){return this.inv[this.sel];}

  addItem(stack){
    if(!stack)return true;
    return this.give(stack.id,stack.count)>=stack.count||true;
  }
  give(id,count){
    count=count||1;
    let left=count;
    const maxS=(typeof id==='number')?64:(ITEMS[id]?ITEMS[id].stack:64);
    for(let i=0;i<36&&left>0;i++){
      const s=this.inv[i];
      if(s&&s.id===id&&typeof id!=='string'||(s&&s.id===id&&typeof id==='number')){
        const room=maxS-s.count;
        if(room>0){const take=Math.min(room,left);s.count+=take;left-=take;}
      }
    }
    for(let i=0;i<36&&left>0;i++){
      if(!this.inv[i]){
        const take=Math.min(maxS,left);
        this.inv[i]={id,count:take};
        if(typeof id==='string'&&ITEMS[id]&&ITEMS[id].durability)this.inv[i].dur=ITEMS[id].durability;
        left-=take;
      }
    }
    return count-left;
  }

  consumeHeld(n){
    n=n||1;
    const s=this.inv[this.sel];
    if(!s)return;
    s.count-=n;
    if(s.count<=0)this.inv[this.sel]=null;
  }

  damageTool(slot,amt){
    const s=this.inv[slot];
    if(!s||typeof s.id!=='string'||!ITEMS[s.id]||!ITEMS[s.id].durability)return;
    s.dur-=amt;
    if(s.dur<=0){this.inv[slot]=null;}
  }

  update(dt,input,world,game){
    this.world=world||this.world;
    const w=this.world;
    if(!w)return;
    if(this.dead)return;
    const K=input.keys;
    const inWater=bodyInBlock(w,this.pos,0.3,1.6,B.WATER);
    const inLava=bodyInBlock(w,this.pos,0.25,1.2,B.LAVA);
    const onLadder=this.onLadder();
    const headWater=w.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+1.55),Math.floor(this.pos.z))===B.WATER;

    const mdx=input.consumeMouseDX?input.consumeMouseDX():0;
    const mdy=input.consumeMouseDY?input.consumeMouseDY():0;
    if(mdx||mdy){
      const sens=0.0023*(game.settings?game.settings.sens:1);
      const invX=(game.settings&&game.settings.invertX)?-1:1;
      const invY=(game.settings&&game.settings.invertY)?-1:1;
      this.yaw-=mdx*sens*invX;
      this.pitch-=mdy*sens*invY;
      const L=Math.PI/2-0.001;
      this.pitch=Math.max(-L,Math.min(L,this.pitch));
      if(this.yaw>Math.PI)this.yaw-=Math.PI*2;
      if(this.yaw<-Math.PI)this.yaw+=Math.PI*2;
    }

    let mx=0,mz=0;
    if(K['KeyW'])mz-=1;
    if(K['KeyS'])mz+=1;
    if(K['KeyA'])mx-=1;
    if(K['KeyD'])mx+=1;
    const len=Math.hypot(mx,mz)||1;
    mx/=len;mz/=len;
    const wantSprint=(K['ShiftLeft']||K['ShiftRight'])&&mz<0&&!inWater;
    this.sprinting=wantSprint&&this.hunger>6;
    if(this.sprinting)this.exhaustion+=dt*0.6;

    let speed=this.mode==='creative'&&this.flying?(this.sprinting?21:10.5):(this.sprinting?5.6:4.32);
    if(inWater&&!this.flying)speed*=0.55;
    if(onLadder)speed*=0.85;
    const slip=this.standingOn()===B.ICE?0.06:1;
    const sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
    const tx=(-sy*-mz+ -cy*mx)*speed;
    const tz=(-cy*-mz-(-sy)*mx)*speed;
    void tx;void tz;
    const fwdX=-Math.sin(this.yaw),fwdZ=-Math.cos(this.yaw);
    const rightX=-fwdZ,rightZ=fwdX;
    const tvx=(fwdX*-mz+rightX*mx)*speed;
    const tvz=(fwdZ*-mz+rightZ*mx)*speed;

    const accel=this.onGround||this.flying?14:4;
    const fric=this.flying?6:(this.onGround?(slip<1?1.2:13):1.6);
    this.vel.x+=(tvx-this.vel.x)*Math.min(1,accel*dt)*(slip<1?slip*8:1);
    if(Math.abs(tvx)<0.01)this.vel.x*= Math.pow(0.5,fric*dt*(slip<1?0.4:1));
    this.vel.z+=(tvz-this.vel.z)*Math.min(1,accel*dt)*(slip<1?slip*8:1);
    if(Math.abs(tvz)<0.01)this.vel.z*=Math.pow(0.5,fric*dt*(slip<1?0.4:1));

    if(this.flying){
      let vy=0;
      if(K['Space'])vy=speed*0.8;
      if(K['KeyC'])vy=-speed*0.8;
      this.vel.y+=(vy-this.vel.y)*Math.min(1,10*dt);
    } else if(inWater){
      this.vel.y+=GRAVITY*0.28*dt;
      this.vel.y*=Math.pow(0.4,dt);
      if(K['Space'])this.vel.y=Math.min(this.vel.y+22*dt,3.6);
      this.fallStartY=null;
    } else if(onLadder){
      this.vel.y=K['Space']?3.2:(K['ShiftLeft']?-3.2:0);
      this.fallStartY=null;
    } else {
      this.vel.y+=GRAVITY*dt;
      if(this.vel.y<-56)this.vel.y=-56;
      if(K['Space']&&this.onGround){
        this.vel.y=JUMP_V;
        this.exhaustion+=0.08;
        if(game.audio)game.audio.play('step',this.standingOn());
      }
    }

    const wasV=this.vel.y;
    const g={};
    collideMove(this.world,this.pos,this.vel,0.3,1.8,dt,g);
    this.onGround=g.g;

    if(!this.flying&&!inWater){
      if(!this.onGround&&this.vel.y<0&&this.fallStartY===null)this.fallStartY=this.pos.y-wasV*dt*0;
      if(this.fallStartY===null&&!this.onGround)this.fallStartY=this.pos.y;
      if(this.onGround&&this.fallStartY!==null){
        const d=this.fallStartY-this.pos.y;
        if(d>3.6&&this.mode==='survival'){
          this.applyDamage(Math.floor(d-3.2));
          if(game.audio)game.audio.play('fall');
        }
        this.fallStartY=null;
      }
    }

    const hspd=Math.hypot(this.vel.x,this.vel.z);
    this.stepDist+=hspd*dt;
    if(this.onGround&&this.stepDist>(this.sprinting?2.2:2.9)){
      this.stepDist=0;
      if(game.audio)game.audio.play('step',this.standingOn());
    }
    this.bobPhase+=hspd*dt*1.6;
    this.bobAmt+=((this.onGround?Math.min(1,hspd/4):0)-this.bobAmt)*Math.min(1,10*dt);
    if(hspd>0.5&&this.mode!=='creative')this.exhaustion+=dt*(this.sprinting?0.11:0.02);

    if(inLava&&this.mode==='survival'){
      this.lavaT+=dt;
      if(this.lavaT>0.35){this.lavaT=0;this.applyDamage(4);}
    } else this.lavaT=0;
    if(headWater){
      this.airT+=dt;
      if(this.airT>1){this.airT=0;this.air-=1;if(this.air<0){this.air=0;this.applyDamage(2);}}
    } else this.air=Math.min(10,this.air+dt*4);

    if(this.mode==='survival'){
      if(this.hunger>=18&&this.hp<20){
        this.regenT+=dt;
        if(this.regenT>1.6){this.regenT=0;this.hp=Math.min(20,this.hp+1);this.exhaustion+=1.2;}
      } else if(this.hunger<=0){
        this.starveT+=dt;
        if(this.starveT>2.2){this.starveT=0;if(this.hp>1)this.applyDamage(1);}
      }
      if(this.exhaustion>=4){
        this.exhaustion-=4;
        if(this.saturation>0)this.saturation--;
        else if(this.hunger>0)this.hunger--;
      }
    }

    this.hurtT=Math.max(0,this.hurtT-dt);
    this.hurtFlash=Math.max(0,this.hurtFlash-dt*2.4);
    this.attackCd=Math.max(0,this.attackCd-dt);
    this.placeCd=Math.max(0,this.placeCd-dt);

    if(this.eating){
      this.eating.t+=dt;
      if(game.audio&&Math.random()<dt*7)game.audio.play('eat');
      if(this.eating.t>1.35){
        const it=ITEMS[this.eating.id];
        if(it&&it.food){
          this.hunger=Math.min(20,this.hunger+it.food);
          this.saturation=Math.min(this.hunger,this.saturation+it.food*0.6);
        }
        this.consumeHeld(1);
        this.eating=null;
      }
    }

    if(this.pos.y<-24){this.applyDamage(6);}

    if((input.mouse?input.mouse.left:input.left)&&game.state==='play')this.tryMineOrAttack(dt,game,true);
    if((input.mouse?input.mouse.right:input.right)&&game.state==='play')this.tryUse(dt,game,true);
  }

  standingOn(){
    const w=this.world;
    if(!w)return B.AIR;
    const bids=[w.getBlock(Math.floor(this.pos.x-0.25),Math.floor(this.pos.y-0.08),Math.floor(this.pos.z-0.25)),
                w.getBlock(Math.floor(this.pos.x+0.25),Math.floor(this.pos.y-0.08),Math.floor(this.pos.z-0.25)),
                w.getBlock(Math.floor(this.pos.x-0.25),Math.floor(this.pos.y-0.08),Math.floor(this.pos.z+0.25)),
                w.getBlock(Math.floor(this.pos.x+0.25),Math.floor(this.pos.y-0.08),Math.floor(this.pos.z+0.25))];
    for(const b of bids)if(isSolid(b))return b;
    return B.AIR;
  }
  onLadder(){
    const w=this.world;
    if(!w)return false;
    for(let dy=0;dy<2;dy++){
      if(w.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y)+dy,Math.floor(this.pos.z))===B.LADDER)return true;
    }
    return false;
  }

  raycastTarget(game){
    const w=game?game.world:this.world;
    const e=this.eyePos(),d=this.lookDir();
    return w.raycast(e.x,e.y,e.z,d.x,d.y,d.z,REACH);
  }

  tryMineOrAttack(dt,game,hold){
    const mob=this.pickMob(game);
    if(mob&&this.attackCd<=0){
      this.attackMob(mob,game);
      this.swingArm(game);
      return;
    }
    const hit=this.raycastTarget(game);
    if(!hit){this.mining=null;return;}
    const def=BLOCKS[hit.id];
    if(def.hard<0){this.mining=null;return;}
    if(hit.id===B.TNT){game.igniteTNT(hit.x,hit.y,hit.z);return;}
    if(!this.mining||this.mining.x!==hit.x||this.mining.y!==hit.y||this.mining.z!==hit.z){
      this.mining={x:hit.x,y:hit.y,z:hit.z,id:hit.id,progress:0};
    }
    const held=this.heldItem();
    const it=held&&typeof held.id==='string'?ITEMS[held.id]:null;
    let mult=1;
    if(it&&it.tool&&it.toolType===def.tool)mult=it.speed;
    const properTool=!def.tool||(it&&it.tool&&it.toolType===def.tool&&it.tier>=def.tier);
    let secs;
    if(properTool)secs=def.hard*1.5/mult;
    else secs=def.hard*1.5/(it&&it.tool?it.speed*0.35:0.62);
    if(this.mode==='creative')secs=0.03;
    this.mining.progress+=dt/Math.max(0.04,secs);
    if(Math.random()<dt*8&&game.audio)game.audio.play('dig',hit.id);
    if(Math.random()<dt*9)game.entities.burst(hit.x+0.5,hit.y+0.5,hit.z+0.5,hit.id,2);
    game.renderer.setCrackStage(Math.min(3,Math.floor(this.mining.progress*4)));
    game.renderer.crackMesh.visible=true;
    game.renderer.crackMesh.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
    if(this.mining.progress>=1){
      const dropOk=properTool||!def.tool;
      this.breakBlock(hit.x,hit.y,hit.z,dropOk,game);
      if(held&&(it&&it.tool&&(it.toolType===def.tool||def.hard>0.5)))this.damageTool(this.sel,1);
      this.exhaustion+=0.02;
      this.mining=null;
      game.renderer.crackMesh.visible=false;
    }
  }

  breakBlock(x,y,z,dropOk,game){
    const w=this.world;
    const id=w.getBlock(x,y,z);
    if(id===B.AIR)return;
    const def=BLOCKS[id];
    this.world.setBlock(x,y,z,B.AIR,{record:true});
    game.entities.burst(x+0.5,y+0.5,z+0.5,id,14);
    if(game.audio)game.audio.play('break',id);
    if(dropOk&&this.mode==='survival'){
      let dropId=def.drop;
      if(typeof dropId==='string'){game.dropItem(x+0.5,y+0.4,z+0.5,dropId,1);}
      else if(dropId>=0){game.dropItem(x+0.5,y+0.4,z+0.5,dropId,1);}
      if(def.extraDrop)game.dropItem(x+0.5,y+0.4,z+0.5,def.extraDrop,1+(Math.random()<0.5?1:0));
      if((id===B.LEAVES)&&Math.random()<0.06)game.dropItem(x+0.5,y+0.4,z+0.5,'apple',1);
      if((id===B.LEAVES||id===B.BIRCH_LEAVES)&&Math.random()<0.10)game.dropItem(x+0.5,y+0.4,z+0.5,'sapling_item',1);
      if(id===B.GRAVEL&&Math.random()<0.15)void 0;
    }
    if(id===B.CHEST||id===B.FURNACE||id===B.FURNACE_LIT)game.spillContainer(x,y,z);
    if(id===B.WHEAT2)game.dropItem(x+0.5,y+0.4,z+0.5,'seeds',1);
  }

  attackMob(mob,game){
    if(this.attackCd>0)return;
    this.attackCd=0.45;
    const held=this.heldItem();
    const it=held&&typeof held.id==='string'?ITEMS[held.id]:null;
    let dmg=1;
    if(it&&it.dmg)dmg=it.dmg;
    if(this.mode==='creative')dmg=12;
    const dx=mob.pos.x-this.pos.x,dz=mob.pos.z-this.pos.z;
    const dl=Math.hypot(dx,dz)||1;
    mob.hurt(dmg,dx/dl*7,4.2,dz/dl*7);
    if(it&&it.toolType==='sword')this.damageTool(this.sel,1);
    else if(it&&it.tool)this.damageTool(this.sel,2);
    if(game.audio)game.audio.play('hit');
    this.exhaustion+=0.1;
  }

  pickMob(game){
    const e=this.eyePos(),d=this.lookDir();
    let best=null,bestD=3.4;
    for(const m of game.entities.mobs){
      if(m.dead)continue;
      const cx=m.pos.x-e.x,cy=(m.pos.y+m.def.h/2)-e.y,cz=m.pos.z-e.z;
      const proj=cx*d.x+cy*d.y+cz*d.z;
      if(proj<0||proj>3.4)continue;
      const px=e.x+d.x*proj,py=e.y+d.y*proj,pz=e.z+d.z*proj;
      const dd=Math.hypot(m.pos.x-px,(m.pos.y+m.def.h*0.5)-py,m.pos.z-pz);
      if(dd<m.def.w*0.9+0.35&&proj<bestD+1){best=m;bestD=proj;}
    }
    return best;
  }

  swingArm(game){
    game.ui&&game.ui.swing();
  }

  tryUse(dt,game,hold){
    if(this.eating)return;
    const hit=this.raycastTarget(game);
    const held=this.heldItem();

    if(hit&&!this.useHeld){
      const def=BLOCKS[hit.id];
      if(def.interact){
        if(this.placeCd<=0){
          this.placeCd=0.28;
          game.openInteraction(def.interact,hit);
        }
        return;
      }
    }

    if(held&&typeof held.id==='string'&&ITEMS[held.id]){
      const it=ITEMS[held.id];
      if(it.food){
        if((this.hunger<19.5||this.mode==='creative')&&!this.eating){
          this.eating={id:held.id,t:0};
          this.swingArm(game);
        }
        return;
      }
      if(it.places!==undefined&&it.plant){
        if(hit&&this.placeCd<=0){this.placeSeed(hit,it,game);this.placeCd=0.22;}
        return;
      }
    }

    if(held&&typeof held.id==='number'&&hit&&this.placeCd<=0){
      this.placeBlock(hit,held.id,game);
      this.placeCd=0.21;
      return;
    }
  }

  placeSeed(hit,it,game){
    const w=this.world;
    const x=hit.x+hit.face[0],y=hit.y+hit.face[1],z=hit.z+hit.face[2];
    if(w.getBlock(hit.x,hit.y,hit.z)!==it.on)return;
    if(w.getBlock(x,y,z)!==B.AIR)return;
    this.world.setBlock(x,y,z,it.plant,{record:true});
    this.consumeHeld(1);
    if(game.audio)game.audio.play('place',it.plant);
  }

  placeBlock(hit,id,game){
    const w=this.world;
    const x=hit.x+hit.face[0],y=hit.y+hit.face[1],z=hit.z+hit.face[2];
    if(y<1||y>=HEIGHT)return;
    const cur=w.getBlock(x,y,z);
    if(cur!==B.AIR&&cur!==B.WATER&&!(BLOCKS[cur]&&BLOCKS[cur].cross))return;
    const def=BLOCKS[id];
    if((def.cross||id===B.TORCH)&&!isSolid(w.getBlock(x,y-1,z)))return;
    if(id===B.TORCH&&!isOpaque(w.getBlock(x,y-1,z)))return;
    if(def.solid){
      const px={x:x+0.5,y:y,z:z+0.5};
      if(Math.abs(px.x-this.pos.x)<0.8&&Math.abs(px.z-this.pos.z)<0.8&&px.y+1>this.pos.y&&px.y<this.pos.y+1.8)return;
      for(const m of game.entities.mobs){
        if(Math.abs(px.x-m.pos.x)<m.def.w/2+0.5&&Math.abs(px.z-m.pos.z)<m.def.w/2+0.5&&px.y+1>m.pos.y&&px.y<m.pos.y+m.def.h)return;
      }
    }
    if(id===B.LADDER){
      const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
      let f=0;
      for(let i=0;i<4;i++){
        if(isSolid(w.getBlock(x+dirs[i][0],y,z+dirs[i][1]))){f=i;break;}
      }
      this.world.meta.set(x+','+y+','+z,{f});
    }
    if(def.facing){
      const f=faceToF(hit.face);
      this.world.meta.set(x+','+y+','+z,{f});
    }
    this.world.setBlock(x,y,z,id,{record:true});
    this.consumeHeld(1);
    if(game.audio)game.audio.play('place',id);
    this.swingArm(game);
    if(id===B.LEVER_OFF||id===B.LEVER_ON||id===B.WIRE||id===B.LAMP_OFF||id===B.LAMP_ON)game.world.queueCircuit&&game.world.queueCircuit(x,y,z);
  }


  damage(n,kx,ky,kz,onDeath){
    this.applyDamage(n);
    if(kx||kz){this.vel.x+=kx*6;this.vel.z+=kz*6;this.vel.y+=3.5;}
    if(this.dead&&onDeath)onDeath();
  }
  applyDamage(n){
    if(this.mode==='creative'||this.dead)return;
    n=Math.round(n);
    if(n<=0)return;
    this.hp-=n;
    this.hurtFlash=1;
    this.hurtT=0.4;
    if(window.__game)window.__game.audio&&window.__game.audio.play('hurt');
    if(this.hp<=0){
      this.hp=0;
      this.dead=true;
      if(window.__game)window.__game.onPlayerDeath();
    }
  }



  serialize(){
    return {
      pos:[this.pos.x,this.pos.y,this.pos.z],
      yaw:this.yaw,pitch:this.pitch,
      hp:this.hp,hunger:this.hunger,air:this.air,
      sel:this.sel,mode:this.mode,
      spawn:[this.spawnPoint.x,this.spawnPoint.y,this.spawnPoint.z],
      bedSpawn:this.bedSpawn?[this.bedSpawn.x,this.bedSpawn.y,this.bedSpawn.z]:null,
      inv:this.inv.map(s=>s?[s.id,s.count,s.dur]:null),
      flying:!!this.flying,
    };
  }
  deserialize(d){
    if(!d)return;
    this.pos={x:d.pos[0],y:d.pos[1],z:d.pos[2]};
    this.yaw=d.yaw||0;this.pitch=d.pitch||0;
    this.hp=Math.max(1,d.hp??20);this.hunger=d.hunger??20;this.air=d.air??10;
    this.sel=d.sel|0;this.mode=d.mode||'survival';
    if(d.spawn)this.spawnPoint={x:d.spawn[0],y:d.spawn[1],z:d.spawn[2]};
    if(d.bedSpawn)this.bedSpawn={x:d.bedSpawn[0],y:d.bedSpawn[1],z:d.bedSpawn[2]};
    this.inv=d.inv.map(s=>s?{id:s[0],count:s[1],...(s[2]!==undefined?{dur:s[2]}:{})}:null);
    this.flying=!!d.flying;
  }
}


function faceToF(face){
  if(face[2]===1)return 0;
  if(face[2]===-1)return 1;
  if(face[0]===-1)return 2;
  return 3;

}
