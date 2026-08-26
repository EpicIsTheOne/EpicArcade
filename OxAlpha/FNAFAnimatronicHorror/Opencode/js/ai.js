import {ROOMS} from './scene.js';
import {rand,pick,chance,clamp} from './utils.js';

export const NIGHT_CFG=[null,
  {strix:4, selene:0, rusty:2,  scamper:0,  eclipse:0, rustBase:20},
  {strix:6, selene:5, rusty:5,  scamper:3,  eclipse:0, rustBase:17},
  {strix:8, selene:7, rusty:8,  scamper:6,  eclipse:0, rustBase:14},
  {strix:10,selene:9, rusty:10, scamper:8,  eclipse:1, rustBase:12},
  {strix:13,selene:12,rusty:12, scamper:11, eclipse:1, rustBase:10},
  {strix:16,selene:15,rusty:15, scamper:14, eclipse:2, rustBase:8.5}
];

const SIDE_OF={PARTY_W:'L',KITCHEN:'L',MAINT:'L',WVENT:'L',WDOOR:'L',WCORNER:'L',WHALL:'L',
               PARTY_E:'R',ARCADE:'R',EVENT:'R',EDOOR:'R',ECORNER:'R',EHALL:'R'};

const CAM_OF_NODE={STAGE:'STAGE',DINING:'DINING',PARTY_W:'PARTY_W',PARTY_E:'PARTY_E',BACKSTAGE:'BACKSTAGE',
  KENNEL:'KENNEL',KITCHEN:'KITCHEN',ARCADE:'ARCADE',LOBBY:'LOBBY',WHALL:'WHALL',EHALL:'EHALL',
  WCORNER:'WCORNER',ECORNER:'ECORNER',MAINT:'MAINT',WDOOR:'WCORNER',EDOOR:'ECORNER'};

function distOffice(anchor){return Math.hypot(anchor[0],anchor[2]-14);}
function panOf(anchor){return clamp(anchor[0]/9,-1,1);}

export class Director{
  constructor(world,audio,hooks){
    this.world=world;this.audio=audio;this.hooks=hooks;
    this.nodes={strix:'STAGE',selene:'STAGE',rusty:'KENNEL',scamper:null};
    this.cfg=NIGHT_CFG[1];
    this.night=1;
    this.tStrix=rand(7,10);this.tSelene=rand(12,18);
    this.rustyStage=0;this.tRusty=24;
    this.chargeIdx=-1;this.tCharge=0;
    this.mousePhase='idle';this.mouseSide=null;this.mouseHopsLeft=0;this.tMouse=rand(18,26);this.mouseDwell=0;
    this.eclipseCam=null;this.eclipseT=0;this.stareT=0;
    this.patience=6;this.patienceMax=6;this.enraged=0;
    this.seleneMoves=0;this.tSeleneAmbient=20;
    this.lureRoom=null;this.lureUntil=-99;
    this.now=0;
  }
  attach(id,actor){this.chars=this.chars||{};this.chars[id]=actor;}
  startNight(n){
    this.night=n;this.cfg=NIGHT_CFG[Math.min(n,6)];
    this.nodes={strix:'STAGE',selene:'STAGE',rusty:'KENNEL',scamper:null};
    this.tStrix=rand(7,10);this.tSelene=rand(12,18);this.tSeleneAmbient=22;
    this.rustyStage=0;this.tRusty=this.cfg.rustBase+rand(4,9);
    this.chargeIdx=-1;this.mousePhase='idle';this.mouseSide=null;this.tMouse=rand(18,26);
    this.eclipseCam=null;this.eclipseT=0;this.stareT=0;
    this.patience=this.patienceMax=Math.max(4,9-n*.8);
    this.enraged=0;this.seleneMoves=0;this.lureRoom=null;this.lureUntil=-99;
    const st=ROOMS.STAGE.anchor;
    this.chars.strix.place([st[0]-.7,st[1],st[2]],Math.PI*.92);
    this.chars.strix.show();
    this.chars.selene.place([st[0]+1.5,st[1],st[2]+.3],Math.PI*1.08);
    this.chars.selene.show();
    this.chars.rusty.hide();
    this.chars.scamper.hide();
    this.hooks.kennelChange(0);
  }
  putChar(id,node){
    const a=this.chars[id];const r=ROOMS[node];if(!r)return;
    a.place(r.anchor,node==='WDOOR'||node==='EDOOR'?0:Math.atan2(-r.anchor[0],-(r.anchor[2])+0)*0+Math.PI*(r.anchor[2]<14?1:0));
    a.faceTowards({x:r.anchor[0]*-.2,z:14});
    a.show();
    this.nodes[id]=node;
  }
  proximity(id){
    const n=this.nodes[id];
    if(!n||!ROOMS[n])return 99;
    return distOffice(ROOMS[n].anchor);
  }
  scamperAtVent(){return this.mousePhase==='vent'?this.mouseSide:null;}
  lure(roomId,t){
    this.lureRoom=roomId;this.lureUntil=t+10;
  }

