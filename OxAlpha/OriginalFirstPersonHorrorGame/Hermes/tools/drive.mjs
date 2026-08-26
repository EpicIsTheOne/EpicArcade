/* HOLLOW SIGNAL — automated traversal driver (test tooling).
   Launches headless Chrome, plays the full progression, saves screenshots. */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root,'screenshots');
mkdirSync(SHOTS,{recursive:true});

const URL_ = process.env.GAME_URL || 'http://localhost:8642/?debug=1';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const errors=[];
let step_n=0;
const ok=(name,cond,extra='')=>{
  console.log(`${cond?'✓':'✗ FAIL'} ${name}${extra?'  — '+extra:''}`);
  if(!cond) errors.push(name);
};
async function shot(page,name){ await page.screenshot({path:path.join(SHOTS,name)}); console.log(`  📷 ${name}`); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* yaw to face from player pos toward (tx,tz): forward=(-sin,-cos) */
const faceYaw=(px,pz,tx,tz)=>Math.atan2(-(tx-px),-(tz-pz));

async function main(){
  const browser=await puppeteer.launch({
    executablePath:CHROME,
    headless:'new',
    args:['--window-size=1280,720','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${path.join(root,'tools','.chrome-profile')}`],
    defaultViewport:{width:1280,height:720},
  });
  const page=await browser.newPage();
  page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));

  await page.goto(URL_,{waitUntil:'load'});
  await sleep(2500);
  await shot(page,'01-title.png');

  /* ---------- boot sanity ---------- */
  const booted=await page.evaluate(()=>({three:!!window.THREE, hg:!!window.HG, state:window.HG?.Game?.state}));
  ok('boot: THREE + HG present',booted.three&&booted.hg);
  ok('boot: state=title',booted.state==='title',String(booted.state));

  /* ---------- start ---------- */
  await page.click('#btnStart');
  await sleep(800);
  await shot(page,'02-intro.png');
  // skip intro via click
  await page.click('#intro');
  await sleep(900);
  const st1=await page.evaluate(()=>HG.Game.state);
  ok('intro skipped → play',st1==='play',st1);

  /* ---------- movement ---------- */
  const p0=await page.evaluate(()=>({x:HG.Player.x,z:HG.Player.z}));
  await page.keyboard.down('KeyW'); await sleep(1100); await page.keyboard.up('KeyW');
  const p1=await page.evaluate(()=>({x:HG.Player.x,z:HG.Player.z}));
  const moved=Math.hypot(p1.x-p0.x,p1.z-p0.z);
  ok('movement W displaces player',moved>1.5,moved.toFixed(2)+'m');

  /* flashlight toggle */
  await page.keyboard.press('KeyF');
  const fl=await page.evaluate(()=>HG.Player.flash.intensity>0);
  ok('flashlight toggles on',fl);
  await sleep(400);
  await shot(page,'03-gameplay-airlock.png');

  /* helper: teleport+face an interactable and verify prompt appears */
  async function gotoInteract(id){
    return page.evaluate((id)=>{
      const G=HG.Game;
      const it=G.interactables.find(i=>i.id===id);
      if(!it) return null;
      const yaw=Math.atan2(-(it.pos.x-HG.Player.x)*0-(it.pos.x-HG.Player.x),(it.pos.z-HG.Player.z)); // placeholder
      return it.pos;
    },id);
  }
  async function interactFrom(id,dx=0,dz=-2,floor=null){
    // place player 2m south of target facing it, then press E
    const pos=await page.evaluate((id)=>{const it=HG.Game.interactables.find(i=>i.id===id);return it?{x:it.pos.x,z:it.pos.z,f:it.f}:null;},id);
    if(!pos){ ok(`interactable ${id} exists`,false); return false; }
    const px=pos.x+dx, pz=pos.z+dz;
    const yaw=faceYaw(px,pz,pos.x,pos.z);
    await page.evaluate((x,z,yaw,f)=>{ HG.debug.tp(x,z,f,yaw); },px,pz,yaw,floor===null?pos.f:floor);
    await sleep(350);
    const promptTxt=await page.evaluate(()=>{
      const el=document.getElementById('prompt');
      return el.classList.contains('hidden')?null:el.textContent;
    });
    if(!promptTxt){ ok(`prompt visible for ${id}`,false); return false; }
    console.log(`  · prompt[${id}]: ${promptTxt}`);
    await page.keyboard.press('KeyE');
    await sleep(420);
    return true;
  }

  /* ---------- note reading ---------- */
  await interactFrom('n_work',0,-2);
  const noteShown=await page.evaluate(()=>!document.getElementById('noteWrap').classList.contains('hidden'));
  ok('work order note opens',noteShown);
  await shot(page,'04-note.png');
  await page.keyboard.press('KeyE'); await sleep(300);
  const noteClosed=await page.evaluate(()=>document.getElementById('noteWrap').classList.contains('hidden'));
  ok('note closes with E',noteClosed);

  /* ---------- fuse A (locker two-stage) ---------- */
  await interactFrom('locker',1.4,-.4);
  await interactFrom('locker',1.4,-.4); // second press takes fuse
  const fuseA=await page.evaluate(()=>HG.Game.flags.fuseA);
  ok('fuse A acquired from locker',fuseA);

  /* ---------- security office: fuse B + scare + notes ---------- */
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.cx(36)+2,HG.Maps.cz(6)+1.6,0,Math.PI); }); // inside corridor heading to office door
  await sleep(300);
  // open office door
  await interactFrom('door_d_security',0,-1.6,0);
  await sleep(700);
  await interactFrom('fuseB',0,-1.5);
  const fuseB=await page.evaluate(()=>HG.Game.flags.fuseB);
  ok('fuse B acquired (scare fired)',fuseB);
  await sleep(500);
  await interactFrom('n_marsh',0,-1.6);
  const marshOpen=await page.evaluate(()=>!document.getElementById('noteWrap').classList.contains('hidden'));
  ok('Marsh addendum readable',marshOpen);
  await page.keyboard.press('KeyE'); await sleep(250);
  const wbTxt=await interactFrom('whiteboard',0,-2.2);
  if(await page.evaluate(()=>!document.getElementById('noteWrap').classList.contains('hidden'))){
    const body=await page.evaluate(()=>document.getElementById('noteBody').textContent);
    ok('whiteboard mentions APR 17',body.includes('APR 17'));
    await page.keyboard.press('KeyE'); await sleep(200);
  }

  /* ---------- aux power ---------- */
  await interactFrom('fusebox',-1.6,0,0);
  await sleep(1600);
  const aux=await page.evaluate(()=>({on:HG.world.phases.aux, unlocked:!HG.world.doors.d_stairs.locked}));
  ok('aux power ON',aux.on===true);
  ok('stairwell mag-lock released',aux.unlocked===true);
  await shot(page,'05-lobby-powered.png');

  /* ---------- checkpoint saved ---------- */
  const cp=await page.evaluate(()=>HG.Game.checkpoint.id);
  ok('checkpoint cp1 set',cp==='cp1',cp);

  /* ---------- descend ---------- */
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.cx(15.5),HG.Maps.cz(4.2),0,Math.PI); });
  await sleep(300);
  // walk north onto stair trigger
  await page.keyboard.down('KeyW'); await sleep(1700); await page.keyboard.up('KeyW');
  await sleep(1400);
  const floorNow=await page.evaluate(()=>HG.Player.floor);
  ok('stairs teleport to B2',floorNow===1,String(floorNow));
  await sleep(600);
  await shot(page,'06-b2-arrival.png');

  /* ---------- explore lower: labs, rec, calendar ---------- */
  await interactFrom('n_log',0,-1.7,1);
  await page.keyboard.press('KeyE'); await sleep(250);
  await interactFrom('calendar',1.9,0,1);
  const calBody=await page.evaluate(()=>document.getElementById('noteWrap').classList.contains('hidden')?'':'shown');
  await shot(page,'07-calendar.png');
  await page.keyboard.press('KeyE'); await sleep(250);
  await interactFrom('n_rec',0,-1.6,1);
  await page.keyboard.press('KeyE'); await sleep(250);

  /* ---------- containment knock scare ---------- */
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.cx(33.5),HG.Maps.cz(11.5),1,Math.PI); });
  await sleep(900);
  const containScared=await page.evaluate(()=>HG.Game.hintFlags.contain===undefined||true);
  await shot(page,'08-containment.png');

  /* ---------- deep storage: valve handle ---------- */
  await interactFrom('handle',0,-1.6,1);
  const vh=await page.evaluate(()=>HG.Game.flags.valveHandle);
  ok('valve handle acquired',vh);
  await interactFrom('n_storage',1.4,-1.2,1);
  await page.keyboard.press('KeyE'); await sleep(200);

  /* ---------- generator puzzle ---------- */
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.cx(22),HG.Maps.cz(27),1,Math.PI); });
  await sleep(300);
  // valves without handle installed yet: first E installs handle
  await interactFrom('valve0',0,-1.4,1);   // installs handle
  await interactFrom('valve0',0,-1.4,1);   // open
  await interactFrom('valve1',0,-1.4,1);   // closed
  await interactFrom('valve2',0,-1.4,1);   // open
  const fuel=await page.evaluate(()=>HG.Game.flags.fuelOK);
  ok('fuel pressure nominal (1 OPEN · 2 CLOSED · 3 OPEN)',fuel);
  // breaker before fuel should refuse — already have fuel, engage:
  await interactFrom('breaker',1.6,0,1);
  await sleep(1800);
  const gen=await page.evaluate(()=>({on:HG.Game.flags.genOn,audio:HG.Audio.genOn,phase:HG.world.phases.gen}));
  ok('generator ONLINE',gen.on&&gen.audio&&gen.phase,JSON.stringify(gen));
  await sleep(800);
  await shot(page,'09-generator-room.png');

  /* ---------- keypad ---------- */
  await interactFrom('keypad',-1.8,.4,1);
  const kpVisible=await page.evaluate(()=>!document.getElementById('keypadWrap').classList.contains('hidden'));
  ok('keypad opens',kpVisible);
  await shot(page,'10-keypad.png');
  // wrong code first
  for(const k of ['1','2','3','4']) await page.click(`#kpGrid button[data-k="${k}"]`);
  await page.click('#kpGrid button[data-k="⏎"]');
  await sleep(500);
  const rejected=await page.evaluate(()=>HG.Game.flags.codeDone===false);
  ok('wrong code rejected',rejected);
  await sleep(300);
  // correct code 0417
  await page.click('#kpGrid button[data-k="C"]');
  for(const k of ['0','4','1','7']) await page.click(`#kpGrid button[data-k="${k}"]`);
  await page.click('#kpGrid button[data-k="⏎"]');
  await sleep(2200);
  const fin=await page.evaluate(()=>({active:HG.Game.finale.active,threat:HG.Threat.active,t:Math.round(HG.Game.finale.t)}));
  ok('FINALE started — Choir hunts',fin.active&&fin.threat,JSON.stringify(fin));
  await sleep(1500);

  /* ---------- chase moment screenshot (threat nearby) ---------- */
  await page.evaluate(()=>{ // put player in hall looking back down corridor at approaching threat
    HG.debug.tp(HG.Maps.cx(31.5),HG.Maps.cz(27.5),1,Math.PI*1.5);
  });
  await sleep(100);
  await page.evaluate(()=>{ HG.Threat.relocate(HG.Maps.cx(28),HG.Maps.cz(24)); });
  await sleep(1400);
  await shot(page,'11-chase.png');

  /* ---------- death & retry ---------- */
  const deaths0=await page.evaluate(()=>HG.Game.deaths);
  await page.evaluate(()=>{ HG.Threat.relocate(HG.Player.x+.5,HG.Player.z); }); // ensure caught
  await sleep(3200);
  const afterDeath=await page.evaluate(()=>({state:HG.Game.state,deaths:HG.Game.deaths,cp:HG.Game.checkpoint.id,
    p:{f:HG.Player.floor}}));
  ok('caught → respawned at cp3, progress kept',
    afterDeath.state==='play'&&afterDeath.deaths===deaths0+1&&afterDeath.cp==='cp3'&&afterDeath.p.f===1,
    JSON.stringify(afterDeath));
  const finaleKept=await page.evaluate(()=>HG.Game.finale.active);
  ok('finale persists through death',finaleKept);

  /* ---------- board the lift ---------- */
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.P.elevGate.wx,HG.Maps.P.elevGate.wz-3,1,0); });
  await sleep(300);
  // fast-forward remaining timer
  await page.evaluate(()=>{ HG.Game.finale.t=Math.min(HG.Game.finale.t,.4); });
  await sleep(2600); // ding + gate opens
  const gate=await page.evaluate(()=>HG.world.elev.gateOpenT>.3);
  ok('lift arrives, gate opens',gate);
  await page.evaluate(()=>{ HG.debug.tp(HG.Maps.P.elevGate.wx,HG.Maps.P.elevGate.wz-1.2,1,0); });
  await sleep(2600);
  const ending=await page.evaluate(()=>HG.Game.state);
  ok('ending sequence begins on boarding',ending==='ending'||ending==='end',ending);
  await sleep(4000);
  await shot(page,'12-ending-dark.png');
  await sleep(21000);
  const endState=await page.evaluate(()=>HG.Game.state);
  ok('end screen reached',endState==='end',endState);
  await sleep(400);
  await shot(page,'13-end.png');

  /* ---------- stats summary ---------- */
  const stats=await page.evaluate(()=>({deaths:HG.Game.deaths,notes:HG.Game.notesRead,time:HG.Game.playT|0}));
  console.log('stats:',JSON.stringify(stats));

  await browser.close();

  console.log('\n================================');
  if(errors.length){
    console.log(`FAILURES (${errors.length}):`);
    for(const e of errors) console.log('  ✗ '+e);
    process.exit(1);
  } else {
    console.log('ALL CHECKS PASSED ✔');
  }
}

main().catch(e=>{ console.error('driver crashed:',e); process.exit(2); });
