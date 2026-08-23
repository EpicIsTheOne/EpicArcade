// visual_sweep.mjs — capture office views, all cams with threats in frame, jumpscare frame.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const SHOTS = path.resolve(process.cwd(),'screenshots');
const browser = await puppeteer.launch({ executablePath: exe, headless:'shell',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],
  defaultViewport:{width:1280,height:800} });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8520/index.html?qa=1', {waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4500));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const snap = n=>page.screenshot({path:path.join(SHOTS,n)});

// Night 5 so everyone is active
await page.evaluate(()=>WD.game.startNight(5));
await sleep(900);

// 1. plain office view
await snap('vs_01_office.png');

// 2. look left/right views (yaw 0 = facing doors/north)
await page.evaluate(()=>{ WD.view.yaw=0.7; }); await sleep(350);
await snap('vs_02_office_left.png');
await page.evaluate(()=>{ WD.view.yaw=-0.7; }); await sleep(350);
await snap('vs_03_office_right.png');
await page.evaluate(()=>{ WD.view.yaw=0; });

// 3. doors closed + lights
await page.evaluate(()=>{ WD.game.toggleDoor('L'); WD.game.toggleDoor('E'); });
await sleep(500);
await snap('vs_04_doors_closed.png');
await page.evaluate(()=>{ WD.game.toggleLight('L'); });
await sleep(400);
// put Orv at the west door so the light reveals him
await page.evaluate(()=>{ WD.ai.qaForce('door_l','orv'); });
await sleep(700);
await snap('vs_05_orv_at_door.png');
await page.evaluate(()=>{ WD.game.toggleDoor('L'); WD.game.toggleDoor('E'); WD.game.toggleLight('L'); });

// 4. every cam with its resident threat forced into frame
const plan=[['stage','orv'],['dining','bolt'],['kitchen','rivets'],['arcade','sera'],
  ['party','wonder'],['atrium','sera'],['backstage','wonder'],['workshop','rivets'],
  ['hall_w','orv'],['hall_e','bolt']];
let i=6;
for(const [cam,ch] of plan){
  await page.evaluate(([c,ch2])=>{
    WD.state.monitor=true; WD.ui.syncMonitor();
    if(WD.ai.state.chars[ch2]) WD.ai.qaForce(c,ch2);
    WD.state.camId=c;
  },[cam,ch]);
  await sleep(600);
  await snap(`vs_${String(i++).padStart(2,'0')}_cam_${cam}.png`);
}

// 5. jumpscare mid-lunge (freeze at 0.5s)
await page.evaluate(()=>{
  WD.state.monitor=false; WD.ui.syncMonitor();
  WD.view.yaw=0;
});
await sleep(400);
await page.evaluate(()=>WD.game.die('bolt'));
await sleep(650);
await snap('vs_16_jumpscare.png');
await sleep(1400);
await snap('vs_17_death_screen.png');

console.log('visual sweep complete');
await browser.close();
