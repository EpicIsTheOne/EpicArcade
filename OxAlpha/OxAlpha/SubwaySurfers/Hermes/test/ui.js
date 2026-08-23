// Final UI verification: missions panel, board purchase flow, runner select.
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
function findBrowser() {
  const cands = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}
(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: 'new',
    args: ['--no-first-run', '--mute-audio', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:' + (process.argv[2] || '8642') + '/index.html?qa=1', { waitUntil: 'networkidle2' });
  await page.waitForFunction('!!window.SR_READY', { timeout: 45000 });
  const results = [];
  const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' [' + d + ']' : '')); };

  // missions panel
  await page.evaluate(() => document.getElementById('btnMissions').click());
  await new Promise(r => setTimeout(r, 400));
  const m = await page.evaluate(() => ({
    visible: !document.getElementById('missionsWrap').classList.contains('hidden'),
    rows: document.querySelectorAll('#missionList .mrow').length,
    text: (document.getElementById('missionList').textContent || '').slice(0, 80)
  }));
  check('missions: panel opens with 3 rows', m.visible && m.rows === 3, JSON.stringify(m));
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'v19_missions.png') });
  await page.evaluate(() => document.getElementById('btnMissionsClose').click());

  // give coins, buy a board, equip it
  await page.evaluate(() => { window.Save.data.coins += 5000; window.Save.persist(); });
  await page.evaluate(() => { window.Shop.open(); });
  await page.evaluate(() => window.Shop.render('boards'));
  await new Promise(r => setTimeout(r, 200));
  const buyBolt = await page.evaluate(() => {
    // find Bolt card button by scanning rendered cards
    const cards = Array.from(document.querySelectorAll('#shopCards .card'));
    const bolt = cards.find(c => c.querySelector('.nm') && c.querySelector('.nm').textContent.includes('Bolt'));
    if (!bolt) return 'no card';
    const btn = bolt.querySelector('button');
    if (!btn || btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  });
  await new Promise(r => setTimeout(r, 300));
  const equipped = await page.evaluate(() => ({ board: window.Save.data.board, owned: window.Save.data.ownedBoards, coins: window.Save.data.coins }));
  check('shop: can buy & equip Bolt board', buyBolt === 'clicked' && equipped.board === 'bolt' && equipped.owned.indexOf('bolt') >= 0,
    buyBolt + ' ' + JSON.stringify(equipped));

  // buy a runner
  await page.evaluate(() => window.Shop.render('runners'));
  await new Promise(r => setTimeout(r, 200));
  const buyRunner = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#shopCards .card'));
    const ember = cards.find(c => c.querySelector('.nm') && c.querySelector('.nm').textContent.includes('Ember'));
    if (!ember) return 'no card';
    const btn = ember.querySelector('button');
    if (!btn || btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  });
  const rState = await page.evaluate(() => ({ runner: window.Save.data.runner, owned: window.Save.data.ownedRunners }));
  check('shop: can buy & select Ember runner', buyRunner === 'clicked' && rState.runner === 'ember', buyRunner + ' ' + JSON.stringify(rState));

  // upgrade a powerup
  await page.evaluate(() => { window.Shop.render('powerups'); });
  await new Promise(r => setTimeout(r, 200));
  const upg = await page.evaluate(() => {
    const before = window.Save.data.upgrades.magnet;
    const cards = Array.from(document.querySelectorAll('#shopCards .card'));
    const mag = cards.find(c => c.querySelector('.nm') && c.querySelector('.nm').textContent.includes('MAGNET'));
    const btn = mag && mag.querySelector('button');
    if (!btn || btn.disabled) return { ok: false, before };
    btn.click();
    return { ok: true, before, after: window.Save.data.upgrades.magnet };
  });
  check('shop: magnet upgrade level increases', upg.ok && upg.after === upg.before + 1, JSON.stringify(upg));

  // board actually changes gameplay color when running
  await page.evaluate(() => { document.getElementById('btnShopClose').click(); window.Game.newRun(); window.Game.boardQA(); });
  await new Promise(r => setTimeout(r, 400));
  const b = await page.evaluate(() => window.Game.boardActive);
  check('run: equipped board activates', b === true);

  console.log('\n== RESULT: ' + results.filter(r => r.ok).length + '/' + results.length + ' ==');
  fs.writeFileSync(path.join(__dirname, '..', 'shots', 'ui_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(results.some(r => !r.ok) ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
