'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch {
  const bundled = process.env.PLAYWRIGHT_MODULE || 'C:/Users/Epic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
  playwright = require(bundled);
}
const { start } = require('../server');
const artifacts = path.join(__dirname, 'artifacts');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-community-browser-'));
const options = { port: 0, root: path.join(temp, 'games'), archiveRoot: path.join(temp, 'archive'), communityDataDir: path.join(temp, 'community') };
for (const directory of [options.root, options.archiveRoot, artifacts]) fs.mkdirSync(directory, { recursive: true });
let service, browser;
const passed = [], errors = [];
function step(name) { passed.push(name); console.log('PASS ' + name); }

(async () => {
  service = await start(options);
  let base = `http://127.0.0.1:${service.port}`;
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
  await page.goto(base + '/Community/');
  await page.getByText('The first build starts here.').waitFor();
  await page.screenshot({ path: path.join(artifacts, 'community-empty-desktop.png'), fullPage: true });
  step('Real empty Community and initial API load');

  await page.getByRole('link', { name: 'Publish a project +', exact: true }).click();
  await page.getByLabel('Project name', { exact: false }).fill('Signal Garden');
  await page.getByLabel('Project link', { exact: false }).fill('https://example.com/signal-garden');
  assert.equal(await page.locator('.optional-details').getAttribute('open'), null);
  await page.getByRole('button', { name: 'Publish project', exact: true }).click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Username', { exact: false }).fill('browser_creator');
  await page.getByLabel('Password', { exact: false }).fill('private-browser-test-password');
  await page.getByLabel('Display name (optional)').fill('Test Creator');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('dialog', { name: 'Save your recovery code' }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download private file', exact: true }).click();
  const download = await downloadPromise;
  const recoveryPath = path.join(temp, 'recovery.json'); await download.saveAs(recoveryPath);
  assert(JSON.parse(await fsp.readFile(recoveryPath, 'utf8')).recoveryCode);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('heading', { name: 'Signal Garden', exact: true }).waitFor();
  step('Human registration, private recovery download, Name + Link publication retaining draft');

  await page.getByRole('link', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('An ambient garden of generative patterns. Made with two models and a little curiosity.');
  const modelPicker = page.getByRole('group', { name: 'Models used', exact: true });
  await modelPicker.getByRole('searchbox').fill('Astra');
  await modelPicker.getByLabel('GPT-6 Astra', { exact: true }).check();
  await modelPicker.getByRole('searchbox').fill('Luna');
  await modelPicker.getByLabel('GPT-5.6 Luna', { exact: true }).check();
  await page.getByLabel('Agent / harness', { exact: true }).fill('codex');
  await page.getByRole('group', { name: 'Categories', exact: true }).getByLabel('Art', { exact: true }).check();
  await page.getByRole('group', { name: 'Categories', exact: true }).getByLabel('Experiment', { exact: true }).check();
  await page.getByLabel('Source / repository link', { exact: true }).fill('https://github.com/example/signal-garden');
  await page.getByLabel('Visibility', { exact: true }).selectOption('unlisted');
  await page.screenshot({ path: path.join(artifacts, 'community-publish-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Unlisted · direct link only', { exact: true }).waitFor();
  await page.getByText('Published manually', { exact: true }).waitFor();
  const signalPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: 'GPT-6 Astra', exact: true }).waitFor();
  step('Optional metadata, searchable multi-model selection, edit prefill and unlisted publication');

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const anonPage = await anon.newPage(); anonPage.setDefaultTimeout(12000);
  await anonPage.goto(base + '/Community/');
  await anonPage.getByText('The first build starts here.').waitFor();
  await anonPage.goto(base + signalPath);
  await anonPage.getByRole('heading', { name: 'Signal Garden', exact: true }).waitFor();
  await anonPage.screenshot({ path: path.join(artifacts, 'community-detail-mobile.png'), fullPage: true });
  assert(await anonPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  step('Unlisted excluded from discovery but direct link works; mobile detail has no overflow');

  await page.getByRole('link', { name: 'Edit project', exact: true }).click();
  assert.equal(await modelPicker.getByRole('checkbox', { name: 'GPT-6 Astra', exact: true }).isChecked(), true);
  await page.getByLabel('Visibility', { exact: true }).selectOption('public');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Signal Garden', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Like project', exact: true }).click();
  await page.locator('#likeButton[aria-pressed="true"]').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Like project', exact: true }).getAttribute('aria-pressed'), 'true');

  const credentials = await page.evaluate(async () => (await fetch('/api/community/v1/auth/me')).json());
  async function api(route, method = 'GET', body) {
    return page.evaluate(async ({ route, method, body }) => {
      const me = await (await fetch('/api/community/v1/auth/me')).json();
      const response = await fetch('/api/community/v1' + route, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json(); if (!response.ok) throw new Error(JSON.stringify(result)); return result;
    }, { route, method, body });
  }
  const samples = [
    ['Orbit Runner', 'game', 'A small orbital arcade game with a one-button control scheme.'],
    ['Afterglow', 'music', 'An audio-reactive experiment in light, motion and rhythm.'],
    ['Pocket Studio', 'editor', 'A focused canvas editor for quick visual ideas.'],
    ['Field Notes', 'tool', 'A lightweight way to collect and connect research notes.'],
    ['Material Lab', '3d', 'A playground for procedural surfaces and materials.'],
    ['Tiny Atlas', 'website', 'A curious map of places worth exploring.']
  ];
  for (const [name, tag, description] of samples) await api('/projects', 'POST', { name, url: 'https://example.com/' + name.toLowerCase().replaceAll(' ', '-'), tags: [tag], description, models: ['gpt-6-astra'], harness: 'codex' });
  await page.goto(base + '/Community/');
  await page.getByText('7 projects', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'community-desktop.png'), fullPage: true });
  await page.getByRole('searchbox', { name: 'Search community projects', exact: true }).pressSequentially('Signal', { delay: 40 });
  await page.getByText('1 project', { exact: true }).waitFor();
  assert.equal(await page.locator('#projectSearch').evaluate(input => input === document.activeElement), true);
  await page.getByRole('searchbox', { name: 'Search community projects', exact: true }).fill('');
  await page.getByText('7 projects', { exact: true }).waitFor();
  await page.locator('.browse-filters > summary').click();
  const filterModels = page.getByRole('group', { name: 'Models', exact: true });
  await filterModels.getByLabel('GPT-6 Astra', { exact: true }).check();
  await filterModels.getByLabel('GPT-5.6 Luna', { exact: true }).check();
  await page.getByText('1 project · model combination', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Signal Garden', exact: true }).click();
  await page.getByRole('link', { name: 'Test Creator · @browser_creator', exact: true }).click();
  await page.getByRole('heading', { name: 'Test Creator', exact: true }).waitFor();
  await page.getByRole('link', { name: 'GPT-6 Astra · 7', exact: true }).click();
  await page.getByRole('heading', { name: 'GPT-6 Astra', exact: true }).waitFor();
  step('Search retains keyboard focus, AND model filters, likes, creator and model routes');

  await page.goto(base + '/Community/account');
  await page.getByRole('heading', { name: 'Your submissions · 7', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create token', exact: true }).click();
  await page.getByLabel('Token label', { exact: false }).fill('Browser test agent');
  await page.getByLabel('Publishing harness', { exact: true }).fill('opencode');
  await page.getByRole('dialog').getByRole('button', { name: 'Create token', exact: true }).click();
  await page.getByRole('dialog', { name: 'Save your agent token' }).waitFor();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByText('Browser test agent', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByText('No agent tokens yet.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Username', { exact: false }).fill('browser_creator');
  await page.getByLabel('Password', { exact: false }).fill('private-browser-test-password');
  await page.getByRole('dialog').getByRole('button', { name: 'Log in', exact: true }).last().click();
  await page.getByRole('heading', { name: 'Your submissions · 7', exact: true }).waitFor();
  step('Account submissions, token create/download/revoke and real logout/login');

  await anonPage.goto(base + '/Community/');
  await anonPage.getByText('7 projects', { exact: true }).waitFor();
  await anonPage.screenshot({ path: path.join(artifacts, 'community-mobile.png'), fullPage: true });
  assert(await anonPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await anon.close();
  await page.goto(base + '/Community/agent');
  const skillDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Community skill ↓', exact: true }).click();
  const skill = await skillDownload; assert.equal(skill.suggestedFilename(), 'epic-bench-community.zip');
  step('Mobile discovery and actual skill ZIP download');

  const moderationProject = (await api('/projects?mine=1')).projects[0];
  await api('/projects/' + moderationProject.id + '/report', 'POST', { reason: 'Browser moderation verification' });
  const fixedPort = service.port;
  await service.close();
  service = await start({ ...options, port: fixedPort, communityAdminIds: [credentials.user.id] });
  await page.goto(base + '/Community/admin');
  await page.getByText('Browser moderation verification', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Hide project', exact: true }).click();
  await page.getByText('Project hidden', { exact: true }).waitFor();
  assert.equal((await fetch(base + '/api/community/v1/projects/' + moderationProject.id)).status, 404);
  await page.getByRole('button', { name: 'Resolve report', exact: true }).click();
  await page.getByText('No open reports.', { exact: true }).waitFor();
  await page.getByLabel('Project ID', { exact: false }).fill(moderationProject.id);
  await page.getByLabel('Action', { exact: true }).selectOption('restore');
  await page.getByRole('button', { name: 'Apply project action', exact: true }).click();
  await page.getByText('Project moderation updated', { exact: true }).waitFor();
  assert.equal((await fetch(base + '/api/community/v1/projects/' + moderationProject.id)).status, 200);
  await page.getByLabel('Action', { exact: true }).selectOption('feature');
  await page.getByRole('button', { name: 'Apply project action', exact: true }).click();
  await page.waitForFunction(async id => (await (await fetch('/api/community/v1/projects/' + id)).json()).project.featured, moderationProject.id);
  step('Real moderator report resolution, hide, restore and feature controls');

  // Local game content has full storage while the account API is unavailable on
  // its origin. This fixture never changes a real arcade build.
  const gameDir = path.join(options.root, 'TestGame [model-astra] [codex] [run-01]');
  fs.mkdirSync(gameDir);
  fs.writeFileSync(path.join(gameDir, 'index.html'), '<script>localStorage.setItem("qa","ok");document.title=localStorage.getItem("qa")</script><h1>Game origin test</h1>');
  const { scanBuilds } = require('../../ox-arcade/lib/scan');
  const builds = await scanBuilds(options.root);
  await page.goto(base + '/Arcade/play/' + builds[0].id + '/');
  assert.equal(await page.title(), 'ok');
  assert.notEqual(new URL(page.url()).origin, base);
  assert.equal((await fetch(service.gameOrigin + '/api/community/v1/auth/me')).status, 404);
  step('Game origin isolation preserves localStorage and exposes no account API');

  assert.deepEqual(errors, []);
  await fsp.writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify({ passed, errors, viewport: '1440x1050 / 390x844', testDataOnly: true }, null, 2));
  console.log('Browser validation complete: ' + passed.length + ' flows');
})().catch(async error => {
  console.error(error.stack);
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
    try { await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }); console.error((await page.locator('body').innerText()).slice(-3000)); } catch {}
    break;
  }
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close(); await service?.close();
  const resolved = path.resolve(temp);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('epic-community-browser-')) await fsp.rm(resolved, { recursive: true, force: true });
});