  update(dt,ctx){
    this.now+=dt;
    const c=this.cfg;
    this._strix(dt,ctx,c.strix);
    if(c.selene>0)this._selene(dt,ctx,c.selene);
    this._rusty(dt,ctx,c.rusty);
    if(c.scamper>0)this._scamper(dt,ctx,c.scamper);
    if(c.eclipse>0)this._eclipse(dt,ctx,c.eclipse);
    if(this.enraged>0)this.enraged-=dt;
  }

  _watched(node,ctx){return ctx.monitorUp&&ctx.activeCam===CAM_OF_NODE[node];}

  _strix(dt,ctx,level){
    this.tStrix-=dt;
    const node=this.nodes.strix;
    const watched=this._watched(node,ctx)&&node!=='KITCHEN'&&node!=='MAINT';
    const frozen=(watched&&this.enraged<=0);
    if(frozen){
      this.patience-=dt;
      if(this.patience<=0){
        this.enraged=rand(5,8);
        this.patience=this.patienceMax;
        this.hooks.say('STRIX IS DONE BEING WATCHED.',1);
        this.hooks.camGlitch(CAM_OF_NODE[node]??'STAGE');
      }
      return;
    }else{
      this.patience=Math.min(this.patienceMax,this.patience+dt*.5);
    }
    if(node==='WDOOR'||node==='EDOOR'){
      const side=SIDE_OF[node];
      const k='tDoor_strix';
      this[k]=(this[k]??rand(1.6,2.8))-dt;
      if(this[k]<=0){
        this[k]=rand(1.2,2.2);
        if(ctx.doors[side])this.doorBlocked('strix',side,ctx);
        else if(rand(20)<level*.95)this.hooks.breach(side,'strix');
      }
      return;
    }
    if(this.tStrix>0)return;
    this.tStrix=Math.max(2.6,4.8-level*.09)+rand(-.5,.7);
    if(rand(20)<level){
      if(this.lureRoom&&chance(.45)){
        const lr=this.lureRoom;
        this._tp('strix',lr,ctx);
        this.hooks.say('servo whir · distant',0);
        return;
      }
      const next=this._advance('strix',node);
      if(next)this._tp('strix',next,ctx);
    }
  }
  _advance(id,node){
    const R=['STAGE','DINING'];
    if(node==='STAGE')return 'DINING';
    if(node==='DINING')return pick(['PARTY_W','PARTY_E']);
    if(node==='PARTY_W')return pick(['LOBBY','WHALL']);
    if(node==='PARTY_E')return pick(['LOBBY','EHALL']);
    if(node==='KITCHEN')return 'WHALL';
    if(node==='ARCADE')return 'EHALL';
    if(node==='LOBBY')return pick(['WHALL','EHALL']);
    if(node==='WHALL')return 'WCORNER';
    if(node==='EHALL')return 'ECORNER';
    if(node==='WCORNER')return 'WDOOR';
    if(node==='ECORNER')return 'EDOOR';
    return null;
  }
  _doorArrive(id,side){
    this.nodes[id]=side==='L'?'WDOOR':'EDOOR';
    this.chars[id].place(ROOMS[this.nodes[id]].anchor,0);
    this.chars[id].show();
    this.hooks.atDoor(side,id);
  }
  doorBlocked(id,side,ctx){
    this.audio.bang(side);
    this.hooks.blockedBang(side,id);
    const back=side==='L'?'WCORNER':'ECORNER';
    this.nodes[id]=back;
    this.chars[id].place(ROOMS[back].anchor,0);
    this.patience=this.patienceMax;
    if(id==='selene'){this.tSelene=rand(10,16);}
    if(id==='strix'){this.tStrix=rand(5,8);}
  }

