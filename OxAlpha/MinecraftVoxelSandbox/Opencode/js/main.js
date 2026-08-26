// Main orchestrator: boot, input, streaming, day cycle, interaction, save/load, loop.
import * as THREE from '../vendor/three.module.js';
import { CHUNK, HEIGHT, SEA } from './config.js';
import { B, BLOCKS, isSolid } from './blocks.js';
import { ITEMS } from './items.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { Player } from './player.js';
import { EntityManager } from './entities.js';
import { UI } from './ui.js';
import { AudioSys } from './audio.js';
import { buildIcons } from './icons.js';
import { SMELT, FUEL } from './craft.js';

const SAVE_KEY='vxforge.save.v1';

function loadSettings(){
  const S={quality:'high',renderDist:7,fov:75,sens:1,invertX:false,invertY:false,
    shadows:true,bloom:true,master:0.55,resScale:1.0};
  try{
    const raw=localStorage.getItem('vx.settings.v1');
    if(raw)Object.assign(S,JSON.parse(raw));
  }catch(e){}
  return S;
}
function saveSettings(S){
  try{localStorage.setItem('vx.settings.v1',JSON.stringify(S));}catch(e){}
}

class Input {
  constructor(){
    this.keys={};
    this.dx=0;this.dy=0;
    this.left=false;this.right=false;
    this.locked=false;
    this.jumpQueued=false;
    this.wheelDir=0;
    this.invertX=false;this.invertY=false;
    window.addEventListener('keydown',e=>{
      if(e.repeat){if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();return;}
      this.keys[e.code]=true;
      if(['Space','Tab'].includes(e.code)||document.activeElement&&document.activeElement.tagName!=='INPUT'&&['F3','F5','F1','KeyQ','KeyE'].includes(e.code))e.preventDefault();
      if(document.activeElement&&document.activeElement.tagName==='INPUT'&&document.activeElement.type==='text')return;
      if(this.onkey)this.onkey(e.code);
    });
    window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    window.addEventListener('blur',()=>{this.keys={};this.left=this.right=false;});
    document.addEventListener('mousemove',e=>{
      if(!this.locked)return;
      this.dx+=e.movementX||0;
      this.dy+=e.movementY||0;
    });
    document.addEventListener('mousedown',e=>{
      if(!this.enabled)return;
      if(e.button===0)this.left=true;
      if(e.button===2)this.right=true;
      if(this.onclick)this.onclick(e.button);
    });
    document.addEventListener('mouseup',e=>{
      if(e.button===0)this.left=false;
      if(e.button===2)this.right=false;
    });
    document.addEventListener('wheel',e=>{
      if(!this.locked)return;
      this.wheelDir=Math.sign(e.deltaY);
      e.preventDefault();
    },{passive:false});
    document.addEventListener('pointerlockchange',()=>{
      const el=document.pointerLockElement;
      const was=this.locked;
      this.locked=!!el;
      if(!el&&was&&this.onunlock)this.onunlock();
    });
    document.addEventListener('contextmenu',e=>{if(this.locked)e.preventDefault();});
    this.enabled=false;
  }
  down(code){return !!this.keys[code];}
  consumeMouseDX(){const v=this.dx;this.dx=0;return v;}
  consumeMouseDY(){const v=this.dy;this.dy=0;return v;}
  consumeJump(){const v=this.jumpQueued;this.jumpQueued=false;return v;}
  requestLock(canvas){
    if(this.locked)return;
    try{
      const p=canvas.requestPointerLock({unadjustedMovement:true});
      if(p&&p.catch)p.catch(()=>canvas.requestPointerLock());
    }catch(e){
      canvas.requestPointerLock();
    }
  }
}

export class Game {
  constructor(){
    this.settings=loadSettings();
    this.canvas=document.getElementById('game');
    this.renderer=new Renderer(this.canvas,this.settings);
    this.audio=new AudioSys();
    this.input=new Input();
    this.icons=buildIcons();
    this.iconImgs={};
    for(const k in this.icons){const im=new Image();im.src=this.icons[k];this.iconImgs[k]=im;}
    this.ui=new UI(this);
    this.state='title';
    this.world=null;this.player=null;this.entities=null;
    this.timeS=0;
    this.hurtFlash=0;
    this.autosaveT=20;
    this.weatherT=60+Math.random()*180;
    this.fpsFrames=0;this.fpsTime=0;this.fps=0;
    this.meshQueue=[];
    this.saveDirty=false;
    this._bindInput();
    this._loop=this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.showTitle();
    window.__game=this;
    window.__vvGame=this;
  }


