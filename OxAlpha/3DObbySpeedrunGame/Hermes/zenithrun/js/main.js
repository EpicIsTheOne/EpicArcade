/* ZENITH RUN · main orchestrator · ox-alpha piagent run-01 · sweep-9f1928d5 */
(function(){
'use strict';
const ZR = window.ZR = window.ZR || {};

/* ---------------- renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x39406e, 0.0062);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth/window.innerHeight, 0.1, 1500);

/* sky dome */
const skyMat = new THREE.ShaderMaterial({
  side:THREE.BackSide, depthWrite:false, fog:false,
  uniforms:{
    top:{value:new THREE.Color(0x0e1438)}, mid:{value:new THREE.Color(0x3a4478)},
    hor:{value:new THREE.Color(0xff9660)}, bot:{value:new THREE.Color(0x141034)},
    sunDir:{value:new THREE.Vector3(0.45,0.38,-0.8).normalize()}
  },
  vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:[
    'varying vec3 vP; uniform vec3 top,mid,hor,bot,sunDir;',
    'void main(){',
    ' float h=normalize(vP).y;',
    ' vec3 c = h>0.28 ? mix(mid,top,smoothstep(0.28,0.9,h))',
    '        : h>-0.05 ? mix(hor,mid,smoothstep(-0.05,0.28,h))',
    '        : mix(bot,hor,smoothstep(-0.7,-0.05,h));',
    ' float s=pow(max(dot(normalize(vP),sunDir),0.0),180.0);',
    ' c += vec3(1.0,0.82,0.55)*s*0.9;',
    ' float s2=pow(max(dot(normalize(vP),sunDir),0.0),6.0);',
    ' c += vec3(1.0,0.6,0.35)*s2*0.16;',
    ' gl_FragColor=vec4(c,1.0); }'
  ].join('\n')
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1000,24,14), skyMat));

/* lights */
scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x33255c, 0.85));
const sun = new THREE.DirectionalLight(0xffd2a0, 1.18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.near=10; sun.shadow.camera.far=260;
sun.shadow.camera.left=-42; sun.shadow.camera.right=42;
sun.shadow.camera.top=42; sun.shadow.camera.bottom=-42;
sun.shadow.bias=-0.0006;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun); scene.add(sun.target);

/* ---------------- game objects ---------------- */
const course = new ZR.Course();
course.build(scene);
ZR.course = course;

const ev = {
  jump(sl){ ZR.audio.jump(); fx.burstJump(player.pos); },
  wallJump(){ ZR.audio.wallJump(); fx.burstWall(player.pos, player.wallN); },
  land(i){ ZR.audio.land(i); if(i>0.25){ fx.burstLand(player.pos,i); camShake=Math.min(0.5,camShake+i*0.35);} squashImpulse(Math.min(0.42,0.12+i*0.3)); },
  dash(dir){ ZR.audio.dash(); dashKick=9; fx.burstDash(player.pos,dir); },
  bounce(){ ZR.audio.bounce(); fx.burstBounce(player.pos); squashImpulse(0.3); },
  bonk(){ ZR.audio.bonk(); },
  step(){ ZR.audio.step(); },
  slideStart(){ ZR.audio.slideStart(); fx.burstLand(player.pos,0.3); },
  slideStop(){ ZR.audio.slideStop(); }
};
function squashImpulse(k){ player.squash = k; }

const player = new ZR.Player(ev);
scene.add(player.mesh);

let particles=null, trail=null, speedlines=null;
particles = new ZR.fx.ParticleSystem(scene);
trail = new ZR.fx.Trail(scene);
speedlines = new ZR.fx.SpeedLines();

const rec = new ZR.ghost.Recorder();
const ghost = new ZR.ghost.GhostRig(scene);
let bestRun = ZR.ghost.loadBest();
if (bestRun) ghost.load(bestRun.samples);

