import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CFG, QUALITY, settings, loadSettings, loadProgress, saveProgress } from './config.js';
import { getMaterials, clamp } from './utils.js';
import { Collider } from './physics.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { PortalSystem } from './portals.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { WorldBuilder, updateTerminals } from './world.js';
import {
  Cube, FloorButton, PedestalButton, Door, MovingPlatform,
  AcidPool, Grill, Elevator, separateBodies,
} from './entities.js';
import { LEVELS } from './levels.js';
import { ANNOUNCE } from './story.js';

// ------------------------------------------------------------------ bootstrap
const app=document.getElementById('app');
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.06;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0b0e12);
const camera=new THREE.PerspectiveCamera(settings.fov,1,0.08,220);

const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(renderer),0.04).texture;
pmrem.dispose();

const composer=new EffectComposer(renderer);
let renderPass,bloomPass,smaaPass,outputPass;

function buildComposer(useSmaa){
  composer.passes.length=0;
  renderPass=new RenderPass(scene,camera);
  composer.addPass(renderPass);
  bloomPass=new UnrealBloomPass(new THREE.Vector2(512,512),0.38,0.55,0.82);
  composer.addPass(bloomPass);
  if(smaaPass){composer.removePass(smaaPass);smaaPass=null;}
  if(useSmaa){
    smaaPass=new SMAAPass(window.innerWidth*renderer.getPixelRatio(),window.innerHeight*renderer.getPixelRatio());
    composer.addPass(smaaPass);
  }
  outputPass=new OutputPass();
  composer.addPass(outputPass);
}

const input=new Input();
input.attach(renderer.domElement);
const ui=new UI();
loadSettings();

let portalSystem,fx;
let quality=QUALITY[settings.quality]||QUALITY.ultra;
window.__QUALITY__=quality;

function applyQuality(){
  quality=QUALITY[settings.quality]||QUALITY.ultra;
  window.__QUALITY__=quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality.pixelRatioCap));
  renderer.shadowMap.enabled=quality.shadows;
  if(GAME.lightRig){
    GAME.lightRig.dir.castShadow=quality.shadows;
    GAME.lightRig.dir.shadow.mapSize.setScalar(quality.shadowSize);
    if(GAME.lightRig.dir.shadow.map){GAME.lightRig.dir.shadow.map.dispose();GAME.lightRig.dir.shadow.map=null;}
  }
  buildComposer(quality.smaa);
  resize();
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  composer.setSize(w,h);
}
addEventListener('resize',resize);

// ------------------------------------------------------------- level runtime
const progress=loadProgress();
const GAME={
  state:'boot', li:0, runner:null,
  deathsTotal:progress.deaths||0,
  portalsFired:0, startTime:performance.now(),
  lightRig:null,
};

class LevelRunner {
  constructor(def,index){
    this.def=def;this.index=index;
    this.signals={};
    this.cubes=[];this.buttons=[];this.pedestals=[];this.doors=[];
    this.platforms=[];this.acids=[];this.grills=[];this.elevator=null;
    this.done=false;this.timeInLevel=0;
  }