  showTitle(){
    this.state='title';
    this.ui.title(!!localStorage.getItem(SAVE_KEY),
      ()=>this.continueWorld(),
      (seed)=>this.startWorld(seed,false));
  }

  startWorld(seedStr,creative){
    let seed;
    if(seedStr){
      seed=0;
      for(let i=0;i<seedStr.length;i++){seed=(seed*31+seedStr.charCodeAt(i))|0;}
    } else seed=(Math.random()*2**31)|0;
    localStorage.removeItem(SAVE_KEY);
    this.beginGame(seed,creative?'creative':'survival',null);
  }

  continueWorld(){
    try{
      const data=JSON.parse(localStorage.getItem(SAVE_KEY));
      this.beginGame(data.seed,data.mode||'survival',data);
    }catch(e){
      console.error('load failed',e);
      localStorage.removeItem(SAVE_KEY);
      this.startWorld('',false);
    }
  }

  beginGame(seed,mode,saveData){
    this.world=new World(seed);
    this.renderer.attachWorld(this.world);
    this.player=new Player(this.world);
    this.player.mode=mode;
    this.entities=new EntityManager(this);
    this.mode=mode;

    if(saveData){
      this.world.loadEdits(saveData.edits);
      this.world.time=saveData.time??0.30;
      if(saveData.meta)for(const[k,v]of saveData.meta)this.world.meta.set(k,v);
      for(const k in saveData.containers){
        const c=saveData.containers[k];
        c.slots=c.slots.map(s=>s?{id:s[0],count:s[1],...(s[2]!==undefined?{dur:s[2]}:{})}:null);
        this.world.containers.set(k,c);
      }
      this.player.deserialize(saveData.player);
    }

    this.state='loading';
    this.ui.showLoading('Carving mountains…');

    const R=this.settings.renderDist+1;
    const pcx=Math.floor((saveData?this.player.pos.x:8)>>4);
    const pcz=Math.floor((saveData?this.player.pos.z:8)>>4);
    const jobs=[];
    for(let dz=-R;dz<=R;dz++)for(let dx=-R;dx<=R;dx++){
      if(dx*dx+dz*dz>R*R+1)continue;
      jobs.push([pcx+dx,pcz+dz,dx*dx+dz*dz]);
    }
    jobs.sort((a,b)=>a[2]-b[2]);
    let ji=0;
    const step=()=>{
      const t0=performance.now();
      while(ji<jobs.length&&performance.now()-t0<28){
        this.world.ensureChunk(jobs[ji][0],jobs[ji][1]);
        ji++;
      }
      this.ui.setLoading(ji/jobs.length,'Growing forests…');
      if(ji<jobs.length){requestAnimationFrame(step);return;}
      this.finishBegin(saveData);
    };
    requestAnimationFrame(step);
  }

  finishBegin(saveData){
    const p=this.player;
    if(saveData){
      p.spawnPoint=p.spawnPoint||new THREE.Vector3(8,this.world.surfaceY(8,8),8);
      if(!p.inv.some(Boolean)){
        this.giveStarterKit();
      }
    } else {
      let sx=8,sz=8;
      for(let r=0;r<40;r++){
        const x=sx+r*7,z=sz+Math.sin(r)*11|0;
        const y=this.world.surfaceY(x,z);
        const g=this.world.getBlock(x,y-1,z);
        if(g!==B.WATER&&y>SEA-2){sx=x;sz=z;break;}
      }
      const sy=this.world.surfaceY(sx,sz)+1;
      p.pos={x:sx+0.5,y:sy+0.2,z:sz+0.5};
      p.yaw=Math.PI*0.25;
      p.spawnPoint=new THREE.Vector3(sx+0.5,sy,sz+0.5);
      if(p.mode==='survival')this.giveStarterKit();
      else {
        p.flying=true;
        p.give(B.GLOWSTONE,64);
        p.give(B.PLANKS,64);
        p.give('diamond_pickaxe',1);
        p.give('diamond_sword',1);
      }
    }
    this.dirtyChunksAll();
    this.state='play';
    this.ui.hideLoading();
    this.ui.dirtyHotbar=true;
    this.ui.updateStats();
    this.toastMsg('Welcome to VoxelForge! Punch a tree to begin.');
    this.input.requestLock(this.canvas);
  }

  dirtyChunksAll(){
    for(const[,c]of this.world.chunks)c.dirty=true;
  }

  giveStarterKit(){
    const p=this.player;
    p.give(B.PLANKS,16);
    p.give('wooden_pickaxe',1);
    p.give('wooden_axe',1);
    p.give(B.TORCH,8);
    p.give('bread',4);
    p.sel=0;
    this.ui.dirtyHotbar=true;
  }