/* small local particle-burst helpers */
const fx = {
  burstJump(p){ particles.spawn({p:[p.x,p.y-0.7,p.z], n:6, vel:[0,-1,0], vspread:2.2, color:[0xbfd8ff,0x7fa8ff], size:5, life:0.4, grav:4}); },
  burstLand(p,i){ particles.spawn({p:[p.x,p.y-player.hy+0.1,p.z], n:6+(i*14|0), spread:i*0.5, vel:[0,0.6,0], vspread:1.2+i*3, color:[0xcfe2ff,0x93aede], size:6, life:0.5, grav:7}); },
  burstWall(p,n){ particles.spawn({p:[p.x+n.x*0.5,p.y,p.z+n.z*0.5], n:8, vel:[n.x*3,1,n.z*3], vspread:2, color:[0xffe9a8,0xffc94d], size:5, life:0.4, grav:5}); },
  burstDash(p,d){ particles.spawn({p:[p.x-d.x,p.y-0.2,p.z-d.z], n:12, vel:[-d.x*4,0,-d.z*4], vspread:2.5, color:[0x40e8ff,0xffffff,0xff5ea8], size:7, life:0.35, grav:0}); },
  burstBounce(p){ particles.spawn({p:[p.x,p.y-0.8,p.z], n:14, vel:[0,6,0], vspread:3, color:[0xa8ff5e,0xd6ff9e], size:8, life:0.5, grav:8}); },
  burstDeath(p){ particles.spawn({p:[p.x,p.y,p.z], n:26, spread:0.4, vel:[0,2,0], vspread:7, color:[0xff5ea8,0xff2450,0xffffff], size:8, life:0.7, grav:9}); },
  burstCheckpoint(p){ particles.spawn({p:[p.x,p.y+1.5,p.z], n:20, spread:1.8, vel:[0,3,0], vspread:2.4, color:[0xa8ff5e,0x40e8ff,0xffffff], size:7, life:0.9, grav:2}); },
  confetti(p){ particles.spawn({p:[p.x,p.y+7,p.z], n:60, spread:3.5, vel:[0,-2,0], vspread:5, color:[0xffc94d,0xff5ea8,0x40e8ff,0xa8ff5e,0xffffff], size:9, life:1.6, grav:5}); }
};

/* ---------------- state ---------------- */
const S = {
  state:'menu',            // menu | ready | running | paused | finished | freeroam
  prevState:null,
  runTime:0, deaths:0,
  cpsHit:[], cpTimes:[],
  lastResult:null,
  camYaw:0, camPitch:0.34, camDist:8.2,
  manualCamT:99,
  dashKick:0, camShake:0,
  boostCd:0, helpOpen:false,
  autoAlign:true,
  finishConfettiT:0
};
let dashKick=0, camShake=0;

const SPAWN = course.spawnPoint.clone();

function currentSpawn(){
  const i=S.cpsHit.length? S.cpsHit[S.cpsHit.length-1] : -1;
  return i>=0 ? course.checkpoints[i].spawn : SPAWN;
}
function totalCp(){ return course.checkpoints.length; }