  build(){
    const scene=this.sceneRef=GAME.scene;
    // clear previous level group
    if(GAME.levelGroup){
      scene.remove(GAME.levelGroup);
      GAME.levelGroup.traverse(o=>{
        if(o.geometry)o.geometry.dispose();
      });
    }
    portalSystem.reset();
    portalSystem.panels.length=0;
    portalSystem.occluders.length=0;

    const b=new WorldBuilder(scene,portalSystem);
    this.b=b;
    const ctx={
      b,
      cube:(pos)=>{const cu=new Cube(scene,pos);cu.spawnPos=pos.clone();this.cubes.push(cu);return cu;},
      buttonFloor:(pos,ch,r)=>{const bt=new FloorButton(scene,pos,ch,r);this.buttons.push(bt);return bt;},
      pedestal:(pos,yaw,ch,secs)=>{const p=new PedestalButton(scene,pos,yaw,ch,secs);this.pedestals.push(p);return p;},
      door:(x,y,z,yaw,w,h,chs,mode)=>{
        const d=new Door(scene,new THREE.Vector3(x,y,z),yaw,w,h,chs,mode);
        const rad=yaw*Math.PI/180;
        const horiz=Math.abs(Math.sin(rad))>0.5;
        const min=new THREE.Vector3(
          x-(horiz?0.3:(w+0.4)/2), y-0.05, z-(horiz?(w+0.4)/2:0.3));
        const max=new THREE.Vector3(
          x+(horiz?0.3:(w+0.4)/2), y+h+0.25, z+(horiz?(w+0.4)/2:0.3));
        d.setCollider(b.colliderOnly(min,max,'door'));
        this.doors.push(d);return d;
      },
      platform:(pts,speed,size)=>{
        const p=new MovingPlatform(scene,pts,speed,size);
        this.platforms.push(p);return p;
      },
      acid:(min,max,surface)=>{const a=new AcidPool(scene,min,max,surface,fx);this.acids.push(a);return a;},
      grill:(min,max)=>{const g=new Grill(scene,min,max,0,fx);this.grills.push(g);return g;},
      elevator:(pos,yaw)=>{
        const e=new Elevator(scene,pos,yaw,null,scene.userData.mats);
        e.setTriggerBox(new THREE.Vector3(pos.x-1.1,pos.y,pos.z-1.1),new THREE.Vector3(pos.x+1.1,pos.y+2.4,pos.z+1.1));
        this.elevator=e;return e;
      },
    };
    this.def.build(ctx);

    // platform colliders (after builder exists)
    // handled below in attachPlatformColliders

    // player spawn
    const P=GAME.player;
    P.spawnPos.copy(this.def.spawn);
    P.spawnYaw=(this.def.yawDeg||0)*Math.PI/180;
    P.respawn();
    P.dropHeld(true);

    // lighting rig fitted to geometry
    if(GAME.lightRig){scene.remove(GAME.lightRig.hemi,GAME.lightRig.dir,GAME.lightRig.target);}
    const bb=new THREE.Box3().setFromObject(b.group);
    const center=bb.getCenter(new THREE.Vector3());
    const size=bb.getSize(new THREE.Vector3());
    const hemi=new THREE.HemisphereLight(this.def.alert?0x40222a:0x9db4c4,this.def.alert?0x1c1216:0x2a2620,this.def.alert?0.75:0.95);
    const dir=new THREE.DirectionalLight(0xeef2f6,this.def.alert?1.35:1.7);
    dir.position.copy(center).add(new THREE.Vector3(size.x*0.25+8,size.y*0.7+14,size.z*0.15+7));
    dir.target.position.copy(center);
    dir.castShadow=quality.shadows;
    dir.shadow.mapSize.setScalar(quality.shadowSize);
    const sc=dir.shadow.camera;
    sc.left=-Math.max(size.x,size.z)*0.62-4;sc.right=Math.max(size.x,size.z)*0.62+4;
    sc.top=Math.max(size.x,size.z)*0.62+4;sc.bottom=-Math.max(size.x,size.z)*0.62-4;
    sc.near=1;sc.far=size.y*2+60;
    dir.shadow.bias=-0.0006;dir.shadow.normalBias=0.03;
    scene.add(hemi,dir,dir.target);
    GAME.lightRig={hemi,dir,target:dir.target};

    scene.fog=new THREE.FogExp2(0x0c1014,0.011*(quality.fogDensityMul||1)*(this.def.alert?1.25:1));

    // door colliders initial eval
    for(const d of this.doors)d.evaluate(this.signals);

    // announcements
    this.announceQueue=[...(this.def.announce||[])];
    this.announceT=1.2;
    ui.chamberCard(`CHAMBER ${String(this.def.num).padStart(2,'0')} — ${this.def.name.toUpperCase()}`,'KESTREL DEEP RESEARCH · KINETICS WING');

    GAME.levelGroup=b.group;
    this.bb=bb;
  }

  announce(dt){
    if(!this.announceQueue.length)return;
    this.announceT-=dt;
    if(this.announceT<=0){
      const line=this.announceQueue.shift();
      audio.chime(700);
      ui.subtitle(`<b>WREN:</b> ${line}`,Math.min(9000,1600+line.length*55));
      this.announceT=line.length*0.055+2.6;
    }
  }