  toastMsg(msg,long){
    this.ui.toast(msg,long);
  }

  _bindInput(){
    const I=this.input;
    I.onkey=(code)=>{
      if(this.state!=='play'){
        return;
      }
      if(code==='Escape'){
        if(this.ui.open)this.ui.closeScreen();
        else this.openPause();
        return;
      }
      if(this.ui.open)return;
      switch(code){
        case 'KeyE':
          if(this.ui.open)this.ui.closeScreen();
          else {
            const nearTable=this.nearBlockType(B.CRAFTING);
            this.pauseInputForUI();
            this.ui.openInventory(nearTable);
          }
          break;
        case 'KeyQ':{
          const held=this.player.heldItem();
          if(held){
            const d=this.player.lookDir();
            this.dropItem(this.player.eyePos().x+d.x,this.player.eyePos().y-0.2,this.player.eyePos().z+d.z,held.id,1,held.dur,d.x*7,d.y*7+2,d.z*7);
            this.player.consumeHeld(1);
          }
          break;
        }
        case 'KeyH': this.ui.openHelp(); break;
        case 'F3': this.ui.debugOn=!this.ui.debugOn; this.ui.debugEl.style.display=this.ui.debugOn?'block':'none'; break;
        case 'KeyF':
          if(this.player.mode==='creative'){this.player.flying=!this.player.flying;this.player.vel.y=0;}
          break;
        case 'Space':
          this.input.jumpQueued=true;
          break;
      }
      if(code.startsWith('Digit')){
        const n=+code.slice(5);
        if(n>=1&&n<=9){this.player.sel=n-1;this.ui.dirtyHotbar=true;}
      }
    };
    I.onclick=(btn)=>{
      if(this.state!=='play')return;
      if(this.ui.open)return;
      if(!I.locked){I.requestLock(this.canvas);return;}
      if(btn===0){
        this.player.swingArm&&this.player.swingArm();
      }
      if(btn===2)this.useAction();
    };
    I.onunlock=()=>{
      if(this.state==='play'&&!this.ui.open)this.openPause();
    };
  }

  openPause(){
    this.state='pause';
    this.input.enabled=false;
    this.ui.openPause();
  }

  resumePlay(){
    this.state='play';
    this.input.enabled=true;
    this.input.requestLock(this.canvas);
  }

  onScreenClose(){
    if(this.state==='pause'||this.uiOpenPaused){
      this.resumePlay();
    } else {
      this.input.enabled=true;
    }
    this.uiOpenPaused=false;
  }
  pauseInputForUI(){
    this.uiOpenPaused=this.state==='play'&&!this.uiOpenPaused;
    this.input.enabled=false;
    if(this.input.locked)document.exitPointerLock();
  }
  resumeFromUI(){
    this.resumePlay();
  }