function doRestart(){
  S.state='ready'; S.runTime=0; S.deaths=0;
  S.cpsHit=[]; S.cpTimes=[];
  course.checkpoints.forEach(cp=>{ cp.active=false; cp.ringMat.color.setHex(0x40e8ff);
    cp.beamMat.color.setHex(0x40e8ff); cp.beamMat.opacity=0.22;
    cp.disc.material=cp._discMat; });
  course.finishTrigger.crossed=false;
  player.spawnAt(currentSpawn());
  player.heading=Math.PI; // face +Z? heading measured atan2(x,z): +Z is 0... face course dir:
  player.heading=0;
  rec.start();
  trail.show(false); trail.clear();
  ZR.audio.slideStop();
  ZR.ui.showFinish(false); ZR.ui.showHud(true); ZR.ui.split(null);
  ZR.ui.hud({time:0,cp:0,totalCp:totalCp(),deaths:0,dashCdFrac:1,speedFrac:0});
}
function startRun(){
  ZR.audio.unlock();
  ZR.ui.showStart(false);
  doRestart();
}
function beginTiming(){
  S.state='running';
}
function die(){
  if (S.state!=='running') return;
  S.deaths++;
  ZR.audio.death();
  fx.burstDeath(player.pos);
  ZR.fx.flash('#ff2450', 0.55, 500);
  camShake=0.5;
  player.spawnAt(currentSpawn());
  player.invulnUntil = performance.now()/1000 + 0.5;
}
function finishRun(){
  if (S.state!=='running') return;
  S.state='finished';
  const t=S.runTime;
  ZR.audio.finish(); ZR.audio.slideStop();
  fx.confetti(course.finishTrigger? {x:0,y:44,z:350}:{x:0,y:5,z:0});
  setTimeout(()=>fx.confetti({x:-3,y:46,z:352}),300);
  setTimeout(()=>fx.confetti({x:3,y:46,z:352}),600);
  const samples=rec.stop();
  const prevBest = bestRun? bestRun.time : null;
  const isNew = prevBest==null || t<prevBest;
  if (isNew){
    bestRun={time:t, splits:S.cpTimes.slice(), samples};
    ZR.ghost.saveBest(t,S.cpTimes,samples);
    ghost.load(samples);
    ZR.ui.best(bestRun);
  }
  const splitsDelta = bestRun && bestRun.splits ? S.cpTimes.map((ct,i)=> ct!=null && bestRun.splits[i]!=null ? ct-bestRun.splits[i] : null) : [];
  S.lastResult={time:t, pb:(isNew?t:prevBest), isNew, deaths:S.deaths, splitsDelta};
  ZR.ui.finish(S.lastResult);
}

/* pause */
function setPause(on){
  if (on && (S.state==='running'||S.state==='ready')){
    S.prevState=S.state; S.state='paused';
    ZR.ui.pauseStats('time '+ZR.fmtTime(S.runTime)+' · CP '+S.cpsHit.length+'/'+totalCp()+' · deaths '+S.deaths);
    ZR.ui.showPause(true);
    ZR.audio.duck(true); ZR.audio.slideStop();
  } else if (!on && S.state==='paused'){
    S.state=S.prevState||'ready';
    ZR.ui.showPause(false);
    ZR.audio.duck(false);
  }
}

/* key handling */
ZR.input.onKey=function(c){
  if (c==='KeyR' && S.state!=='menu'){ doRestart(); ZR.audio.uiClick(); }
  else if (c==='KeyH'){ S.helpOpen=!S.helpOpen; ZR.ui.help(S.helpOpen); }
  else if (c==='KeyM'){ ZR.audio.setMuted(!ZR.audio.isMuted()); ZR.ui.toast(ZR.audio.isMuted()?'MUTED':'SOUND ON'); }
  else if (c==='KeyG'){ ghost.enabled=!ghost.enabled; if(!ghost.enabled) ghost.g.visible=false;
                          ZR.ui.ghostTag(ghost.enabled&&ghost.has()&&(S.state==='running')); }
  else if (c==='Escape'||c==='KeyP'){
    if (S.state==='finished'||S.state==='freeroam'){ /* handled as resume below */ }
    setPause(S.state!=='paused');
  }
  else if (c==='KeyF'){ try{ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }catch(e){} }
};

/* UI wiring */
ZR.ui.init({
  totalCp: totalCp(),
  onStart: startRun,
  onResume: ()=>setPause(false),
  onRestart: ()=>{ ZR.ui.showFinish(false); ZR.ui.showPause(false); startRun(); },
  onFreeRoam: ()=>{ ZR.ui.showFinish(false); S.state='freeroam'; },
  onGhostToggle: v=>{ ghost.enabled=v; if(!v) ghost.g.visible=false; }
});

if (bestRun) ZR.ui.best(bestRun);