  update(dt){
    if(this.done)return;
    this.timeInLevel+=dt;
    this.announce(dt);

    const P=GAME.player;

    // platforms move first, carrying riders
    for(const pl of this.platforms)pl.update(dt);
    for(const pl of this.platforms)pl.carry([P.body,...this.cubes.map(c=>c.body)],dt);

    P.update(dt,input,portalSystem);

    for(const cu of this.cubes)cu.update(dt,GAME.world,portalSystem,P,this.acids,this.grills);

    // cube/cube + cube/player separation
    for(let i=0;i<this.cubes.length;i++){
      for(let j=i+1;j<this.cubes.length;j++)separateBodies(this.cubes[i].body,this.cubes[j].body,true,true);
      if(P.held!==this.cubes[i])separateBodies(P.body,this.cubes[i].body,true,true);
    }

    for(const bt of this.buttons)bt.evaluate(this.cubes,P,this.signals);
    for(const pd of this.pedestals)pd.update(dt,this.signals);
    for(const d of this.doors){d.evaluate(this.signals);d.update(dt);}
    for(const a of this.acids)a.update(dt);
    for(const g of this.grills)g.update(dt,P,portalSystem,this.cubes);

    // acid death
    if(!P.dead){
      for(const a of this.acids){
        if(a.kills(P.body.pos,P.feetY())){this.kill();break;}
      }
    }
    // void fall guard
    if(P.body.pos.y<-40)this.kill();

    // interact prompt
    updatePrompt(P,this.cubes,this.pedestals);

    // elevator completion
    if(this.elevator&&!this.done){
      if(this.elevator.update(dt,P)){
        this.complete();
      }
    }

    updateTerminals(this.b.terminals,dt);
    fx.update(dt);
    portalSystem.update(dt);
  }

  kill(){
    const P=GAME.player;
    if(P.dead)return;
    P.dead=true;
    audio.zap();
    fx.burst(P.body.pos,24,null,3.4,.7);
    GAME.deathsTotal++;progress.deaths=GAME.deathsTotal;saveProgress(progress);
    ui.fade(true,240);
    setTimeout(()=>{
      for(const cu of this.cubes)cu.reset();
      P.respawn();
      ui.fade(false,420);
      if(Math.random()<0.85&&ANNOUNCE.deathLines.length){
        const l=ANNOUNCE.deathLines[Math.floor(Math.random()*ANNOUNCE.deathLines.length)];
        ui.subtitle(`<b>WREN:</b> ${l}`,5000);
      }
    },300);
  }

  complete(){
    this.done=true;
    audio.success();
    progress.unlocked=Math.max(progress.unlocked,this.index+1);
    saveProgress(progress);
    input.clearKeys();
    setTimeout(()=>ui.fade(true,700),350);
    setTimeout(()=>{
      const nxt=LEVELS[this.index+1];
      if(nxt){
        GAME.loadLevel(this.index+1);
        ui.fade(false,800);
      }else{
        // finale
        GAME.state='menu';
        input.releaseLock();
        ui.hudOn(false);
        ui.show('main');
        document.getElementById('btnContinue').disabled=false;
        let i=0;
        for(const l of ANNOUNCE.finale){
          setTimeout(()=>ui.subtitle(`<b>WREN:</b> ${l}`,5200),1200+i*6000);i++;
        }
        ui.subtitle(`<b>THRESHOLD</b> — evaluation complete · ${GAME.deathsTotal} reconstitutions · thank you for your data`,10000);
      }
    },1150);
  }
}

// prompt logic (grab / pedestal hints)
const _pw=new THREE.Vector3();
function updatePrompt(P,cubes,pedestals){
  let text=null;
  if(!P.held){
    const eye=P.eyePos(new THREE.Vector3());
    const dir=P.forward(new THREE.Vector3());
    for(const cu of cubes){
      if(cu.dead)continue;
      _pw.copy(cu.body.pos).sub(eye);
      if(_pw.length()<CFG.GRAB_DIST&&_pw.clone().normalize().dot(dir)>0.72){text='<kbd>E</kbd> pick up cube';break;}
    }
    if(!text)for(const pd of pedestals){
      _pw.copy(pd.pos).setY(pd.pos.y+1.12).sub(eye);
      if(_pw.length()<pd.range+0.6&&_pw.normalize().dot(dir)>0.8&&pd.available){text='<kbd>E</kbd> press interface';break;}
    }
  }else text='<kbd>E</kbd> drop';
  ui.prompt(text);
}

// ------------------------------------------------------------------ game init
portalSystem=new PortalSystem(scene,camera,renderer,null);
fx=new FX(scene);
portalSystem.fx=fx;
GAME.scene=scene;
GAME.player=new Player(null,camera);
GAME.world={colliders:[]}; // rebuilt per level

GAME.loadLevel=function(i){
  GAME.li=i;
  const def=LEVELS[i];
  const runner=new LevelRunner(def,i);
  GAME.runner=runner;
  GAME.world.colliders=[];
  runner.build();
  GAME.world.colliders=runner.b.colliders;

  // platform colliders
  runner.platformColliders=[];
  for(const pl of runner.platforms){
    const col=new Collider(new THREE.Vector3(),new THREE.Vector3(),'platform');
    pl.setCollider(col);
    GAME.world.colliders.push(col);
    runner.platformColliders.push(col);
    col.id=colIdSeq++;
  }

  // line-of-sight check for grabs (prevents fetching cubes through walls)
  const losRC=new THREE.Raycaster();
  GAME.player.losCheck=(origin,dirNorm,dist)=>{
    losRC.set(origin,dirNorm);losRC.far=dist-0.1;
    return losRC.intersectObjects(portalSystem.occluders,false).length===0;
  };
  GAME.player.world=GAME.world;

  ui.portalDots(false,false);
  GAME.state='playing';
  ui.hideAll();ui.hudOn(true);
  audio.startAmbient(1,def.alert);
};

