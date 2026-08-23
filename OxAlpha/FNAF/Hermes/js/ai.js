// ai.js — Wonderdrome animatronic intelligence. Real movement over the room graph,
// per-character mechanics, readable tells, difficulty scaling by night/hour.
'use strict';
WD.ai = (() => {
  const U = ()=>WD.utils;
  const ROOMS = ()=>WD.ROOMS;
  const GRAPH = ()=>WD.GRAPH;

  // difficulty tables per night (1..6). ai = base aggression 0..1
  const NIGHTS = {
    1:{ ai:0.30, chars:['orv'],                note:'Orv only. Learn the cameras.' },
    2:{ ai:0.42, chars:['orv','rivets'],       note:'Rivets found a way in. Watch the vents.' },
    3:{ ai:0.55, chars:['orv','rivets','bolt'], note:'Bolt woke up. Doors will not save you alone.' },
    4:{ ai:0.68, chars:['orv','rivets','bolt','sera'], note:'Sera is awake.' },
    5:{ ai:0.80, chars:['orv','rivets','bolt','sera','wonder'], note:'Everything is awake.' },
    6:{ ai:0.92, chars:['orv','rivets','bolt','sera','wonder'], note:'The final show.' },
  };

  const state = { chars:{}, timers:{}, events:[] };

  function nightCfg(){ return NIGHTS[WD.state.night] || NIGHTS[6]; }
  function hourRamp(){ return 0.72 + 0.28*(WD.state.hour/(WD.CFG.HOUR_COUNT-1)); } // 0.72..1.0

  // ---------- pathing ----------
  function neighbors(r){
    const n = (GRAPH()[r]||[]).slice();
    return n;
  }
  function pathTo(from, to){
    if(from===to) return [];
    const q=[[from]], seen={[from]:1};
    while(q.length){
      const p=q.shift(); const last=p[p.length-1];
      for(const nb of neighbors(last)){
        if(seen[nb]) continue; seen[nb]=1;
        const np=p.concat([nb]);
        if(nb===to) return np.slice(1);
        q.push(np);
      }
    }
    return null;
  }
  function stepToward(from, to){
    const p = pathTo(from,to);
    return p? p[0] : from;
  }
  function distanceToOffice(from){
    if(from==='office') return 0;
    const p = pathTo(from, 'door_l');
    return p? p.length : 99;
  }

  // ---------- spawn ----------
  function spawnFor(id){
    switch(id){
      case 'orv': return 'stage';
      case 'bolt': return 'party';
      case 'rivets': return 'workshop';
      case 'sera': return 'atrium';
      case 'wonder': return 'backstage';
    }
  }

  function activate(night){
    state.chars = {};
    const cfg = nightCfg();
    for(const id of cfg.chars){
      state.chars[id] = {
        id, room: spawnFor(id), prevRoom: spawnFor(id),
        pos: spawnPos(id), target: spawnPos(id), moving:false, moveT:0,
        aggro: 0, cooldown: 0, state:'dormant', stateT:0,
        doorSide:null, attackTimer:0, peekT:0, chargeT:0, windup:0,
        lastSeen:-99, camGlitchT:0, musicT:0,
        aggroScale: ()=>1,          // default; updaters may override per-tick
        decideT: 0,
      };
    }
    state.events = [];
  }
  function spawnPos(id){
    const A = WD.worldAnchors;
    const r = spawnFor(id);
    // floor position in the room: anchor XZ, pushed toward the room's look target so
    // characters stand in the open (the anchor itself is up at the camera mount)
    if(A && A[r]){
      const p=A[r].pos, l=A[r].look;
      return [p[0]*0.35+l[0]*0.65, p[2]*0.35+l[2]*0.65];
    }
    return [0,-16];
  }
  function roomCenter(r){
    const A = WD.worldAnchors;
    // floor-level room center for pathing/positions
    if(A && A[r]){
      const p=A[r].pos, l=A[r].look;
      return [p[0]*0.35+l[0]*0.65, p[2]*0.35+l[2]*0.65];
    }
    const map = { door_l:[-1.9,13.4], door_e:[1.9,13.4], vent_n:[-8.5,-12], vent_s:[-11.5,7],
      office:[0,16.5] };
    return map[r]||[0,0];
  }

  // ---------- audio tell helper ----------
  function tell(kind, room, charId, opt={}){
    WD.audio.event(kind, room, charId, opt);
    state.events.push({ kind, room, charId, t:WD.state.nightT });
    if(state.events.length>60) state.events.shift();
  }

  // ---------- per-character updates (dt seconds) ----------
  function update(dt){
    const st = WD.state;
    if(st.dead || st.won || st.powerOut) return;
    const ramp = hourRamp();
    for(const id in state.chars){
      const c = state.chars[id];
      c.cooldown = Math.max(0, c.cooldown - dt);
      c.stateT += dt;
      const ai = nightCfg().ai * ramp * c.aggroScale();
      switch(id){
        case 'orv': updOrv(c, dt, ai); break;
        case 'rivets': updRivets(c, dt, ai); break;
        case 'bolt': updBolt(c, dt, ai); break;
        case 'sera': updSera(c, dt, ai); break;
        case 'wonder': updWonder(c, dt, ai); break;
      }
    }
    // movement interpolation for all
    for(const id in state.chars) moveInterp(state.chars[id], dt);
  }

  // shared: begin moving to adjacent room over `dur` seconds
  function beginMove(c, nextRoom, dur, mode='walk'){
    c.prevRoom=c.room; c.room=nextRoom; c.moving=true; c.moveDur=dur; c.moveT=0;
    c.fromPos=c.pos.slice(); c.toPos=roomCenter(nextRoom); c.moveMode=mode;
    tell(mode==='vent'?'crawl':'steps', c.prevRoom, c.id, {to:nextRoom});
  }
  function moveInterp(c, dt){
    if(!c.moving) return;
    c.moveT += dt;
    const k = Math.min(1, c.moveT/c.moveDur);
    const e = k<0.5? 2*k*k : 1-Math.pow(-2*k+2,2)/2;   // easeInOutQuad
    c.pos[0]=U().lerp(c.fromPos[0], c.toPos[0], e);
    c.pos[1]=U().lerp(c.fromPos[1], c.toPos[1], e);
    if(k>=1){ c.moving=false; c.pos=c.toPos.slice(); onArrive(c);
      for(const h of arriveHooks) h(c); }
  }
  function onArrive(c){
    if(c.room==='door_l'||c.room==='door_e'){
      c.doorSide = c.room==='door_l'?'L':'E';
      c.state='at_door'; c.stateT=0; c.attackTimer = U().rand(4.5, 8.0);
      tell('door_knock', c.room, c.id);
      WD.audio.event('knock', c.room, c.id);
    }
    if(c.room==='vent_n'||c.room==='vent_s'){
      c.state='in_vent'; c.stateT=0; c.attackTimer=U().rand(5,9);
      tell('vent_bang', c.room, c.id);
    }
  }
  // arrival hooks registered by character logic (e.g. Sera slipping through open doors)
  const arriveHooks = [];
  function onArriveHook(fn){ arriveHooks.push(fn); }

  // ============ ORV — The Watcher ============
  function updOrv(c, dt, ai){
    const st=WD.state;
    c.aggroScale = ()=>1;
    if(c.state==='dormant'){ if(Math.random() < ai*dt*0.5) c.state='roam'; return; }
    if(c.state==='roam'){
      if(c.moving) return;
      c.decideT=(c.decideT||0)+dt;
      if(c.decideT > U().lerp(9,3.5,ai)){
        c.decideT=0;
        // prefers dark rooms; heads generally toward office
        const opts=neighbors(c.room);
        const next=U().pick(opts);
        beginMove(c, next, U().lerp(6.5,3.2,ai), 'walk');
      }
      // if watched on camera, freeze (his tell: he only moves unobserved... mostly)
      return;
    }
    if(c.state==='at_door'){
      const doorClosed = c.doorSide==='L'? st.doorL : st.doorE;
      if(doorClosed){
        c.attackTimer-=dt;
        if(c.attackTimer<=0){
          tell('retreat', c.room, c.id);
          c.state='roam'; c.doorSide=null;
          beginMove(c,'hall_w',5,'walk');
          c.cooldown=U().rand(6,14);
        }
      } else {
        c.attackTimer-=dt*2.2;   // open door = faster entry
        if(c.attackTimer<=0){ WD.game.die('orv'); }
      }
    }
  }

  // ============ RIVETS — vent vermin ============
  function updRivets(c, dt, ai){
    const st=WD.state;
    c.aggroScale=()=>1;
    if(c.state==='dormant'){ if(Math.random()<ai*dt*0.6) c.state='roam'; return; }
    if(c.state==='roam'){
      if(c.moving) return;
      c.decideT=(c.decideT||0)+dt;
      if(c.decideT>U().lerp(7,2.6,ai)){
        c.decideT=0;
        // bias toward vents
        const opts=neighbors(c.room);
        let next;
        if(c.room==='backstage' && Math.random()<0.55) next='vent_n';
        else if(c.room==='workshop' && Math.random()<0.55) next='vent_s';
        else next=U().pick(opts);
        const vent = next.startsWith('vent');
        beginMove(c, next, vent? U().lerp(5,2.5,ai) : U().lerp(5.5,2.8,ai), vent?'vent':'walk');
      }
      return;
    }
    if(c.state==='in_vent'){
      c.attackTimer-=dt;
      const sealed=st.sealed;
      if(sealed){
        if(c.attackTimer<=0){
          tell('retreat',c.room,c.id); c.state='roam';
          beginMove(c, c.room==='vent_n'?'backstage':'workshop', 4.5, 'vent');
          c.cooldown=U().rand(7,15);
        }
      } else if(c.attackTimer<=0){
        WD.game.die('rivets');
      }
      return;
    }
    if(c.state==='at_door'){ // fallback (shouldn't happen)
      c.state='roam';
    }
  }

  // ============ BOLT — charger ============
  function updBolt(c, dt, ai){
    const st=WD.state;
    c.aggroScale=()=> st.monitor? 1.35 : 1;   // moves faster while you watch
    if(c.state==='dormant'){ if(Math.random()<ai*dt*0.45) c.state='stalk'; return; }
    if(c.state==='stalk'){
      if(c.moving) return;
      c.decideT=(c.decideT||0)+dt;
      if(c.decideT>U().lerp(6,2.2,ai)){
        c.decideT=0;
        const next=stepToward(c.room, Math.random()<0.5?'hall_e':'arcade');
        if(next!==c.room) beginMove(c,next,U().lerp(4.5,2.2,ai),'walk');
      }
      if((c.room==='hall_e'||c.room==='arcade') && !c.moving && Math.random()<ai*dt*0.5){
        c.state='windup'; c.stateT=0; c.windup=U().rand(2.2,3.4);
        tell('music', c.room, c.id);
      }
      return;
    }
    if(c.state==='windup'){
      c.windup-=dt;
      if(Math.floor(c.windup*3)!==Math.floor((c.windup+dt)*3)) tell('music', c.room, c.id);
      if(c.windup<=0){
        c.state='charge'; c.stateT=0;
        const target = Math.random()<0.5?'door_e':'hall_e';
        c.chargePath = pathTo(c.room, target)||['hall_e','door_e'];
        c.pathIdx=0;
        tell('charge', c.room, c.id);
      }
      return;
    }
    if(c.state==='charge'){
      if(c.moving) return;
      if(c.pathIdx>=c.chargePath.length){
        // reached door_e
        c.doorSide='E'; c.state='at_door'; c.attackTimer=U().rand(3.5,5.5);
        tell('slam', c.room, c.id);
        return;
      }
      const next=c.chargePath[c.pathIdx++];
      beginMove(c,next,0.85,'walk');   // fast!
      return;
    }
    if(c.state==='at_door'){
      const closed=st.doorE;
      if(closed){
        c.attackTimer-=dt;
        if(c.attackTimer<=0){ tell('retreat',c.room,c.id); c.state='stalk'; c.doorSide=null;
          beginMove(c,'hall_e',4,'walk'); c.cooldown=U().rand(8,16); }
      } else {
        c.attackTimer-=dt*2.6;
        if(c.attackTimer<=0) WD.game.die('bolt');
      }
    }
  }

  // ============ SERA — statue ============
  function updSera(c, dt, ai){
    const st=WD.state;
    c.aggroScale=()=>1;
    if(c.state==='dormant'){ if(Math.random()<ai*dt*0.4) c.state='statue'; return; }
    if(c.state==='statue'){
      // moves only while unobserved by current camera
      const watched = st.monitor && st.camId===c.room;
      if(!watched){
        c.unseenT=(c.unseenT||0)+dt;
        if(c.unseenT>U().lerp(7,2.8,ai)){
          c.unseenT=0;
          const next=stepToward(c.room,'office');
          if(next!==c.room){ beginMove(c,next,U().lerp(5.5,2.6,ai),'scamper'); tell('skitter',c.room,c.id); }
          else if(c.room==='office'){
            // reached office — she attacks unless you flash the light on her
            c.state='in_office'; c.stateT=0;
          }
        }
      } else c.unseenT=0;
      return;
    }
    if(c.state==='in_office'){
      // kill after grace unless player flashes light at her (light forces retreat)
      c.stateT+=dt;
      if(st.lightL||st.lightE||WD.view && WD.view.flashUsed){
        tell('retreat',c.room,c.id); c.state='statue'; c.unseenT=0;
        beginMove(c,'atrium',5,'scamper'); c.cooldown=U().rand(10,18);
      } else if(c.stateT>U().lerp(6,3,ai)){
        WD.game.die('sera');
      }
    }
  }
  // Sera entering office: when she arrives at a door and it is OPEN, she slips inside
  onArriveHook(function(c){
    if(c.id!=='sera') return;
    if(c.room==='door_l'||c.room==='door_e'){
      const closed = c.room==='door_l'? WD.state.doorL : WD.state.doorE;
      if(!closed){ c.room='office'; c.state='in_office'; c.stateT=0; c.doorSide=null;
        tell('whisper', 'office', c.id); }
    }
  });

  // ============ WONDER-0 — the puppet ============
  function updWonder(c, dt, ai){
    const st=WD.state;
    c.aggroScale=()=>1;
    if(st.box<=0.5){
      if(c.state!=='hunt'){ c.state='hunt'; c.stateT=0; tell('musicbox_stop', c.room, c.id); }
    }
    if(c.state==='dormant'){ if(st.box<WD.CFG.BOX_MAX*0.6 && Math.random()<ai*dt*0.4) c.state='roam'; return; }
    if(c.state==='roam'){
      if(c.moving) return;
      c.decideT=(c.decideT||0)+dt;
      if(c.decideT>U().lerp(8,3,ai)){
        c.decideT=0;
        const next=U().pick(neighbors(c.room));
        if(next!==c.room) beginMove(c,next,U().lerp(6,3,ai),'walk');
      }
      if(st.box>WD.CFG.BOX_MAX*0.75){ c.state='dormant'; c.room=spawnFor('wonder'); c.pos=spawnPos('wonder'); }
      return;
    }
    if(c.state==='hunt'){
      // relentless: straight at nearest door, ignores everything
      if(c.moving) return;
      const pl=pathTo(c.room,'door_l'), pe=pathTo(c.room,'door_e');
      const target = (pl&&(!pe||pl.length<=pe.length))? 'door_l':'door_e';
      const next=stepToward(c.room,target);
      if(next!==c.room){ beginMove(c,next,1.4,'walk'); }
      else {
        c.doorSide = c.room==='door_l'?'L':'E';
        c.state='at_door'; c.attackTimer=2.6;  // doors barely delay it
      }
      return;
    }
    if(c.state==='at_door'){
      c.attackTimer-=dt;
      const closed=c.doorSide==='L'?st.doorL:st.doorE;
      if(closed && c.attackTimer<=0){
        // doors only delay it: it retreats but the box is still dying
        tell('retreat',c.room,c.id); c.state='roam'; c.doorSide=null;
        beginMove(c, c.doorSide==='L'?'hall_w':'hall_e', 3, 'walk');
        c.cooldown=4;
      } else if(!closed && c.attackTimer<=0){
        WD.game.die('wonder');
      }
    }
  }

  // ---------- camera anomaly system ----------
  function updateAnomalies(dt){
    const st=WD.state;
    st.anomalies=st.anomalies.filter(a=>(a.t-=dt)>0);
    if(Math.random()<dt*0.02){
      const rooms=WD.ROOM_LIST.filter(r=>ROOMS()[r].cam);
      st.anomalies.push({ room:U().pick(rooms), t:U().rand(4,9) });
    }
  }
  function anomalyOn(room){ return WD.state.anomalies.some(a=>a.room===room); }

  // ---------- QA ----------
  function snap(){
    const o={};
    for(const id in state.chars){ const c=state.chars[id];
      o[id]={ room:c.room, state:c.state, moving:c.moving, doorSide:c.doorSide||null,
        pos:c.pos.map(v=>+v.toFixed(2)) }; }
    return o;
  }
  function qaForce(room, charId){
    const c=state.chars[charId]; if(!c) return false;
    if(c.moving) return false;
    c.room=room; c.pos=roomCenter(room); c.moving=false; c.state='roam'; c.stateT=0;
    if(room==='door_l'||room==='door_e'){ onArrive(c); }
    if(room==='vent_n'||room==='vent_s'){ onArrive(c); }
    return true;
  }
  function qaSetState(charId, s){ const c=state.chars[charId]; if(c){ c.state=s; c.stateT=0; } }

  return { activate, update, snap, qaForce, qaSetState, updateAnomalies, anomalyOn,
    pathTo, stepToward, nightCfg, NIGHTS, state };
})();