  _selene(dt,ctx,level){
    this.tSeleneAmbient-=dt;
    let go=0;
    if(ctx.monitorJustOpened)go=.9;
    else if(ctx.camJustSwitched)go=1.0;
    else if(this.tSeleneAmbient<=0){go=.35;this.tSeleneAmbient=rand(13,18);}
    if(go<=0)return;
    const node=this.nodes.selene;
    if(node==='WDOOR'||node==='EDOOR'){
      const side=SIDE_OF[node];
      const k='tDoor_selene';
      this[k]=(this[k]??rand(1.8,3.2))-dt*1.6;
      if(this[k]<=0){
        this[k]=rand(1.4,2.4);
        if(ctx.doors[side])this.doorBlocked('selene',side,ctx);
        else if(rand(20)<level)this.hooks.breach(side,'selene');
      }
      return;
    }
    if(rand()>=go*clamp(level/12,.25,1))return;
    if(this.lureRoom&&this.lureUntil>this.now){
      const lr=this.lureRoom;this.lureUntil=-99;
      this._tp('selene',lr,ctx);
      this.audio.giggle(distOffice(ROOMS[lr].anchor),panOf(ROOMS[lr].anchor));
      this.hooks.say('a giggle echoes somewhere far away',0);
      return;
    }
    const next=this._advance('selene',node);
    if(next){
      this._tp('selene',next,ctx);
      const d=distOffice(ROOMS[next].anchor);
      if(d<26)this.audio.servo(d,panOf(ROOMS[next].anchor),.35);
    }
  }

  _rusty(dt,ctx,level){
    if(this.rustyStage===3){
      this.tCharge-=dt;
      if(this.tCharge<=0){
        this.chargeIdx++;
        this.tCharge=.55;
        const path=['WHALL','WCORNER','WDOOR'];
        if(this.chargeIdx<path.length){
          const node=path[this.chargeIdx];
          this.nodes.rusty=node;
          const p=ROOMS[node].anchor;
          this.chars.rusty.place(p,node==='WDOOR'?Math.PI:-Math.PI/2);
          this.chars.rusty.show();
          this.chars.rusty.mood=1;
          this.audio.footstep(distOffice(p)*.45,-.85);
          if(node==='WDOOR'){
            if(ctx.doors.L){
              this.hooks.blockedBang('L','rusty');
              this.audio.bang('L');
              this._rustyReset(ctx);
            }else{
              this.hooks.breach('L','rusty');
              this._rustyReset(ctx,true);
            }
          }
        }
      }
      return;
    }
    const watchingDoghouse=ctx.monitorUp&&ctx.activeCam==='KENNEL';
    if(watchingDoghouse)this.tRusty+=dt*.75;
    this.tRusty-=dt;
    if(this.rustyStage===0&&this.tRusty<=0){
      this.rustyStage=1;this.tRusty=rand(6,10);
      const p=ROOMS.KENNEL.anchor;
      this.chars.rusty.place([p[0]-.4,p[1],p[2]+.5],Math.PI);
      this.chars.rusty.show();
      this.hooks.kennelChange(1);
      this.audio.servo(9,-.5,.5);
    }else if(this.rustyStage===1&&this.tRusty<=0){
      this.rustyStage=2;this.tRusty=rand(6,10)-level*.12;
      this.chars.rusty.hide();
      this.hooks.kennelChange(2);
      this.audio.servo(9,-.5,.3);
    }else if(this.rustyStage===2&&this.tRusty<=0){
      if(rand(20)<level+4){
        this.rustyStage=3;this.chargeIdx=-1;this.tCharge=.35;
        this.hooks.kennelChange(3);
        this.hooks.say('SCRAPING METAL · WEST WING',1);
        this.audio.servo(5,-.7,1.4);
        this.audio.footstep(5,-.85);
      }else{
        this.tRusty=rand(4,7);
      }
    }
  }
  _rustyReset(ctx,silent){
    this.rustyStage=0;this.tRusty=this.cfg.rustBase+rand(0,5)-(ctx?.attempts??0);
    this.chars.rusty.hide();
    this.nodes.rusty='KENNEL';
    this.hooks.kennelChange(0);
  }