let colIdSeq=10000;

// ------------------------------------------------------------------ menu flow
function startGame(idx){
  audio.ensure();
  audio.stopAmbient();
  GAME.portalsFired=0;
  GAME.loadLevel(idx);
  ui.fade(false,400);
  input.requestLock().then(ok=>{ if(!ok)ui.subtitle('Click the viewport to capture the mouse',3200); });
}

document.getElementById('btnNew').onclick=()=>{
  audio.ensure();
  GAME.deathsTotal=0;
  startGame(0);
};
document.getElementById('btnContinue').onclick=()=>{audio.ensure();startGame(Math.min(progress.unlocked,LEVELS.length-1));};
document.getElementById('btnControls').onclick=()=>ui.show('controls');
document.getElementById('btnCtrlBack').onclick=()=>ui.show('main');
document.getElementById('btnSettings').onclick=()=>{ui.settingsBack='main';ui.show('settings');};
document.getElementById('btnPauseSettings').onclick=()=>{ui.settingsBack='pause';ui.show('settings');};
document.getElementById('btnSetBack').onclick=()=>ui.show(ui.settingsBack);
document.getElementById('btnResume').onclick=resume;
document.getElementById('btnRestartChamber').onclick=()=>{startGame(GAME.li);};
document.getElementById('btnQuitMenu').onclick=()=>{
  GAME.state='menu';audio.stopAmbient();
  input.releaseLock();ui.hudOn(false);ui.show('main');
};
document.getElementById('btnChapters').onclick=()=>{
  const wrap=document.getElementById('chapters');wrap.innerHTML='';
  LEVELS.forEach((L,i)=>{
    const btn=document.createElement('button');btn.className='mi';
    const locked=i>progress.unlocked;
    btn.textContent=`${String(L.num).padStart(2,'0')} · ${L.name}${locked?' 🔒':''}`.replace('🔒','— locked');
    btn.disabled=locked;
    btn.onclick=()=>{audio.ensure();startGame(i);};
    wrap.appendChild(btn);
  });
  ui.show('chapters');
};
document.getElementById('btnChapBack').onclick=()=>ui.show('main');

function resume(){
  ui.hideAll();ui.hudOn(true);
  GAME.state='playing';
  audio.startAmbient(1,LEVELS[GAME.li]?.alert);
  input.requestLock();
}
function pause(){
  if(GAME.state!=='playing')return;
  GAME.state='paused';
  input.releaseLock();input.clearKeys();
  audio.stopAmbient();
  ui.show('pause');
}
input.on('unlock',()=>{ if(GAME.state==='playing')pause(); });
input.on('key',code=>{
  if(code==='Escape'){
    if(GAME.state==='playing')pause();
    else if(GAME.state==='paused')resume();
  }
  if(GAME.state!=='playing')return;
  if(code==='KeyE'){ GAME.player.tryGrab(GAME.runner.cubes,GAME.runner.pedestals); }
  if(code==='KeyR'){ startGame(GAME.li); }
});
input.on('fire',which=>{
  if(GAME.state!=='playing'||GAME.player.dead)return;
  const P=GAME.player;
  const origin=P.eyePos(new THREE.Vector3());
  const dir=P.forward(new THREE.Vector3());
  portalSystem.shoot(which,origin,dir);
  GAME.portalsFired++;
  ui.portalDots(portalSystem.blue.placed,portalSystem.orange.placed);
});

// settings binding
const syncSettingsUI=ui.bindSettings(
  null,
  { fov:v=>{camera.fov=v;camera.updateProjectionMatrix();},
    vol:v=>audio.setVolume(v), },
  ()=>applyQuality()
);
audio.setVolume(settings.vol);
camera.fov=settings.fov;camera.updateProjectionMatrix();

