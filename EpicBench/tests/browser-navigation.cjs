'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {start}=require('../server');const {chromium}=require('playwright');
(async()=>{let service,browser;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'epic-navigation-'));try{
service=await start({port:0,autoPreview:false,root:temp,archiveRoot:temp,communityDataDir:path.join(temp,'community')});
browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),base=`http://127.0.0.1:${service.port}`;
for(const route of ['Arcade','Tracker','Community']) {
 await page.goto(base+'/');await page.locator('.boot').waitFor({state:'hidden'});
 assert.equal(await page.locator('.console-links').count(),0);
 await page.locator(`.portal[href="/${route}/"]`).click();await page.waitForURL(base+`/${route}/`);
 assert.equal(await page.locator('.console-links a[aria-current="page"]').innerText(),route === 'Tracker' ? 'Prompts' : route);
 assert.equal(await page.locator('.console-links a').count(),4);
 for(const width of [390,1440]) {await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);assert.equal(await page.locator('.console-links').evaluate(e=>e.getBoundingClientRect().top),0);assert(await page.locator('.console-links a').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})));}
 await page.screenshot({path:path.join(os.tmpdir(),`navigation-${route}.png`)});
 console.log('PASS Home portal + shared navigation: '+route);
}
await page.goto(base+'/');await page.locator('.boot').waitFor({state:'hidden'});await page.keyboard.press('Control+k');await page.locator('#paletteOverlay.open').waitFor();await page.locator('#paletteInput').focus();await page.keyboard.press('Escape');await page.locator('#paletteOverlay').waitFor({state:'hidden'});await page.locator('.portal[href="/Tracker/"]').click();await page.waitForURL(base+'/Tracker/');
await page.locator('.console-links a[href="/Community/"]').click();await page.waitForURL(base+'/Community/');await page.goBack();await page.waitForURL(base+'/Tracker/');
await page.goto(base+'/Tracker/results.html');assert.equal(await page.locator('.console-links a[aria-current]').innerText(),'Prompts');
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement,'::view-transition-new(root)').animationName),'none');
console.log('PASS Palette dismissal, cross-page navigation, Back, results navigation, reduced motion');
}finally{await browser?.close();await service?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
