// Mobs, item drops, particles, TNT. All dynamic scene objects.
import * as THREE from '../vendor/three.module.js';
import { B, BLOCKS } from './blocks.js';
import { ITEMS } from './items.js';

const GRAV=-26;

export class EntityManager {
  constructor(game){
    this.game=game;
    this.mobs=[];
    this.items=[];
    this.particles=[];
    this.tnt=[];
    this.spawnT=0;
    this._geoCache=new Map();
  }

  boxGeo(w,h,d,colTop,colSide,colBot){
    const key=w+'_'+h+'_'+d+colTop+colSide+colBot;
    if(this._geoCache.has(key))return this._geoCache.get(key);
    const g=new THREE.BoxGeometry(w,h,d);
    const colors=new Float32Array(g.attributes.position.count*3);
    const n=g.attributes.normal;
    for(let i=0;i<n.count;i++){
      let c=colSide;
      if(n.getY(i)>0.5)c=colTop; else if(n.getY(i)<-0.5)c=colBot;
      colors[i*3]=c[0];colors[i*3+1]=c[1];colors[i*3+2]=c[2];
    }
    g.setAttribute('aCol',new THREE.BufferAttribute(colors,3));
    this._geoCache.set(key,g);
    return g;
  }

  spawnMob(type,x,y,z){
    const def=MOB_DEFS[type];
    if(!def)return null;
    const mesh=new THREE.Group();
    const mat=this.game.renderer.entityMaterial();
    const parts=[];
    for(const p of def.parts){
      const geo=this.boxGeo(p.size[0],p.size[1],p.size[2],p.top||p.col,p.col,p.col);
      const m=new THREE.Mesh(geo,mat);
      m.position.set(p.pos[0],p.pos[1],p.pos[2]);
      mesh.add(m);
      parts.push({mesh:m,pivot:p.pivot});
    }
    mesh.position.set(x,y,z);
    this.game.renderer.scene.add(mesh);
    const mob={
      type,def,mesh,parts,mat,
      pos:new THREE.Vector3(x,y,z),vel:new THREE.Vector3(),
      yaw:Math.random()*Math.PI*2,hp:def.hp,
      onGround:false,wanderT:0,wx:0,wz:0,
      hurtT:0,dieT:0,fuse:-1,burnT:0,attackCd:0,soundT:Math.random()*8,
      legPhase:0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnItem(x,y,z,id,count,dur,vx,vy,vz){
    let mesh;
    if(typeof id==='number'&&BLOCKS[id]&&!BLOCKS[id].cross){
      const geo=this.game.renderer.blockPreviewGeometry(id);
      mesh=new THREE.Mesh(geo,this.game.renderer.matSolid);
      void dur;
    } else {
      const iconKey=id==='sapling_item'?'block:'+B.SAPLING:id;
      let ic2=this.game.iconImgs&&this.game.iconImgs[iconKey];
      if(!ic2||!ic2.complete){const c=document.createElement('canvas');c.width=c.height=16;ic2=c;}
      const mat=this.game.renderer.spriteMaterial(ic2);
      mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.36,0.36),mat);
    }
    mesh.position.set(x,y,z);
    this.game.renderer.scene.add(mesh);
    const it={id,count,mesh,pos:new THREE.Vector3(x,y,z),
      vel:new THREE.Vector3(vx!==undefined?vx:(Math.random()-0.5)*2.4,vy!==undefined?vy:3.2,vz!==undefined?vz:(Math.random()-0.5)*2.4),
      age:0,pickupDelay:0.6};
    if(dur!==undefined)it.dur=dur;
    this.items.push(it);
    return it;
  }

  burst(x,y,z,color,n=14,spd=3.2,life=0.7,size=7){
    for(let i=0;i<n;i++){
      this.particles.push({
        x:x+(Math.random()-0.5)*0.6,y:y+(Math.random()-0.5)*0.6,z:z+(Math.random()-0.5)*0.6,
        vx:(Math.random()-0.5)*spd,vy:Math.random()*spd*0.9,vz:(Math.random()-0.5)*spd,
        life:life*(0.6+Math.random()*0.7),maxLife:life,size:size*(0.6+Math.random()*0.8),
        col:[color[0]*(0.75+Math.random()*0.5),color[1]*(0.75+Math.random()*0.5),color[2]*(0.75+Math.random()*0.5)],
        grav:12
      });
    }
  }

