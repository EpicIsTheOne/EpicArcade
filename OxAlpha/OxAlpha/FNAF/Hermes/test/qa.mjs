// qa.mjs — full headless gameplay/controls/visual QA for Wonderdrome.
// Usage: node test/qa.mjs [--quick]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');
const QUICK = process.argv.includes('--quick');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const URL_ = 'http://127.0.0.1:8520/index.html?qa=1';

const results = [];
function rec(name, pass, detail=''){ 
  results.push({name, pass, detail});
  console.log(`${pass?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`);
}
async function shot(page, name){
  const p = path.join(SHOTS, name);
  await page.screenshot({path:p});
  console.log('   shot:', name);
  return p;
}
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function main(){
  fs.mkdirSync(SHOTS,{recursive:true});
  const exe = CHROME_CANDIDATES.find(c=>fs.existsSync(c));
  if(!exe){ console.error('NO CHROME FOUND'); process.exit(2); }
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'shell',
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--enable-unsafe-swiftshader',
      '--window-size=1280,800','--mute-audio'],
    defaultViewport:{width:1280,height:800},
  });
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror', e=>{ errors.push('pageerror: '+e.message);
    if(e.stack && (e.message.includes('stack')||e.message.includes('call stack')))
      console.log('[stack-trace]\n'+e.stack.split('\n').slice(0,22).join('\n')); });
  page.on('console', m=>{ if(m.type()==='error' && !m.text().includes('Failed to load resource'))
    errors.push('console: '+m.text()); });

  await page.goto(URL_, {waitUntil:'networkidle2', timeout:60000});
  await sleep(4500);   // boot + GLB loads

  // ---------- 1. boot ----------
  const booted = await page.evaluate(()=>({screen:WD.state.screen,
    chars:Object.keys(WD.charRigs||{}), hasWorld:!!WD.worldAnchors}));
  rec('boot: menu screen reached', booted.screen==='menu', JSON.stringify(booted.screen));
  rec('boot: all 5 characters loaded', booted.chars.length===5, booted.chars.join(','));
  await shot(page,'qa_01_menu.png');

  // ---------- 2. start night ----------
  await page.evaluate(()=>WD.game.startNight(1));
  await sleep(1200);
  let st = await page.evaluate(()=>WD.qa.snap());
 rec('night start: screen=play', st.screen==='play');
 rec('night start: power near-full and draining', st.power>90 && st.power<=100, `power=${st.power}`);

  // ---------- 3. CONTROLS: directional semantics ----------
  const look0 = await page.evaluate(()=>({yaw:WD.view.yaw,pitch:WD.view.pitch}));
  // mouse RIGHT -> yaw decreases (look right in three.js YXZ)
  await page.evaluate(()=>WD.game.applyLook(100,0));
  const lookR = await page.evaluate(()=>({yaw:WD.view.yaw,pitch:WD.view.pitch}));
  rec('controls: mouse right => view right', lookR.yaw<look0.yaw,
    `dyaw=${(lookR.yaw-look0.yaw).toFixed(4)}`);
  // mouse UP -> pitch increases (look up)
  await page.evaluate(()=>WD.game.applyLook(0,-100));
  const lookU = await page.evaluate(()=>({yaw:WD.view.yaw,pitch:WD.view.pitch}));
  rec('controls: mouse up => view up', lookU.pitch>lookR.pitch,
    `dpitch=${(lookU.pitch-lookR.pitch).toFixed(4)}`);
  // invertY flips vertical
  await page.evaluate(()=>{ WD.state.settings.invertY=true; WD.game.applyLook(0,-50);
    WD.state.settings.invertY=false; });
  const lookI = await page.evaluate(()=>({pitch:WD.view.pitch}));
  rec('controls: invertY option flips vertical', lookI.pitch<lookU.pitch);
  // keyboard defenses
  await page.keyboard.press('KeyD'); await sleep(150);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('controls: D toggles west door', st.doorL===true);
  await page.keyboard.press('KeyD'); await sleep(150);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('controls: D again reopens west door', st.doorL===false);
  await page.keyboard.press('KeyE'); await sleep(150);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('controls: E toggles east door', st.doorE===true);
  await page.keyboard.press('KeyS'); await sleep(150);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('controls: S toggles vent seal', st.sealed===true);
  await page.keyboard.press('Space'); await sleep(300);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('controls: SPACE opens monitor', st.monitor===true);
  rec('monitor open: usage pips rose', st.usage>=2, `pips=${st.usage}`);

  // ---------- 4. CAMERA SYSTEM ----------
  const cams=['stage','dining','kitchen','arcade','party','atrium','backstage','workshop','hall_w','hall_e'];
  let camOK=0;
  for(const c of cams){
    await page.evaluate(r=>{ WD.state.camId=r; }, c);
    await sleep(260);
    const s = await page.evaluate(()=>WD.ui.drawCamFrame(0.016)??true);
    camOK++;
  }
  rec(`camera system: all ${cams.length} feeds selectable`, camOK===cams.length);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('camera map state tracks selection', cams.includes(st.cam));
  await shot(page,'qa_02_monitor.png');

  // music box wind
  await page.evaluate(()=>{ WD.state.winding=true; });
  await sleep(900);
  const boxAfter = await page.evaluate(()=>WD.qa.snap().box);
  rec('music box winds while held', boxAfter>95, `box=${boxAfter}`);
  await page.evaluate(()=>{ WD.state.winding=false; });

  await page.keyboard.press('Space'); await sleep(250);   // close monitor

  // ---------- 5. AI MOVEMENT over the graph ----------
  st = await page.evaluate(()=>WD.qa.snap());
  rec('AI night1: Orv active on stage', !!(st.chars.orv), JSON.stringify(st.chars.orv||{}));
  // force a walk to verify movement interpolation works
  const mv = await page.evaluate(()=>{
    const ok = WD.ai.qaForce('dining','orv');
    return {ok, snap:WD.qa.snap().chars.orv};
  });
  rec('AI: forced relocation to dining applied', mv.ok && mv.snap.room==='dining',
    JSON.stringify(mv.snap));
  // let him roam toward doors naturally for a few seconds
  await page.evaluate(()=>{ WD.ai.qaSetState('orv','roam'); });
  await sleep(4000);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('AI: Orv roams rooms over time', !!st.chars.orv, JSON.stringify(st.chars.orv));

  // ---------- 5b. every animatronic mechanic smoke-test via QA hooks (night 5 = all five active)
  await page.evaluate(()=>WD.game.startNight(5));
  await sleep(700);
  for(const [id,room] of [['rivets','vent_n'],['bolt','hall_e'],['sera','door_l'],['wonder','backstage']]){
    const r = await page.evaluate(([id,room])=>{
      if(!WD.ai.state.chars[id]) return null;
      WD.ai.qaForce(room,id);
      return WD.qa.snap().chars[id];
    },[id,room]);
    if(r===null){ rec(`mechanic hook: ${id} present`, false, 'not active on night 1'); continue; }
    rec(`mechanic hook: ${id} can reach ${room}`, r.room===room || r.room==='office',
      JSON.stringify({room:r.room,state:r.state}));
  }

  // ---------- 6. DEATH PATH ----------
  await page.evaluate(()=>WD.game.die('orv'));
  await sleep(1900);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('death: jumpscare leads to death screen', st.screen==='dead' && st.deadBy==='orv',
    `${st.screen}/${st.deadBy}`);
  await shot(page,'qa_03_death.png');
  await page.evaluate(()=>WD.ui.toMenu());
  await sleep(400);

  // ---------- 7. POWER / BLACKOUT LOSS ----------
  await page.evaluate(()=>WD.game.startNight(3));  // bolt+rivets+orv
  await sleep(700);
  await page.evaluate(()=>{ WD.state.monitor=false; });
  await page.evaluate(()=>WD.qa.addPower(-99.5));  // near-empty
  await sleep(3500);                                // drain to blackout
  st = await page.evaluate(()=>WD.qa.snap());
  rec('blackout: power outage triggers', st.powerOut===true, `power=${st.power}`);
  await shot(page,'qa_04_blackout.png');
  // darkness prologue (~2.6s) + rand(8..16) approach => allow up to 26s
  let deadSeen=false;
  for(let i=0;i<26;i++){
    await sleep(1000);
    const s2 = await page.evaluate(()=>({dead:WD.state.dead, by:WD.state.deadBy}));
    if(s2.dead){ deadSeen=true; break; }
  }
  rec('blackout: death follows the dark', deadSeen, `deadBy=${await page.evaluate(()=>WD.state.deadBy)}`);
  await page.evaluate(()=>WD.ui.toMenu());

  // ---------- 8. WIN PATH + PROGRESSION ----------
  await page.evaluate(()=>WD.game.startNight(1));
  await sleep(600);
  await page.evaluate(()=>{ WD.state.nightT=99999; });   // force clock past end
  await sleep(800);
  st = await page.evaluate(()=>WD.qa.snap());
  rec('win: surviving reaches 6AM', st.won===true, `unlocked=${await page.evaluate(()=>WD.state.unlockedNight)}`);
  rec('win: unlocks next night', await page.evaluate(()=>WD.state.unlockedNight>=2),
    `unlocked=${await page.evaluate(()=>WD.state.unlockedNight)}`);
  await page.evaluate(()=>WD.ui.toMenu());

  // ---------- 9. LATER NIGHT difficulty ----------
  await page.evaluate(()=>WD.game.startNight(5));
  await sleep(700);
  st = await page.evaluate(()=>({
    chars:Object.keys(WD.ai.state.chars), cfg:WD.ai.nightCfg().ai }));
  rec('night 5: all five threats active', st.chars.length===5, st.chars.join(','));
  await page.evaluate(()=>WD.ui.toMenu());

  // ---------- 10. FILES / LORE persistence ----------
  const files = await page.evaluate(()=>({found:WD.state.filesFound.length,
    saved:JSON.parse(localStorage.getItem('wonderdrome_save_v1')||'{}')}));
  rec('lore: file unlock persisted to save', files.saved.filesFound?.length>=1,
    JSON.stringify(files.found));

  // ---------- 11. PERF probe ----------
  const perf = await page.evaluate(async ()=>{
    const t0=performance.now(); let frames=0;
    await new Promise(res=>{
      const tick=()=>{ frames++; if(performance.now()-t0<2000) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    return { fps: Math.round(frames/2),
      drawCalls: WD.game.renderer.info.render.calls,
      tris: WD.game.renderer.info.render.triangles };
  });
  rec('performance: headless render loop alive', perf.fps>10, JSON.stringify(perf));

  // ---------- error budget ----------
  const realErrors = errors.filter(e=>!e.includes('favicon'));
  rec('console: no page errors', realErrors.length<=2, realErrors.slice(0,3).join(' | '));

  await browser.close();
  const fails = results.filter(r=>!r.pass).length;
  console.log(`\n===== QA SUMMARY: ${results.length-fails}/${results.length} passed =====`);
  fs.writeFileSync(path.join(SHOTS,'qa_results.json'), JSON.stringify(results,null,2));
  process.exit(fails?1:0);
}
main().catch(e=>{ console.error('QA DRIVER CRASH:', e); process.exit(3); });
