import * as THREE from 'three';
import {buildWorld} from './scene.js';
import {CamSystem} from './cameras.js';
import {UI} from './ui.js';
import {sfx} from './audio.js';
import {Game} from './game.js';

function showErr(msg){
  const el=document.getElementById('boot-error');
  if(!el)return;
  el.classList.remove('hide');
  el.textContent='BOOT ERROR — '+msg;
}
window.addEventListener('error',e=>{
  showErr((e.message||'unknown')+' @ '+(e.filename||'?').split('/').pop()+':'+(e.lineno||''));
});
window.addEventListener('unhandledrejection',e=>{
  showErr('async: '+(e.reason&&e.reason.message||e.reason));
});

function boot(){
  try{
    const qs=new URLSearchParams(location.search);
    const qa=qs.has('qa');
    let saved={};
    try{saved=JSON.parse(localStorage.getItem('starlight.nightshift.v1')||'{}');}catch(e){}
    const quality=qa?'lite':(saved.settings&&saved.settings.gfx)||'ultra';

    const canvas=document.getElementById('gl');
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(qa?1:Math.min(devicePixelRatio||1,quality==='ultra'?2:quality==='high'?1.5:1));
    renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=quality!=='lite';
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.18;

    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x04050a,.042);

    const officeCam=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.05,70);
    officeCam.position.set(0,1.52,14.95);
    officeCam.rotation.order='YXZ';

    const world=buildWorld(scene,quality);

    const cams=new CamSystem(renderer);
    cams.resize(innerWidth,innerHeight,renderer.getPixelRatio());

    const noop=()=>{};
    const ui=new UI({
      onFlipHover:noop,onFlipToggle:noop,onMonClose:noop,onLureBtn:noop,onSnareBtn:noop,
      onResume:noop,onRestart:noop,onQuit:noop,onHelpClose:noop,onArchiveBack:noop,
      onSettingsBack:noop,onRetry:noop,onGoMenu:noop,onWinNext:noop,onSetting:noop,
      canSub:()=>true,onPanelDown:noop,onPanelUp:noop,onMapPick:noop,
      onArchive:noop,onSettingsOpen:noop,onHelp:noop,onTypeTick:noop
    });

    const game=new Game(renderer,scene,officeCam,world,cams,ui,sfx);
    window.__SP=game;

    window.addEventListener('resize',()=>{
      renderer.setSize(innerWidth,innerHeight);
      officeCam.aspect=innerWidth/innerHeight;
      officeCam.updateProjectionMatrix();
      cams.resize(innerWidth,innerHeight,renderer.getPixelRatio());
    });

    let last=performance.now();
    function frame(now){
      const dt=Math.min(.05,(now-last)/1000);
      last=now;
      try{
        game.update(dt);
        game.render();
      }catch(err){
        console.error(err);
        showErr(err.message);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    console.log('%c★ STARLIGHT PLAYHOUSE — terminal online','color:#ffd97a;font-size:14px');
  }catch(err){
    console.error(err);
    showErr(err.message+'\n'+(err.stack||'').slice(0,900));
    throw err;
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();
