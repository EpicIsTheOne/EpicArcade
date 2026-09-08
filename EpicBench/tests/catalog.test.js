'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { makeCatalog } = require('../community-catalog');
const identities = require('../../ox-arcade/lib/model-catalog');

test('catalog merges real benchmark identities and excludes harness-only backfills', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'epic-catalog-'));
  try {
    await fs.writeFile(path.join(dir, 'runs.json'), JSON.stringify([
      { model: 'codex' }, { model: 'piagent' }, { model: 'real-provider/new-model' }, { model: 'astra' }
    ]));
    const catalog = await makeCatalog({ trackerDir: dir, harnessMeta: { codex: { label: 'Codex' } },
      getBuilds: () => [{ model: 'OxAlpha' }] })();
    assert(catalog.models.some(m => m.id === 'real-provider/new-model'));
    assert(!catalog.models.some(m => ['piagent', 'codex', 'astra', 'OxAlpha'].includes(m.id)));
    assert.equal(catalog.models.filter(m => m.id === 'gpt-6-astra').length, 1);
    assert.equal(identities.lookup('OxAlpha').id, 'openrouter/stealth/ox-alpha');
    assert.equal(catalog.harnesses[0].id, 'codex');
    assert(catalog.tags.some(t => t.id === '3d'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