/* ---------------- triggers (per physics step) ---------------- */
function triggers(prev){
  const p=player.pos;
  /* void */
  if (p.y < course.killY){ die(); return; }
  /* hazards */
  if ((S.state==='running') && (!player.invulnUntil || performance.now()/1000>player.invulnUntil)){
    const hz=player.touchingHazard();
    if (hz){ die(); return; }
  }
  if (S.state!=='running') return;
  /* checkpoints */
  for (let i=0;i<course.checkpoints.length;i++){
    const cp=course.checkpoints[i];
    if (cp.active) continue;
    const dx=p.x-cp.p.x, dz=p.z-cp.p.z, dy=p.y-cp.p.y;
    if (dx*dx+dz*dz < 3.4*3.4 && Math.abs(dy)<4.5){
      course.activateCheckpoint(cp);
      S.cpsHit.push(i);
      S.cpTimes[i]=S.runTime;
      player.dashCdT=0;
      ZR.audio.checkpoint();
      fx.burstCheckpoint(cp.p);
      ZR.ui.centerPop('CHECKPOINT '+(i+1),'#a8ff5e',900);
      if (bestRun && bestRun.splits && bestRun.splits[i]!=null){
        ZR.ui.split(S.runTime-bestRun.splits[i]);
      } else ZR.ui.split(null);
    }
  }
  /* dash gates */
  for (let i=0;i<course.gates.length;i++){
    const g=course.gates[i];
    if (g.cd>0) continue;
    const s0=(prev.x-g.p.x)*g.n.x+(prev.y-g.p.y)*g.n.y+(prev.z-g.p.z)*g.n.z;
    const s1=(p.x-g.p.x)*g.n.x+(p.y-g.p.y)*g.n.y+(p.z-g.p.z)*g.n.z;
    if (s0*s1<0){
      const f=s0/(s0-s1);
      const cx=prev.x+(p.x-prev.x)*f-g.p.x, cy=prev.y+(p.y-prev.y)*f-g.p.y, cz=prev.z+(p.z-prev.z)*f-g.p.z;
      if (cx*cx+cy*cy+cz*cz < g.r*g.r && player.hspeed>4){
        g.cd=0.6;
        const hs=player.hspeed;
        const ns=Math.min(30,hs*1.07+0.6);
        const k=ns/Math.max(0.01,hs);
        player.vel.x*=k; player.vel.z*=k;
        ZR.audio.gate();
        particles.spawn({p:[g.p.x,g.p.y,g.p.z], n:14, spread:g.r*0.7, vel:[0,0,0], vspread:2,
          color:[0xff5ea8,0xffc94d,0xffffff], size:7, life:0.5, grav:0});
      }
    }
  }
  /* boost strips */
  if (S.boostCd<=0){
    for (let i=0;i<course.boosts.length;i++){
      const b=course.boosts[i];
      if (p.x>b.min.x&&p.x<b.max.x&&p.y>b.min.y&&p.y<b.max.y&&p.z>b.min.z&&p.z<b.max.z){
        const hs=player.hspeed;
        if (hs>3){
          const ns=Math.min(22,hs+5);
          const k=ns/Math.max(0.01,hs);
          player.vel.x*=k; player.vel.z*=k;
          S.boostCd=0.35;
          ZR.audio.gate();
          particles.spawn({p:[p.x,p.y-0.6,p.z], n:8, vel:[0,1,0], vspread:2, color:[0xa8ff5e], size:6, life:0.4, grav:3});
        }
        break;
      }
    }
  }
  /* finish */
  const F=course.finishTrigger;
  if (!F.crossed && prev.z<F.z && p.z>=F.z && p.x>F.minX && p.x<F.maxX && p.y>F.minY-2 && p.y<F.maxY){
    F.crossed=true;
    finishRun();
  }
}