  nearBlockType(id){
    const px=Math.floor(this.player.pos.x),py=Math.floor(this.player.pos.y),pz=Math.floor(this.player.pos.z);
    for(let dy=-1;dy<=2;dy++)for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      if(this.world.getBlock(px+dx,py+dy,pz+dz)===id)return true;
    }
    return false;
  }

  useAction(){
    const p=this.player;
    const hit=p.raycastTarget(this);
    const held=p.heldItem();

    if(hit){
      const def=BLOCKS[hit.id];
      if(def.interact&&p.placeCd<=0){
        p.placeCd=0.25;
        this.interactWith(def.interact,hit);
        return;
      }
      if(hit.id===B.TNT&&held&&typeof held.id==='string'&&(held.id==='torch')){
        this.igniteTNT(hit.x,hit.y,hit.z);
        return;
      }
    }

    if(!held)return;

    if(typeof held.id==='string'&&ITEMS[held.id]){
      const it=ITEMS[held.id];
      if(it.food){
        if(p.eatingT<=0&&(p.hunger<19.9||p.mode==='creative')){
          p.eatingT=1.35;
          p.eatingId=held.id;
          if(this.audio)this.audio.play('eat');
        }
        return;
      }
      if(it.plant!==undefined&&hit){
        const tx=hit.x+hit.face[0],ty=hit.y+hit.face[1],tz=hit.z+hit.face[2];
        if(this.world.getBlock(hit.x,hit.y,hit.z)===it.on&&this.world.getBlock(tx,ty,tz)===B.AIR){
          this.world.setBlock(tx,ty,tz,it.plant,{record:true});
          p.consumeHeld(1);
          if(this.audio)this.audio.play('place');
          p.placeCd=0.22;
        }
        return;
      }
    }

    if(typeof held.id==='number'&&hit&&p.placeCd<=0){
      this.tryPlace(hit,held.id);
    }
  }

  interactWith(kind,hit){
    switch(kind){
      case 'craft':{
        const near=this.nearBlockType(B.CRAFTING);
        this.pauseInputForUI();
        this.ui.openInventory(true);
        break;
      }
      case 'furnace':{
        const key=hit.x+','+hit.y+','+hit.z;
        let cont=this.world.containers.get(key);
        if(!cont){
          cont={type:'furnace',slots:{input:null,fuel:null,out:null,burn:0,burnMax:0,prog:0}};
          this.world.containers.set(key,cont);
        }
        this.pauseInputForUI();
        this.ui.openFurnace(cont);
        break;
      }
      case 'chest':{
        const key=hit.x+','+hit.y+','+hit.z;
        let cont=this.world.containers.get(key);
        if(!cont){
          cont={type:'chest',slots:new Array(27).fill(null)};
          const loot=this.rollStructureLoot(key);
          if(loot){
            loot.forEach((s,i)=>cont.slots[i*2]=s);
          }
          this.world.containers.set(key,cont);
        }
        this.pauseInputForUI();
        this.ui.openChest(cont);
        break;
      }
      case 'bed':{
        const elev=this.world.sunElev();
        const hostiles=this.entities.mobs.some(m=>{if(!m.def.hostile)return false;const pp=this.player.pos;const ddx=m.pos.x-pp.x,ddy=m.pos.y-pp.y,ddz=m.pos.z-pp.z;return (ddx*ddx+ddy*ddy+ddz*ddz)<144;});
        if(hostiles){this.toastMsg('You may not rest now; there are monsters nearby');break;}
        if(elev>-0.08){this.toastMsg('You can only sleep at night');break;}
        this.player.spawnPoint=new THREE.Vector3(hit.x+0.5,hit.y+1.05,hit.z+0.5);
        this.ui.showSleep(()=>{
          this.world.time=0.30;
          this.world.weather.rain*=0.5;
          this.toastMsg('You slept through the night. Spawn point set.');
        });
        break;
      }
      case 'lever':{
        const id=this.world.getBlock(hit.x,hit.y,hit.z);
        const nid=id===B.LEVER_OFF?B.LEVER_ON:B.LEVER_OFF;
        this.world.setBlock(hit.x,hit.y,hit.z,nid,{record:false});
        let ed=this.world.edits.get((hit.x>>4)+','+(hit.z>>4));
        if(ed)ed.set(((hit.y)<<8)|((hit.z&15)<<4)|(hit.x&15),nid);
        this.world.queueCircuit(hit.x,hit.y,hit.z);
        if(this.audio)this.audio.play('click');
        break;
      }
    }
  }

  rollStructureLoot(key){
    const [x,y,z]=key.split(',').map(Number);
    let mossy=0,total=0;
    for(let dy=-1;dy<=2;dy++)for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      total++;
      if(this.world.getBlock(x+dx,y+dy,z+dz)===B.MOSSY)mossy++;
    }
    if(y<36&&mossy/total>0.15)return this.lootRoll('dungeon');
    return this.lootRoll('ruins');
  }

  lootRoll(kind){
    const TABLE={
      dungeon:[['iron_ingot',1,4,.85],['bread',1,2,.75],['redstone',2,5,.6],['glowstone_dust',1,3,.5],['apple',1,2,.45],['string',1,3,.4],['gunpowder',1,3,.35],['golden_apple',1,1,.07],['name_tag',0,0,0]],
      ruins:[['bread',1,2,.7],['coal',2,6,.7],['iron_ingot',1,2,.45],['sapling_item',1,2,.4],['apple',1,1,.4],['stick',2,4,.5]],
    };
    const out=[];
    const table=TABLE[kind]||TABLE.ruins;
    const n=kind==='dungeon'?3+(Math.random()*3|0):2+(Math.random()*2|0);
    for(let i=0;i<n;i++){
      let tot=0;
      for(const t of table)tot+=t[3];
      let r=Math.random()*tot;
      for(const t of table){
        r-=t[3];
        if(r<=0){
          const cnt=t[1]+Math.floor(Math.random()*(t[2]-t[1]+1));
          if(cnt>0)out.push({id:t[0],count:cnt,...(ITEMS[t[0]]&&ITEMS[t[0]].durability?{dur:ITEMS[t[0]].durability}:{})});
          break;
        }
      }
    }
    return out;
  }

  tryPlace(hit,id){
    const p=this.player;
    const x=hit.x+hit.face[0],y=hit.y+hit.face[1],z=hit.z+hit.face[2];
    if(y<1||y>=HEIGHT)return;
    const cur=this.world.getBlock(x,y,z);
    if(cur!==B.AIR&&cur!==B.WATER&&!(BLOCKS[cur]&&BLOCKS[cur].cross))return;
    const def=BLOCKS[id];
    if((def.cross||def.shape==='torch')&&!isSolid(this.world.getBlock(x,y-1,z)))return;
    if(def.solid){
      if(Math.abs(x+0.5-p.pos.x)<0.86&&Math.abs(z+0.5-p.pos.z)<0.86&&y+1>p.pos.y-0.02&&y<p.pos.y+1.78){
        if(!(p.mode==='creative'&&p.flying))return;
      }
      for(const m of this.entities.mobs){
        if(Math.abs(x+0.5-m.pos.x)<0.6+m.def.hw&&Math.abs(z+0.5-m.pos.z)<0.6+m.def.hw&&y+1>m.pos.y&&y<m.pos.y+m.def.hgt)return;
      }
    }
    if(id===B.LADDER){
      const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
      let f=3;
      for(let i=0;i<4;i++){
        if(isSolid(this.world.getBlock(x+dirs[i][0],y,z+dirs[i][1]))){f=i;break;}
      }
      this.world.meta.set(x+','+y+','+z,{f});
    }
    if(def.facing){
      const face=hit.face;
      let f=0;
      if(face[2]===1)f=0;
      else if(face[2]===-1)f=1;
      else if(face[0]===-1)f=2;
      else f=3;
      this.world.meta.set(x+','+y+','+z,{f});
    }
    this.world.setBlock(x,y,z,id,{record:true});
    if(id===B.LEVER_OFF||id===B.LEVER_ON||(id===B.WIRE_OFF||id===B.WIRE_ON)||id===B.LAMP_ON||id===B.LAMP_OFF)this.world.queueCircuit(x,y,z);
    p.consumeHeld(1);
    p.placeCd=0.21;
    if(this.audio)this.audio.play('place',id);
  }

  igniteTNT(x,y,z){
    this.entities.igniteTNT(x,y,z);
    this.world.setBlock(x,y,z,B.AIR,{record:true});
  }

  dropItem(x,y,z,id,count,dur,vx,vy,vz){
    this.entities.spawnItem(x,y,z,id,count,dur,vx,vy,vz);
  }

  swingArm(){}

  applyQuality(light){
    const S=this.settings;
    const q=S.quality;
    if(q==='low'){S.renderDist=Math.min(S.renderDist,4);S.resScale=Math.min(S.resScale,0.66);}
    if(q==='medium'){S.renderDist=Math.min(S.renderDist,6);S.resScale=Math.min(S.resScale,0.85);}
    if(q==='ultra'){S.renderDist=Math.max(S.renderDist,9);S.resScale=Math.max(S.resScale,1);}
    this.renderer.camera.fov=S.fov;
    this.renderer.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.world&&this.world.update(0,this.pcx(),this.pcz(),S.renderDist);
    void light;
  }

  applySettings(){
    this.applyQuality();
    saveSettings(this.settings);
  }

  pcx(){return this.player?Math.floor(this.player.pos.x)>>4:0;}
  pcz(){return this.player?Math.floor(this.player.pos.z)>>4:0;}

  isDay(){return this.world.sunElev()>0;}

  iconURL(ref){
    return typeof ref==='number'?(this.icons['block:'+ref]||''):(this.icons[ref]||'');
  }

  meshVisibleChunks(budgetMs){
    const end=performance.now()+budgetMs;
    const pcx=this.pcx(),pcz=this.pcz();
    let built=0;
    const sorted=[...this.world.chunks.values()]
      .filter(c=>c.dirtyMesh)
      .sort((a,b)=>((a.cx-pcx)**2+(a.cz-pcz)**2)-((b.cx-pcx)**2+(b.cz-pcz)**2));
    for(const c of sorted){
      if(performance.now()>end)break;
      this.renderer.buildChunk(c);
      built++;
    }
    return built;
  }

  updateWeather(dt){
    const w=this.world.weather;
    w.timer-=dt;
    if(w.timer<=0){
      if(w.target>0){
        w.target=0;
        w.timer=240+Math.random()*420;
      } else {
        w.target=Math.random()<0.65?0.6+Math.random()*0.4:(Math.random()<0.3?1.0:0);
        w.timer=90+Math.random()*160;
        if(w.target>0)this.toastMsg('Rain begins to fall…');
      }
    }
    w.rain+=(w.target-w.rain)*Math.min(1,dt*0.25);
    if(this.audio)this.audio.setRain(w.rain);
    if(w.rain>0.5&&Math.random()<dt*0.02){
      setTimeout(()=>this.audio.play('thunder'),100+Math.random()*1500);
      this.flashT=0.5;
    }
  }

  tickFurnaces(dt){
    for(const[,c]of this.world.containers){
      if(c.type!=='furnace')continue;
      const f=c.slots;
      let smeltIn=null;
      if(f.input){
        const key=typeof f.input.id==='number'?B[f.input.id]+'':f.input.id;
        if(SMELT[key]!==undefined)smeltIn=key;
      }
      let canSmelt=false;
      if(smeltIn!==null){
        const res=SMELT[smeltIn];
        const outId=typeof res==='object'?res.block:res.item;
        const outIsNum=outId===undefined?true:(outId===parseInt(outId)?false:false);
        void outIsNum;
        if(!f.out||(String(f.out.id)===String(outId)&&f.out.count<64))canSmelt=true;
      }
      if(f.burn>0)f.burn-=dt;
      if(canSmelt&&f.burn<=0&&f.fuel){
        const fk=typeof f.fuel.id==='number'?B[f.fuel.id]+'':f.fuel.id;
        const secs=FUEL[fk]||0;
        if(secs>0){
          f.burnMax=f.burn=secs/8;
          f.fuel.count--;
          if(f.fuel.count<=0)f.fuel=null;
        } else canSmelt=false;
      }
      if(canSmelt&&f.burn>0){
        f.prog+=dt;
        if(f.prog>=10){
          f.prog=0;
          const res=SMELT[smeltIn];
          const outId=typeof res==='object'?res.block:res.item;
          if(f.out&&String(f.out.id)===String(outId))f.out.count++;
          else f.out={id:outId,count:1};
          f.input.count--;
          if(f.input.count<=0)f.input=null;
        }
      } else if(!canSmelt){
        f.prog=0;
      }
    }
  }

  saveNow(toastIt){
    if(!this.world||!this.player)return;
    const containers={};
    for(const[k,c]of this.world.containers){
      containers[k]={type:c.type,slots:c.type==='chest'
        ?c.slots.map(s=>s?[s.id,s.count,s.dur??null]:null)
        :{...c.slots,
           input:c.slots.input?[c.slots.input.id,c.slots.input.count]:null,
           fuel:c.slots.fuel?[c.slots.fuel.id,c.slots.fuel.count]:null,
           out:c.slots.out?[c.slots.out.id,c.slots.out.count]:null}};
    }
    const meta=[];
    for(const[k,v]of this.world.meta)meta.push(k,v);
    const data={
      v:1,seed:this.world.seed,mode:this.mode,
      time:this.world.time,
      weather:this.world.weather,
      edits:this.world.serializeEdits(),
      containers,meta,
      player:this.player.serialize()
    };
    try{
      localStorage.setItem(SAVE_KEY,JSON.stringify(data));
      if(toastIt)this.toastMsg('World saved');
    }catch(e){
      this.toastMsg('Save failed (storage full?)','#e06655');
    }
    this.autosaveT=25;
  }

  respawnPlayer(){
    this.player.dead=false;
    this.player.hp=this.player.maxHp;
    this.player.hunger=20;
    this.player.air=10;
    const sp=this.player.spawnPoint||new THREE.Vector3(8,this.world.surfaceY(8,8)+1,8);
    this.player.pos={x:sp.x,y:sp.y,z:sp.z};
    this.player.vel={x:0,y:0,z:0};
    this.player.protectT=2;
    this.state='play';
    this.input.requestLock(this.canvas);
  }

  onPlayerDeath(reason){
    if(this.state==='dead')return;
    this.state='dead';
    this.input.enabled=false;
    if(this.input.locked)document.exitPointerLock();
    const inv=this.player.inv;
    for(let i=0;i<36;i++){
      if(inv[i]){
        this.dropItem(this.player.pos.x,this.player.pos.y+1,this.player.pos.z,inv[i].id,inv[i].count,inv[i].dur,
          (Math.random()-0.5)*6,4,(Math.random()-0.5)*6);
        inv[i]=null;
      }
    }
    this.ui.dirtyHotbar=true;
    setTimeout(()=>this.ui.openDeath(reason),700);
  }

  quitToTitle(){
    this.showTitle();
  }

  viewmodelSwing(){}
  resumeFromUI(){this.resumePlay();}
  pauseInputForUI(){
    this.input.enabled=false;
    if(this.input.locked)document.exitPointerLock();
  }
  onScreenClose(){
    this.input.enabled=true;
    if(this.state==='play')this.input.requestLock(this.canvas);
  }

  _loop(tms){
    requestAnimationFrame(this._loop);
    const dt=Math.min(0.05,(tms-(this._lastT||tms))/1000||0.016);
    this._lastT=tms;
    this.timeS+=dt;
    this.sharedTime=this.timeS;

    this.fpsFrames++;this.fpsTime+=dt;
    if(this.fpsTime>0.5){this.fps=Math.round(this.fpsFrames/this.fpsTime);this.fpsFrames=0;this.fpsTime=0;}

    if(this.state==='loading')return;

    if(this.state==='play'&&this.world){
      const p=this.player;
      if(!p.dead&&!this.ui.open){
        p.update(dt,this.input,this.world,this);
        this.handleMining(dt);
      } else if(p.dead){
        p.vel={x:0,y:0,z:0};
      }
      this.world.update(dt,this.pcx(),this.pcz(),this.settings.renderDist+1);
      this.meshVisibleChunks(this.chunksLoading?14:5);
      if(!this.chunksLoading&&this.pendingChunkCount()>0)this.chunksLoading=true;
      if(this.chunksLoading&&this.pendingChunkCount()===0)this.chunksLoading=false;
      this.entities.update(dt);
      this.entities.syncParticles();
      this.tickFurnaces(dt);
      this.world.time=(this.world.time+dt/600)%1;
      this.updateWeather(dt);
      if(p.eatingT>0){
        p.eatingT-=dt;
        if(Math.random()<dt*8&&this.audio)this.audio.play('eat');
        if(p.eatingT<=0){
          const it=ITEMS[p.eatingId];
          p.hunger=Math.min(20,p.hunger+it.food);
          if(this.audio)this.audio.play('burp');
          p.consumeHeld(1);
        }
      }
      this.handleEatingVisual();
      this.autosaveT-=dt;
      if(this.autosaveT<=0){this.autosaveT=25;this.saveNow(false);}
      if(this.input.wheelDir){
        p.sel=(p.sel+this.input.wheelDir+9)%9;
        this.input.wheelDir=0;
        this.ui.dirtyHotbar=true;
        this.ui.showHeldName();
      }
      this.hurtFlash=Math.max(0,this.hurtFlash-dt*1.8);
      this.flashT=Math.max(0,(this.flashT||0)-dt);
    }

    if(this.world&&this.state!=='title'){
      const cam=this.renderer.camera;
      const eye=this.player.eyePos();
      cam.position.set(
        eye.x+Math.cos(this.timeS*0.7)*0,
        eye.y+(this.player.bobA?Math.abs(Math.sin(this.player.bobA))* -0.09*this.player.bobAmp():0),
        eye.z);
      cam.rotation.order='YXZ';
      cam.rotation.y=-this.player.yaw-Math.PI/2+Math.PI/2;
      cam.rotation.y=this.player.yaw*-1;
      cam.rotation.x=this.player.pitch;
      cam.rotation.z=0;
      const sprintK=this.player.sprinting?1:0;
      const targetFov=this.settings.fov*(sprintK?1.12:1)*(this.headUnderwater()?0.92:1);
      cam.fov+=(targetFov-cam.fov)*Math.min(1,10*dt);
      cam.updateProjectionMatrix();

      this.renderer._uw=this.headUnderwater();
      this.renderer.renderFrame({
        world:this.world,
        camera:cam,
        rainAmt:this.world.weather.rain,
        underwater:this.headUnderwater(),
        dayElev:this.world.sunElev(),
        time:this.timeS
      });

      if(this.ui.debugOn){
        const info=`FPS ${this.fps} | XYZ ${this.player.pos.x.toFixed(1)} ${this.player.pos.y.toFixed(1)} ${this.player.pos.z.toFixed(1)}`
          +` | chunks ${this.world.chunks.size} | mobs ${this.entities.mobs.length} items ${this.entities.items.length}`
          +` | tris ${(this.renderer.stats.tris/1000).toFixed(0)}k`
          +` | time ${(this.world.time*24).toFixed(1)}h rain ${(this.world.weather.rain).toFixed(2)}`
          +` | light sky ${this.world.skyAt(Math.floor(this.player.pos.x),Math.floor(this.player.pos.y),Math.floor(this.player.pos.z))} blk ${this.world.blkAt(Math.floor(this.player.pos.x),Math.floor(this.player.pos.y),Math.floor(this.player.pos.z))}`;
        this.ui.updateDebug(info+'\nSeed '+this.world.seed+' · mode '+this.mode);
      }
      if(!this.ui.open&&this.state==='play'){
        this.ui.dirtyHotbar=true;this.ui.renderHotbar&&this.ui.renderHotbar();
        this.ui.updateStats();
        if(this.ui.openKind==='furnace')this.ui.furnaceTick&&this.ui.furnaceTick();
      }
    }
  }

  handleMining(dt){
    const p=this.player,I=this.input;
    const hit=p.raycastTarget(this);
    if(hit){
      this.renderer.outline.visible=true;
      this.renderer.outline.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
    } else this.renderer.outline.visible=false;
    if(I.left&&I.locked){
      if(hit){
        const key=hit.x+','+hit.y+','+hit.z;
        if(!p.mining||p.mining.key!==key){
          p.mining={key,x:hit.x,y:hit.y,z:hit.z,id:hit.id,progress:0};
        }
        const def=BLOCKS[hit.id];
        if(def.hard>=0){
          const held=p.heldItem();
          const it=held&&typeof held.id==='string'?ITEMS[held.id]:null;
          let mult=1,canHarvest=!def.tier;
          if(it&&it.toolType===def.tool){mult=it.speed;canHarvest=it.tier>=def.tier;}
          else if(!def.tool)mult=1;
          else mult=0.28;
          if(p.mode==='creative'){mult=9999;canHarvest=true;}
          p.mining.progress+=dt*mult/Math.max(0.05,def.hard*1.5);
          if(Math.random()<dt*7)this.audio.play('dig',hit.id);
          if(Math.random()<dt*10)this.entities.burst(hit.x+0.5,hit.y+0.5,hit.z+0.5,this.entities.blockColor(hit.id),2,2.4,0.5,5);
          this.renderer.crackMesh.visible=true;
          this.renderer.setCrackStage(Math.min(3,Math.floor(p.mining.progress*4)));
          this.renderer.crackMesh.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
          if(p.mining.progress>=1){
            this.breakBlock(hit,canHarvest);
            p.mining=null;
            this.renderer.crackMesh.visible=false;
          }
        } else {
          p.mining=null;
          this.renderer.crackMesh.visible=false;
        }
      } else {
        p.mining=null;
        this.renderer.crackMesh.visible=false;
      }
    } else {
      p.mining=null;
      this.renderer.crackMesh.visible=false;
    }
    if(I.right&&I.locked){
      if(p.placeCd<=0)this.useAction();
    }
  }

  breakBlock(hit,harvest){
    const def=BLOCKS[hit.id];
    this.world.setBlock(hit.x,hit.y,hit.z,B.AIR,{record:true});
    this.entities.burst(hit.x+0.5,hit.y+0.5,hit.z+0.5,this.entities.blockColor(hit.id),16,3.4,0.7,6);
    this.audio.play('break',hit.id);
    const held=this.player.heldItem();
    const it=held&&typeof held.id==='string'?ITEMS[held.id]:null;
    if(it&&(it.toolType===def.tool||def.hard>0.4)&&it.durability&&this.player.mode!=='creative'){
      this.player.damageTool(this,1);
    }
    this.player.exhaustion+=0.03;
    if(!harvest||this.player.mode==='creative')return;

    if(typeof def.drop==='string'){
      this.dropItem(hit.x+0.5,hit.y+0.35,hit.z+0.5,def.drop,def.dropCount||1);
    } else if(def.drop>=0){
      this.dropItem(hit.x+0.5,hit.y+0.35,hit.z+0.5,def.drop,1);
    }
    if(hit.id===B.LEAVES||hit.id===B.BIRCH_LEAVES||hit.id===B.SPRUCE_LEAVES){
      if(Math.random()<0.06)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'apple',1);
      if(Math.random()<0.05)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'sapling_item',1);
      if(hit.id===B.SPRUCE_LEAVES&&Math.random()<0.04)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'sapling_item',1);
    }
    if(hit.id===B.GRAVEL&&Math.random()<0.12)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'flint',1);
    if(hit.id===B.REDSTONE_ORE)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'redstone',1+(Math.random()*3|0));
    if(hit.id===B.WHEAT2)this.dropItem(hit.x+0.5,hit.y+0.4,hit.z+0.5,'seeds',1);
  }

  headUnderwater(){
    if(!this.player)return false;
    const e=this.player.eyePos();
    return this.world.getBlock(Math.floor(e.x),Math.floor(e.y),Math.floor(e.z))===B.WATER;
  }

  handleEatingVisual(){}
  chunksLoadingTick(){}
  pendingChunkCount(){
    return this.world.genQueue.length;
  }
}

function boot(){
  try{ new Game(); }
  catch(e){
    console.error('BOOT FAILED:',e);
    const d=document.createElement('div');
    d.style.cssText='position:absolute;left:10px;right:10px;bottom:10px;background:#411;z-index:999;padding:12px;font:13px monospace;color:#faa;white-space:pre-wrap;border-radius:6px;';
    d.textContent='Boot error: '+(e&&e.stack||e);
    document.body.appendChild(d);
  }
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot);
else boot();
