// game.js — Wonderdrome main engine: scene, office view, defenses, power, night loop,
// post-processing, jumpscares, blackout sequence.
'use strict';
WD.game = (() => {
  let renderer, scene, camera, composer, bloomPass;
  let worldRoot, charMeshes={}, doorMeshL, doorMeshE, fanGroup;
  let camViewCam, monitorRT=[], monitorPlanes=[];
  const clocks={ last:0 };
  let flickerState={};

  // ---------- init ----------
  async function boot(){
    const canvas=document.getElementById('game');
    renderer=new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;

    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x030408);
    camera=new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 120);
    camera.rotation.order='YXZ';

    WD.loader=new THREE.GLTFLoader();

    worldRoot=WD.world.build(scene);
    WD.worldAnchors=worldRoot.userData.anchors;
    const R=worldRoot.userData.rooms;
    doorMeshL=R.office.doorL; doorMeshE=R.office.doorE;
    fanGroup=R.office.fan;

    // characters
    try{
      const chars=await WD.characters.buildAll();
      for(const id in chars){
        const c=chars[id];
        c.root.visible=false;
        scene.add(c.root);
        charMeshes[id]=c;
      }
      WD.charRigs=chars;
    }catch(e){ console.error('character load failed', e); }

    // post FX
    composer=new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene,camera));
    bloomPass=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 0.55, 0.55, 0.82);
    composer.addPass(bloomPass);
    // CRT/static shader on everything (subtle in-world, strong on cams via CSS overlay)
    const crt=new THREE.ShaderPass(WD.CRTShader); crt.uniforms.density.value=0.06;
    composer.addPass(crt);
    WD.crt=crt;

    addEventListener('resize', ()=>{
      camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight);
    });

    WD.view={ yaw:0, pitch:-0.05 };   // yaw 0 = facing north (the doors) from the desk; PI faces the desk wall
    bindInput();
    WD.ui.init();
    WD.save.load();
    WD.state.screen='menu';                  // ready for the player
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  const keys={};
  function bindInput(){
    addEventListener('keydown', e=>{
      if(e.repeat) return;
      keys[e.code]=true;
      if(WD.state.screen!=='play'){ return; }
      switch(e.code){
        case 'Space': e.preventDefault(); toggleMonitor(); break;
        case 'KeyD': toggleDoor('L'); break;
        case 'KeyE': toggleDoor('E'); break;
        case 'KeyQ': toggleLight('L'); break;
        case 'KeyF': toggleLight('E'); break;
        case 'KeyS': toggleSeal(); break;
        case 'KeyA': lure(); break;
        case 'Escape': WD.ui.pauseToggle(); break;
      }
    });
    addEventListener('keyup', e=>{ keys[e.code]=false; });
    // mouse look — NON-inverted by default (invertY option exists in settings)
    addEventListener('mousemove', e=>{
      if(document.pointerLockElement!==document.body) return;
      if(WD.state.screen!=='play'||WD.state.monitor) return;
      applyLook(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', ()=>{
      if(document.pointerLockElement!==document.body && WD.state.screen==='play' && !WD.state.monitor
         && !WD.state.dead && !WD.state.won){ WD.ui.showPauseHint(true); }
      else WD.ui.showPauseHint(false);
    });
    canvasClick();
  }
  // shared look-math so QA can verify directional semantics exactly
  function applyLook(dx, dy){
    const inv=WD.state.settings.invertY? -1 : 1;
    WD.view.yaw   -= dx*0.0023;               // mouse right -> look right
    WD.view.pitch -= dy*0.0023*inv;           // mouse up -> look up
    WD.view.pitch=WD.utils.clamp(WD.view.pitch,-0.85,0.7);
  }
  function canvasClick(){
    document.body.addEventListener('click', ()=>{
      if(WD.state.screen==='play'&&!WD.state.monitor&&!WD.state.dead&&!WD.state.won
         &&document.pointerLockElement!==document.body){
        document.body.requestPointerLock();
      }
    });
  }

  // ---------- defense actions ----------
  function usageDelta(d){ /* recompute pips */ 
    const st=WD.state;
    let u=1; if(st.monitor)u++; if(st.doorL)u++; if(st.doorE)u++;
    if(st.lightL)u++; if(st.lightE)u++; if(st.sealed)u++;
    st.usagePips=u;
  }
  function toggleDoor(side){
    const st=WD.state;
    if(st.power<=0||st.powerOut) { WD.audio.event('error'); return; }
    if(side==='L') st.doorL=!st.doorL; else st.doorE=!st.doorE;
    WD.audio.event('door_move');
    usageDelta();
  }
  function toggleLight(side){
    const st=WD.state;
    if(st.power<=0||st.powerOut){ WD.audio.event('error'); return; }
    if(side==='L'){ st.lightL=!st.lightL; if(st.lightL&&WD.view) WD.view.flashUsed=true; }
    else { st.lightE=!st.lightE; if(st.lightE&&WD.view) WD.view.flashUsed=true; }
    WD.audio.event('click');
    usageDelta();
  }
  function toggleSeal(){
    const st=WD.state;
    if(st.power<=0||st.powerOut){ WD.audio.event('error'); return; }
    st.sealed=!st.sealed;
    WD.audio.event('seal');
    usageDelta();
  }
  function toggleMonitor(){
    const st=WD.state;
    st.monitor=!st.monitor;
    if(st.monitor){
      if(document.pointerLockElement===document.body) document.exitPointerLock();
      WD.audio.event('monitor_up');
    } else {
      WD.audio.event('cam_switch');
      setTimeout(()=>{ if(!st.monitor&&st.screen==='play'&&!st.dead) document.body.requestPointerLock(); },60);
    }
    usageDelta();
    WD.ui.syncMonitor();
  }
  function lure(){
    const st=WD.state;
    if(st.lureCd>0||st.powerOut){ WD.audio.event('error'); return; }
    // pick nearest active threat room that has a camera
    let best=null,bd=99;
    for(const id in WD.ai.state.chars){
      const c=WD.ai.state.chars[id];
      if(['door_l','door_e','vent_n','vent_s','office'].includes(c.room)) continue;
      const d=(WD.ai.pathTo(c.room,'door_l')||[]).length;
      if(d<bd){ bd=d; best=c.room; }
    }
    if(!best){ WD.audio.event('error'); return; }
    st.lureCd=WD.CFG.LURE_COOLDOWN_S;
    st.power=Math.max(0,st.power-WD.CFG.LURE_COST);
    WD.audio.event('lure',{room:best});
    // pull wanderers toward that room
    for(const id in WD.ai.state.chars){
      const c=WD.ai.state.chars[id];
      if(!['roam','stalk','statue'].includes(c.state)||c.moving) continue;
      if(Math.random()<0.8){
        const nxt=WD.ai.stepToward(c.room,best);
        if(nxt!==c.room){ c.prevRoom=c.room;c.room=nxt;c.moving=false;c.pos=WD.ai.stepToward?c.pos:c.pos; }
        // simple teleport-free nudge: set decision timer so they walk there soon
        c.decideT=999; c._lureTo=best;
      }
    }
    WD.ui.toast('Audio lure sent — '+WD.ROOMS[best].name);
    usageDelta();
  }

  // ---------- night flow ----------
  function startNight(n){
    const st=WD.state;
    st.night=n; st.screen='play'; st.hour=0; st.nightT=0;
    st.power=100; st.doorL=st.doorE=st.lightL=st.lightE=st.sealed=false;
    st.monitor=false; st.box=WD.CFG.BOX_MAX; st.lureCd=0; st.powerOut=false; st.blackoutT=0;
    st.dead=false; st.deadBy=null; st.won=false; st.anomalies=[];
    st._lastHour=-1; st._boxWarned=false;
    WD.view.flashUsed=false;
    // clear any lingering jumpscare from a previous death
    if(scare){ try{ scare.rig.pulseEyes(1); }catch(e){} }
    scare=null;
    WD.shake=0;
    for(const id in charMeshes) charMeshes[id].root.visible=false;
    WD.nightHourLen=WD.CFG.NIGHT_SECONDS/WD.CFG.HOUR_COUNT;
    WD.ai.activate(n);
    WD.audio.startLoops();
    WD.audio.musicBox(true);
    usageDelta();
    WD.ui.beginPlayUI(n);
    document.body.requestPointerLock?.();
  }

  function die(by){
    const st=WD.state;
    if(st.dead||st.won||scare) return;   // one death at a time
    st.dead=true; st.deadBy=by;
    st.monitor=false;
    WD.audio.musicBox(false);
    WD.audio.event('jumpscare',{charId:by});
    runJumpscare(by);
    if(document.pointerLockElement) document.exitPointerLock();
  }
  function win(){
    const st=WD.state;
    if(st.dead||st.won) return;
    st.won=true;
    WD.audio.musicBox(false);
    WD.audio.event('chime');
    if(st.night>=5 && !st.filesFound.includes('end_final')) unlockFile('end_final');
    if(st.unlockedNight<Math.min(6,st.night+1)){ st.unlockedNight=Math.min(6,st.night+1); }
    WD.save.write();
    if(document.pointerLockElement) document.exitPointerLock();
    WD.ui.showWinScreen();
  }
  function unlockFile(idOrKey){
    const st=WD.state;
    if(!st.filesFound.includes(idOrKey)){ st.filesFound.push(idOrKey); WD.save.write();
      WD.ui.toast('FILE unlocked — '+idOrKey); }
  }

  // ---------- jumpscare ----------
  let scare=null;
  function runJumpscare(charId){
    const rig=charMeshes[charId]; if(!rig){ WD.ui.showDeathScreen(); return; }
    // place character right in front of the player (faces point local +Z)
    const yaw=WD.view.yaw;
    const fx=-Math.sin(yaw)*1.05, fz=-Math.cos(yaw)*1.05;
    rig.root.position.set(camera.position.x+fx, 0, camera.position.z+fz);
    rig.root.rotation.set(0, yaw, 0);          // +Z face turns toward -Z view dir when yaw applied
    rig.root.visible=true;
    rig.setMode('lunge');
    rig.pulseEyes(3.5);
    scare={ rig, t:0 };
    // violent shake
    WD.shake=1.0;
  }

  // ---------- blackout / power-out sequence ----------
  function powerOutage(){
    const st=WD.state;
    st.powerOut=true; st.monitor=false;
    st.doorL=st.doorE=st.lightL=st.lightE=st.sealed=false;
    WD.audio.event('power_down');
    WD.audio.stopLoops(); WD.audio.musicBox(false);
    usageDelta();
    // darkness... then Orv comes with his glowing eyes
    setTimeout(()=>{
      if(st.dead||st.won) return;
      const rig=charMeshes['orv'];
      if(rig){
        rig.root.position.set(-0.6, 0, 12.6);   // visible down the west approach
        rig.root.rotation.y=0;                  // faces south toward office
        rig.root.visible=true;
        rig.setMode('float');
        rig.pulseEyes(4.0);
        WD.audio.event('music',{detune:0.5});
      }
      st.blackoutT=WD.utils.rand(8,16);
      WD.blackoutChar='orv';
    }, 2600);
  }

  // ---------- per-frame update ----------
  function update(dt){
    const st=WD.state;
    if(st.screen!=='play') { animateIdleScene(dt); return; }

    // clock
    if(!st.dead&&!st.won&&!st.powerOut){
      st.nightT+=dt;
      st.hour=Math.min(WD.CFG.HOUR_COUNT-1, Math.floor(st.nightT/WD.nightHourLen));
      if(st.hour!==st._lastHour){ st._lastHour=st.hour; WD.audio.event('hour_chime');
        WD.ui.toast(hourName(st.hour)); checkFileTriggers(); }
      if(st.nightT>=WD.CFG.NIGHT_SECONDS){ win(); }
    // blackout countdown: only runs once the darkness prologue has armed a real timer
    } else if(st.powerOut && !st.dead && !st.won){
      if(st.blackoutT>0){
        st.blackoutT-=dt;
        if(st.blackoutT<=0) die(WD.blackoutChar||'orv');
      }
    }

    // power drain
    if(!st.powerOut&&!st.dead&&!st.won){
      let drain=WD.CFG.POWER_DRAIN_BASE + (st.usagePips-1)*WD.CFG.DRAIN_PER_USAGE;
      // previous keeper's warning: building punishes doors harder late night
      if(st.hour>=4&&(st.doorL||st.doorE)) drain*=1.25;
      st.power-=drain*dt;
      if(st.box<WD.CFG.BOX_MAX&&!st.winding) st.box=Math.max(0,st.box-dt*1.4);
      if(st.winding){ st.box=Math.min(WD.CFG.BOX_MAX, st.box+WD.CFG.WIND_RATE*dt);
        if(st.box>=WD.CFG.BOX_MAX) st.winding=false; }
      if(st.lureCd>0) st.lureCd-=dt;
      if(st.power<=0){ st.power=0; powerOutage(); }
      // music box warnings
      if(st.box<WD.CFG.BOX_WARN_AT&&st.box>0&&!st._boxWarned){ st._boxWarned=true;
        WD.audio.event('musicbox_stop'); WD.ui.toast('The music box is slowing…'); }
      if(st.box>WD.CFG.BOX_WARN_AT+15) st._boxWarned=false;
      if(st.box<=0.5&&!st._zeroGrace){ st._zeroGrace=true;
        WD.ui.toast('Something is awake.'); }
      if(st.box>5) st._zeroGrace=false;
    }

    // AI
    if(!st.dead&&!st.won) { WD.ai.update(dt); WD.ai.updateAnomalies(dt); }
    syncCharacters(dt);
    syncDoors(dt);

    // office ambience reactions
    if(fanGroup) fanGroup.rotation.z+=dt*(st.powerOut?2:18);

    // room light flicker
    updateFlicker(dt);

    // camera shake decay
    if(WD.shake>0){ WD.shake=Math.max(0,WD.shake-dt*1.6); }
  }

  function hourName(h){ return ['12 AM','1 AM','2 AM','3 AM','4 AM','5 AM'][h]||''; }

  function checkFileTriggers(){
    const st=WD.state;
    if(st.hour>=3) unlockFile('f1');
  }

  function syncCharacters(dt){
    const st=WD.state;
    for(const id in WD.ai.state.chars){
      const c=WD.ai.state.chars[id], rig=charMeshes[id];
      if(!rig) continue;
      if(scare && scare.rig===rig) continue;   // jumpscare owns this rig right now
      const [x,z]=c.pos;
      const hidden=['vent_n','vent_s'].includes(c.room)&&!['in_vent'].includes(c.state);
      rig.root.visible=!st.powerOut? true : (id===(WD.blackoutChar||'orv'));
      if(c.room==='office'||c.state==='in_office'){
        rig.root.position.set(x*0.4+0.5, 0, z-1.2);
      } else {
        rig.root.position.set(x, 0, z);
      }
      // face travel direction (character faces point local +Z)
      if(c.moving){
        const dx=c.toPos[0]-c.fromPos[0], dz=c.toPos[1]-c.fromPos[1];
        rig.root.rotation.y=Math.atan2(dx,dz);
      }
      // animation mode
      let mode='idle';
      if(st.powerOut&&id===WD.blackoutChar) mode='float';
      else if(c.state==='at_door') mode='stare';
      else if(c.state==='in_vent'||c.moveMode==='vent') mode='vent';
      else if(c.state==='charge') mode='scamper';
      else if(c.id==='wonder'&&c.state!=='dormant') mode='float';
      else if(c.moving) mode=c.id==='sera'?'scamper':'walk';
      else if(c.id==='sera') mode='stare';
      rig.setMode(mode);
      rig.animate(dt, c.state==='charge'?2:1);
      // eye pulse by aggression
      const near=['door_l','door_e','vent_n','vent_s','office'].includes(c.room);
      rig.pulseEyes(near?2.2:1.0);
    }
    // hide dormant wonder puppet fully when box is healthy
    const w=WD.ai.state.chars['wonder'];
    if(w&&charMeshes['wonder']){
      charMeshes['wonder'].root.visible=w.state!=='dormant';
    }
  }

  function syncDoors(dt){
    const st=WD.state;
    const R=worldRoot.userData.rooms.office;
    [[doorMeshL,st.doorL],[doorMeshE,st.doorE]].forEach(([d,closed])=>{
      if(!d) return;
      const target=closed? d.userData.closedY : d.userData.openOffset;
      d.position.y+=(target-d.position.y)*Math.min(1,dt*10);
    });
    R.indL.material.emissiveIntensity=st.doorL?2.4:0.08;
    R.indE.material.emissiveIntensity=st.doorE?2.4:0.08;
    R.doorLightL.intensity=(st.lightL&&!st.powerOut)?26:0;
    R.doorLightE.intensity=(st.lightE&&!st.powerOut)?26:0;
    R.grilleW.material.emissiveIntensity=st.sealed?0.9:0;
    if(R.officeGrilleE) R.grilleE.material.emissiveIntensity=st.sealed?0.9:0;
    else R.grilleE.material.emissiveIntensity=st.sealed?0.9:0;
  }

  function updateFlicker(dt){
    const t=performance.now()/1000;
    const R=worldRoot.userData.rooms;
    for(const rid of ['stage','workshop','hall_w','hall_e','kitchen']){
      const def=R[rid]; const L=def&&(def.flicker||def.light);
      if(!L) continue;
      if(!flickerState[rid]) flickerState[rid]={next:WD.utils.rand(0.5,3)};
      const fs=flickerState[rid]; fs.next-=dt;
      if(fs.next<=0){
        fs.off=!fs.off; fs.next=fs.off? WD.utils.rand(0.03,0.22): WD.utils.rand(0.4,4);
      }
      L.userData._base=L.userData._base||L.intensity;
      L.intensity=fs.off? L.userData._base*0.12 : L.userData._base;
    }
    // arcade glow pulse
    if(R.arcade&&R.arcade.cabs) R.arcade.cabs.forEach((s,i)=>{
      s.material.emissiveIntensity=0.6+Math.abs(Math.sin(t*2+i*1.7))*0.8;
    });
  }

  function animateIdleScene(dt){
    // menu backdrop: slow drift around atrium
    if(WD.state.screen==='menu'){
      menuT=(menuT||0)+dt;
      camera.position.set(Math.sin(menuT*0.05)*3, 2.2, -2+Math.cos(menuT*0.04)*2);
      camera.lookAt(0,1.2,-8);
      updateFlicker(dt);
    }
  }
  let menuT=0;

  // ---------- office camera placement ----------
  function placeCamera(){
    const v=WD.view;
    const shk=WD.shake||0;
    // seated at the desk, facing north wall (doors at z=14); desk behind us at z=18.2
    camera.position.set(
      -0.4+(WD.utils.rand(-1,1)*shk*0.05),
      1.55+Math.sin(performance.now()/900)*0.008+(WD.utils.rand(-1,1)*shk*0.04),
      15.6+(WD.utils.rand(-1,1)*shk*0.05)
    );
    camera.rotation.set(v.pitch+0.06, v.yaw, Math.sin(performance.now()/700)*0.002+shk*0.02*Math.sin(performance.now()/50));
  }
  // security-camera POV placement (with slow pan sway)
  let camSway=0;
  function placeCamCamera(){
    const A=WD.worldAnchors[WD.state.camId]; if(!A) return;
    camSway+=0.016;
    camera.position.set(A.pos[0]+Math.sin(camSway*0.4)*0.18, A.pos[1], A.pos[2]);
    camera.lookAt(A.look[0]+Math.sin(camSway*0.7)*0.5, A.look[1], A.look[2]);
    camera.rotation.z=Math.sin(camSway*0.23)*0.008;
  }

  // ---------- main loop ----------
  function loop(ms){
    requestAnimationFrame(loop);
    const now=ms/1000;
    let dt=Math.min(0.05, now-(clocks.last||now)); clocks.last=now;
    if(WD.state.paused) dt=0;
    update(dt);
    if(scare){
      scare.t+=dt;
      const k=scare.rig;
      // lunge closes distance to the lens
      const dirx=camera.position.x-k.root.position.x, dirz=camera.position.z-k.root.position.z;
      const d=Math.hypot(dirx,dirz);
      if(d>0.95){ k.root.position.x+=dirx*dt*3.4; k.root.position.z+=dirz*dt*3.4; }
      // crouch-lunge: bring the HEAD down to lens height (~1.55m)
      const targetY = -0.42;
      k.root.position.y += (targetY-k.root.position.y)*Math.min(1,dt*7);
      k.animate(dt,3);
      WD.shake=1.2;
      if(scare.t>1.35&&!WD.state._deathShown){ WD.state._deathShown=true; WD.ui.showDeathScreen(); }
    }
    // render: monitor mode renders the selected cam POV; else the office view
    if(WD.state.monitor){
      placeCamCamera();
    } else {
      placeCamera();
    }
    const q=WD.state.settings.quality;
    bloomPass.enabled=q!=='low';
    bloomPass.strength=q==='ultra'?0.75:0.55;
    WD.crt.enabled=true;
    WD.crt.uniforms.time.value=performance.now()/1000;
    WD.crt.uniforms.density.value=WD.state.monitor?0.22:(q==='low'?0.03:0.07);
    composer.render();
    // monitor composite: grab the rendered cam POV into the CRT overlay canvas
    if(WD.state.monitor){ WD.ui.drawCamFrame(dt); WD.ui.drawMap(); }
    WD.ui.tickHUD(dt);
  }

  return { boot, startNight, die, win, toggleMonitor, toggleDoor, toggleLight, toggleSeal, lure,
    usageDelta, applyLook,
    get camera(){return camera;}, get renderer(){return renderer;} };
})();