/* ---------------- camera ---------------- */
const camTargetSm=new THREE.Vector3().copy(SPAWN);
const camPosSm=new THREE.Vector3(SPAWN.x, SPAWN.y+4, SPAWN.z-9);
function updateCamera(dt){
  const pp=player.pos;
  /* auto align behind movement */
  const manual = Math.abs(ZR.input.camTurn())>0.0001;
  if (manual) S.manualCamT=0; else S.manualCamT+=dt;
  S.camYaw += ZR.input.camTurn()*dt;
  S.camPitch += ZR.input.camPitch()*dt;
  S.camPitch=Math.max(-0.05,Math.min(0.9,S.camPitch));
  const zd=ZR.input.zoom(); if(zd) S.camDist=Math.max(5,Math.min(12,S.camDist+zd*0.8));
  if (S.autoAlign && !manual && S.manualCamT>1.1 && player.grounded && player.hspeed>7 && S.state==='running'){
    const want=Math.atan2(player.vel.x,player.vel.z);
    let d=want-S.camYaw; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
    S.camYaw += d*Math.min(1, 2.2*dt*Math.min(1,Math.abs(d)));
  }
  /* lookahead */
  const la=Math.min(3, player.hspeed*0.16);
  const hx=Math.sin(player.heading)*la, hz=Math.cos(player.heading)*la;
  const tx=pp.x+hx, ty=pp.y+0.6, tz=pp.z+hz;
  const k=1-Math.exp(-8*dt);
  camTargetSm.lerp(new THREE.Vector3(tx,ty,tz),k);
  /* position */
  const cpitch=Math.sin(S.camPitch), yoff=S.camDist*cpitch+2.2;
  const flat=S.camDist*Math.cos(S.camPitch);
  const desired=new THREE.Vector3(camTargetSm.x-Math.sin(S.camYaw)*flat, camTargetSm.y+yoff, camTargetSm.z-Math.cos(S.camYaw)*flat);
  /* pull in on obstruction */
  const dir=desired.clone().sub(camTargetSm);
  const len=dir.length(); dir.normalize();
  let cut=len;
  const cols=course.colliders;
  for(let t=0.6;t<len;t+=0.6){
    const sx=camTargetSm.x+dir.x*t, sy=camTargetSm.y+dir.y*t, sz=camTargetSm.z+dir.z*t;
    let blocked=false;
    for(let i=0;i<cols.length;i++){ const c=cols[i];
      if(c.type==='hazard')continue;
      if(sx>c.min.x&&sx<c.max.x&&sy>c.min.y&&sy<c.max.y&&sz>c.min.z&&sz<c.max.z){blocked=true;break;} }
    if(blocked){ cut=Math.max(1.2,t-0.5); break; }
  }
  desired.copy(camTargetSm).addScaledVector(dir,cut);
  camPosSm.lerp(desired, 1-Math.exp(-11*dt));
  /* shake */
  camShake=Math.max(0,camShake-dt*1.8);
  const sh=camShake*camShake*0.35;
  camera.position.copy(camPosSm).add(new THREE.Vector3((Math.random()-0.5)*sh,(Math.random()-0.5)*sh,(Math.random()-0.5)*sh));
  camera.lookAt(camTargetSm.x, camTargetSm.y+0.4, camTargetSm.z);
  /* FOV feel */
  dashKick=Math.max(0,dashKick-dt*26);
  const target=68 + Math.max(0,Math.min(17,player.hspeed-9))*0.85 + dashKick;
  if (Math.abs(camera.fov-target)>0.05){ camera.fov+=(target-camera.fov)*Math.min(1,7*dt); camera.updateProjectionMatrix(); }
}

/* ---------------- menu camera ---------------- */
let menuT=0;
function updateMenuCam(dt){
  menuT+=dt;
  const a=menuT*0.12;
  camera.position.set(SPAWN.x+Math.sin(a)*17, 7.5+Math.sin(menuT*0.3)*1.2, SPAWN.z+Math.cos(a)*17);
  camera.lookAt(SPAWN.x, 2.5, SPAWN.z+6);
}

