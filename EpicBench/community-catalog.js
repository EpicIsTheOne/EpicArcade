'use strict';
const fs = require('node:fs');
const path = require('node:path');
const identities = require(path.join(process.env.OX_DIR || path.join(__dirname, '..', 'ox-arcade'), 'lib', 'model-catalog'));

// Existing benchmark records remain the source of observed model IDs. Historical
// harness-only backfills are deliberately not advertised as model identities.
function makeCatalog({ trackerDir, harnessMeta, getBuilds = () => [] }) {
  let cached = null, expires = 0;
  return async function getCatalog() {
    if (cached && Date.now() < expires) return cached;
    const harnesses = Object.entries(harnessMeta).map(([id, meta]) => ({ id, label: meta.label }));
    const nonModels = new Set([...harnesses.map(h => h.id), 'piagent', 'claudeagent', 'none', 'misc', 'untagged']);
    const models = new Map(identities.models.map(m => [m.id, { id: m.id, label: m.label, arcadeKey: m.arcadeKey }]));
    function add(id) {
      if (typeof id !== 'string' || !id.trim() || id.length > 120 || nonModels.has(id.toLowerCase())) return;
      const canonical = identities.canonical(id);
      if (!models.has(canonical)) models.set(canonical, { id: canonical, label: canonical });
    }
    try {
      const rows = JSON.parse(await fs.promises.readFile(path.join(trackerDir, 'runs.json'), 'utf8'));
      for (const row of Array.isArray(rows) ? rows : rows.runs || []) add(row.model);
    } catch { /* Community remains available when the tracker is offline. */ }
    for (const build of (await getBuilds()) || []) add(build.model);
    cached = {
      models: [...models.values()].sort((a, b) => a.label.localeCompare(b.label)),
      harnesses,
      tags: ['Game', 'Music', 'Editor', 'Video', 'Website', 'App', 'Tool', '3D', 'Art', 'Experiment', 'Other']
        .map(label => ({ id: label.toLowerCase(), label }))
    };
    expires = Date.now() + 60_000;
    return cached;
  };
}
module.exports = { makeCatalog };
