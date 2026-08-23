import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 400)));
await page.goto('http://127.0.0.1:8420/', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const s = await page.evaluate(() => ({
    three: typeof window.THREE,
    charMod: !!window.__charMod,
    game: typeof window.__game,
    readyState: document.readyState,
    lobbyHidden: document.getElementById('lobby')?.classList.contains('hidden'),
  }));
  if (i % 4 === 0 || s.game) console.log(i + 's', JSON.stringify(s));
  if (s.game) break;
}
await browser.close();