  blockColor(id){
    switch(id){
      case B.GRASS:return [0.45,0.65,0.3];
      case B.DIRT:return [0.47,0.33,0.23];
      case B.STONE:case B.COBBLE:case B.MOSSY:return [0.5,0.5,0.52];
      case B.SAND:return [0.85,0.8,0.62];
      case B.LOG:case B.PLANKS:return [0.55,0.42,0.25];
      case B.LEAVES:return [0.28,0.55,0.2];
      case B.WATER:return [0.3,0.55,0.9];
      case B.LAVA:return [1.0,0.5,0.15];
      default:{
        const t=TILE_AVG.get(id);
        return t||[0.6,0.6,0.6];
      }
    }
  }

  igniteTNT(x,y,z,fuse=2.2){
    this.game.world.setBlock(x,y,z,B.AIR,{record:true});
    const mesh=new THREE.Mesh(this.boxGeo(0.98,0.98,0.98,[0.7,0.2,0.15],[0.72,0.22,0.16],[0.7,0.2,0.15]),this.game.renderer.entityMatBase?this.game.renderer.entityMaterial():this.game.renderer.entityMaterial());
    mesh.position.set(x+0.5,y+0.49,z+0.5);
    this.game.renderer.scene.add(mesh);
    this.tnt.push({x:x+0.5,y:y+0.49,z:z+0.5,mesh,t:fuse});
  }

  explodeAt(x,y,z,radius){
    const w=this.game.world;
    w.explode(x,y,z,radius,(ex,ey,ez,r)=>{
      const hurt=(e)=>{
        const d=Math.hypot(e.pos.x-ex,e.pos.y-ey,e.pos.z-ez);
        if(d<r*1.35)e.hurt(Math.round(20*(1-d/(r*1.35))),(e.pos.x-ex)/(d||1),(e.pos.z-ez)/(d||1));
      };
      for(const m of this.mobs)if(!m.dead)hurt(m);
      const pl=this.game.player;
      const d=Math.hypot(pl.pos.x-ex,pl.pos.y+0.9-ey,pl.pos.z-ez);
      if(d<r*1.35)pl.damage(Math.round(17*(1-d/(r*1.35))),(pl.pos.x-ex)/(d||1),(pl.pos.z-ez)/(d||1),()=>this.game.onPlayerDeath('was blown up'));
    });
    for(let i=0;i<40;i++){
      this.particles.push({
        x:x+(Math.random()-0.5)*r,y:y+(Math.random()-0.5)*r,z:z+(Math.random()-0.5)*r,
        vx:(Math.random()-0.5)*9,vy:Math.random()*9,vz:(Math.random()-0.5)*9,
        life:0.5+Math.random()*0.6,maxLife:1,size:11+Math.random()*10,
        col:Math.random()<0.5?[0.35,0.33,0.31]:[1,0.75,0.3],grav:6
      });
    }
    if(this.game.audio)this.game.audio.play('explode');
  }

