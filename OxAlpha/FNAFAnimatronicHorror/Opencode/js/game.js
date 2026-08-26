import * as THREE from 'three';
import {rand,pick,chance,clamp,lerp} from './utils.js';
import {ROOMS,CAM_ORDER} from './scene.js';
import {Actor,META} from './characters.js';
import {Director} from './ai.js';
import {NIGHT_INTROS,MEMOS,CHAR_TIPS} from './lore.js';

const HOUR_SEC=50;
const SAVE_KEY='starlight.nightshift.v1';
const CAM_KEYS=['STAGE','DINING','PARTY_W','PARTY_E','BACKSTAGE','KENNEL','KITCHEN','ARCADE','LOBBY','WHALL','EHALL','WCORNER','ECORNER','MAINT'];

export class Game{
  constructor(renderer,scene,officeCam,world,cams,ui,sfx){
    this.renderer=renderer;this.scene=scene;this.officeCam=officeCam;
    this.world=world;this.cams=cams;this.ui=ui;this.sfx=sfx;
    const qs=new URLSearchParams(location.search);
    this.debug=qs.has('debug');
    this.state='boot';
    this.paused=false;
    this.settings={vol:.8,sens:1,invX:false,invY:false,gfx:'ultra',subs:true};
    this.progress={maxNight:1,beaten:{},memos:[],poster:0};
    this.loadSave();
    this.night=1;
    this.hour=0;
    this.power=100;
    this.doors={L:false,R:false};
    this.hatches={L:false,R:false};
    this.hallLight={L:false,R:false};
    this.monitorUp=false;
    this.activeCam='STAGE';
    this.outage=false;
    this.outagePhase=0;
    this.snare={armed:false,t:0,cd:0};
    this.lureMode=false;
    this.rustyAttempts=0;
    this.breath={L:null,R:null};
    this.lullaby=null;
    this.musicBox=null;
    this.alarmOn=false;
    this.ventRevealT=0;
    this.shakeT=0;
    this.scare=null;
    this.voidWindows=[];
    this.voidWatchT=0;this.maintWatchT=0;
    this.ambientT=rand(14,26);
    this.kitchenT=0;
    this.subPri=0;
    this.yaw=0;this.pitch=-.02;
    this.keys={};
    this._justOpened=false;this._justSwitched=false;
    this.t=0;

    this.actors={
      strix:new Actor('strix'),
      selene:new Actor('selene'),
      rusty:new Actor('rusty'),
      scamper:new Actor('scamper'),
      eclipse:new Actor('eclipse')
    };
    for(const k in this.actors)scene.add(this.actors[k].group);

    this.director=new Director(world,sfx,this.makeHooks());
    for(const k of ['strix','selene','rusty','scamper'])this.director.attach(k,this.actors[k]);

    this.ui.mount();
    this.ui.bindMenu(n=>this.startNight(n));
    this.buildUICbs();
    this.buildMap();
    this.bindInput();

    if(this.debug){
      window.__G=this;
      console.log('[SP] debug API on window.__G');
    }
    this.toMenu();
  }

  loadSave(){
    try{
      const raw=localStorage.getItem(SAVE_KEY);
      if(raw){
        const d=JSON.parse(raw);
        Object.assign(this.progress,d.progress||{});
        Object.assign(this.settings,d.settings||{});
      }
    }catch(e){}
  }
  save(){
    try{
      localStorage.setItem(SAVE_KEY,JSON.stringify({progress:this.progress,settings:this.settings}));
    }catch(e){}
  }
  applySettings(){
    this.sfx.setVolume(this.settings.vol);
    if(this.world.dust)this.world.dust.visible=this.settings.gfx!=='lite';
  }
  gfxChanged(){
    location.reload();
  }

