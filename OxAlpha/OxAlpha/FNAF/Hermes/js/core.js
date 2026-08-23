// core.js — Wonderdrome: constants, utils, global state, save system.
'use strict';
window.WD = window.WD || {};

WD.CFG = {
  NIGHT_SECONDS: 360,          // real seconds per night (base)
  HOUR_COUNT: 6,               // 12AM..6AM
  POWER_DRAIN_BASE: 100 / 46,  // % per second at usage level 1 (idle office)
  DRAIN_PER_USAGE: 100 / 95,   // extra % per second PER usage pip
  BOX_MAX: 100,
  BOX_WARN_AT: 35,
  BOX_GRACE_S: 10,             // Wonder-0 grace after box empty
  DOOR_DRAIN: 1, LIGHT_DRAIN: 1, SEAL_DRAIN: 1, MONITOR_DRAIN: 1, LURE_COST: 2,
  LURE_COOLDOWN_S: 24, WIND_RATE: 26,   // box points per second while winding
};

WD.ROOMS = {
  stage:    { id:'stage',    name:'Show Stage',      cam:1 },
  dining:   { id:'dining',   name:'Dining Hall',     cam:2 },
  arcade:   { id:'arcade',   name:'Arcade Alley',    cam:3 },
  party:    { id:'party',    name:'Party Room',      cam:4 },
  kitchen:  { id:'kitchen',  name:'Kitchen',         cam:5 },
  backstage:{ id:'backstage',name:'Backstage',       cam:6 },
  workshop: { id:'workshop', name:'Maintenance',     cam:7 },
  atrium:   { id:'atrium',   name:'Grand Atrium',    cam:8 },
  hall_w:   { id:'hall_w',   name:'West Hall',       cam:9 },
  hall_e:   { id:'hall_e',   name:'East Hall',       cam:10 },
  door_l:   { id:'door_l',   name:'West Door',       cam:null, blind:true },
  door_e:   { id:'door_e',   name:'East Door',       cam:null, blind:true },
  vent_s:   { id:'vent_s',   name:'South Vent Run',  cam:null, vent:true },
  vent_n:   { id:'vent_n',   name:'North Vent Run',  cam:null, vent:true },
  office:   { id:'office',   name:'Security Office', cam:null },
  storage:  { id:'storage',  name:'Prop Storage',    cam:null, hidden:true },
};
WD.ROOM_LIST = Object.keys(WD.ROOMS);

// Physical adjacency (bidirectional). This IS the venue layout.
WD.GRAPH = {
  stage:     ['backstage','dining'],
  dining:    ['stage','atrium','kitchen','arcade'],
  kitchen:   ['dining'],
  arcade:    ['dining','party','hall_e'],
  party:     ['arcade','atrium'],
  atrium:    ['dining','party','hall_w','hall_e','stage'],
  backstage: ['stage','workshop','vent_n'],
  workshop:  ['backstage','storage','hall_w','vent_s'],
  storage:   ['workshop'],
  hall_w:    ['workshop','atrium','door_l'],
  hall_e:    ['arcade','atrium','door_e'],
  door_l:    ['hall_w'],
  door_e:    ['hall_e'],
  vent_n:    ['backstage'],
  vent_s:    ['workshop'],
  office:    [],
};
// vents connect runs to office specially (Rivets only)
WD.VENT_LINKS = { vent_n:['office'], vent_s:['office'] };

WD.CHARS = {
  orv:    { name:'Orv the Bear',      cls:'watcher' },
  bolt:   { name:'Bolt the Clown',    cls:'charger' },
  rivets: { name:'Rivets',            cls:'vermin'  },
  sera:   { name:'Madame Sera',       cls:'statue'  },
  wonder: { name:'Wonder-0',          cls:'puppet'  },
};

WD.state = {
  screen: 'boot',        // boot | menu | intro | play | dead | win | files | lore
  night: 1, unlockedNight: 1,
  hour: 0, nightT: 0,
  power: 100, usagePips: 1,
  doorL:false, doorE:false,           // closed?
  lightL:false, lightE:false,
  sealed:false,
  monitor:false, camId:'stage',
  box: WD.CFG.BOX_MAX, winding:false,
  lureCd:0, lureRoom:null,
  powerOut:false, blackoutT:0,
  dead:false, deadBy:null, won:false,
  qa:false, paused:false,
  filesFound:[],                       // lore ids discovered this run
  settings:{ quality:'high', invertY:false, volume:0.8 },
  anomalies:[],                        // transient cam anomalies {room, t}
};

WD.utils = {
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  rand:(a,b)=>a+Math.random()*(b-a),
  randi:(a,b)=>Math.floor(a+Math.random()*(b-a+1)),
  pick:(arr)=>arr[Math.floor(Math.random()*arr.length)],
  now:()=>performance.now()/1000,
};

WD.save = {
  KEY:'wonderdrome_save_v1',
  load(){ try{ const s=JSON.parse(localStorage.getItem(this.KEY)); if(s){ Object.assign(WD.state, {
    unlockedNight:s.unlockedNight||1, filesFound:s.filesFound||[],
    settings:Object.assign(WD.state.settings, s.settings||{}) }); } }catch(e){} },
  write(){ try{ localStorage.setItem(this.KEY, JSON.stringify({
    unlockedNight:WD.state.unlockedNight, filesFound:WD.state.filesFound,
    settings:WD.state.settings })); }catch(e){} },
};

// ---- QA hooks (enabled only with ?qa=1) ------------------------------------
WD.qa = {
  enabled:new URLSearchParams(location.search).has('qa'),
  snap(){ const st=WD.state; return {
    screen:st.screen, night:st.night, hour:st.hour, time:st.nightT,
    power:+st.power.toFixed(1), usage:st.usagePips,
    doorL:st.doorL, doorE:st.doorE, sealed:st.sealed, monitor:st.monitor,
    cam:st.camId, box:+st.box.toFixed(1), powerOut:st.powerOut,
 dead:st.dead, deadBy:st.deadBy, won:st.won, yaw:+(WD.view?WD.view.yaw.toFixed(3):0),
    pitch:+(WD.view?WD.view.pitch.toFixed(3):0),
    chars:WD.ai?WD.ai.snap():{}, audio:WD.audio?WD.audio.status():{},
  };},
  forceChar(room,char){ return WD.ai?WD.ai.qaForce(room,char):false; },
  setHour(h){ WD.state.hour=h; WD.state.nightT=h*(WD.nightHourLen||60); },
  addPower(v){ WD.state.power=WD.utils.clamp(WD.state.power+v,0,100); },
  kill(by){ if(WD.game) WD.game.die(by); },
  winNight(){ if(WD.game) WD.game.win(); },
};