  update(dt){
    const game=this.game,world=game.world,player=game.player;

    for(let i=this.tnt.length-1;i>=0;i--){
      const t=this.tnt[i];
      t.t-=dt;
      t.mesh.scale.setScalar(1+Math.sin(t.t*18)*0.06);
      t.mesh.material.uniforms.uFlash.value=(Math.sin(t.t*24)>0)?0.8:0;
      t.mesh.material.uniforms.uLightMul.value=1.6;
      if(t.t<=0){
        game.renderer.scene.remove(t.mesh);
        this.tnt.splice(i,1);
        this.explodeAt(t.x,t.y,t.z,4.2);
      }
    }

    for(let i=this.mobs.length-1;i>=0;i--){
      const m=this.mobs[i];
      if(m.dieT>0){
        m.dieT-=dt;
        m.mesh.rotation.z=Math.min(Math.PI/2,(1-m.dieT/0.4)*Math.PI/2);
        m.mesh.scale.multiplyScalar(Math.max(0.05,1-dt*1.4));
        if(m.dieT<=0){
          game.renderer.scene.remove(m.mesh);
          this.mobs.splice(i,1);
        }
        continue;
      }
      const distP=m.pos.distanceTo(new THREE.Vector3(player.pos.x,player.pos.y,player.pos.z));
      if(distP>90||(m.def.hostile&&game.isDay()&&m.type!=='creeper'&&distP>34)){
        game.renderer.scene.remove(m.mesh);this.mobs.splice(i,1);continue;
      }
      m.soundT-=dt;
      if(m.soundT<=0&&distP<20&&game.audio){
        m.soundT=5+Math.random()*9;
        game.audio.mob(m.type,distP);
      }

      m.attackCd=Math.max(0,m.attackCd-dt);
      m.hurtT=Math.max(0,m.hurtT-dt);

      if(m.def.hostile&&distP<m.def.range&&!(player.mode==='creative')){
        const dx=player.pos.x-m.pos.x,dz=player.pos.z-m.pos.z;
        const dl=Math.hypot(dx,dz)||1;
        m.wx=dx/dl;m.wz=dz/dl;
        m.yaw=Math.atan2(dx,dz);
        if(m.type==='creeper'){
          if(distP<2.6){
            if(m.fuse<0){m.fuse=1.5;if(game.audio)game.audio.play('fuse');}
          } else if(distP>6)m.fuse=-1;
          if(m.fuse>=0){
            m.fuse-=dt;
            m.wx=0;m.wz=0;
            if(m.fuse<=0){
              game.renderer.scene.remove(m.mesh);this.mobs.splice(i,1);
              this.explodeAt(m.pos.x,m.pos.y+0.6,m.pos.z,3.4);
              continue;
            }
          }
        } else if(distP<1.7&&m.attackCd<=0&&Math.abs(player.pos.y-m.pos.y)<2){
          m.attackCd=1.1;
          player.damage(m.def.dmg,dx/dl,0,dz/dl,()=>game.onPlayerDeath('was slain by a '+m.def.label));
          if(game.audio)game.audio.play('hit');
        }
      } else {
        m.wanderT-=dt;
        if(m.wanderT<=0){
          m.wanderT=2+Math.random()*4;
          if(Math.random()<0.6){const a=Math.random()*Math.PI*2;m.wx=Math.sin(a);m.wz=Math.cos(a);}
          else{m.wx=0;m.wz=0;}
        }
        if(m.wx||m.wz)m.yaw=Math.atan2(m.wx,m.wz);
      }

      const spd=m.def.speed*(m.fuse>=0?0:1)*(m.hurtT>0?0.5:1);
      m.vel.x+=(m.wx*spd-m.vel.x)*Math.min(1,8*dt);
      m.vel.z+=(m.wz*spd-m.vel.z)*Math.min(1,8*dt);

      const feetId=world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y+0.1),Math.floor(m.pos.z));
      const inWater=(feetId===B.WATER);
      if(inWater){
        m.vel.y+=(1.6-m.vel.y)*Math.min(1,4*dt);
      } else {
        m.vel.y+=GRAV*dt;
        m.vel.y=Math.max(m.vel.y,-50);
      }

      this.moveMob(world,m,dt);

      const ahead=world.getBlock(Math.floor(m.pos.x+m.wx*0.7),Math.floor(m.pos.y+0.2),Math.floor(m.pos.z+m.wz*0.7));
      const aheadUp=world.getBlock(Math.floor(m.pos.x+m.wx*0.7),Math.floor(m.pos.y+1.2),Math.floor(m.pos.z+m.wz*0.7));
      if((ahead!==B.AIR&&BLOCKS[ahead]&&BLOCKS[ahead].solid)&&(!BLOCKS[aheadUp]||!BLOCKS[aheadUp].solid)&&m.onGround&&(m.wx||m.wz)){
        m.vel.y=7.2;
      }

      if(m.def.burns&&game.isDay()&&world.skyAt(Math.floor(m.pos.x),Math.floor(m.pos.y+1),Math.floor(m.pos.z))>13){
        m.burnT+=dt;
        if(Math.random()<dt*8)this.particles.push({x:m.pos.x,y:m.pos.y+1.4,z:m.pos.z,vx:(Math.random()-0.5),vy:2+Math.random()*2,vz:(Math.random()-0.5),life:0.4,maxLife:0.4,size:8,col:[1,0.6,0.15],grav:-4});
        if(m.burnT>1){m.burnT=0;this.hurtMob(m,2);}
      }