// ------------------------------------------------------------------ main loop
let last=performance.now(),fpsAcc=0,fpsN=0,fpsShow=0;
function tick(){
  requestAnimationFrame(tick);
  const now=performance.now();
  let dt=Math.min((now-last)/1000,0.05);
  last=now;

  if(GAME.state==='playing'&&GAME.runner){
    GAME.runner.update(dt);
    // portal traversal for held-cube edge: handled inside system
    portalSystem.renderPortals(GAME.player.held?[GAME.player.held.mesh]:null);
    composer.render();
    // perf hud
    fpsAcc+=dt;fpsN++;
    if(fpsAcc>=0.5){fpsShow=Math.round(fpsN/fpsAcc);fpsAcc=0;fpsN=0;
      if(location.search.includes('perf')){
        const m=renderer.info.memory, r=renderer.info.render;
        ui.perf(`${fpsShow} fps · ${(1000/Math.max(fpsShow,1)).toFixed(1)} ms<br>tris ${r.triangles.toLocaleString()} · calls ${r.calls}<br>geo ${m.geometries} tex ${m.textures}`);
      }
    }
  }else if(GAME.state==='menu'){
    // slow menu orbit backdrop around current level (or empty)
    const t=now*0.00008;
    if(GAME.runner){
      const c=GAME.runner.bb.getCenter(new THREE.Vector3());
      const r=Math.max(GAME.runner.bb.getSize(new THREE.Vector3()).length()*0.42,10);
      camera.position.set(c.x+Math.cos(t)*r,c.y+r*0.45,c.z+Math.sin(t)*r);
      camera.lookAt(c.x,c.y,c.z*0+1);
    }
    fx.update(dt);
    composer.render();
  }
}
GAME.tick=tick;

// ------------------------------------------------------------------ debug API
window.GAME={
  get state(){return GAME.state;}, set state(v){GAME.state=v;},
  levels:LEVELS,
  load:(i)=>{startGame(clamp(i|0,0,LEVELS.length-1));},
  pos(){const p=GAME.player;return {x:+p.pos.x.toFixed(2),y:+p.pos.y.toFixed(2),z:+p.pos.z.toFixed(2),
    yawDeg:+(p.yaw*57.2958).toFixed(1),pitchDeg:+(p.pitch*57.2958).toFixed(1)};},
  tp(x,y,z){GAME.player.setFeet(x,y,z);GAME.player.body.vel.set(0,0,0);},
  vel(x,y,z){GAME.player.body.vel.set(x,y,z);},
  look(yawDeg,pitchDeg){GAME.player.yaw=yawDeg*Math.PI/180;GAME.player.pitch=pitchDeg*Math.PI/180;},
  turn(dYaw,dPitch){GAME.player.yaw+=dYaw*Math.PI/180;GAME.player.pitch=clamp(GAME.player.pitch+dPitch*Math.PI/180,-1.55,1.55);},
  key(code,down){input.debugSetKey(code,down);},
  fire(which){input.debugFire(which);ui.portalDots(portalSystem.blue.placed,portalSystem.orange.placed);},
  use(){GAME.player.tryGrab(GAME.runner.cubes,GAME.runner.pedestals);},
  portals(){return {blue:portalSystem.blue.placed,orange:portalSystem.orange.placed,linked:portalSystem.linked,
    blueAt:portalSystem.blue.center.toArray().map(v=>+v.toFixed(1)),
    orangeAt:portalSystem.orange.center.toArray().map(v=>+v.toFixed(1))};},
  cubes(){return GAME.runner.cubes.map(c=>({pos:c.body.pos.toArray().map(v=>+v.toFixed(2)),carried:c.carried,dead:c.dead}));},
  cubeTo(i,x,y,z){const c=GAME.runner.cubes[i];if(c){c.body.pos.set(x,y,z);c.body.vel.set(0,0,0);}},
  signal(name){return GAME.runner.signals[name];},
  doors(){return GAME.runner.doors.map(d=>({open:+d.open.toFixed(2),target:d.target}));},
  god(v){GAME.godmode=v??!GAME.godmode;return GAME.godmode;},
  kill(){GAME.runner.kill();},
  win(){GAME.runner.complete();},
  shot(){return renderer.domElement.toDataURL('image/png');},
  stats(){return {fps:fpsShow,deaths:GAME.deathsTotal,portalsFired:GAME.portalsFired,
    time:((performance.now()-GAME.startTime)/1000)|0,
    tris:renderer.info.render.triangles,calls:renderer.info.render.calls};},
  resume,pause,
};

// ------------------------------------------------------------------ go
applyQuality();
resize();
buildComposer(quality.smaa);
applyQuality();
// preload chamber 0 as menu backdrop
GAME.loadLevel(0);
GAME.state='menu';
ui.show('main');
document.getElementById('btnContinue').disabled=progress.unlocked<=0;
setTimeout(()=>document.getElementById('loading').classList.add('hidden'),150);
tick();