/* ---------------- main loop ---------------- */
let last=performance.now(), acc=0, fpsAcc=0, fpsN=0, avgFps=60;
const STEP=1/120;
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000; last=now;
  if(dt>0.06) dt=0.06;
  fpsAcc+=dt; fpsN++;
  if(fpsAcc>0.5){ avgFps=fpsN/fpsAcc; fpsAcc=0; fpsN=0; }

  const simActive = S.state==='ready'||S.state==='running'||S.state==='finished'||S.state==='freeroam';

  if (simActive){
    /* timing starts on first movement input */
    if (S.state==='ready'){
      const inp=ZR.input.axis();
      if (inp.mag>0||ZR.input.jumpPressed()||ZR.input.dashPressed()) beginTiming();
    }
    if (S.state==='running'){
      S.runTime+=dt;
      rec.tick(S.runTime, {x:player.pos.x, y:player.pos.y-player.hy, z:player.pos.z}, player.heading);
    }
    acc+=dt;
    let steps=0;
    S.boostCd-=dt;
    while(acc>=STEP && steps<6){
      course.update(STEP);
      const prev={x:player.pos.x,y:player.pos.y,z:player.pos.z};
      player.update(STEP, ZR.input, S.camYaw);
      triggers(prev);
      acc-=STEP; steps++;
      if (S.state==='paused') break;
    }
    /* ghost */
    if (ghost.enabled && ghost.has()){
      if (S.state==='running'){ ghost.seek(S.runTime); ZR.ui.ghostTag(true); }
      else if (S.state==='finished'){ ghost.seek(S.lastResult? S.lastResult.time : 0); }
      else ghost.g.visible=false;
    }
    /* trail + speedlines + wind by speed */
    const hs=player.hspeed;
    const fast=hs>13.5;
    trail.show(fast);
    if(fast) trail.push({x:player.pos.x,y:player.pos.y-0.25,z:player.pos.z});
    speedlines.update(dt, Math.max(0,Math.min(1,(hs-16)/11)) * (S.state==='running'?1:0.3), now/1000);
    ZR.audio.setWind(Math.min(1,hs/26));
    /* HUD */
    if (S.state==='running'||S.state==='ready'){
      ZR.ui.hud({time:S.runTime, cp:S.cpsHit.length, totalCp:totalCp(), deaths:S.deaths,
        dashCdFrac: player.dashCdT<=0?1:1-player.dashCdT/0.85,
        speedFrac: Math.min(1,hs/27)});
    }
  } else {
    speedlines.update(dt,0,now/1000);
    ZR.audio.setWind(0);
  }

  player.updateVisual(dt);
  particles.update(dt);
  if (S.state==='menu') updateMenuCam(dt); else updateCamera(dt);

  /* shadow follows player */
  const focus = S.state==='menu'? SPAWN : player.pos;
  sun.position.set(focus.x+40, focus.y+62, focus.z-30);
  sun.target.position.copy(focus); sun.target.updateMatrixWorld();

  renderer.render(scene,camera);
  ZR.input.endFrame();
}

window.addEventListener('resize', ()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
  speedlines.resize();
});
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && S.state==='running') setPause(true); });
speedlines.resize();

/* start screen shows menu world */
player.spawnAt(SPAWN);
player.heading=0;
ZR.ui.showHud(false);
requestAnimationFrame(frame);

/* ---------------- QA hook (read-only + safe actions) ---------------- */
window.__ZR={
  ver:'zr1-r1-oxalpha',
  state(){return S.state;},
  info(){ return {p:[+player.pos.x.toFixed(3),+player.pos.y.toFixed(3),+player.pos.z.toFixed(3)],
    v:[+player.vel.x.toFixed(3),+player.vel.y.toFixed(3),+player.vel.z.toFixed(3)],
    grounded:player.grounded, hy:player.hy, hspeed:+player.hspeed.toFixed(2),
    heading:+player.heading.toFixed(3), sliding:player.sliding, dashCd:+player.dashCdT.toFixed(2)}; },
  camYaw(){return S.camYaw;},
  setCamYaw(a){S.camYaw=a;},
  setAutoAlign(v){S.autoAlign=!!v;},
  timer(){return +S.runTime.toFixed(3);},
  cps(){return S.cpsHit.slice();},
  deaths(){return S.deaths;},
  movers(){return course.movers.map(m=>({x:+m.pos.x.toFixed(2),y:+m.pos.y.toFixed(2),z:+m.pos.z.toFixed(2)}));},
  botPath(){return course.botPath;},
  checkpoints(){return course.checkpoints.map(c=>[c.p.x,c.p.y,c.p.z]);},
  finishInfo(){return S.lastResult;},
  fps(){return +avgFps.toFixed(1);},
  restart(){doRestart();},
  start(){startRun();},
  ping:'pong'
};
})();