  _scamper(dt,ctx,level){
    if(this.mousePhase==='vent'){
      this.mouseDwell-=dt;
      if(chance(dt*.7))this.audio.ventScratch(this.mouseSide==='L'?-.9:.9);
      if(ctx.snareArmed){
        this.audio.snareZap(this.mouseSide==='L'?-.9:.9);
        this.hooks.caughtBySnare(this.mouseSide,'scamper');
        this._mouseReset(rand(20,30));
        return;
      }
      const closed=this.mouseSide==='L'?ctx.hatches.L:ctx.hatches.R;
      if(closed){
        this.audio.hatchClang(this.mouseSide==='L'?-.9:.9);
        this.hooks.say('THUD against the vent hatch',0);
        this._mouseReset(rand(12,20));
        return;
      }
      if(this.mouseDwell<=0){
        this.hooks.breach(this.mouseSide==='L'?'VENT_L':'VENT_R','scamper');
        this._mouseReset(rand(22,32));
      }
      return;
    }
    this.tMouse-=dt;
    if(this.tMouse>0)return;
    this.tMouse=rand(5.5,8.5)-level*.08;
    if(this.mousePhase==='idle'){
      this.mousePhase='travel';
      this.mouseSide=chance(.5)?'L':'R';
      this.mouseHopsLeft=randi(2,4);
      const start=this.mouseSide==='L'?'MAINT':'ARCADE';
      this.nodes.scamper=start;
      this.chars.scamper.place(ROOMS[start].anchor,0);
      this.chars.scamper.show();
      this.audio.footstep(11,this.mouseSide==='L'?-.6:.6);
      return;
    }
    if(this.mousePhase==='travel'){
      this.mouseHopsLeft--;
      const cur=this.nodes.scamper;
      let next;
      if(this.mouseSide==='L'){
        next=cur==='MAINT'?(this.mouseHopsLeft<=0?'WVENT':'MAINT'):cur;
      }else{
        next=cur==='ARCADE'?(this.mouseHopsLeft<=0?'EVENT':'ARCADE'):cur;
      }
      if(next==='WVENT'||next==='EVENT'){
        this.mousePhase='vent';
        this.mouseDwell=rand(4.5,7.5)-this.night*.25;
        this.hooks.ventActivity(this.mouseSide);
        this.audio.ventScratch(this.mouseSide==='L'?-.9:.9);
      }else{
        this.nodes.scamper=next;
        this.chars.scamper.place(ROOMS[next].anchor,0);
      }
    }
  }
  _mouseReset(t){
    this.mousePhase='idle';this.mouseSide=null;this.tMouse=t;
    this.chars.scamper.hide();this.nodes.scamper=null;
  }

  _eclipse(dt,ctx,level){
    if(this.eclipseCam){
      this.eclipseT-=dt;
      if(ctx.monitorUp&&ctx.activeCam===this.eclipseCam){
        this.stareT+=dt;
        if(this.stareT>.9&&chance(dt*1.4))this.audio.whisper();
        if(this.stareT>2.2){
          ctx.drainPower(dt*1.5*this.cfg.eclipse);
          this.hooks.eclipseStare(true);
        }
      }else{
        if(this.stareT>0)this.hooks.eclipseStare(false);
        this.stareT=Math.max(0,this.stareT-dt*2.5);
      }
      if(this.eclipseT<=0){
        this.eclipseCam=null;this.stareT=0;
        this.hooks.eclipseGone();
      }
      return;
    }
    if(ctx.camJustSwitched&&chance(.05*this.cfg.eclipse)){
      const pool=CAM_ORDER.filter(x=>x!=='KITCHEN');
      this.eclipseCam=pick(pool);
      this.eclipseT=rand(8,13);
      this.hooks.eclipseAppear(this.eclipseCam);
      this.audio.whisper();
    }
  }

  _tp(id,node,ctx){
    const from=this.nodes[id];
    this.nodes[id]=node;
    const a=this.chars[id];
    const r=ROOMS[node];
    a.place(r.anchor,Math.atan2(-r.anchor[0],14-r.anchor[2]));
    a.faceTowards({x:r.anchor[0]*.2,z:14});
    a.show();
    if(id==='strix'||id==='selene'){
      if(node==='WDOOR'){a.place(r.anchor,Math.PI);this.hooks.atDoor('L',id);return;}
      if(node==='EDOOR'){a.place(r.anchor,Math.PI);this.hooks.atDoor('R',id);return;}
    }
    if(ctx&&(ctx.activeCam===CAM_OF_NODE[from]||ctx.activeCam===CAM_OF_NODE[node])&&ctx.monitorUp){
      this.hooks.staticBlip();
    }
    const d=distOffice(r.anchor);
    this.audio.servo(Math.max(d*.75,.8),panOf(r.anchor),.45);
    if(d<10)setTimeout(()=>{if(this.nodes[id]===node)this.audio.footstep(d*.6,panOf(r.anchor));},300);
    this.hooks.onMove(id,from,node);
  }
}

function randi(a,b){return Math.floor(rand(a,b+1));}