  makeHooks(){
    return {
      say:(t,p=0)=>this.sub(t,p),
      camGlitch:c=>{
        if(this.monitorUp&&this.activeCam===c)this.cams.burst(1);
        this.sfx.staticBurst(.25);
      },
      atDoor:(side,id)=>{
        this.sub(`${META[id].name} — ${side==='L'?'WEST':'EAST'} DOOR`,1);
      },
      blockedBang:(side,id)=>{
        this.stopBreath(side);
        this.sub(`BANG against the ${side==='L'?'west':'east'} door!`,1);
        if(id==='rusty'){
          this.rustyAttempts++;
          this.power=Math.max(0,this.power-(1+Math.min(this.rustyAttempts*1.5,6)));
          this.toast(`Rusty slammed the door! Power −${(1+Math.min(this.rustyAttempts*1.5,6)).toFixed(0)}%`);
        }
      },
      breach:(sideOrVent,id)=>this.triggerScare(sideOrVent,id),
      kennelChange:st=>{
        const msg=['','RUSTY is peeking out of the doghouse…','THE DOGHOUSE IS EMPTY','SCRAPING METAL — WEST WING'][st];
        if(msg)this.sub(msg,st>=2?1:0);
        if(st===2)this.sfx.servo(9,-.5,.5);
      },
      caughtBySnare:(side)=>{
        this.toast('SNARED! Scamper retreats.');
        this.snare.armed=false;this.snare.cd=30;
        this.ui.snareUI('cd',this.snare.cd/30);
      },
      ventActivity:side=>this.sub(`scratching · ${side==='L'?'WEST':'EAST'} vent`,1),
      eclipseAppear:cam=>{
        this.sub('SIGNAL ANOMALY',1);
        if(this.monitorUp&&this.activeCam===cam)this.cams.burst(.6);
      },
      eclipseGone:()=>{
        this.cams.setCorrupt(0,false);
        this.flashEl&&this.flashSet(0,'red');
      },
      eclipseStare:on=>{
        if(on){
          this.sub('DO NOT LOOK',2);
          this.flashSet(.16,'red');
        }else this.flashSet(0,'red');
      },
      staticBlip:()=>{this.cams.burst(.85);this.sfx.camSwitch();},
      onMove:(id,from,to)=>{
        if((from==='WDOOR'||from==='EDOOR')&&to!=='WDOOR'&&to!=='EDOOR'){
          const side=from==='WDOOR'?'L':'R';
          this.stopBreath(side);
        }
      }
    };
  }

  buildUICbs(){
    const cbs={
      onFlipHover:up=>{if(up&&!this.monitorUp&&!this.outage&&(this.state==='night'))this.toggleMonitor(true);},
      onFlipToggle:()=>{if(this.state==='night'&&!this.outage)this.toggleMonitor(!this.monitorUp);},
      onMonClose:()=>this.toggleMonitor(false),
      onLureBtn:()=>this.toggleLureMode(),
      onSnareBtn:()=>this.armSnare(),
      onResume:()=>this.setPaused(false),
      onRestart:()=>this.startNight(this.night),
      onQuit:()=>this.toMenu(),
      onHelpClose:()=>{if(this.state==='menu')this.showMenu();else this.ui.screen(null);},
      onArchiveBack:()=>this.showMenu(),
      onSettingsBack:()=>{this.save();this.showMenu();},
      onRetry:()=>this.startNight(this.night),
      onGoMenu:()=>this.toMenu(),
      onWinNext:()=>this.toMenu(),
      onSetting:(k,v)=>{
        this.settings[k]=v;
        if(k==='gfx'){this.save();setTimeout(()=>this.gfxChanged(),250);}
        if(k==='vol')this.applySettings();
        if(k==='sens'||k==='invX'||k==='invY'){}
        if(k==='subs'){}
      },
      canSub:()=>this.settings.subs&&(this.state==='night'),
      onPanelDown:(key,act)=>{
        if(this.state!=='night'||this.outage)return;
        if(act.startsWith('door'))this.toggleDoor(act.slice(4));
        else if(act.startsWith('hatch'))this.toggleHatch(act.slice(5));
        else if(act.startsWith('light'))this.setLight(act.slice(5),true);
      },
      onPanelUp:(key,act)=>{
        if(act.startsWith('light'))this.setLight(act.slice(5),false);
      },
      onMapPick:(id,lure)=>this.handleMapPick(id,lure),
      onArchive:()=>this.ui.archive(MEMOS,this.progress.memos),
      onSettingsOpen:()=>this.ui.settings(this.settings),
      onHelp:()=>this.ui.help(),
      onTypeTick:()=>this.sfx.typeTick()
    };
    for(const k in cbs)this.ui.cb[k]=cbs[k];
  }

  buildMap(){
    const entries=[];
    for(const id of CAM_ORDER){
      const r=ROOMS[id];
      entries.push({id,num:r.num?('CAM '+r.num):'',label:r.name,mx:r.mx,my:r.my,audioOnly:!!r.audioOnly});
    }
    entries.push({id:'VOID',num:'CAM ??',label:'???',mx:93,my:4,hidden:true});
    entries.push({id:'OFFICE',label:'YOU',mx:50,my:97,office:true});
    this.ui.buildMap(entries);
    this.ui.mapVoid(false);
  }

