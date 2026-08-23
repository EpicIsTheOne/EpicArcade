import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto('http://127.0.0.1:8420/', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await page.evaluate(() => !!window.__game)) break;
}
await page.click('#btnPlay');
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { window.__game.qaJump(); });
await new Promise(r => setTimeout(r, 12000));
await page.evaluate(() => window.__game.qaSteerTo(-80, -80));
await new Promise(r => setTimeout(r, 25000));
const info = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  const m = p.mesh;
  // count child meshes and check world positions
  let meshes = 0, visible = 0;
  m.traverse(o => { if (o.isMesh) { meshes++; if (o.visible) visible++; } });
  return {
    mode: p.mode, pos: { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1) },
    meshPos: { x: +m.position.x.toFixed(1), y: +m.position.y.toFixed(1), z: +m.position.z.toFixed(1) },
    meshVisible: m.visible, childMeshes: meshes, visibleChildren: visible,
    inScene: !!m.parent, parentIsScene: m.parent === g.scene,
    cam: { x: +g.camera.position.x.toFixed(1), y: +g.camera.position.y.toFixed(1), z: +g.camera.position.z.toFixed(1) },
    yaw: +p.camRig.yaw.toFixed(2), pitch: +p.camRig.pitch.toFixed(2),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'qa/shots/probe-char.png' });
await browser.close();
