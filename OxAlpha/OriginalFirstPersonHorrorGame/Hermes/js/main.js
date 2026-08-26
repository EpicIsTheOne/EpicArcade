/* HOLLOW SIGNAL — main: renderer, loop, menu wiring */
(function(){
"use strict";
const HG = window.HG;

const params=new URLSearchParams(location.search);

function boot(){
  const app=document.getElementById('app');
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  if('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
  else renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=HG.settings.brightness;
  app.appendChild(renderer.domElement);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x040507);
  scene.fog=new THREE.FogExp2(0x05070a,.052);
  HG.scene=scene;
  HG.renderer=renderer;
  HG.camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,90);
  cameraFix();

  // base lights
  const hemi=new THREE.HemisphereLight(0x2a3138,0x0b0d10,.5); scene.add(hemi);
  const amb=new THREE.AmbientLight(0x181c22,.55); scene.add(amb);

  /* build */
  HG.WorldBuilder.build(scene);
  HG.Player.init(HG.camera);
  HG.Threat.init(scene);
  HG.UI.init();
  HG.Input.init(renderer.domElement);
  HG.Game.init();
  HG.Game.world=HG.world;
  HG.Game.player=HG.Player;
  HG.Game.state='title';

  /* lock helper used by game flow */
  HG.UI.lockPointerForPlay=()=>{ HG.Input.lockPointer(renderer.domElement); };

  /* brightness live-apply */
  const origSave=HG.settings.save.bind(HG.settings);
  HG.settings.save=()=>{ renderer.toneMappingExposure=HG.settings.brightness*.9+.1*HG.settings.brightness*1.4;
    renderer.toneMappingExposure=Math.max(.25,HG.settings.brightness*.95); origSave(); };

  /* menu buttons */
  const $=id=>document.getElementById(id);
  $('btnStart').addEventListener('click',()=>{
    HG.Audio.init(); HG.Audio.resume();
    HG.Game.beginIntro();
    // NOTE: no pointer lock here — the intro must stay clickable
  });
  const panelBack=(panel)=>()=>$(panel).classList.add('hidden');
  let settingsReturn='title';
  $('btnTitleSettings').addEventListener('click',()=>{settingsReturn='title';$('settingsWrap').classList.remove('hidden');});
  $('btnPauseSettings').addEventListener('click',()=>{settingsReturn='pause';$('pauseWrap').classList.add('hidden');$('settingsWrap').classList.remove('hidden');});
  $('btnSetBack').addEventListener('click',()=>{
    $('settingsWrap').classList.add('hidden');
    if(settingsReturn==='pause')$('pauseWrap').classList.remove('hidden');
  });
  $('btnTitleControls').addEventListener('click',()=>$('controlsWrap').classList.remove('hidden'));
  $('btnPauseControls').addEventListener('click',()=>{$('pauseWrap').classList.add('hidden');$('controlsWrap').classList.remove('hidden');});
  $('btnCtrlBack').addEventListener('click',()=>{
    $('controlsWrap').classList.add('hidden');
    if(HG.Game.state==='pause')$('pauseWrap').classList.remove('hidden');
  });
  $('btnResume').addEventListener('click',()=>HG.Game.resumePlay());
  $('btnRestartCp').addEventListener('click',()=>HG.Game.restartFromCheckpoint());
  $('btnQuit').addEventListener('click',()=>HG.Game.quitToTitle());
  $('credits').addEventListener('click',()=>location.reload());

  /* pointer lock lost during play → pause */
  HG.onPointerLockLost=()=>{
    if(HG.Game.state==='play') HG.Game.pauseGame();
  };
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&HG.Game.state==='play') HG.Game.pauseGame();
  });

  window.addEventListener('resize',cameraFix);
  function cameraFix(){
    HG.camera.aspect=innerWidth/innerHeight;
    HG.camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  }

  /* main loop */
  let last=performance.now(), fogTarget=.052;
  function frame(now){
    requestAnimationFrame(frame);
    let dt=(now-last)/1000; last=now;
    dt=Math.min(dt,.05);

    const G=HG.Game, P=HG.Player;
    G.update(dt,HG.Input);

    // fog follows player's floor
    if(G.state!=='title'){
      fogTarget=P.floor===0?.052:.068;
      scene.fog.density+=(fogTarget-scene.fog.density)*Math.min(1,dt*3);
    }

    // audio listener
    if(G.state!=='title'&&P.camYaw){
      HG.Audio.setListener(P.x,P.z,P.yaw,P.floor);
      HG.Audio.update(dt);
    } else {
      HG.Audio.update(dt);
    }

    renderer.render(scene,HG.camera);
    HG.Input.endFrame();
  }
  requestAnimationFrame(frame);

  /* hide loading once first frame rendered */
  setTimeout(()=>document.getElementById('loading').classList.add('hidden'),120);

  /* ---------- debug hooks (?debug=1) ---------- */
  if(params.get('debug')){
    window.HG.debug={
      tp(x,z,f,yaw=0){ HG.Player.place(x,z,yaw,f); },
      give(w){ const F=HG.Game.flags;
        if(w==='fuses'){F.fuseA=F.fuseB=true;}
        if(w==='valve')F.valveHandle=F.handleInstalled=true;
        if(w==='all'){F.fuseA=F.fuseB=F.valveHandle=F.handleInstalled=true;}
        HG.Game.refreshInv(); },
      aux(){ HG.Game.flags.fuseA=HG.Game.flags.fuseB=true; HG.Game.powerAux(); },
      gen(){ this.aux(); HG.Game.flags.valves=[true,false,true]; HG.world.setValveState(0,true);HG.world.setValveState(1,false);HG.world.setValveState(2,true); HG.Game.flags.handleInstalled=HG.Game.flags.valveHandle=HG.Game.flags.fuelOK=true; HG.Game.powerGen(); },
      code(){ this.gen(); HG.Game.openKeypad(); },
      finale(){ this.gen(); HG.Game.startFinale(); },
      end(){ HG.Game.showEndScreen(); },
      threat(x,z){ HG.Threat.spawnAt(x,z,HG.Player.floor); },
      state(){ return JSON.stringify({state:HG.Game.state,flags:HG.Game.flags,cp:HG.Game.checkpoint.id,
        p:{x:+HG.Player.x.toFixed(1),z:+HG.Player.z.toFixed(1),f:HG.Player.floor},threat:{s:HG.Threat.state,x:+HG.Threat.x.toFixed(1),z:+HG.Threat.z.toFixed(1)}}); },
      skipIntro(){ HG.Game.beginPlay(); },
    };
    console.log('[HOLLOW SIGNAL] debug hooks ready at window.HG.debug');
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

})();