      m.legPhase+=dt*Math.hypot(m.vel.x,m.vel.z)*3.4;
      m.mesh.position.copy(m.pos);
      m.mesh.rotation.y=m.yaw;
      const sw=Math.sin(m.legPhase*4)*Math.min(1,Math.hypot(m.vel.x,m.vel.z))*0.6;
      for(const p of m.parts){
        if(p.pivot)p.mesh.rotation.x=p.pivot==='leg'?sw:(p.pivot==='leg2'?-sw:(p.pivot==='arm'?-1.2+Math.sin(m.legPhase*2)*0.12:-p.pivot==='leg'?0:0));
        if(p.pivot==='arm'){p.mesh.rotation.x=-1.25;}
      }
      const lm=Math.pow(world.lightLevelAt(m.pos.x,m.pos.y+1,m.pos.z),0.8);
      m.mat.uniforms.uLightMul.value=0.25+lm*0.95;
      m.mesh.scale.setScalar(m.fuse>=0?1+(1.5-m.fuse)*0.14*(Math.sin(m.fuse*30)>0?1:0.6):1);
    }

    for(let i=this.items.length-1;i>=0;i--){
      const it=this.items[i];
      it.age+=dt;
      it.pickupDelay-=dt;
      it.vel.y+=GRAV*dt*0.85;
      it.vel.x*=Math.pow(0.02,dt);it.vel.z*=Math.pow(0.02,dt);
      const nx=it.pos.x+it.vel.x*dt,ny=it.pos.y+it.vel.y*dt,nz=it.pos.z+it.vel.z*dt;
      const below=world.getBlock(Math.floor(nx),Math.floor(ny-0.14),Math.floor(nz));
      if(BLOCKS[below]&&BLOCKS[below].solid&&it.vel.y<0){
        it.pos.y=Math.floor(ny-0.14)+1.14;
        it.vel.y=0;
      } else it.pos.set(nx,ny,nz);
      if(it.pos.y<-10){game.renderer.scene.remove(it.mesh);this.items.splice(i,1);continue;}

      const ep=player.eyePos();
      const dxp=it.pos.x-ep.x, dyp=it.pos.y-(ep.y-0.8), dzp=it.pos.z-ep.z;
      const dp=Math.sqrt(dxp*dxp+dyp*dyp+dzp*dzp);
      if(it.pickupDelay<=0&&dp<2.2&&it.age>0.5){
        const dir=new THREE.Vector3(player.pos.x,it.pos.y,player.pos.z).setY(player.pos.y+1).sub(it.pos).normalize();
        it.vel.addScaledVector(dir,dt*38);
        it.pos.addScaledVector(dir,dt*Math.max(0,(2.2-dp))*3);
      }
      if(it.pickupDelay<=0&&dp<1.1&&it.age>0.4){
        const stack={id:it.id,count:it.count};
        if(player.addItem(stack)){
          if(game.audio)game.audio.play('pop');
          game.ui.dirtyHotbar=true;
          game.renderer.scene.remove(it.mesh);
          this.items.splice(i,1);
          continue;
        }
      }
      if(it.age>300){game.renderer.scene.remove(it.mesh);this.items.splice(i,1);continue;}

      it.mesh.position.set(it.pos.x,it.pos.y+Math.sin(it.age*2.4)*0.07,it.pos.z);
      it.mesh.rotation.y=it.age*1.6;
      const nearL=Math.pow(world.lightLevelAt(it.pos.x,it.pos.y+0.5,it.pos.z),0.8);
      if(it.mesh.material.uniforms&&it.mesh.material.uniforms.uLightMul)it.mesh.material.uniforms.uLightMul.value=0.3+nearL;
    }

    this.updateParticles(dt);
    this.trySpawn(dt);
  }

  moveMob(world,m,dt){
    const steps=2,sdt=dt/steps;
    for(let s=0;s<steps;s++){
      const halfW=m.def.hw,hgt=m.def.hgt;
      const tryMove=(axis,delta)=>{
        m.pos[axis]+=delta;
        const x0=Math.floor(m.pos.x-halfW),x1=Math.floor(m.pos.x+halfW);
        const y0=Math.floor(m.pos.y),y1=Math.floor(m.pos.y+hgt);
        const z0=Math.floor(m.pos.z-halfW),z1=Math.floor(m.pos.z+halfW);
        for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
          const id=world.getBlock(x,y,z);
          if(id===B.AIR)continue;
          const def=BLOCKS[id];
          if(!def||!def.solid)continue;
          if(axis==='y'){
            if(delta<0){m.pos.y=y0+1+1e-4;m.onGround=true;}else m.pos.y=y1-hgt-1e-4;
            m.vel.y=0;
          } else {
            if(delta>0)m.pos[axis]=Math.ceil(m.pos[axis]+halfW)-halfW-1e-4;
            else m.pos[axis]=Math.floor(m.pos[axis]-halfW)+1+halfW+1e-4;
            m.vel[axis]=0;
          }
          return;
        }
        if(axis==='y'&&delta<0)m.onGround=false;
      };
      tryMove('x',m.vel.x*sdt);
      tryMove('z',m.vel.z*sdt);
      tryMove('y',m.vel.y*sdt);
    }
  }

  hurtMob(m,dmg,kx,kz){
    if(m.dieT>0)return;
    m.hp-=dmg;
    m.hurtT=0.4;
    if(kx!==undefined){m.vel.x+=kx*6;m.vel.z+=kz*6;m.vel.y=Math.max(m.vel.y,3);}
    if(this.game.audio)this.game.audio.play(m.def.hostile?'mobhurt':'hitanimal');
    if(m.hp<=0){
      m.dieT=0.4;
      for(const d of m.def.drops){
        if(Math.random()<d.chance)
          this.spawnItem(m.pos.x,m.pos.y+0.5,m.pos.z,d.id,d.count[0]+Math.floor(Math.random()*(d.count[1]-d.count[0]+1)));
      }
      this.burst(m.pos.x,m.pos.y+0.6,m.pos.z,[0.75,0.2,0.2],10,2.4,0.5,5);
    }
  }

  updateParticles(dt){
    const ps=this.particles;
    for(let i=ps.length-1;i>=0;i--){
      const p=ps[i];
      p.life-=dt;
      if(p.life<=0){ps.splice(i,1);continue;}
      p.vy-=p.grav*dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    }
    if(ps.length>this.maxParticles){
      ps.splice(0,ps.length-this.maxParticles);
    }
  }
  get maxParticles(){return 900;}

  syncParticles(){
    const ps=this.particles;
    const n=Math.min(ps.length,this.maxParticles);
    const cap=1200;
    if(!this.pGeo){
      this.pGeo=new THREE.BufferGeometry();
      this.pPos=new Float32Array(cap*3);
      this.pCol=new Float32Array(cap*3);
      this.pDat=new Float32Array(cap*2);
      this.pGeo.setAttribute('position',new THREE.BufferAttribute(this.pPos,3));
      this.pGeo.setAttribute('aPCol',new THREE.BufferAttribute(this.pCol,3));
      this.pGeo.setAttribute('aPData',new THREE.BufferAttribute(this.pDat,2));
      this.pPoints=new THREE.Points(this.pGeo,this.game.renderer.particleMat);
      this.pPoints.frustumCulled=false;
      this.pPoints.renderOrder=20;
      this.game.renderer.scene.add(this.pPoints);
    }
    let vi=0;
    for(let i=ps.length-1;i>=0&&vi<n;i--){
      const p=ps[i];
      this.pPos[vi*3]=p.x;this.pPos[vi*3+1]=p.y;this.pPos[vi*3+2]=p.z;
      this.pCol[vi*3]=p.col[0];this.pCol[vi*3+1]=p.col[1];this.pCol[vi*3+2]=p.col[2];
      const fade=p.life/p.maxLife;
      this.pDat[vi*2]=p.size*(0.5+fade*0.5);
      this.pDat[vi*2+1]=Math.min(1,fade*1.8);
      vi++;
    }
    this.pGeo.setDrawRange(0,vi);
    this.pGeo.attributes.position.needsUpdate=true;
    this.pGeo.attributes.aPCol.needsUpdate=true;
    this.pGeo.attributes.aPData.needsUpdate=true;
  }

  trySpawn(dt){
    this.spawnT-=dt;
    if(this.spawnT>0)return;
    this.spawnT=1.6;
    const game=this.game,world=game.world,player=game.player;
    const hostiles=this.mobs.filter(m=>m.def.hostile).length;
    const passives=this.mobs.length-hostiles;
    const night=!game.isDay();

    const tryPos=(minR,maxR)=>{
      const a=Math.random()*Math.PI*2,r=minR+Math.random()*(maxR-minR);
      const x=Math.floor(player.pos.x+Math.sin(a)*r),z=Math.floor(player.pos.z+Math.cos(a)*r);
      if(!world.isLoadedAt(x,z))return null;
      const y=world.surfaceY(x,z);
      if(y<2||y>118)return null;
      const ground=world.getBlock(x,y-1,z);
      if(!BLOCKS[ground]||!BLOCKS[ground].solid)return null;
      if(world.getBlock(x,y,z)!==B.AIR||world.getBlock(x,y+1,z)!==B.AIR)return null;
      return {x:x+0.5,y,z:z+0.5,ground};
    };

    if(hostiles<10&&(night||Math.random()<0.25)){
      const p=tryPos(26,52);
      if(p){
        const lightHere=world.blkAt(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));
        const skyOk=night||world.skyAt(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))<6;
        if(lightHere<7&&skyOk){
          this.spawnMob(Math.random()<0.72?'zombie':'creeper',p.x,p.y,p.z);
        }
      }
    }
    if(passives<10&&!night&&Math.random()<0.4){
      const p=tryPos(30,58);
      if(p&&p.ground===B.GRASS){
        const types=['pig','sheep','cow','chicken'];
        const t=types[(Math.random()*types.length)|0];
        const n=1+(Math.random()*2|0);
        for(let k=0;k<n;k++)this.spawnMob(t,p.x+k*0.8,p.y,p.z+k*0.4);
      }
    }
  }
}

