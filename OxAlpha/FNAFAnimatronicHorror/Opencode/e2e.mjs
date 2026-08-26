import {chromium} from 'playwright-core';
import os from 'os';
import path from 'path';
import fs from 'fs';

const EXE = path.join(os.homedir(), 'AppData','Local','ms-playwright','chromium-1223','chrome-win64','chrome.exe');
const BASE = 'http://127.0.0.1:8737/index.html';
const OUT = path.resolve('C:\\Users\\Epic\\Documents\\ChatGPT\\Ox model test\\FNAF Animatronic Horror [model-openrouter-stealth-ox-alpha] [opencode] [run-01]\\screenshots');
const results = {errors: [], checks: {}, shots: []};

const browser = await chromium.launch({executablePath: EXE, headless: true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--enable-unsafe-swiftshader']});
const ctx = await browser.newContext({viewport:{width:1280,height:800}});
const page = await ctx.newPage();
page.on('console', m=>{ if(m.type()==='error') results.errors.push(m.text().slice(0,300)); });
page.on('pageerror', e=>results.errors.push('PAGEERROR: '+String(e).slice(0,300)));

const shot = async name => { const p = path.join(OUT,name); await page.screenshot({path:p}); results.shots.push(name); };
const G = () => page.evaluate('(()=>{const g=window.__SP;return g?{state:g.state,hour:g.hour,power:g.power,mon:g.monitorUp,cam:g.cams.active,nodes:{...g.director.nodes},doors:{...g.doors},lights:{...g.hallLight},yaw:g.yaw}:null})()');

await page.goto(BASE+'?qa=1&debug=1&m=e2e1', {waitUntil:'networkidle'});
await page.waitForFunction('window.__SP && window.__SP.state==="menu"', null, {timeout:15000});
results.checks.boot = 'OK';

await page.evaluate('document.querySelectorAll(".night-b")[0].click(); document.getElementById("btn-new").click();');
await page.waitForTimeout(700);
await page.evaluate('document.getElementById("intro").click()');
await page.waitForFunction('window.__SP.state==="night"', null, {timeout:5000});
await page.evaluate('window.__SP.hour=1.2');
await page.waitForTimeout(900);
await shot('02-office.png');

await page.evaluate('document.getElementById("flip-zone").click()');
await page.waitForTimeout(600);
await shot('03-cam-stage.png');
const stageState = await G();
results.checks.monitorOpens = stageState.mon===true && stageState.cam==='STAGE' ? 'OK':'FAIL '+JSON.stringify(stageState);

const stageVisible = await page.evaluate(`(()=>{
  const g=window.__SP;
  const v=[];
  g.scene.traverse(o=>{});
  return {strixAt:g.director.nodes.strix, seleneAt:g.director.nodes.selene};
})()`);

await page.evaluate('window.__SP.selectCam("DINING",true)');
await page.waitForTimeout(500);
await shot('04-cam-dining.png');

const camMap = await page.evaluate(`(()=>{
  const g=window.__SP;
  const out={};
  for(const id of ['STAGE','DINING','PARTY_W','PARTY_E','BACKSTAGE','KENNEL','ARCADE','LOBBY','WHALL','EHALL','WCORNER','ECORNER','MAINT','KITCHEN']){
    g.cams.set(id);
    const f=g.cams.feeds?null:null;
    const cam = g.cams.active;
    const r=g.world.group;
    out[id]= cam===id ? 'ok' : 'MISMATCH:'+cam;
  }
  g.cams.set('STAGE');
  return out;
})()`);
results.checks.camMapCorrespondence = Object.values(camMap).every(v=>v==='ok')?'OK':JSON.stringify(camMap);

await page.evaluate(`window.__SP.toggleMonitor(false); window.__SP.director.putChar('strix','WDOOR'); window.__SP.setLight('L',true);`);
await page.waitForTimeout(700);
await shot('05-strix-door-light.png');
const doorState = await G();
results.checks.strixAtDoor = doorState.nodes.strix==='WDOOR' && doorState.lights.L===true ? 'OK':'FAIL '+JSON.stringify(doorState.nodes);

const lookTest = await page.evaluate(`(()=>{
  const g=window.__SP;
  const y0=g.yaw;
  document.dispatchEvent(new MouseEvent('mousemove',{movementX:120,movementY:0,clientX:640,clientY:400}));
  const yRight=g.yaw;
  document.dispatchEvent(new MouseEvent('mousemove',{movementX:-240,movementY:0,clientX:640,clientY:400}));
  const yBack=g.yaw;
  return {y0, yRight, yBack, rightTurnsLeft: yRight<y0, returns: Math.abs(yBack-y0)<0.001};
})()`);
results.checks.lookNonInverted = (lookTest.rightTurnsLeft && lookTest.returns)?'OK':JSON.stringify(lookTest);

await page.evaluate('window.__SP.triggerScare("L","strix")');
await page.waitForTimeout(500);
await shot('07-jumpscare.png');
await page.waitForTimeout(1400);
const goState = await G();
results.checks.jumpscareToGameover = goState.state==='gameover'?'OK':'state='+goState.state;
await shot('06-gameover.png');

await page.evaluate('document.getElementById("btn-retry").click();');
await page.waitForTimeout(400);
await page.evaluate('document.getElementById("intro").click();');
await page.waitForFunction('window.__SP.state==="night"',null,{timeout:5000});
await page.evaluate('window.__SP.hour=5.98');
await page.waitForTimeout(1500);
const winState = await G();
results.checks.winAt6AM = winState.state==='win'?'OK':'state='+winState.state+' hour='+winState.hour;
await shot('08-6am.png');

const save = await page.evaluate('JSON.parse(localStorage.getItem("starlight.nightshift.v1")||"{}")');
const prog = save.progress||save;
results.checks.progressSaved = prog.maxNight>=2 ? 'OK maxNight='+prog.maxNight : 'FAIL '+JSON.stringify(save).slice(0,120);

await browser.close();
fs.writeFileSync(path.resolve('C:\\Users\\Epic\\Documents\\ChatGPT\\Ox model test\\FNAF Animatronic Horror [model-openrouter-stealth-ox-alpha] [opencode] [run-01]\\e2e-results.json'), JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
