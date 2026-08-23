// Render one frame in Chrome and dump the actual canvas pixels + material state.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { document.getElementById('btnPlay').click(); });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { document.getElementById('btnCreate').click(); });
  // wait for chunks
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => window.game && window.game.world && window.game.world.chunks.get('0,0') && window.game.world.chunks.get('0,0').state === 'ready');
    if (ready) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 3000));
  const info = await page.evaluate(() => {
    const g = window.game;
    const sceneMeshes = [];
    g.scene.traverse(o => { if (o.isMesh) sceneMeshes.push({ mat: o.material.type, uniforms: o.material.uniforms ? 'yes' : 'no' }); });
    const mats = g.materials;
    return {
      meshes: sceneMeshes.length,
      solidUniforms: {
        dayLight: mats.solid.uniforms.uDayLight.value,
        fogNear: mats.solid.uniforms.uFogNear.value,
        fogFar: mats.solid.uniforms.uFogFar.value,
      },
      camPos: g.camera.position,
      playerY: g.player.pos.y,
      postEnabled: g.post.enabled,
    };
  });
  console.log('INFO:', JSON.stringify(info));
  // read center pixel color of the rendered canvas
  const px = await page.evaluate(() => {
    const c = document.getElementById('game');
    // preserveDrawingBuffer is false by default; use screenshot instead
    return null;
  });
  await page.screenshot({ path: 'screenshots/probe_frame.png' });
  await browser.close();
  console.log('saved probe_frame.png');
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
