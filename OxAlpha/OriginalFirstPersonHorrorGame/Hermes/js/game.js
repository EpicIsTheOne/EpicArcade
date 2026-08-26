/* HOLLOW SIGNAL — game flow: puzzles, triggers, threat orchestration, ending */
(function(){
"use strict";
const HG = window.HG;
const M = HG.M, Maps = HG.Maps, S = HG.Story;
const CS = Maps.CS;
const Threat = HG.Threat;   // defined in threat.js (loads before this module)

const Game = HG.Game = {
  state:'boot',   // boot|title|intro|play|note|keypad|pause|dead|ending|end
  flags:null,
  deaths:0, notesRead:0,
  playT:0,
  checkpoint:{x:0,z:0,yaw:0,f:0,id:'start'},
  interactables:[],
  triggers:[],
  ambT:8,
  finale:{active:false,t:0,gateOpen:false},
  hintFlags:{},

  /* ================= setup ================= */
  init(){
    const W=HG.world, P=Maps.P;
    this.W=W; this.P=P;
    this.resetFlags();

    const I=this.interactables;
    const add=o=>{I.push(o);return o;};
    const wp=(a)=>({x:a.wx!==undefined?a.wx:(a.c+.5)*CS, z:a.wz!==undefined?a.wz:(a.r+.5)*CS});
    this.openNote=(t,b)=>{
      if(this.state!=='play') return;
      this.state='note';
      HG.Input.enabled=false;
      HG.Input.unlockPointer();
      HG.UI.showNote(t,b);
    };

    /* ---------- notes & readable props ---------- */
    add({id:'n_work', pos:wp(P.lobbyDesk), f:0, r:2.4,
      label:'read work order',
      use(){ Game.openNote(S.notes.workOrder.title,S.notes.workOrder.body); Game.noteRead('workOrder'); }});
    add({id:'n_marsh', pos:{x:P.secDesk.wx-.7,z:P.secDesk.wz+.4}, f:0, r:2.2,
      label:'read Marsh’s addendum',
      use(){ Game.openNote(S.notes.marshAddendum.title,S.notes.marshAddendum.body); Game.noteRead('marshAddendum'); }});
    add({id:'whiteboard', pos:{x:P.whiteboardSec.wx-.1,z:P.whiteboardSec.wz}, f:0, r:2.6,
      label:'examine whiteboard',
      use(){ Game.openNote('WHITEBOARD — SECURITY OFFICE','FIRST CONTACT — APR 17\n\n- signal not from strata\n- comes THROUGH array\n- Marsh sealed containment\n- DO NOT restore mains\n\nthe date is everywhere.'); }});
    add({id:'n_log', pos:wp(P.labLogDesk), f:1, r:2.3,
      label:'read array log',
      use(){ Game.openNote(S.notes.labLog.title,S.notes.labLog.body); Game.noteRead('labLog'); }});
    add({id:'calendar', pos:{x:P.calendarRec.wx+.2,z:P.calendarRec.wz}, f:1, r:2.4,
      label:'examine calendar',
      use(){ Game.openNote('WALL CALENDAR — APRIL 1983','April 17 is circled in red.\n\nBeneath it, pressed hard enough\nto tear the paper:\n\n        IT BEGAN'); Game.noteRead('calendar'); }});
    add({id:'n_storage', pos:{x:P.valveHandle.wx+1.2,z:P.valveHandle.wz-.9}, f:1, r:2.3,
      label:'read greasy page',
      use(){ Game.openNote(S.notes.storageNote.title,S.notes.storageNote.body); Game.noteRead('storageNote'); }});
    add({id:'n_rec', pos:{x:cx(27),z:cz(13.5)}, f:1, r:2.2,
      label:'read crossword',
      use(){ Game.openNote(S.notes.recNote.title,S.notes.recNote.body); Game.noteRead('recNote'); }});
    add({id:'n_voss', pos:{x:P.keypadElev.wx-.7,z:P.keypadElev.wz+.9}, f:1, r:2.2,
      label:'read crumpled page',
      use(){ Game.openNote(S.notes.vossFinal.title,S.notes.vossFinal.body); Game.noteRead('vossFinal'); }});

    /* ---------- items ---------- */
    this.lockerStage=0;
    add({id:'locker', pos:wp(P.breakLocker), f:0, r:2.2,
      label:()=>this.flags.fuseA?'locker 3':'open locker 3',
      enabled:()=>!this.flags.fuseA,
      use:function(){
        if(this.lockerStage===0){
          this.lockerStage=1;
          HG.Audio.play('locker');
          HG.UI.toast('locker opens');
          HG.Audio.play('whisper',{vol:.5,sub:'[a faint hum answers from the pipes]',subT:2.5});
        } else {
          this.flags.fuseA=true;
          HG.Audio.play('clunk');
          HG.UI.toast('FUSE acquired (1/2)');
          this.refreshInv();
          if(!this.hintFlags.marsh){this.hintFlags.marsh=1;HG.UI.hint('Dr. Marsh left an addendum in security — read it before restoring power.',6000);}
        }
      }.bind(this)});
    add({id:'fuseB', pos:{x:P.secDesk.wx+.4,z:P.secDesk.wz}, f:0, r:2.1,
      label:'take fuse',
      enabled:()=>!this.flags.fuseB,
      use(){
        this.flags.fuseB=true;
        HG.Audio.play('paper'); HG.Audio.play('clunk',{vol:.8});
        HG.UI.toast('FUSE acquired (2/2)');
        this.refreshInv();
        this.scareFuseB();
      }});

    /* ---------- fuse box ---------- */
    add({id:'fusebox', pos:wp(P.fuseBox), f:0, r:2.3,
      label:()=>this.flags.auxPower?'auxiliary panel':'auxiliary panel — install fuses',
      enabled:()=>!this.flags.auxPower,
      use(){
        const have=(this.flags.fuseA?1:0)+(this.flags.fuseB?1:0);
        if(have<2){
          HG.UI.toast(`panel needs 2 fuses — you have ${have}`); HG.Audio.play('buzz');
          return;
        }
        this.powerAux();
      }});

    /* ---------- doors ---------- */
    const doorInt=(id,label)=>{
      const d=W.doors[id];
      add({id:'door_'+id, pos:{x:d.baseX,z:d.baseZ}, f:d.f, r:2.3,
        label:()=>{
          if(id==='d_stairs'&&!this.flags.auxPower) return 'stairwell door';
          if(id==='d_contain') return 'knock on the blast door';
          return d.open?'close door':label;
        },
        enabled:()=>true,
        use(){
          if(id==='d_stairs'&&d.locked){
            HG.Audio.playAt('buzz',{pos:{x:d.baseX,z:d.baseZ},floor:0});
            HG.UI.toast('MAG-LOCK ENGAGED — NO POWER');
            return;
          }
          if(id==='d_contain'){
            HG.Audio.playAt('bang',{pos:{x:d.baseX,z:d.baseZ},floor:1,vol:.8});
            if(!this.hintFlags.contain){this.hintFlags.contain=1;
              HG.UI.subtitle('[far too close, something answers the knock]',2.6);}
            return;
          }
          d.setOpen(!d.open);
          this.player.emitNoise(13);
        }});
    };
    doorInt('d_break','open door');
    doorInt('d_security','open door');
    doorInt('d_stairs','open stairwell door');
    doorInt('d_contain','containment blast door');

    /* ---------- generator puzzle ---------- */
    add({id:'handle', pos:wp(P.valveHandle), f:1, r:2.1,
      label:'take valve handle',
      enabled:()=>!this.flags.valveHandle,
      use(){
        this.flags.valveHandle=true;
        HG.world.valveHandleMesh.visible=false;
        HG.Audio.play('clunk'); HG.Audio.play('metal');
        HG.UI.toast('VALVE HANDLE acquired');
        this.refreshInv();
      }});
    for(let i=0;i<3;i++){
      const idx=i;
      add({id:'valve'+i, pos:{x:P.genValves.wx+(idx-1)*CS*1.5, z:P.genValves.wz}, f:1, r:1.9,
        label:()=>{
          if(!this.flags.valveHandle) return `fuel line ${idx+1} — missing handle`;
          const st=this.flags.valves[idx];
          return `fuel line ${idx+1} — turn ${st===null?'':(st?'(open)':'(closed)')}`;
        },
        use(){
          if(!this.flags.handleInstalled){
            // first interaction with any valve installs the handle
            this.flags.handleInstalled=true;
            HG.Audio.play('valveTurn');
            HG.UI.toast('valve handle fitted');
            return;
          }
          const v=this.flags.valves[idx];
          this.flags.valves[idx]= v===null? true : !v;
          HG.world.setValveState(idx,this.flags.valves[idx]);
          HG.Audio.playAt('valveTurn',{pos:{x:this.P.genValves.wx,z:this.P.genValves.wz},floor:1,vol:.8});
          this.player.emitNoise(10);
          this.checkFuel();
        }});
    }
    add({id:'breaker', pos:wp(P.genBreaker), f:1, r:2.1,
      label:()=>this.flags.genOn?'main breaker':'main breaker — engage',
      enabled:()=>!this.flags.genOn,
      use(){
        if(!this.flags.fuelOK){
          HG.Audio.play('buzz');
          HG.UI.toast('no fuel pressure — set the manifold valves');
          return;
        }
        this.powerGen();
      }});

    /* ---------- keypad ---------- */
    add({id:'keypad', pos:wp(P.keypadElev), f:1, r:2.2,
      label:()=>{
        if(!this.flags.genOn) return 'lift keypad — dead';
        if(this.finale.active) return 'lift called';
        return 'freight lift keypad';
      },
      use(){
        if(!this.flags.genOn){ HG.UI.toast('panel has no power'); HG.Audio.play('buzz'); return; }
        if(this.finale.active){ HG.UI.toast('car already summoned'); return; }
        this.openKeypad();
      }});

    /* ---------- containment window scare zone ---------- */

    /* ---------- triggers ---------- */
    const T=this.triggers;
    const addT=o=>T.push(o);
    // upper corridor dread
    addT({f:0,x:cx(21.5),z:cz(12),r:3,once:true,fn(){
      HG.Audio.playAt('creak',{pos:{x:cx(21.5),z:cz(8)},floor:0,vol:1.4,sub:'[metal strains somewhere above]',subT:2.4});
      Game.dipLights(0,.9);
    }});
    // containment window
    addT({f:1,x:cx(33.5),z:cz(10.6),r:2.4,once:true,fn(){
      HG.Audio.playAt('glassBang',{pos:{x:cx(33.5),z:28},floor:1,vol:1.2});
      HG.UI.subtitle('[something slams the glass from the dark side]',2.8);
      Game.pulseContainLamp();
    }});
    // gen corridor steam after generator
    addT({f:1,x:cx(21.5),z:cz(20),r:2.6,once:true,cond:()=>Game.flags.genOn&&!Game.finale.active,fn(){
      HG.Audio.playAt('steam',{pos:{x:cx(21.5),z:cz(22)},floor:1,vol:1.2,sub:'[a pipe ruptures — steam screams across the corridor]',subT:3});
      Game.dipLights(1,1.4);
    }});

    // stairs teleports (both directions)
    addT({f:0,x:cx(15.5),z:CS*1.75,r:1.05,once:false,fn(){ Game.stairTeleport(0); }});
    addT({f:1,x:cx(15.5),z:CS*1.75,r:1.05,once:false,fn(){ Game.stairTeleport(1); }});

    this.bindInputExtras();
  },

  resetFlags(){
    this.flags={fuseA:false,fuseB:false,auxPower:false,valveHandle:false,handleInstalled:false,
      valves:[null,null,null],fuelOK:false,genOn:false,codeDone:false};
  },

  refreshInv(){
    const inv=[];
    if(this.flags.fuseA||this.flags.fuseB) inv.push({label:`fuses ${(this.flags.fuseA?1:0)+(this.flags.fuseB?1:0)}/2`});
    if(this.flags.valveHandle) inv.push({label:'valve handle'});
    HG.UI.inventory(inv);
  },
  noteRead(id){ this.notesRead++; },

  cx_(c){return (c+.5)*CS;} , cz_(r){return (r+.5)*CS;},

  /* ================= key story beats ================= */
  powerAux(){
    this.flags.auxPower=true;
    const P=this.P;
    HG.Audio.play('powerup');
    this.player.emitNoise(16);
    HG.after(.35,()=>{ HG.WorldBuilder.applyPhase(HG.world,'aux'); });
    HG.after(1.2,()=>HG.UI.subtitle('[the atrium shudders awake — half the tubes catch, half die]',3.4));
    if(HG.world.fuseBoxLamp){ HG.world.fuseBoxLamp.material.color.setHex(0x2ea043);
      HG.world.fuseBoxLamp.material.emissive=new THREE.Color(0x2ea043); }
    HG.UI.objective('Descend to level B2 — restore the generator.');
    this.advanceObjective(1);
    this.setCheckpoint(P.lobbyDesk.wx,P.lobbyDesk.wz,Math.PI,0,'cp1');
    this.refreshInv();
  },
  checkFuel(){
    const v=this.flags.valves;
    // stencil: LINE 1 OPEN · LINE 2 CLOSED · LINE 3 OPEN
    if(v[0]===true&&v[1]===false&&v[2]===true&&!this.flags.fuelOK){
      this.flags.fuelOK=true;
      HG.Audio.play('chime'); HG.Audio.playAt('thunk',{pos:{x:this.P.genValves.wx,z:this.P.genValves.wz},floor:1});
      HG.UI.subtitle('[fuel pressure settles into the manifold — gauges climb]',3);
      HG.UI.toast('FUEL PRESSURE NOMINAL');
    }
  },
  powerGen(){
    this.flags.genOn=true;
    HG.Audio.genOn=true;
    const P=this.P;
    HG.Audio.play('powerup'); HG.Audio.playAt('roar',{pos:{x:cx(36.5),z:cz(15)},floor:1,vol:.25,sub:'[deep below hearing, something turns over]',subT:3});
    HG.WorldBuilder.applyPhase(HG.world,'gen');
    if(HG.world.breakerLever) HG.world.breakerLever.rotation.x=Math.PI/2-.5;
    this.dipLights(1,.8);
    HG.after(1.4,()=>HG.UI.subtitle('[level B2 stutters to life. the dark retreats — mostly.]',3.2));
    HG.UI.objective('Override the freight lift keypad (east of the generator).');
    this.advanceObjective(2);
    this.setCheckpoint(cx(22.5),cz(26),Math.PI,1,'cp2');
    this.refreshInv();
    if(!this.hintKeys) this.hintKeys=0;
  },

  scareFuseB(){
    // glimpse at the office doorway (upper floor)
    const g={x:cx(36),z:cz(6.4)};
    Threat.glimpse(g.x,g.z,0,.55);
    HG.Audio.playAt('whisper',{pos:g,floor:0,vol:1.1,sub:'[for half a second, someone is standing in the doorway]',subT:2.6});
    HG.Audio.play('sting',{kind:'soft'});
  },

  /* ================= checkpoints / death ================= */
  setCheckpoint(x,z,yaw,f,id){ this.checkpoint={x,z,yaw,f,id}; },
  advanceObjective(n){ this.objIndex=n; },
  objIndex:0,

  playerCaught(){
    if(this.state!=='play'||this._catchGuard) return;
    this._catchGuard=true;
    this.state='dead';
    this.deaths++;
    const pl=this.player;
    pl.frozen=true;
    pl.lookAtPoint(Threat.x,Threat.z,1,20);
    HG.Audio.play('lunge');
    HG.UI.flash('flashRed',.85,300);
    HG.UI.damage(.95);
    setTimeout(()=>{ HG.UI.flash('flashBlack',1,120); },260);
    setTimeout(()=>{ HG.UI.deathScreen(true); },700);
    setTimeout(()=>{
      HG.UI.deathScreen(false);
      this.respawnAtCheckpoint();
      this._catchGuard=false;
    },2600);
  },
  respawnAtCheckpoint(cp){
    const c=cp||this.checkpoint;
    const pl=this.player;
    pl.place(c.x,c.z,c.yaw,c.f);
    pl.frozen=false;
    HG.UI.damage(0); HG.UI.fear(0);
    HG.Audio.setFear(0);
    // push the threat far away and calm it
    if(Threat.active){
      const spots=[[cx(30),cz(15)],[cx(8),cz(18)],[cx(27),cz(13)],[cx(21.5),cz(22)]];
      let best=null,bd=-1;
      for(const [sx,sz] of spots){
        const d=M.dist(sx,sz,c.x,c.z); if(d>bd){bd=d;best=[sx,sz];}
      }
      Threat.relocate(best[0],best[1]);
      Threat.state='stalk'; Threat.alertT=0; Threat.targetCell=null; Threat.lastKnown=null;
    }
    // elevator mercy timer
    if(this.finale.active){
      this.finale.t=Math.max(this.finale.t,35);
    }
    this.state='play';
    HG.UI.toast('— back on your feet —',1800);
  },

  /* ================= stairs ================= */
  _stairsBusy:false,
  stairTeleport(fromF){
    if(this._stairsBusy||this.state!=='play') return;
    this._stairsBusy=true;
    const pl=this.player;
    pl.frozen=true;
    HG.Audio.playAt('footstep',{surf:'metal'});
    HG.UI.flash('flashBlack',1,220);
    setTimeout(()=>{
      const P=Maps.P;
      if(fromF===0){
        pl.place(Maps.cx(15.5),Maps.cz(3),Math.PI,1);
      } else {
        pl.place(Maps.cx(15.5),Maps.cz(3),Math.PI,0);
      }
      pl.frozen=false;
      HG.Audio.playAt('creak',{pos:{x:pl.x,z:pl.z},floor:pl.floor,vol:.7});
      if(fromF===0&&!this.hintFlags.b2){
        this.hintFlags.b2=1;
        HG.UI.hint('Level B2 — laboratories west · recreation east · power plant south',6500);
        HG.UI.objective('Restore the generator — fuel manifold + main breaker.');
        this.advanceObjective(1,true);
      }
      setTimeout(()=>{ HG.UI.flash('flashBlack',0,500); this._stairsBusy=false; },60);
    },240);
  },

  /* ================= lights helpers ================= */
  dipLights(f,dur){
    const Ls=HG.world.lights.filter(l=>l.f===f&&l.on&&l.pl);
    for(const L of Ls){ const t=L.target; L.target=0; HG.after(dur*M.rand(.6,1),()=>{L.target=t;}); }
  },
  pulseContainLamp(){
    const m=HG.world.containLampMat;
    if(!m) return;
    m.emissiveIntensity=3.2;
    HG.after(.5,()=>m.emissiveIntensity=1.4);
  },

  /* ================= keypad ================= */
  openKeypad(){
    this.state='keypad';
    HG.Input.enabled=false;
    HG.Input.unlockPointer();
    HG.UI.openKeypad(
      code=>{
        if(code===S.code){
          HG.Audio.play('chime'); HG.Audio.play('clunk');
          HG.UI.closeKeypad();
          this.startFinale();
        } else {
          HG.UI.kpError();
          HG.UI.toast('REJECTED');
          this.player.emitNoise(14);
        }
      },
      ()=>{ this.resumePlay(); });
  },

  /* ================= FINALE ================= */
  startFinale(){
    this.flags.codeDone=true;
    this.state='play'; HG.Input.enabled=true;
    HG.UI.lockPointerForPlay();
    const P=this.P;
    this.finale={active:true,t:82,gateOpen:false};
    // the Choir wakes
    HG.Audio.play('klaxon');
    HG.after(.7,()=>HG.Audio.playAt('burstDoor',{pos:{x:cx(36.5),z:cz(9.5)},floor:1,vol:1}));
    HG.after(1.1,()=>HG.Audio.play('roar'));
    HG.after(1.15,()=>HG.UI.subtitle('[CONTAINMENT FAILS — something pours into the corridor]',3.2));
    Threat.spawnAt(cx(36.5),cz(8),1);   // pours out into the corridor
    Threat.state='hunt'; Threat.alertT=999;
    this.elevatorHumStart();
    HG.UI.objective('SURVIVE. Reach the freight lift — stay quiet.');
    this.advanceObjective(3);
    this.setCheckpoint(cx(31.5),cz(27.5),Math.PI/2,1,'cp3');
    HG.UI.hint('it hunts by sound — crouch [C] to move quietly',5200);
    this.pulseContainLamp();
  },
  elevatorHumStart(){
    const P=this.P;
    this._elevHum=HG.Audio.makeLoop((c,g)=>{
      const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=38;
      const fl=c.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=150;
      const og=c.createGain(); og.gain.value=.55;
      o.connect(fl); fl.connect(og); og.connect(g); o.start();
      return {setFreq(v){ o.frequency.setTargetAtTime(v,c.currentTime,.6); },
              stop(){ try{o.stop()}catch(e){} }};
    },{pos:{x:P.elevGate.wx,z:P.elevGate.wz},floor:1,ref:17,vol:.02});
  },
  updateFinale(dt){
    const F=this.finale;
    if(!F.active) return;
    F.t-=dt;
    const prog=M.clamp(1-F.t/82,0,1);
    if(this._elevHum){
      this._elevHum.setVol(.06+.5*prog,.5);
      this._elevHum.inner&&this._elevHum.inner.setFreq(38+prog*52);
    }
    if(F.t<=58&&!F._half){ F._half=1;
      HG.UI.subtitle('[cables sing somewhere above — the car is moving]',2.8); }
    if(F.t<=0&&!F.gateOpen){
      F.gateOpen=true;
      HG.Audio.play('ding');
      HG.after(.5,()=>HG.world.elev.setOpen(true));
      HG.UI.subtitle('[THE FREIGHT LIFT HAS ARRIVED — GO]',3.4);
    }
    // boarding check
    const P=this.P, pl=this.player;
    if(F.gateOpen && Math.abs(pl.x-P.elevGate.wx)<1.25 && pl.z>P.elevGate.wz-2.45 && pl.z<P.elevGate.wz+.2){
      this.startEnding();
    }
  },
  startEnding(){
    const F=this.finale, pl=this.player, P=this.P;
    F.active=false; F.boarded=true;
    this.state='ending';
    pl.frozen=true;
    if(this._elevHum){ this._elevHum.stop(); this._elevHum=null; }
    HG.world.elev.setOpen(false);
    HG.Audio.play('doorSlide');
    // the Choir lunges into the closing gate
    HG.after(.55,()=>{
      Threat.relocate(P.elevGate.wx, P.elevGate.wz-1.6);
      Threat.syncBody();
      pl.lookAtPoint(Threat.x,Threat.z,1,50);
      HG.Audio.play('lunge');
    });
    HG.after(1.15,()=>{
      HG.UI.flash('flashWhite',.95,160);
      HG.Audio.play('doorSlam',{vol:1.5});
      Threat.banish();
    });
    HG.after(1.45,()=>{
      HG.UI.flash('flashBlack',1,200);
      HG.UI.damage(0); HG.UI.fear(0);
    });
    // ascent rumble + shake
    HG.after(1.8,()=>{
      this._rumble=HG.Audio.makeLoop((c,g)=>{
        const n=c.createBufferSource(); n.buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
        const d=n.buffer.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
        n.loop=true;
        const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=70;
        const ng=c.createGain(); ng.gain.value=.8;
        n.connect(f); f.connect(ng); ng.connect(g); n.start();
        return {stop(){ try{n.stop()}catch(e){} }};
      },{vol:.5});
      this._shake=true;
      HG.Audio.play('radio',{vol:.6,sub:'KDF·S SURFACE — “copy contractor, say again?”',subT:4});
    });
    const radioLines=[
      [5.5,'"Station\'s restored. Aux, generator, lift. Car two is coming up."'],
      [10.5,'“...hold on. who pulled the fuses?”'],
      [14,'“Previous crew. Chief researcher Marsh.”'],
      [17.5,'“there\'s no Marsh on this manifest. Kestrel Deep closed in \'83.”'],
      [22,'“...the station was warm.”'],
    ];
    for(const [t,line] of radioLines){
      HG.after(t+1.8,()=>{ HG.Audio.play('radio',{vol:.5}); HG.UI.subtitle(line,3.6); });
    }
    HG.after(26.5,()=>{
      if(this._rumble){this._rumble.stop();this._rumble=null;}
      this._shake=false;
      this.showEndScreen();
    });
  },
  showEndScreen(){
    this.state='end';
    HG.Input.enabled=false;
    HG.Input.unlockPointer();
    HG.Audio.setFear(0);
    const mins=Math.floor(this.playT/60), secs=Math.floor(this.playT%60);
    HG.UI.endScreen({
      time:`${mins}:${String(secs).padStart(2,'0')}`,
      deaths:this.deaths,
      notes:this.notesRead,
    });
  },

  /* ================= input extras ================= */
  bindInputExtras(){
    window.addEventListener('keydown',e=>{
      if(e.code==='Tab'){
        if(['play'].includes(this.state)){
          HG.UI.show('objOverlay'); this.renderObjectives(); e.preventDefault();
        }
      }
      if(e.code==='KeyE'){
        if(HG.UI._noteClose){ HG.UI.hideNote(); return; }
      }
      if(e.code==='Escape'){
        if(this.state==='note'){ HG.UI.hideNote(); }
        else if(this.state==='keypad'&&HG.UI._kp){
          const c=HG.UI._kp.onCancel; HG.UI.closeKeypad(); c&&c();
        }
      }
    });
    window.addEventListener('keyup',e=>{ if(e.code==='Tab') HG.UI.hide('objOverlay'); });

    // note close → resume
    const origHide=HG.UI.hideNote.bind(HG.UI);
    HG.UI.hideNote=()=>{ origHide(); if(Game.state==='note') Game.resumePlay(); };
  },
  renderObjectives(){
    const list=[
      {text:'Restore auxiliary power (atrium panel)',done:this.flags.auxPower},
      {text:'Descend to B2 · restore the generator',done:this.flags.genOn},
      {text:'Override the freight lift keypad',done:this.flags.codeDone,cur:!this.flags.codeDone&&this.flags.genOn},
      {text:this.finale.active?'Reach the freight lift':'—',cur:this.finale.active,done:false},
    ];
    if(!this.flags.auxPower) list[0].cur=true;
    else if(!this.flags.genOn) list[1].cur=true;
    HG.UI.objectivesOverlay(list.filter(o=>o.text!=='—'||o.cur));
  },

  /* ================= state transitions ================= */
  beginIntro(){
    this.state='intro';
    HG.UI.hide('title');
    HG.UI.show('intro');
    const el=HG.UI.els.introText;
    el.textContent='';
    const text=S.intro;
    let i=0; this._introDone=false;
    const step=()=>{
      if(this._introDone) return;
      i+=2;
      el.textContent=text.slice(0,i);
      if(i<text.length){ this._introTimer=setTimeout(step,24); }
      else this.finishIntroSoon();
    };
    step();
    this._introSkip=()=>{
      clearTimeout(this._introTimer);
      this._introDone=true;
      this.beginPlay();
    };
    document.getElementById('intro').addEventListener('click',this._introSkip,{once:true});
  },
  finishIntroSoon(){ HG.after(2.6,()=>{ if(this.state==='intro') this.beginPlay(); }); },
  beginPlay(){
    if(this.state==='play') return;
    HG.UI.hide('intro');
    HG.UI.setHUD(true);
    this.state='play';
    HG.Input.enabled=true;
    // fresh start: place the contractor at the service airlock
    const sp=Maps.P.spawnU;
    this.player.place(Maps.cx(sp.c),Maps.cz(sp.r),sp.yaw,sp.f);
    this.player.frozen=false;
    this.player.flashOn=true;
    HG.UI.lockPointerForPlay();
    HG.UI.objective('Restore auxiliary power — find two fuses, then the atrium panel.');
    this.renderObjectives();
    HG.UI.hint('WASD move · mouse look · E interact · F flashlight',7000);
    setTimeout(()=>{ if(!HG.Input.pointerLocked&&this.state==='play') HG.UI.hint('click the screen to capture the mouse',5000); },1600);
    this.startTime=performance.now();
  },
  pauseGame(){
    if(this.state!=='play') return;
    this.state='pause';
    HG.Input.enabled=false;
    HG.UI.show('pauseWrap');
    HG.Audio.suspend&&null;
  },
  resumePlay(){
    if(this.state==='keypad') HG.UI.closeKeypad();
    HG.UI.hide('pauseWrap');
    this.state='play';
    HG.Input.enabled=true;
    HG.UI.lockPointerForPlay();
    HG.Audio.resume();
  },
  restartFromCheckpoint(){
    HG.UI.hide('pauseWrap');
    this.respawnAtCheckpoint(this.checkpoint);
    if(this.finale.boarded) return;
  },
  quitToTitle(){ location.reload(); },

  /* ================= per-frame ================= */
  update(dt,input){
    // timers always tick during play-ish states
    if(['play','dead','ending'].includes(this.state)) HG.tickTimers(dt);

    switch(this.state){
      case 'title':{
        this.titleCam(dt);
        break;
      }
      case 'intro': break;
      case 'play':{
        this.playT+=dt;
        this.player.update(dt,input);
        Threat.update(dt,this.player);
        this.world.update(dt,{x:this.player.x,z:this.player.z},this.player.floor);
        this.scanInteract(input);
        this.scanTriggers();
        this.updateFinale(dt);
        this.ambience(dt);
        this.updateFearFX(dt);
        break;
      }
      case 'dead':{
        this.world.update(dt,{x:this.player.x,z:this.player.z},this.player.floor);
        break;
      }
      case 'ending':{
        this.world.update(dt,{x:this.player.x,z:this.player.z},1);
        if(this._shake){
          this.player.roll.rotation.z=(Math.random()-.5)*.02;
          this.player.camYaw.position.y+= (Math.random()-.5)*.03;
        }
        break;
      }
      case 'note':
      case 'keypad':
      case 'pause':{
        this.world.update(dt*.2,{x:this.player.x,z:this.player.z},this.player.floor);
        break;
      }
    }
  },

  scanInteract(){
    const pl=this.player;
    let best=null,bestScore=0;
    const fx=-Math.sin(pl.yaw), fz=-Math.cos(pl.yaw);
    for(const it of this.interactables){
      if(it.enabled&&!it.enabled()) continue;
      if(it.f!==pl.floor) continue;
      const dx=it.pos.x-pl.x, dz=it.pos.z-pl.z;
      const d=Math.hypot(dx,dz);
      const range=it.r||2.3;
      if(d>range) continue;
      const dot=(dx*fx+dz*fz)/(d||1);
      if(dot<.62) continue;
      const score=dot*(1-d/range+.3);
      if(score>bestScore){bestScore=score;best=it;}
    }
    this.currentInteract=best;
    if(best){
      const lbl=typeof best.label==='function'?best.label():best.label;
      HG.UI.prompt(`[E] ${lbl}`);
      if(input.hit('KeyE')){
        best.use.call(Game);
      }
    } else HG.UI.prompt(null);
  },
  scanTriggers(){
    const pl=this.player;
    for(const t of this.triggers){
      if(t.done) continue;
      if(t.f!==pl.floor) continue;
      if(t.cond&&!t.cond()) continue;
      if(M.dist(pl.x,pl.z,t.x,t.z)<t.r){
        if(t.once) t.done=true;
        t.fn();
      }
    }
  },
  ambience(dt){
    this.ambT-=dt;
    if(this.ambT>0) return;
    this.ambT=M.rand(16,34);
    if(this.finale.active) this.ambT*=.55;
    const pl=this.player;
    const ang=M.rand(0,Math.PI*2), dd=M.rand(9,22);
    const pos={x:M.clamp(pl.x+Math.cos(ang)*dd,2,(GW-2)*CS),z:M.clamp(pl.z+Math.sin(ang)*dd,2,(GH-2)*CS)};
    const roll=Math.random();
    if(roll<.4) HG.Audio.playAt('creak',{pos,floor:pl.floor,vol:M.rand(.5,1)});
    else if(roll<.65) HG.Audio.playAt('bang',{pos,floor:pl.floor,vol:M.rand(.3,.7),sub:'[something shifts in the dark]',subT:2});
    else if(roll<.85) HG.Audio.playAt('whisper',{pos,floor:pl.floor,vol:M.rand(.4,.9)});
    else HG.Audio.playAt('hiss',{pos,floor:pl.floor,vol:.5});
  },
  updateFearFX(dt){
    const f=Threat.active?Threat.fearLevel:0;
    HG.UI.fear((f*.85).toFixed(3));
    HG.UI.damage(f>.6?((f-.6)*1.4).toFixed(3):0);
    this.player.fear=f;
  },

  titleCam(dt){
    // slow drift through the lobby for the menu backdrop
    this._tc=this._tc||{t:0};
    this._tc.t+=dt*.05;
    const a=this._tc.t;
    const cam=HG.camera;
    const cxp=cx(21.5)+Math.sin(a)*4.5;
    const czp=cz(21.5)+Math.cos(a*.7)*3.2;
    cam.position.set(cxp,1.55,czp);
    cam.rotation.set(-.04,a+Math.PI,0);
    cam.rotation.order='YXZ';
    cam.rotation.y=a+Math.PI;
    this.world.update(dt,{x:cxp,z:czp},0);
  },
};

/* local grid helpers */
const cx=c=>(c+.5)*CS, cz=r=>(r+.5)*CS, GW=Maps.GW, GH=Maps.GH;

/* glimpse helper for scares (uses threat body without activating AI) */
HG.Threat.glimpse=function(x,z,floorY,dur,yaw){
  const b=this.body.g;
  b.visible=true;
  b.position.set(x, floorY===0?0:-6, z);
  b.rotation.y=(yaw!==undefined)?yaw:Math.atan2(HG.Game.player.x-x,HG.Game.player.z-z);
  this.animT=0; this.speed=.4;
  HG.after(dur,()=>{ if(!this.active) b.visible=false; });
};

})();
