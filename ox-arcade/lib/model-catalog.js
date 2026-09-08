/* Shared display identities for benchmark, arcade and Community surfaces. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EPIC_MODELS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const models = [
    { id: 'openrouter/stealth/ox-alpha', label: 'OX-Alpha', arcadeKey: 'oxalpha', aliases: ['OxAlpha', 'ox-alpha', 'openrouter-stealth-ox-alpha'] },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', arcadeKey: 'astra', aliases: ['astra', 'gpt6astra'] },
    { id: 'omen-alpha', label: 'Omen Alpha', arcadeKey: 'omenalpha', aliases: ['omenalpha', 'opencode-go/omen-alpha'] },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', arcadeKey: 'gpt56terra', aliases: [] },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', arcadeKey: 'gpt56luna', aliases: [] }
  ];
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const lookup = (id) => models.find(m => [m.id, m.arcadeKey, ...m.aliases].some(a => key(a) === key(id)));
  return { models, lookup, canonical: id => lookup(id)?.id || id };
});