export const MOB_DEFS={
  pig:{label:'Pig',hp:10,speed:1.7,range:0,hostile:false,dmg:0,hw:0.42,hgt:0.85,
    drops:[{id:'porkchop',count:[1,3],chance:1}],
    parts:[
      {size:[0.62,0.5,0.9],pos:[0,0.45,0],col:[0.94,0.63,0.66]},
      {size:[0.44,0.44,0.42],pos:[0,0.55,0.6],col:[0.96,0.68,0.70]},
      {size:[0.16,0.5,0.16],pos:[0.18,0.25,0.28],col:[0.88,0.56,0.58],pivot:'leg'},
      {size:[0.16,0.5,0.16],pos:[-0.18,0.25,0.28],col:[0.88,0.56,0.58],pivot:'leg2'},
      {size:[0.16,0.5,0.16],pos:[0.18,0.25,-0.28],col:[0.88,0.56,0.58],pivot:'leg2'},
      {size:[0.16,0.5,0.16],pos:[-0.18,0.25,-0.28],col:[0.88,0.56,0.58],pivot:'leg'}
    ]},
  sheep:{label:'Sheep',hp:8,speed:1.6,range:0,hostile:false,dmg:0,hw:0.42,hgt:1.1,
    drops:[{id:'mutton',count:[1,2],chance:1},{id:'block:'+B.WOOL,count:[1,1],chance:1}],
    parts:[
      {size:[0.66,0.62,0.95],pos:[0,0.72,0],col:[0.92,0.92,0.9]},
      {size:[0.4,0.4,0.4],pos:[0,0.95,0.62],col:[0.82,0.74,0.66]},
      {size:[0.16,0.45,0.16],pos:[0.19,0.24,0.3],col:[0.78,0.72,0.64],pivot:'leg'},
      {size:[0.16,0.45,0.16],pos:[-0.19,0.24,0.3],col:[0.78,0.72,0.64],pivot:'leg2'},
      {size:[0.16,0.45,0.16],pos:[0.19,0.24,-0.3],col:[0.78,0.72,0.64],pivot:'leg2'},
      {size:[0.16,0.45,0.16],pos:[-0.19,0.24,-0.3],col:[0.78,0.72,0.64],pivot:'leg'}
    ]},
  cow:{label:'Cow',hp:10,speed:1.5,range:0,hostile:false,dmg:0,hw:0.45,hgt:1.25,
    drops:[{id:'beef',count:[1,3],chance:1},{id:'leather',count:[0,2],chance:0.8}],
    parts:[
      {size:[0.72,0.65,1.05],pos:[0,0.85,0],col:[0.41,0.28,0.2]},
      {size:[0.46,0.44,0.44],pos:[0,1.15,0.68],col:[0.35,0.24,0.17]},
      {size:[0.2,0.62,0.2],pos:[0.22,0.32,0.32],col:[0.32,0.22,0.16],pivot:'leg'},
      {size:[0.2,0.62,0.2],pos:[-0.22,0.32,0.32],col:[0.32,0.22,0.16],pivot:'leg2'},
      {size:[0.2,0.62,0.2],pos:[0.22,0.32,-0.32],col:[0.32,0.22,0.16],pivot:'leg2'},
      {size:[0.2,0.62,0.2],pos:[-0.22,0.32,-0.32],col:[0.32,0.22,0.16],pivot:'leg'}
    ]},
  chicken:{label:'Chicken',hp:4,speed:1.4,range:0,hostile:false,dmg:0,hw:0.25,hgt:0.65,
    drops:[{id:'chicken_raw',count:[1,1],chance:1},{id:'feather',count:[0,2],chance:0.9}],
    parts:[
      {size:[0.4,0.4,0.5],pos:[0,0.42,0],col:[0.93,0.91,0.86]},
      {size:[0.24,0.28,0.26],pos:[0,0.68,0.26],col:[0.95,0.93,0.88]},
      {size:[0.08,0.08,0.14],pos:[0,0.66,0.42],col:[0.95,0.6,0.2]},
      {size:[0.08,0.3,0.08],pos:[0.1,0.16,0],col:[0.9,0.65,0.3],pivot:'leg'},
      {size:[0.08,0.3,0.08],pos:[-0.1,0.16,0],col:[0.9,0.65,0.3],pivot:'leg2'}
    ]},
  zombie:{label:'Zombie',hp:20,speed:2.35,range:22,hostile:true,dmg:3,burns:true,hw:0.32,hgt:1.9,
    drops:[{id:'rotten_flesh',count:[0,2],chance:0.9}],
    parts:[
      {size:[0.5,0.5,0.5],pos:[0,1.65,0],col:[0.35,0.55,0.35]},
      {size:[0.52,0.72,0.3],pos:[0,1.05,0],col:[0.25,0.42,0.6]},
      {size:[0.2,0.66,0.2],pos:[0.37,1.2,0.28],col:[0.35,0.55,0.35],pivot:'arm'},
      {size:[0.2,0.66,0.2],pos:[-0.37,1.2,0.28],col:[0.35,0.55,0.35],pivot:'arm'},
      {size:[0.22,0.7,0.22],pos:[0.14,0.35,0],col:[0.24,0.35,0.55],pivot:'leg'},
      {size:[0.22,0.7,0.22],pos:[-0.14,0.35,0],col:[0.24,0.35,0.55],pivot:'leg2'}
    ]},
  creeper:{label:'Creeper',hp:20,speed:2.1,range:18,hostile:true,dmg:0,burns:false,hw:0.3,hgt:1.65,
    drops:[{id:'gunpowder',count:[0,2],chance:1}],
    parts:[
      {size:[0.5,0.5,0.5],pos:[0,1.4,0],col:[0.36,0.62,0.3]},
      {size:[0.44,0.78,0.3],pos:[0,0.76,0],col:[0.32,0.58,0.27]},
      {size:[0.22,0.38,0.24],pos:[0.14,0.19,0.2],col:[0.30,0.54,0.26],pivot:'leg'},
      {size:[0.22,0.38,0.24],pos:[-0.14,0.19,0.2],col:[0.30,0.54,0.26],pivot:'leg2'},
      {size:[0.22,0.38,0.24],pos:[0.14,0.19,-0.2],col:[0.30,0.54,0.26],pivot:'leg2'},
      {size:[0.22,0.38,0.24],pos:[-0.14,0.19,-0.2],col:[0.30,0.54,0.26],pivot:'leg'}
    ]}
};

const TILE_AVG=new Map();
