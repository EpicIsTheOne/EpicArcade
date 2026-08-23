// perf.mjs — headless performance profile across quality presets + monitor load.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: exe, headless:'shell',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],
  defaultViewport:{width:1280,height:800} });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8520/index.html?qa=1', {waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4500));
await page.evaluate(()=>WD.game.startNight(5));
await new Promise(r=>setTimeout(r,1500));

async function sample(label){
  const r = await page.evaluate(()=>new Promise(res=>{
    // accumulate a whole frame's draw stats (info normally resets per pass)
    WD.game.renderer.info.autoReset=false; WD.game.renderer.info.reset();
    const t0=performance.now(); let n=0;
    const tick=()=>{ n++;
      if(performance.now()-t0<2500) requestAnimationFrame(tick);
      else { const i=WD.game.renderer.info;
        const out={fps:Math.round(n/((performance.now()-t0)/1000)),
          drawCalls:i.render.calls, tris:i.render.triangles,
          geoms:i.memory.geometries};
        i.autoReset=true; res(out); } };
    requestAnimationFrame(tick);
  }));
  console.log(label.padEnd(22), JSON.stringify(r));
  return r;
}

for(const q of ['low','medium','high','ultra']){
  await page.evaluate(q=>{ WD.state.settings.quality=q; WD.game.applyQuality?.(q); }, q);
  await new Promise(r=>setTimeout(r,700));
  await sample('office '+q);
}
// monitor open on ultra (worst case: bloom+CRT composite)
await page.evaluate(()=>{ WD.state.settings.quality='ultra'; WD.game.applyQuality?.('ultra');
  WD.state.monitor=true; WD.ui.syncMonitor(); });
await new Promise(r=>setTimeout(r,900));
await sample('monitor ultra');
console.log('perf profile done');
fs.writeFileSync('notes/perf_last.json', JSON.stringify({when:'run'},null,1));
await browser.close();