  bindInput(){
    const cv=this.renderer.domElement;
    document.addEventListener('mousemove',e=>{
      if(this.state!=='night'||this.paused||this.monitorUp||this.outage)return;
      const s=this.settings;
      this.yaw-=e.movementX*.0021*s.sens*(s.invX?-1:1);
      this.pitch-=e.movementY*.0019*s.sens*(s.invY?-1:1);
      this.clampLook();
    });
    document.addEventListener('keydown',e=>{
      if(e.repeat)return;
      this.firstGesture();
      const k=e.key.toLowerCase();
      this.keys[k]=true;
      if(this.state==='intro'&&k===' '){document.getElementById('intro').click();return;}
      if(this.state!=='night')return;
      if(k==='escape'){this.setPaused(!this.paused);return;}
      if(this.paused)return;
      switch(k){
        case ' ':case 's':if(!this.outage)this.toggleMonitor(!this.monitorUp);break;
        case 'q':this.toggleDoor('L');break;
        case 'e':this.toggleDoor('R');break;
        case 'z':this.setLight('L',true);break;
        case 'c':this.setLight('R',true);break;
        case 'x':this.flashVents();break;
        case 'f':this.toggleHatch('L');break;
        case 'g':this.toggleHatch('R');break;
        case 't':if(this.monitorUp)this.toggleLureMode();break;
        case 'b':this.armSnare();break;
        case 'm':this.sfx.setMuted(!this.sfx.muted);this.toast(this.sfx.muted?'MUTED':'SOUND ON',1200);break;
        case 'arrowleft':case 'a':break;
        case 'arrowright':case 'd':break;
        case 'arrowup':if(this.monitorUp)this.selectCam(CAM_ORDER[(CAM_ORDER.indexOf(this.activeCam)+CAM_ORDER.length-1)%CAM_ORDER.length]);break;
        case 'arrowdown':if(this.monitorUp)this.selectCam(CAM_ORDER[(CAM_ORDER.indexOf(this.activeCam)+1)%CAM_ORDER.length]);break;
      }
      if(/^[1-9]$/.test(k)&&this.monitorUp){
        const idx=+k-1;
        if(idx<CAM_ORDER.length)this.selectCam(CAM_ORDER[idx]);
      }
    });
    document.addEventListener('keyup',e=>{
      const k=e.key.toLowerCase();
      this.keys[k]=false;
      if(k==='z')this.setLight('L',false);
      if(k==='c')this.setLight('R',false);
    });
    document.addEventListener('pointerdown',()=>this.firstGesture(),{once:false});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&this.state==='night'&&!this.paused)this.setPaused(true);
    });
  }
  firstGesture(){
    if(!this.sfx.ok){
      this.sfx.init();
      this.applySettings();
    }
    this.sfx.resume();
  }
  clampLook(){
    this.yaw=clamp(this.yaw,-1.25,1.25);
    this.pitch=clamp(this.pitch,-.44,.38);
  }

  sub(t,pri=0){
    if(!this.settings.subs||this.state!=='night')return;
    if(pri<this.subPri)return;
    this.subPri=pri;
    this.ui.sub(t);
    clearTimeout(this._subT);
    this._subT=setTimeout(()=>{this.subPri=0;},1800);
  }
  toast(t){this.ui.toast(t);}
  flashSet(op,cls){
    const f=document.getElementById('flash');
    if(!f)return;
    f.classList.toggle('red',cls==='red');
    f.style.transition='none';
    f.style.opacity=op;
    if(op>0&&op<.5)setTimeout(()=>{f.style.transition='opacity .6s';f.style.opacity=0;},90);
  }

  showMenu(){
    this.state='menu';
    this.paused=false;
    this.ui.screen(null);
    this.ui.menuShow({
      maxNight:Math.min(this.progress.maxNight,6),
      beaten:this.progress.beaten,
      hasSave:true
    },Math.min(Math.min(this.progress.maxNight,6)+ (this.progress.maxNight>=6?0:1),6)||1);
    this.selDefault();
  }
  selDefault(){
    const nb=document.querySelectorAll('.night-b');
    let sel=this.progress.maxNight>=6?6:Math.min(this.progress.maxNight+1,6);
    nb.forEach(b=>{
      b.classList.toggle('sel',+b.dataset===sel);
    });
  }
  toMenu(){
    this.state='menu';
    this.paused=false;
    this.stopAllLoops();
    this.sfx.fanLoop(false);
    this.cams.setCorrupt(0,false);
    this.hideActorsToMenu();
    this.ui.screen(null);
    this.ui.hudShow(false);
    this.ui.monShow(false);
    this.ui.panelsShow(false);
    this.ui.flipZoneShow(false);
    this.ui.menuShow({
      maxNight:Math.min(this.progress.maxNight,6),
      beaten:this.progress.beaten,
      hasSave:true
    },this.defaultNight());
  }
  defaultNight(){return this.progress.maxNight>=6?6:Math.min(this.progress.maxNight+1,6);}
  hideActorsToMenu(){
    this.actors.strix.hide();
    this.actors.selene.hide();
    this.actors.rusty.hide();
    this.actors.scamper.hide();
  }

  startNight(n){
    this.firstGesture();
    this.night=clamp(n,1,6);
    this.hour=0;
    this.power=100;
    this.doors={L:false,R:false};
    this.hatches={L:false,R:false};
    this.hallLight={L:false,R:false};
    this.monitorUp=false;
    this.activeCam='STAGE';
    this.cams.set('STAGE');
    this.outage=false;this.outagePhase=0;this.outageT=0;
    this.snare={armed:false,t:0,cd:0};
    this.lureMode=false;
    this.rustyAttempts=0;
    this.voidWatchT=0;this.maintWatchT=0;
    this.voidWindows=[];
    if(this.night>=3){
      this.voidWindows=[rand(60,150),rand(170,260)].map(t=>[t,t+22]);
    }
    this.ambientT=rand(14,26);
    this.stopAllLoops();
    this.world.setDoor('L',false);this.world.setDoor('R',false);
    this.world.setHatch('L',false);this.world.setHatch('R',false);
    this.world.setHallLight('L',false);this.world.setHallLight('R',false);
    this.world.setVoidVisible(false);
    this.restoreOfficePower();
    this.director.startNight(this.night);
    this.ui.screen(null);
    this.ui.hudShow(true);
    this.ui.monShow(false);
    this.ui.panelsShow(true);
    this.ui.flipZoneShow(true);
    this.ui.setNight(this.night);
    this.ui.setClock('12:00 AM');
    this.ui.setPower(100,1,false);
    this.ui.snareUI('ready',0);
    this.ui.mapActive('STAGE');
    this.ui.panelBtn('doorL',false,'door');this.ui.panelBtn('doorR',false,'door');
    this.ui.panelBtn('hatchL',false,'hatch');this.ui.panelBtn('hatchR',false,'hatch');
    this.ui.panelBtn('lightL',false,'light');this.ui.panelBtn('lightR',false,'light');
    const intro=NIGHT_INTROS[this.night];
    this.state='intro';
    this.ui.intro(intro.head,intro.lines,()=>{
      this.state='night';
      this.ui.screen(null);
      this.ui.hudShow(true);
      this.ui.flipZoneShow(true);
      this.ui.panelsShow(true);
      this.sfx.fanLoop(true);
    });
    this.save();
  }
  restoreOfficePower(){
    const w=this.world;
    w.deskLamp.intensity=42;
    w.monGlow.intensity=3.2;
    w.redGlow.intensity=.5;
    w.fluorOn=true;w.fluorT=0;
    w.monitors.forEach(m=>m.material.color.setHex(0x88bbff));
  }
  stopAllLoops(){
    this.stopBreath('L');this.stopBreath('R');
    if(this.lullaby){this.lullaby.stop();this.lullaby=null;}
    if(this.musicBox){this.musicBox.stop();this.musicBox=null;}
    this.sfx.stopAlarm&&this.sfx.stopAlarm();
    this.alarmOn=false;
  }
  stopBreath(side){
    if(this.breath[side]){this.breath[side].stop();this.breath[side]=null;}
  }
  setPaused(p){
    this.paused=p;
    if(p){this.ui.pause();}
    else this.ui.screen(null);
    this.sfx.fanLoop(!p&&this.state==='night');
  }

  toggleMonitor(up){
    if(up===this.monitorUp)return;
    this.monitorUp=up;
    this.sfx.monitorUp&&this.sfx.monitorUp();
    if(!up)this.sfx.monitorDown();
    this.ui.monShow(up);
    this.ui.panelsShow(!up&&!this.outage);
    if(up){
      this.setLight('L',false);this.setLight('R',false);
      this.cams.set(this.activeCam);
      this.ui.mapActive(this.cams.active);
      this.refreshCamInfo();
      this._justOpened=true;
      this.cams.burst(.7);
    }else{
      this.ui.mapLureMode(false);this.lureMode=false;
    }
  }
  refreshCamInfo(){
    const r=ROOMS[this.activeCam];
    if(!r)return;
    const hTxt=this.clockString();
    this.ui.setCamInfo(r.num?('CAM '+r.num):'CAM ??',r.name,`NOV 0${6+this.night} 1993   ${hTxt}`,!!r.audioOnly);
  }
  selectCam(id){
    if(id==='OFFICE')return;
    if(id==='VOID'&&!this.voidVisibleNow())return;
    const changed=this.cams.set(id);
    this.activeCam=id;
    this.ui.mapActive(id);
    this.refreshCamInfo();
    if(changed){this.sfx.camSwitch();this.cams.burst(.5);}
    this._justSwitched=true;
  }
  handleMapPick(id,lure){
    if(lure){
      const r=ROOMS[id];
      if(!r||!r.anchor||id==='VOID'){this.toast('Cannot lure there');return;}
      if(this.lureCd>0){this.toast('Lure recharging…');return;}
      this.power=Math.max(0,this.power-3);
      this.lureCd=8;
      this.director.lure(id,this.director.now);
      this.sfx.lurePlay({x:r.anchor[0],z:r.anchor[2]});
      this.ui.mapLureTarget(id);
      this.toast(`Lullaby playing in ${r.name}`);
      setTimeout(()=>this.ui.mapLureTarget(null),4000);
      return;
    }
    this.selectCam(id);
  }
  toggleLureMode(){
    if(!this.monitorUp)return;
    this.lureMode=!this.lureMode;
    this.ui.mapLureMode(this.lureMode);
    this.sfx.uiClick();
  }
  armSnare(){
    if(this.snare.cd>0||this.snare.armed)return;
    if(this.power<6){this.toast('Not enough power!');return;}
    this.power-=5;
    this.snare.armed=true;this.snare.t=20;
    this.sfx.snareZap(0);
    this.sub('VENT SNARE ARMED',1);
  }
  toggleDoor(side){
    if(this.outage)return;
    if(this.monitorUp)this.toggleMonitor(false);
    this.doors[side]=!this.doors[side];
    this.world.setDoor(side,this.doors[side]);
    this.sfx.doorMove(!this.doors[side],side==='L'?-.7:.7);
    this.ui.panelBtn('door'+side,this.doors[side],'door');
  }
  toggleHatch(side){
    if(this.outage)return;
    this.hatches[side]=!this.hatches[side];
    this.world.setHatch(side,this.hatches[side]);
    this.sfx.doorMove(!this.hatches[side],side==='L'?-.85:.85);
    this.ui.panelBtn('hatch'+side,this.hatches[side],'hatch');
  }
  setLight(side,on){
    if(this.outage){on=false;}
    if(this.monitorUp)on=false;
    if(this.hallLight[side]===on)return;
    this.hallLight[side]=on;
    this.world.setHallLight(side,on);
    if(on)this.sfx.hallLightOn(side);
    this.ui.panelBtn('light'+side,on,'light');
  }
  flashVents(){
    if(this.outage||this.ventRevealT>0)return;
    this.power=Math.max(0,this.power-.4);
    this.ventRevealT=.5;
    this.sfx.ventFlash();
    const at=this.director.scamperAtVent();
    if(at){
      const anchor=at==='L'?ROOMS.WVENT.anchor:ROOMS.EVENT.anchor;
      this.actors.scamper.place(anchor,at==='L'?-Math.PI/2:Math.PI/2);
      this.actors.scamper.show();
      this.sub('EYES IN THE '+(at==='L'?'WEST':'EAST')+' VENT',1);
      this.sfx.ventScratch(at==='L'?-.9:.9);
    }
  }
  voidVisibleNow(){
    return this.voidWindows.some(([a,b])=>this.hourSec()>=a&&this.hourSec()<=b);
  }
  hourSec(){return this.hour*HOUR_SEC;}

  triggerScare(sideOrVent,charId){
    if(this.state==='scare')return;
    const a=this.actors[charId];
    if(!a)return;
    this.state='scare';
    this.scare={id:charId,t:0,dur:a.startScare()};
    this.stopAllLoops();
    this.sfx.fanLoop(false);
    this.monitorUp=false;
    this.ui.monShow(false);
    this.ui.panelsShow(false);
    this.ui.flipZoneShow(false);
    let pos;
    if(sideOrVent==='L')pos=[-2.1,0,12.55];
    else if(sideOrVent==='R')pos=[2.1,0,12.55];
    else if(sideOrVent==='VENT_L')pos=[-3.02,.32,13.72];
    else if(sideOrVent==='VENT_R')pos=[3.02,.32,13.72];
    else pos=[-2.1,0,12.55];
    a.group.position.set(pos[0],pos[1],pos[2]);
    a.faceTowards({x:this.officeCam.position.x*.3,z:this.officeCam.position.z});
    a.show();
    this.sfx.screech(charId);
    setTimeout(()=>this.flashSet(.85,'red'),320);
    this.shakeT=1;
  }
  finishScare(){
    const id=this.scare.id;
    const tips=CHAR_TIPS[id]||CHAR_TIPS.strix;
    this.state='gameover';
    this.flashSet(0,'red');
    this.ui.gameover(META[id].name,META[id].title,pick(tips)+'\n\n— '+META[id].tip);
  }

  beginOutage(){
    this.outage=true;
    this.outagePhase=1;
    this.outageT=rand(3,6);
    this.doors={L:false,R:false};this.world.setDoor('L',false);this.world.setDoor('R',false);
    this.hatches={L:false,R:false};this.world.setHatch('L',false);this.world.setHatch('R',false);
    this.setLight('L',false);this.setLight('R',false);
    if(this.monitorUp)this.toggleMonitor(false);
    this.ui.panelsShow(false);
    this.ui.flipZoneShow(false);
    const w=this.world;
    w.deskLamp.intensity=0;
    w.fluorOn=false;w.fluorT=9999;
    w.fluorLight.intensity=0;
    w.monGlow.intensity=.2;
    w.monitors.forEach(m=>m.material.color.setHex(0x05070b));
    this.sfx.powerDown();
    if(this.alarmOn){this.sfx.stopAlarm();this.alarmOn=false;}
    this.sub('POWER FAILURE',2);
  }
  updateOutage(dt){
    if(!this.outage)return;
    this.world.monGlow.intensity=.2;
    this.world.fluorLight.intensity=0;
    if(this.outagePhase===1){
      this.outageT-=dt;
      if(this.outageT<=0){
        this.outagePhase=2;
        this.outageT=rand(5,10);
        const st=this.actors.strix;
        st.place([-2.15,0,12.5],0);
        st.show();
        st.rig.eyes.forEach(e=>e.eyeb.material.emissiveIntensity=6);
        this.musicBox=this.sfx.musicBoxLoop();
        this.world.redGlow.intensity=.5;
      }
    }else if(this.outagePhase===2){
      this.outageT-=dt;
      if(this.outageT<=0){
        this.triggerScare('POWER','strix');
      }
    }
  }

  winNight(){
    this.state='win';
    this.stopAllLoops();
    this.sfx.fanLoop(false);
    this.sfx.chime();
    this.progress.beaten[this.night]=true;
    this.progress.maxNight=Math.max(this.progress.maxNight,Math.min(this.night+1,6));
    const unlockMemos=[];
    const tryUnlock=m=>{if(!this.progress.memos.includes(m)){this.progress.memos.push(m);unlockMemos.push(m);}};
    if(this.night===1)tryUnlock('m1');
    if(this.night===2)tryUnlock('m2');
    if(this.night===4)tryUnlock('m5');
    if(this.night===5)tryUnlock('m8');
    if(this.night===6){tryUnlock('m9');tryUnlock('m8');}
    if(this.outageSurvived)tryUnlock('m7');
    if(unlockMemos.length)this.toast('NEW ARCHIVE ENTRY UNLOCKED');
    this.save();
    let extra='';
    if(this.night===5)extra='You survived the contract.\nOVERTIME has been unlocked.';
    if(this.night===6)extra='There is nothing left to survive.\nYou stayed anyway.';
    this.ui.win(`NIGHT ${this.night===6?'6 (OVERTIME)':this.night} SURVIVED\n\n${extra}`,null);
  }

  clockString(){
    const hF=this.hour;
    let h=Math.floor(hF);
    const m=Math.floor((hF-h)*60);
    const disp=h===0?12:h;
    return `${disp}:${m.toString().padStart(2,'0')} AM`;
  }
  usageBars(){
    return 1+(this.doors.L?1:0)+(this.doors.R?1:0)+(this.hallLight.L?1:0)+(this.hallLight.R?1:0)+(this.monitorUp?1:0);
  }

  update(dt){
    this.t+=dt;
    const w=this.world;
    w.update(dt,this.t);
    if(this.state==='menu'||this.state==='win'||this.state==='gameover'){
      this.idleView(dt);
    }
    if(this.state==='intro'){
      this.idleView(dt);
      this.actors.strix.update(dt,null);
      this.actors.selene.update(dt,null);
    }
    if(this.state==='scare'&&this.scare){
      this.scare.t+=dt;
      const a=this.actors[this.scare.id];
      a.update(dt,this.officeCam);
      this.shakeT=Math.max(0,1-this.scare.t/this.scare.dur);
      if(this.scare.t>=this.scare.dur+.45){
        const done=true;
        this.finishScare();
      }
    }
    if(this.state!=='night')return;
    if(this.paused)return;

    this.hour+=dt/HOUR_SEC;
    if(!this.outageSurvived)this.outageSurvived=this.outage;

    const bars=this.usageBars();
    if(!this.outage){
      this.power-=dt*.055*bars;
      if(this.snare.armed){
        this.snare.t-=dt;
        this.ui.snareUI('armed',this.snare.t/20);
        if(this.snare.t<=0){this.snare.armed=false;this.snare.cd=30;}
      }else if(this.snare.cd>0){
        this.snare.cd-=dt;
        this.ui.snareUI('cd',this.snare.cd/30);
        if(this.snare.cd<=0)this.ui.snareUI('ready',0);
      }
      if(this.lureCd>0)this.lureCd-=dt;
    }
    this.ui.setPower(this.power,bars,this.power<20&&!this.outage);
    this.ui.setClock(this.clockString());

    if(!this.alarmOn&&this.power<10&&!this.outage){
      this.alarmOn=true;
      this.sfx.alarmLow&&this.sfx.alarmLow();
    }
    if(this.alarmOn&&chance(dt*.5))this.sfx.powerWarnBeep&&this.sfx.powerWarnBeep();

    if(this.power<=0&&!this.outage)this.beginOutage();
    this.updateOutage(dt);

    if(this.hour>=6){this.winNight();return;}

    const voidVis=this.voidVisibleNow();
    if(voidVis!==this.world.voidVisible){
      w.setVoidVisible(voidVis);
      this.ui.mapVoid(voidVis);
      if(!voidVis&&this.activeCam==='VOID'){this.selectCam('STAGE');this.cams.burst(1);}
    }
    if(this.monitorUp&&this.activeCam==='VOID')this.voidWatchT+=dt;
    if(this.monitorUp&&this.activeCam==='MAINT')this.maintWatchT+=dt;
    if(this.voidWatchT>3&&!this.progress.memos.includes('m10')){
      this.progress.memos.push('m10');this.toast('NEW ARCHIVE ENTRY UNLOCKED');this.save();
    }
    if(this.maintWatchT>10&&!this.progress.memos.includes('m3')){
      this.progress.memos.push('m3');this.toast('NEW ARCHIVE ENTRY UNLOCKED');this.save();
    }

    this._justOpened=this._justOpenedFrame||false;
    this._justSwitched=this._justSwitchedFrame||false;
    this._justOpenedFrame=false;this._justSwitchedFrame=false;

    this.lookKeys(dt);
    if(this.ventRevealT>0){
      this.ventRevealT-=dt;
      if(this.ventRevealT<=0&&!this.director.mouseInVentHideLock)this.actors.scamper.hide();
    }

    const ctx={
      monitorUp:this.monitorUp,
      activeCam:this.activeCam,
      monitorJustOpened:this._justOpened,
      camJustSwitched:this._justSwitched,
      doors:{L:this.doors.L,R:this.doors.R},
      hatches:{L:this.hatches.L,R:this.hatches.R},
      snareArmed:this.snare.armed,
      attempts:this.rustyAttempts,
      drainPower:a=>{this.power=Math.max(0,this.power-a);}
    };
    this.director.update(dt,ctx);

    const eclCam=this.director.eclipseCam;
    this.cams.setCorrupt(eclCam&&(this.monitorUp&&this.activeCam===eclCam)?1:0,true);

    this.watchDoors(dt);
    this.updateAudioProx(dt);
    this.ambientEvents(dt);

    for(const k of ['strix','selene','rusty','scamper']){
      const a=this.actors[k];
      if(a.group.visible&&a.mode!=='scare')a.update(dt,null);
    }

    this.layoutPanels();
    this.cams.update(dt);
  }

  idleView(dt){
    this.yaw=Math.sin(this.t*.14)*.14;
    this.pitch=-.03+Math.sin(this.t*.09)*.02;
    this.cams.update(dt);
  }
  lookKeys(dt){
    const sp=1.7*dt;
    if(this.keys['a']||(this.keys['arrowleft']&&!this.monitorUp))this.yaw+=sp;
    if(this.keys['d']||(this.keys['arrowright']&&!this.monitorUp))this.yaw-=sp;
    this.clampLook();
  }
  watchDoors(dt){
    for(const side of ['L','R']){
      const node=side==='L'?'WDOOR':'EDOOR';
      const occ=['strix','selene'].find(id=>this.director.nodes[id]===node);
      if(occ){
        if(!this['threat_'+side]){
          this['threat_'+side]={id:occ,t:rand(3.2,5.2)};
        }
        if(!this.doors[side]){
          if(!this.breath[side])this.breath[side]=this.sfx.breathLoop(side);
          this['threat_'+side].t-=dt;
          if(this['threat_'+side].t<=0){
            this.triggerScare(side,this['threat_'+side].id);
            return;
          }
        }else{
          this.stopBreath(side);
          this['threat_'+side].grace=(this['threat_'+side].grace||0)+dt;
          if(this['threat_'+side].grace>rand(1,1.6)){
            this.director.doorBlocked(this['threat_'+side].id,side,{});
            this['threat_'+side]=null;
          }
        }
      }else{
        this['threat_'+side]=null;
        this.stopBreath(side);
      }
    }
  }
  updateAudioProx(dt){
    const prox=this.director.nodes.selene?this.director.proximity('selene'):99;
    if(prox<24&&!this.outage){
      if(!this.lullaby){
        const p=panOfAnchor(ROOMS[this.director.nodes.selene]?.anchor);
        this.lullaby=this.sfx.lullabyStart(prox,p);
      }
      this.lullaby.setDist&&this.lullaby.setDist(prox);
    }else if(this.lullaby){
      this.lullaby.stop();this.lullaby=null;
    }
    const kitchenOcc=this.director.nodes.selene==='KITCHEN'||this.director.nodes.strix==='KITCHEN';
    this.kitchenT-=dt;
    if(kitchenOcc&&this.kitchenT<=0){
      this.kitchenT=rand(3,7);
      this.sfx.clang(9,-.75);
      if(chance(.25))this.sfx.giggle(9,-.75);
    }
  }
  ambientEvents(dt){
    this.ambientT-=dt;
    if(this.ambientT>0)return;
    this.ambientT=rand(18,40);
    const roll=Math.random();
    if(roll<.4)this.sfx.footstep(rand(12,18),rand(-1,1));
    else if(roll<.7)this.sfx.clang(rand(12,17),rand(-1,1));
    else if(roll<.85&&this.night>=2)this.sfx.giggle(rand(12,16),rand(-1,1));
    else this.sfx.whisper();
  }

  layoutPanels(){
    if(this.monitorUp||this.outage||this.state!=='night'){this.ui.panelsShow(this.state==='night'&&!this.outage&&!this.monitorUp);return;}
    const v=new THREE.Vector3();
    const size=new THREE.Vector2();
    this.renderer.getSize(size);
    const proj=pos=>{
      v.set(pos.x,pos.y,pos.z).project(this.officeCam);
      if(v.z>1)return null;
      const dist=Math.abs(v.z)<.001?9:9;
      return {
        x:(v.x*.5+.5)*size.x,
        y:(-v.y*.5+.5)*size.y,
        scale:clamp(1.25-v.z*.28,.55,1.15)
      };
    };
    this.ui.layoutPanels(proj);
  }

  render(){
    const cam=this.officeCam;
    cam.rotation.order='YXZ';
    let sy=0,sx=0;
    if(this.shakeT>0){
      const s=this.shakeT*this.shakeT*.05;
      sy=(Math.random()-.5)*s;
      sx=(Math.random()-.5)*s;
    }
    cam.rotation.y=this.yaw+sy;
    cam.rotation.x=this.pitch+sx;
    cam.position.set(0,1.52,14.95);
    if(this.monitorUp&&this.state==='night'){
      this.cams.renderCurrent(this.renderer,this.scene,this.world.voidVisible);
    }else{
      this.cams.renderOffice(this.renderer,this.scene,cam);
    }
  }
}

function panOfAnchor(a){return a?clamp(a[0]/9,-1,1):0;}
