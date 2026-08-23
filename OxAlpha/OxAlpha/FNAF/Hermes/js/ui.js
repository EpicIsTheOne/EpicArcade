// ui.js — HUD, camera monitor + map, menus, death/win screens, files journal, toasts.
'use strict';
WD.ui = (() => {
  const $ = (id)=>document.getElementById(id);
  let camCtx=null, mapCanvas=null, toastTimer=null, tapeIdx=0;

  function init(){
    buildMenu(); buildHUD(); buildMonitor(); buildDeath(); buildWin(); buildFiles(); buildPause();
    syncMenu();
  }

  // ---------------- MENU ----------------
  function buildMenu(){
    const m=$('menu');
    m.innerHTML=`
      <div class="menu-inner">
        <div class="menu-title">WONDERDROME</div>
        <div class="menu-sub">a night keeper's shift · family amusement complex · est. 1981</div>
        <div class="menu-buttons">
          <button id="btnContinue">CLOCK IN — NIGHT <span id="menuNight">1</span></button>
          <button id="btnNightSelect">SELECT NIGHT</button>
          <button id="btnFiles">FILES</button>
          <button id="btnHow">HOW TO SURVIVE</button>
          <button id="btnSettings">SETTINGS</button>
        </div>
        <div class="menu-foot">headphones strongly recommended · the building listens</div>
      </div>
      <div id="nightSelect" class="panel hidden"></div>
      <div id="howPanel" class="panel hidden"></div>
      <div id="settingsPanel" class="panel hidden"></div>`;
    $('btnContinue').onclick=()=>{ WD.audio.init(); WD.game.startNight(WD.state.unlockedNight); };
    $('btnNightSelect').onclick=()=>showNightSelect();
    $('btnFiles').onclick=()=>{ showFiles('menu'); };
    $('btnHow').onclick=()=>showHow();
    $('btnSettings').onclick=()=>showSettings();
  }
  function syncMenu(){
    $('menuNight').textContent=WD.state.unlockedNight;
  }
  function showNightSelect(){
    const p=$('nightSelect');
    let h='<h3>SELECT NIGHT</h3>';
    for(let n=1;n<=6;n++){
      const un=n<=WD.state.unlockedNight;
      h+=`<button class="nightbtn ${un?'':'locked'}" data-n="${n}" ${un?'':'disabled'}>
        ${un?`NIGHT ${n}`:`NIGHT ${n} — LOCKED`}</button>`;
    }
    h+=`<button class="back">BACK</button>`;
    p.innerHTML=h; p.classList.remove('hidden');
    p.querySelectorAll('.nightbtn:not(.locked)').forEach(b=>{
      b.onclick=()=>{ WD.audio.init(); WD.game.startNight(+b.dataset.n); };
    });
    p.querySelector('.back').onclick=()=>p.classList.add('hidden');
  }
  function showHow(){
    const p=$('howPanel');
    p.innerHTML=`<h3>HOW TO SURVIVE</h3>
      <div class="how">
      <p><b>MOUSE</b> look around the office (click to capture cursor) · <b>SPACE</b> camera monitor</p>
      <p><b>D / E</b> west / east DOOR · <b>Q / F</b> west / east DOOR LIGHT · <b>S</b> vent seal · <b>A</b> audio lure · <b>ESC</b> pause</p>
      <p><b>POWER</b> everything drains it. At 0%: total blackout. Something will come.</p>
      <p><b>THE MUSIC BOX</b> (monitor → MAINTENANCE) keeps Wonder-0 asleep. If the tune stops, WIND IT FIRST.</p>
      <p><b>ORV</b> moves in the dark. Watch him on cameras to slow him. Listen at the doors.</p>
      <p><b>RIVETS</b> uses the vents. Bangs mean he's in a run. SEAL the vents when he's inside.</p>
      <p><b>BOLT</b> hears the door motors and charges while you watch the monitors. His tune = he's picking a door. Close EARLY.</p>
      <p><b>SERA</b> only moves when unwatched. If she's in your office, LIGHTS — immediately.</p>
      <p><b>WONDER-0</b> wakes when the box dies. Doors only slow it. Wind. The. Box.</p>
      <button class="back">BACK</button></div>`;
    p.classList.remove('hidden');
    p.querySelector('.back').onclick=()=>p.classList.add('hidden');
  }
  function showSettings(){
    const p=$('settingsPanel');
    const s=WD.state.settings;
    p.innerHTML=`<h3>SETTINGS</h3><div class="how">
      <label>Quality
        <select id="setQuality">
          <option value="low"${s.quality==='low'?' selected':''}>Low</option>
          <option value="high"${s.quality==='high'?' selected':''}>High</option>
          <option value="ultra"${s.quality==='ultra'?' selected':''}>Ultra</option>
        </select></label>
      <label>Invert Y <input type="checkbox" id="setInvY" ${s.invertY?'checked':''}></label>
      <label>Volume <input type="range" id="setVol" min="0" max="1" step="0.05" value="${s.volume}"></label>
      <button class="back">BACK</button></div>`;
    p.classList.remove('hidden');
    $('setQuality').onchange=e=>{ s.quality=e.target.value; WD.save.write(); };
    $('setInvY').onchange=e=>{ s.invertY=e.target.checked; WD.save.write(); };
    $('setVol').oninput=e=>{ s.volume=+e.target.value; WD.audio.setVolume(s.volume); WD.save.write(); };
    p.querySelector('.back').onclick=()=>p.classList.add('hidden');
  }

  // ---------------- HUD ----------------
  function buildHUD(){
    const h=$('hud');
    h.innerHTML=`
      <div id="hudPower"><div class="hud-label">POWER</div>
        <div id="powerBar"><div id="powerFill"></div></div>
        <div id="usage"><span class="hud-label">USAGE</span> <span id="usagePips"></span></div>
      </div>
      <div id="hudClock"><div id="clockTime">12 AM</div><div id="clockNight">NIGHT 1</div></div>
      <div id="hudBox"><div class="hud-label">MUSIC BOX</div>
        <div id="boxBar"><div id="boxFill"></div></div></div>
      <div id="hudHints"><span>SPACE monitor</span><span>D/E doors</span><span>Q/F lights</span>
        <span>S seal</span><span>A lure</span></div>
      <div id="crosshair"></div>
      <div id="toast"></div>
      <div id="pauseHint">click to focus · ESC pauses</div>`;
  }
  function tickHUD(dt){
    const st=WD.state;
    if(st.screen!=='play'&&st.screen!=='dead'&&st.screen!=='win') return;
    $('powerFill').style.width=`${st.power}%`;
    $('powerFill').classList.toggle('low', st.power<25);
    const pips=st.usagePips;
    $('usagePips').textContent='▮'.repeat(pips)+'▯'.repeat(5-pips);
    $('usagePips').style.color=pips>=4?'#ff5040':pips>=3?'#ffb040':'#7fd0a0';
    $('clockTime').textContent=['12 AM','1 AM','2 AM','3 AM','4 AM','5 AM'][st.hour];
    $('clockNight').textContent=`NIGHT ${st.night}`;
    $('boxFill').style.width=`${st.box}%`;
    $('boxFill').classList.toggle('low', st.box<WD.CFG.BOX_WARN_AT);
    $('hud').style.opacity = st.monitor? 0.25 : 1;
  }
  function toast(msg, ms=3400){
    const t=$('toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'), ms);
  }

  // ---------------- MONITOR ----------------
  function buildMonitor(){
    const m=$('monitor');
    m.innerHTML=`
      <div id="camWrap">
        <canvas id="camCanvas" width="960" height="540"></canvas>
        <div id="camStatic"></div>
        <div id="camLabel"><span id="camName">SHOW STAGE</span><span id="camNum">CAM 01</span></div>
        <div id="camRec">● REC</div>
      </div>
      <div id="mapWrap">
        <canvas id="mapCanvas" width="300" height="430"></canvas>
        <div id="mapButtons"></div>
        <div id="boxControls">
          <div class="hud-label">MUSIC BOX</div>
          <button id="btnWind">HOLD TO WIND</button>
        </div>
      </div>`;
    mapCanvas=$('mapCanvas');
    const mb=$('mapButtons');
    WD.ROOM_LIST.filter(r=>WD.ROOMS[r].cam).forEach(r=>{
      const b=document.createElement('button');
      b.className='camBtn'; b.dataset.room=r;
      b.textContent=`CAM ${String(WD.ROOMS[r].cam).padStart(2,'0')}`;
      b.onclick=()=>selectCam(r);
      mb.appendChild(b);
    });
    $('btnWind').addEventListener('pointerdown',()=>{ WD.state.winding=true; });
    addEventListener('pointerup',()=>{ WD.state.winding=false; });
    camCtx=$('camCanvas').getContext('2d');
  }
  function selectCam(r){
    WD.state.camId=r;
    WD.audio.event('cam_switch');
    refreshSelection();
  }
  // visual-only refresh; no sound, no recursion
  function refreshSelection(){
    document.querySelectorAll('.camBtn').forEach(b=>{
      b.classList.toggle('active', b.dataset.room===WD.state.camId);
    });
    const rn=document.getElementById('camName'), cn=document.getElementById('camNum');
    if(rn) rn.textContent=WD.ROOMS[WD.state.camId].name.toUpperCase();
    if(cn) cn.textContent='CAM '+String(WD.ROOMS[WD.state.camId].cam||0).padStart(2,'0');
  }
  function syncMonitor(){
    const m=$('monitor');
    m.classList.toggle('hidden', !WD.state.monitor);
    if(WD.state.monitor) refreshSelection();
  }
  // draw current camera frame: game.js renders cam POV to main canvas; we composite CRT
  let camRenderT=0;
  function drawCamFrame(dt){
    if(!WD.state.monitor) return;
    camRenderT+=dt;
    const ctx=camCtx;
    const st=WD.state;
    // keep the DOM label in sync with the actual selected feed (covers programmatic switches)
    const rn=document.getElementById('camName'), cn=document.getElementById('camNum');
    if(rn && rn.textContent!==WD.ROOMS[st.camId].name.toUpperCase())
      rn.textContent=WD.ROOMS[st.camId].name.toUpperCase();
    if(cn){ const want='CAM '+String(WD.ROOMS[st.camId].cam||0).padStart(2,'0');
      if(cn.textContent!==want) cn.textContent=want; }
    document.querySelectorAll('.camBtn').forEach(b=>{
      b.classList.toggle('active', b.dataset.room===st.camId);
    });
    const gameCanvas=document.getElementById('game');
    ctx.fillStyle='#000'; ctx.fillRect(0,0,960,540);
    ctx.drawImage(gameCanvas, 0, 0, 960, 540);
    // scanlines
    ctx.fillStyle='rgba(0,0,0,0.22)';
    for(let y=0;y<540;y+=3) ctx.fillRect(0,y,960,1);
    // green-grey tint + vignette
    ctx.fillStyle='rgba(40,160,120,0.07)'; ctx.fillRect(0,0,960,540);
    const g=ctx.createRadialGradient(480,270,180,480,270,560);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle=g; ctx.fillRect(0,0,960,540);
    // interference when anomaly on this room
    if(WD.ai.anomalyOn(st.camId)||Math.random()<0.008){
      for(let i=0;i<26;i++){
        const y=Math.random()*540, h=1+Math.random()*5;
        ctx.fillStyle=`rgba(255,255,255,${0.03+Math.random()*0.12})`;
        ctx.fillRect(Math.random()*960*0.4, y, 960*(0.3+Math.random()*0.7), h);
      }
    }
    // timestamp (bottom-left, clear of the DOM label)
    ctx.font='16px monospace'; ctx.fillStyle='rgba(180,255,220,0.8)';
    const t=st.nightT;
    ctx.fillText(`NIGHT ${st.night}  ${['12','1','2','3','4','5'][st.hour]}:${String(Math.floor(t%60)).padStart(2,'0')} AM`, 20, 522);
  }

  // map drawing — rooms as boxes matching world layout, cam dots, threat blips hidden
  function drawMap(){
    const ctx=mapCanvas.getContext('2d');
    ctx.clearRect(0,0,300,430);
    ctx.save(); ctx.translate(150, 215); ctx.scale(6.2, 6.2); ctx.translate(-0.5, -0.5);
    const st=WD.state;
    const rooms=[
      ['stage',-6,-20.5,12,9],['backstage',-11.1,-20,5,8],['kitchen',-12,-10,5,7],
      ['dining',-7,-11,14,9],['arcade',6.5,-11,6,9],['party',7,0,7,7.5],
      ['atrium',-8,-1.5,16,11],['workshop',-12.5,-1,6,9],['storage',-15.5,6.5,4,4],
      ['hall_w',-6.2,6,3.4,9],['hall_e',2.8,6,3.4,9],['door_l',-6.2,15,3.4,2],
      ['door_e',2.8,15,3.4,2],['office',-3.5,14,7,5],
    ];
    for(const [id,x,y,w,h] of rooms){
      const active = st.camId===id;
      const hasCam = !!WD.ROOMS[id].cam;
      ctx.fillStyle= active? 'rgba(120,220,180,0.5)' : hasCam? 'rgba(60,90,110,0.45)':'rgba(40,45,55,0.4)';
      ctx.strokeStyle= active? '#9fffd8' : hasCam? '#5a88a0':'#3a3f4a';
      ctx.lineWidth=0.18;
      ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
      if(hasCam){
        ctx.fillStyle= active? '#eafff5':'#9fd0c0';
        ctx.font='1.6px monospace';
        ctx.fillText(String(WD.ROOMS[id].cam).padStart(2,'0'), x+0.4, y+2.2);
      }
      // vent runs as dashed lines
      if(id==='backstage'||id==='workshop'){
        ctx.setLineDash([0.8,0.5]); ctx.strokeStyle='#7a6a30';
        ctx.beginPath();
        if(id==='backstage'){ ctx.moveTo(-8.5,-12); ctx.lineTo(-1.9,13.4); }
        else { ctx.moveTo(-9.5,8); ctx.lineTo(1.9,13.4); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // YOU marker
    ctx.fillStyle='#ff5040'; ctx.font='2px monospace';
    ctx.fillText('YOU', 1.2, 17.5);
    ctx.restore();
  }

  // ---------------- DEATH / WIN ----------------
  function buildDeath(){
    const d=$('death');
    d.innerHTML=`
      <div class="death-inner">
        <div class="death-title">SHIFT TERMINATED</div>
        <div class="death-by" id="deathBy"></div>
        <div class="death-quote" id="deathQuote"></div>
        <button id="btnRetry">TRY AGAIN</button>
        <button id="btnDeathMenu">MAIN MENU</button>
      </div>`;
    $('btnRetry').onclick=()=>WD.game.startNight(WD.state.night);
    $('btnDeathMenu').onclick=()=>toMenu();
  }
  const deathQuotes={
    orv:'"You looked away. That is all it takes."',
    rivets:'"The seals were never load-bearing. You were."',
    bolt:'"He heard the motor. He counted. He won."',
    sera:'"She only wanted to be seen. Just not by you."',
    wonder:'"The verse ended. You did not wind the box."',
    blackout:'"The building held its breath. You were the exhale."',
  };
  function showDeathScreen(){
    const st=WD.state;
    st.screen='dead';
    $('monitor').classList.add('hidden');
    $('deathBy').textContent=`taken by ${
      {orv:'ORV THE BEAR',rivets:'RIVETS',bolt:'BOLT THE CLOWN',sera:'MADAME SERA',
       wonder:'WONDER-0',blackout:'THE DARK'}[st.deadBy]||'THE DARK'}`;
    $('deathQuote').textContent=deathQuotes[st.deadBy]||'';
    $('death').classList.remove('hidden');
    $('hud').style.opacity=0;
  }
  function buildWin(){
    const w=$('win');
    w.innerHTML=`
      <div class="win-inner">
        <div class="win-title">6 AM</div>
        <div class="win-sub" id="winSub">you survived</div>
        <div class="win-tape" id="winTape"></div>
        <button id="btnNextNight">NEXT NIGHT</button>
        <button id="btnWinMenu">MAIN MENU</button>
      </div>`;
    $('btnNextNight').onclick=()=>{
      if(WD.state.night>=6){ showFiles('win'); }
      else WD.game.startNight(WD.state.night+1);
    };
    $('btnWinMenu').onclick=()=>toMenu();
  }
  function showWinScreen(){
    const st=WD.state;
    st.screen='win';
    $('monitor').classList.add('hidden');
    $('winSub').textContent= st.night>=6? 'the final show is over':'you survived night '+st.night;
    const tape=WD.lore.tapes[st.night-1];
    $('winTape').innerHTML= tape? `<div class="tape-from">☎ ANSWERING MACHINE — ${tape.from}</div>
      <div class="tape-text">${tape.text}</div>`:'';
    $('win').classList.remove('hidden');
    $('hud').style.opacity=0;
    if(st.night>=6){ $('btnNextNight').textContent='CREDITS / FILES'; }
  }
  function toMenu(){
    const st=WD.state;
    st.screen='menu';
    ['death','win','pause'].forEach(id=>$(id).classList.add('hidden'));
    $('monitor').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('hud').style.opacity=0;
    syncMenu();
  }
  function beginPlayUI(n){
    const st=WD.state;
    st.screen='play';
    ['menu','death','win','pause','filesPanel'].forEach(id=>$(id).classList.add('hidden'));
    $('hud').style.opacity=1;
    st._deathShown=false;
  }

  // ---------------- FILES JOURNAL ----------------
  function buildFiles(){
    const f=$('filesPanel');
    f.innerHTML=`<div class="files-inner"><h3>RECOVERED FILES</h3>
      <div id="filesList"></div>
      <div id="filesBody"></div>
      <button class="back">BACK</button></div>`;
    f.querySelector('.back').onclick=()=>{
      f.classList.add('hidden');
      if(WD.state.screen==='play') $('pause').classList.remove('hidden');
    };
  }
  function showFiles(from){
    const f=$('filesPanel');
    const list=$('filesList');
    list.innerHTML='';
    const st=WD.state;
    WD.lore.files.forEach(file=>{
      const has=st.filesFound.includes(file.id);
      const b=document.createElement('button');
      b.className='fileBtn'+(has?'':' locked');
      b.textContent= has? file.title : '??? — '+file.unlock;
      b.onclick=()=>{ if(has) $('filesBody').innerHTML=`<div class="fileText">${file.text}</div>`;
        else $('filesBody').innerHTML=`<div class="fileText dim">Locked: ${file.unlock}</div>`; };
      list.appendChild(b);
    });
    if(st.filesFound.includes('end_final')){
      const b=document.createElement('button'); b.className='fileBtn';
      b.textContent='THE SIXTH NIGHT (ENDING)';
      b.onclick=()=>{ $('filesBody').innerHTML=`<div class="fileText">${WD.lore.endings.final.text}</div>`; };
      list.appendChild(b);
    }
    $('filesBody').innerHTML='<div class="fileText dim">Select a file.</div>';
    $('pause').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('win').classList.add('hidden');
    f.classList.remove('hidden');
  }

  // ---------------- PAUSE ----------------
  function buildPause(){
    const p=$('pause');
    p.innerHTML=`<div class="pause-inner"><h3>PAUSED</h3>
      <button id="btnResume">RESUME</button>
      <button id="btnPauseFiles">FILES</button>
      <button id="btnPauseQuit">QUIT TO MENU</button></div>`;
    $('btnResume').onclick=()=>pauseToggle();
    $('btnPauseFiles').onclick=()=>showFiles('play');
    $('btnPauseQuit').onclick=()=>{ WD.state.paused=false; toMenu(); };
  }
  function pauseToggle(){
    const st=WD.state;
    if(st.screen!=='play') return;
    st.paused=!st.paused;
    $('pause').classList.toggle('hidden', !st.paused);
    if(st.paused&&document.pointerLockElement) document.exitPointerLock();
  }
  function showPauseHint(show){
    $('pauseHint').classList.toggle('hidden', !show);
  }

  return { init, tickHUD, toast, syncMonitor, drawCamFrame, drawMap, showFiles,
    showDeathScreen, showWinScreen, beginPlayUI, toMenu, pauseToggle, showPauseHint, syncMenu };
})();
