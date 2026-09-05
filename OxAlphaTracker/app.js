const MODEL_KEYS = ['ox-alpha', 'astra', 'omen-alpha'];
const MODEL_LABELS = { 'ox-alpha': 'Ox Alpha', astra: 'Astra', 'omen-alpha': 'Omen Alpha' };
const MODEL_COLORS = { 'ox-alpha': '#22d3ee', astra: '#a78bfa', 'omen-alpha': '#f472b6' };
const HARNESS_KEYS = ['pi', 'opencode', 'codex', 'claude', 'hermes'];
const HARNESS_LABELS = {
  hermes: 'Hermes',
  pi: 'Pi',
  opencode: 'OpenCode',
  codex: 'Codex CLI',
  claude: 'Claude Code',
};
const HARNESS_COLORS = {
  hermes: '#f59e0b',
  pi: '#ec4899',
  opencode: '#22d3ee',
  codex: '#a3e635',
  claude: '#c084fc',
};
const comboKey = (mk, hk) => `${mk}|${hk}`;
const MOON_COUNT = 8;
const ARC_CIRC = 2 * Math.PI * 33;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

let prompts = [];
const SECTIONS = {};
let CMDK_ENTRIES = [];

const stateKey = 'oxAlphaHarnessState';
let state = loadState();

const FILTER_KEY = 'oxAlphaFiltersV1';
const THEME_KEY = 'oxAlphaTheme';
const filterState = { diff: new Set(), status: new Set(), hideDone: false };
const bootedAt = Date.now();
let lastTotalDone = -1;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(stateKey)) || {};
    // migration: old flat harness statuses belonged to the ox-alpha baseline
    for (const pid of Object.keys(s)) {
      if (!s[pid] || typeof s[pid] !== 'object') continue;
      for (const hk of ['hermes', 'pi', 'opencode', 'codex', 'claude']) {
        if (s[pid][hk] != null && s[pid][comboKey('ox-alpha', hk)] == null) {
          s[pid][comboKey('ox-alpha', hk)] = s[pid][hk];
        }
        delete s[pid][hk];
      }
    }
    return s;
  } catch {
    return {};
  }
}
function saveState() {
  localStorage.setItem(stateKey, JSON.stringify(state));
}

function statusFor(promptId, harness) {
  return (state[promptId] && state[promptId][harness]) || 'notstarted';
}
function setStatus(promptId, harness, status) {
  if (!state[promptId]) state[promptId] = {};
  state[promptId][harness] = status;
  saveState();
}

async function init() {
  try {
    prompts = await loadPrompts();
    bootUI();
  } catch (err) {
    showLoadError(err);
    return;
  }
  seedFromApi();
}

// pull confirmed bench results from the API and mark matching combos done —
// local user statuses always win over seeded results.
// model field may be a harness alias (legacy ox-alpha runs: piagent, opencode…)
// or an actual model id (astra, omen-alpha, …) with harness in r.harness.
const HARNESS_ALIAS = {
  piagent: 'pi', pi: 'pi', opencode: 'opencode', 'openrouter/stealth/ox-alpha': 'opencode',
  codex: 'codex', claudeagent: 'claude', claude: 'claude', hermes: 'hermes',
};
const modelKeyOf = (m) =>
  m ? String(m).toLowerCase().replace(/^(openrouter[-_/])?(stealth[-_/])?/i, '') : '';
async function seedFromApi() {
  try {
    const res = await fetch('api/status', { cache: 'no-store' });
    if (!res.ok) return;
    const d = await res.json();
    let changed = false;
    (d.runs || []).forEach((r) => {
      const mdl = String(r.model || '').toLowerCase();
      let mk, hk;
      if (HARNESS_ALIAS[mdl]) {
        mk = 'ox-alpha';
        hk = HARNESS_ALIAS[mdl];
      } else {
        mk = modelKeyOf(r.model);
        const hz = String(r.harness || '').toLowerCase();
        hk = HARNESS_ALIAS[hz] || (HARNESS_LABELS[hz] ? hz : null);
      }
      if (!hk || !MODEL_KEYS.includes(mk)) return;
      if (r.promptId == null || r.status !== 'pass') return;
      if (r.promptId < 1 || r.promptId > prompts.length) return;
      const key = comboKey(mk, hk);
      if (state[r.promptId] && state[r.promptId][key] != null) return;
      if (!state[r.promptId]) state[r.promptId] = {};
      state[r.promptId][key] = 'done';
      changed = true;
    });
    if (!changed) return;
    saveState();
    document.querySelectorAll('.prompt-card').forEach((card) => {
      const p = card.__prompt, key = card.__hk;
      const st = statusFor(p.id, key);
      applyStatusClass(card, p.id, key);
      if (card._sel) { card._sel.value = st; card._sel.dataset.status = st; }
      const cb = card.querySelector('.checkwrap input');
      if (cb) cb.checked = st === 'done';
    });
    MODEL_KEYS.forEach(updateSectionCount);
    updateOverall();
    toast('SEEDED CONFIRMED BENCH RESULTS', 'success');
  } catch { /* offline / static host — statuses stay local */ }
}

async function loadPrompts() {
  let firstErr = null;
  try {
    const res = await fetch('prompts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching prompts.json`);
    const data = await res.json();
    assertPromptData(data);
    return data;
  } catch (err) {
    firstErr = err;
  }
  const xhrData = await loadPromptsViaXhr();
  if (xhrData) {
    console.warn('fetch() failed; loaded prompts.json via XMLHttpRequest.', firstErr);
    return xhrData;
  }
  if (Array.isArray(window.PROMPTS_DATA) && window.PROMPTS_DATA.length) {
    console.warn('fetch() and XHR failed; using embedded prompt data.', firstErr);
    return window.PROMPTS_DATA;
  }
  throw new Error(
    `${firstErr ? firstErr.message : 'Unknown error'} - and no embedded fallback data was found.`
  );
}

function assertPromptData(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('prompts.json is empty or not an array');
  }
  for (const p of data) {
    if (
      !p ||
      typeof p.id !== 'number' ||
      typeof p.title !== 'string' ||
      typeof p.difficulty !== 'string' ||
      typeof p.text !== 'string'
    ) {
      throw new Error('prompts.json contains malformed entries');
    }
  }
}

function loadPromptsViaXhr() {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'prompts.json', true);
      xhr.onload = () => {
        try {
          if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
            const data = JSON.parse(xhr.responseText);
            assertPromptData(data);
            resolve(data);
            return;
          }
        } catch {}
        resolve(null);
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

function showLoadError(err) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'load-error';
  box.style.cssText =
    'max-width:720px;margin:48px auto;padding:28px 32px;border:1px solid rgba(248,113,113,0.55);' +
    'border-radius:14px;background:rgba(18,10,16,0.9);color:#fecaca;' +
    'box-shadow:0 0 32px rgba(248,113,113,0.15);font-family:inherit;';
  const h = document.createElement('h2');
  h.textContent = 'DATA LINK FAILURE';
  h.style.cssText =
    'margin:0 0 12px;font-size:18px;letter-spacing:0.14em;text-transform:uppercase;color:#f87171;';
  const p1 = document.createElement('p');
  p1.textContent = 'Could not load prompts.json.';
  p1.style.cssText = 'margin:0 0 12px;line-height:1.6;';
  const p2 = document.createElement('p');
  p2.textContent = `Reason: ${err && err.message ? err.message : err}`;
  p2.style.cssText = 'margin:0 0 12px;line-height:1.6;color:#f87171;';
  const p3 = document.createElement('p');
  p3.textContent =
    'This usually happens when the page is opened via file:// - browsers block local file access there. ' +
    'Serve this folder over HTTP instead (e.g. "python -m http.server") and reload.';
  p3.style.cssText = 'margin:0;line-height:1.6;color:#cbd5e1;';
  box.append(h, p1, p2, p3);
  app.appendChild(box);
}

function bootUI() {
  buildThemeDots();
  applyTheme(localStorage.getItem(THEME_KEY) || 'cyan');
  restoreFilterUI();
  buildFilterBar();
  render();
  buildMiniHudDots();
  initCmdkEntries();
  wireTopButtons();
  updateOverall();
  scrambleDecode(document.getElementById('megaTitle'));
  scrambleDecode(document.getElementById('consoleSubtitle'));
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  MODEL_KEYS.forEach((mk) => {
    const section = buildModelSection(mk);
    SECTIONS[mk] = section;
    app.appendChild(section);
  });
  updateOverall();
}

function buildModelSection(mk) {
  const section = document.createElement('section');
  section.className = 'harness-section';
  section.dataset.hk = mk;
  section.style.setProperty('--ac', MODEL_COLORS[mk]);
  const collapsed = localStorage.getItem('collapsed_' + mk) !== '0';
  if (collapsed) section.classList.add('collapsed');

  const header = document.createElement('div');
  header.className = 'harness-header';

  const sys = buildOrbitSystem(mk);
  const title = document.createElement('div');
  title.className = 'harness-title';
  const h2 = document.createElement('h2');
  h2.textContent = MODEL_LABELS[mk];
  const countLabel = document.createElement('span');
  countLabel.className = 'task-count-label';
  countLabel.dataset.count = mk;
  title.append(h2, countLabel);

  const arrow = document.createElement('span');
  arrow.className = 'collapse-arrow';
  arrow.textContent = '\u25BC';

  header.append(sys, title, arrow);
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'harness-body' + (collapsed ? '' : ' open');
  const inner = document.createElement('div');
  inner.className = 'harness-body-inner';
  HARNESS_KEYS.forEach((hk) => {
    const key = comboKey(mk, hk);
    const gcol = localStorage.getItem('hcollapsed_' + key) !== '0';
    const grp = document.createElement('div');
    grp.className = 'harness-group' + (gcol ? ' collapsed' : '');
    grp.dataset.grp = key;
    const sub = document.createElement('div');
    sub.className = 'harness-sub';
    const dot = document.createElement('span');
    dot.className = 'harness-sub-dot';
    dot.style.background = HARNESS_COLORS[hk];
    const lab = document.createElement('span');
    lab.textContent = HARNESS_LABELS[hk].toUpperCase() + ' \u00B7 HARNESS';
    const bar = document.createElement('span');
    bar.className = 'harness-sub-bar';
    const fill = document.createElement('i');
    fill.dataset.hbar = key;
    bar.appendChild(fill);
    const gcount = document.createElement('span');
    gcount.className = 'harness-sub-count';
    gcount.dataset.gcount = key;
    const reset = document.createElement('button');
    reset.className = 'harness-sub-reset';
    reset.title = `Reset all ${HARNESS_LABELS[hk]} statuses for ${MODEL_LABELS[mk]}`;
    reset.textContent = '\u27F2';
    reset.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm(`Reset every ${HARNESS_LABELS[hk]} status for ${MODEL_LABELS[mk]}?`)) return;
      prompts.forEach((p) => setStatus(p.id, key, 'notstarted'));
      prompts.forEach((p) => {
        const card = document.querySelector(`.prompt-card[data-card="${p.id}|${key}"]`);
        if (!card) return;
        applyStatusClass(card, p.id, key);
        if (card._sel) { card._sel.value = 'notstarted'; card._sel.dataset.status = 'notstarted'; }
        const cb = card.querySelector('.checkwrap input');
        if (cb) cb.checked = false;
      });
      updateSectionCount(mk);
      updateOverall();
      toast(`${MODEL_LABELS[mk]} \u00B7 ${HARNESS_LABELS[hk]} RESET`);
    });
    const garrow = document.createElement('span');
    garrow.className = 'collapse-arrow';
    garrow.textContent = '\u25BC';
    sub.append(dot, lab, bar, gcount, reset, garrow);

    const gbody = document.createElement('div');
    gbody.className = 'harness-group-body';
    const ginner = document.createElement('div');
    ginner.className = 'harness-group-inner';
    prompts.forEach((p, ci) => {
      const card = buildPromptCard(p, key, mk);
      card.style.animationDelay = `${ci * 14}ms`;   // cascade entry (item 6)
      ginner.appendChild(card);
    });
    gbody.appendChild(ginner);

    sub.addEventListener('click', () => {
      grp.classList.toggle('collapsed');
      localStorage.setItem('hcollapsed_' + key, grp.classList.contains('collapsed') ? '1' : '0');
    });

    grp.append(sub, gbody);
    inner.appendChild(grp);
  });
  body.appendChild(inner);
  section.appendChild(body);

  header.addEventListener('click', () => {
    const opening = section.classList.contains('collapsed');
    section.classList.toggle('collapsed');
    body.classList.toggle('open');
    localStorage.setItem('collapsed_' + mk, section.classList.contains('collapsed') ? '1' : '0');
    if (opening && !REDUCED_MOTION) {
      section.classList.remove('booting');
      void section.offsetWidth;
      section.classList.add('booting');
    }
  });

  updateSectionCount(mk);
  return section;
}

function buildOrbitSystem(mk) {
  const sys = document.createElement('div');
  sys.className = 'orbit-system';
  sys.innerHTML = `
    <svg class="arc-svg" viewBox="0 0 72 72">
      <circle class="arc-track" cx="36" cy="36" r="33" fill="none" stroke-width="2.5"></circle>
      <circle class="arc-fill" cx="36" cy="36" r="33" fill="none" stroke-width="2.5"
        stroke-linecap="round" stroke-dasharray="${ARC_CIRC.toFixed(2)}"
        stroke-dashoffset="${ARC_CIRC.toFixed(2)}" transform="rotate(-90 36 36)"></circle>
    </svg>
    <div class="moon-field"></div>
    <div class="planet-icon" style="background: radial-gradient(circle at 32% 32%, #ffffff, ${MODEL_COLORS[mk]} 42%, #000000 100%); color:${MODEL_COLORS[mk]}"></div>
  `;
  const field = sys.querySelector('.moon-field');
  const moons = [];
  const HZ_ABBR = { pi: 'PI', opencode: 'OC', codex: 'CX', claude: 'CL', hermes: 'HM' };
  HARNESS_KEYS.forEach((hk, i) => {
    const m = document.createElement('span');
    m.className = 'moon moon-hz';
    m.style.setProperty('--ma', `${(360 / HARNESS_KEYS.length) * i + 12}deg`);
    m.dataset.hmoon = comboKey(mk, hk);
    m.title = HARNESS_LABELS[hk];
    const tag = document.createElement('i');
    tag.className = 'moon-tag';
    tag.textContent = HZ_ABBR[hk] || '?';
    m.appendChild(tag);
    field.appendChild(m);
    moons.push(m);
  });
  sys._moons = moons;
  sys._arc = sys.querySelector('.arc-fill');
  return sys;
}

function applyStatusClass(card, promptId, hk) {
  card.classList.remove('status-done', 'status-progress', 'status-notstarted');
  card.classList.add('status-' + statusFor(promptId, hk));
}

const NOTES_KEY = 'oxAlphaNotesV1';
let notes = (() => {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; }
})();
let noteSaveT = null;
function saveNote(promptId, text) {
  if (text) notes[promptId] = text;
  else delete notes[promptId];
  clearTimeout(noteSaveT);
  noteSaveT = setTimeout(() => localStorage.setItem(NOTES_KEY, JSON.stringify(notes)), 300);
}

function buildPromptCard(p, key, mk) {
  const card = document.createElement('article');
  card.className = 'prompt-card';
  card.dataset.card = `${p.id}|${key}`;
  card.__prompt = p;
  card.__hk = key;
  card.__mk = mk;
  applyStatusClass(card, p.id, key);

  const row = document.createElement('div');
  row.className = 'card-row';

  const wrap = document.createElement('label');
  wrap.className = 'checkwrap';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = statusFor(p.id, key) === 'done';
  checkbox.setAttribute('aria-label', `Mark ${p.title} done`);
  const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  checkSvg.setAttribute('viewBox', '0 0 24 24');
  const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  checkPath.setAttribute('d', 'M5 13l4.2 4.2L19 7.5');
  checkSvg.appendChild(checkPath);
  wrap.append(checkbox, checkSvg);
  wrap.addEventListener('click', (ev) => ev.stopPropagation());
  checkbox.addEventListener('change', () => {
    const val = checkbox.checked ? 'done' : 'notstarted';
    setStatus(p.id, key, val);
    syncSelect(card, val);
    applyStatusClass(card, p.id, key);
    updateSectionCount(mk);
    updateOverall();
    if (val === 'done') celebrate(checkbox, mk);
    else dimRipple(card);
  });

  const title = document.createElement('span');
  title.className = 'prompt-title';
  title.textContent = `${String(p.id).padStart(2, '0')} - ${p.title}`;

  const diff = document.createElement('span');
  diff.className = 'difficulty-tag difficulty-' + p.difficulty.replace(/\s+/g, '');
  diff.textContent = p.difficulty;

  const statusSel = document.createElement('select');
  statusSel.className = 'status-select';
  [['notstarted', 'Not started'], ['progress', 'In progress'], ['done', 'Done']].forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    statusSel.appendChild(o);
  });
  statusSel.value = statusFor(p.id, key);
  statusSel.dataset.status = statusSel.value;
  statusSel.addEventListener('click', (ev) => ev.stopPropagation());
  statusSel.addEventListener('change', () => {
    const prev = statusSel.dataset.status;
    setStatus(p.id, key, statusSel.value);
    statusSel.dataset.status = statusSel.value;
    checkbox.checked = statusSel.value === 'done';
    applyStatusClass(card, p.id, key);
    updateSectionCount(mk);
    updateOverall();
    if (statusSel.value === 'done') celebrate(statusSel, mk);
    else if (prev === 'done') dimRipple(card);
  });
  card._sel = statusSel;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn' + (notes[p.id] ? ' has-note' : '');
  copyBtn.innerHTML = `${COPY_ICON}<span>Copy prompt</span>`;
  copyBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(p.text);
    } catch {
      fallbackCopy(p.text);
    }
    copyBtn.classList.add('copied');
    card.classList.add('copy-sweep');   // green sweep across the row (item 9)
    setTimeout(() => card.classList.remove('copy-sweep'), 750);
    const label = copyBtn.querySelector('span');
    if (label) {
      label.textContent = 'Copied \u2713';
      setTimeout(() => { label.textContent = 'Copy prompt'; }, 1600);
    }
    setTimeout(() => copyBtn.classList.remove('copied'), 1600);
  });

  const noteBtn = document.createElement('button');
  noteBtn.className = 'note-btn' + (notes[p.id] ? ' has-note' : '');
  noteBtn.title = notes[p.id] ? 'Edit note' : 'Add a note';
  noteBtn.textContent = '\u270E';
  noteBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    body.classList.toggle('open');
    noteArea.classList.toggle('open');
    if (noteArea.classList.contains('open')) noteText.focus();
  });

  const noteArea = document.createElement('div');
  noteArea.className = 'note-area' + (notes[p.id] ? ' open' : '');
  const noteText = document.createElement('textarea');
  noteText.placeholder = 'Private note for this prompt (stored locally)…';
  noteText.value = notes[p.id] || '';
  noteText.addEventListener('click', (ev) => ev.stopPropagation());
  noteText.addEventListener('input', () => {
    saveNote(p.id, noteText.value.trim());
    noteBtn.classList.toggle('has-note', !!noteText.value.trim());
    noteBtn.title = noteText.value.trim() ? 'Edit note' : 'Add a note';
  });
  noteArea.appendChild(noteText);

  row.append(wrap, title, diff, statusSel, copyBtn, noteBtn);

  const body = document.createElement('div');
  body.className = 'prompt-body';
  const pre = document.createElement('pre');
  pre.className = 'prompt-text';
  pre.textContent = p.text;
  body.appendChild(pre);
  body.appendChild(noteArea);

  row.addEventListener('click', () => {
    const opening = !body.classList.contains('open');
    body.classList.toggle('open');
    if (opening && localStorage.getItem('oxTypePrompt') !== '0' && !REDUCED_MOTION && !body.dataset.typed) {
      body.dataset.typed = '1';   // typewriter first-open (item 23)
      const full = p.text;
      const head = full.slice(0, Math.min(220, full.length));
      let i = 0;
      pre.textContent = '';
      const caret = document.createElement('span');
      caret.className = 'type-caret';
      caret.textContent = '\u258C';
      pre.after(caret);
      const timer = setInterval(() => {
        i += 14;
        pre.textContent = head.slice(0, i);
        if (i >= head.length) {
          clearInterval(timer);
          pre.textContent = full;
          caret.remove();
        }
      }, 16);
    }
  });

  if (FINE_POINTER && !REDUCED_MOTION) attachTilt(row);

  card.append(row, body);
  return card;
}

function syncSelect(card, val) {
  const sel = card._sel;
  if (!sel) return;
  sel.value = val;
  sel.dataset.status = val;
}

function attachTilt(row) {
  let raf = 0;
  row.addEventListener('mousemove', (ev) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = row.getBoundingClientRect();
      const nx = (ev.clientX - r.left) / r.width - 0.5;
      const ny = (ev.clientY - r.top) / r.height - 0.5;
      row.style.transform = `perspective(750px) rotateX(${(-ny * 3).toFixed(2)}deg) rotateY(${(nx * 4).toFixed(2)}deg)`;
    });
  });
  row.addEventListener('mouseleave', () => {
    row.style.transform = '';
  });
}

function celebrate(sourceEl, hk) {
  const section = SECTIONS[hk];
  if (!section) return;
  const r = sourceEl.getBoundingClientRect();
  spawnBurst(r.left + r.width / 2, r.top + r.height / 2);
  pulseToPlanet(r.left + r.width / 2, r.top + r.height / 2, section);
  radarBlip();
  const sys = section.querySelector('.orbit-system');
  if (sys && !REDUCED_MOTION) {
    sys.classList.add('arc-flash');
    setTimeout(() => sys.classList.remove('arc-flash'), 700);
  }
}

/* dim ripple when a status drops out of done (item 7) */
function dimRipple(card) {
  if (REDUCED_MOTION || !card) return;
  card.classList.remove('dim-ripple');
  void card.offsetWidth;
  card.classList.add('dim-ripple');
  setTimeout(() => card.classList.remove('dim-ripple'), 700);
}

function spawnBurst(x, y) {
  if (REDUCED_MOTION) return;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'fx-particle';
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.background = i % 3 === 0 ? '#fff' : i % 3 === 1 ? '#4ade80' : '#67e8f9';
    document.body.appendChild(s);
    const ang = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 34;
    s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist - 8}px)) scale(.15)`, opacity: 0 },
      ],
      { duration: 460 + Math.random() * 220, easing: 'cubic-bezier(.1,.7,.3,1)' }
    ).onfinish = () => s.remove();
  }
}

function pulseToPlanet(x, y, section) {
  if (REDUCED_MOTION) return;
  const planet = section.querySelector('.planet-icon');
  if (!planet) return;
  const pr = planet.getBoundingClientRect();
  const tx = pr.left + pr.width / 2;
  const ty = pr.top + pr.height / 2;
  const orb = document.createElement('span');
  orb.className = 'pulse-orb';
  orb.style.left = x + 'px';
  orb.style.top = y + 'px';
  document.body.appendChild(orb);
  const midX = (tx - x) * 0.5;
  const midY = (ty - y) * 0.5 - 36;
  orb.animate(
    [
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${midX}px), calc(-50% + ${midY}px)) scale(1.25)`, opacity: 0.95, offset: 0.5 },
      { transform: `translate(calc(-50% + ${tx - x}px), calc(-50% + ${ty - y}px)) scale(.3)`, opacity: 0.25 },
    ],
    { duration: 560, easing: 'cubic-bezier(.3,.6,.4,1)' }
  ).onfinish = () => {
    orb.remove();
    const sys = section.querySelector('.orbit-system');
    if (sys) {
      sys.classList.add('charged');
      setTimeout(() => sys.classList.remove('charged'), 500);
    }
  };
}

function radarBlip() {
  const radar = document.getElementById('radar');
  if (!radar) return;
  const b = document.createElement('span');
  b.className = 'radar-blip';
  b.style.left = 20 + Math.random() * 60 + '%';
  b.style.top = 20 + Math.random() * 60 + '%';
  radar.appendChild(b);
  setTimeout(() => b.remove(), 1500);
}

function updateSectionCount(mk) {
  const section = SECTIONS[mk];
  if (!section) return;
  const labelEl = section.querySelector(`[data-count="${mk}"]`);
  const sys = section.querySelector('.orbit-system');
  const total = HARNESS_KEYS.length * prompts.length;
  const done = prompts.reduce(
    (n, p) => n + HARNESS_KEYS.filter((hk) => statusFor(p.id, comboKey(mk, hk)) === 'done').length,
    0
  );
  HARNESS_KEYS.forEach((hk) => {
    const gEl = section.querySelector(`[data-gcount="${comboKey(mk, hk)}"]`);
    if (!gEl) return;
    const gd = prompts.filter((p) => statusFor(p.id, comboKey(mk, hk)) === 'done').length;
    gEl.textContent = `${gd}/${prompts.length} DONE`;
    const barEl = section.querySelector(`[data-hbar="${comboKey(mk, hk)}"]`);
    if (barEl) barEl.style.width = `${prompts.length ? (gd / prompts.length) * 100 : 0}%`;
    const wasComplete = gEl.dataset.complete === '1';
    const nowComplete = !!prompts.length && gd === prompts.length;
    if (nowComplete && !wasComplete && Date.now() - bootedAt > 4000) { gEl.dataset.complete = '1'; confettiAlong(gEl.closest('.harness-sub') || gEl); }
    else if (!nowComplete) gEl.dataset.complete = '0';
  });
  if (labelEl) labelEl.textContent = `${total} TASKS \u00B7 ${done} DONE`;
  if (sys) {
    const pct = total ? done / total : 0;
    sys._arc.style.strokeDashoffset = (ARC_CIRC * (1 - pct)).toFixed(2);
    // constellation: one moon per harness (item 24)
    HARNESS_KEYS.forEach((hk, i) => {
      const moon = sys._moons[i];
      if (!moon) return;
      const hdone = prompts.filter((p) => statusFor(p.id, comboKey(mk, hk)) === 'done').length;
      const hpct = prompts.length ? hdone / prompts.length : 0;
      moon.classList.toggle('lit', hpct >= 0.6);
      moon.classList.toggle('gold', hpct >= 1);
    });
    sys.classList.toggle('complete', !!total && done === total);
  }
  section.classList.toggle('complete', !!total && done === total);
  rankCeremony(mk, total, done);
}

function currentRank(pct) {
  if (pct >= 100) return 'OX ALPHA';
  if (pct >= 75) return 'COMMANDER';
  if (pct >= 50) return 'SPECIALIST';
  if (pct >= 25) return 'PILOT';
  return 'CADET';
}

/* rank-up ceremony (item 21) — fires when a model crosses a tier */
const RANKS_KEY = 'oxAlphaRanks';
let modelRanks = (() => {
  try { return JSON.parse(localStorage.getItem(RANKS_KEY)) || {}; } catch { return {}; }
})();
function rankCeremony(mk, total, done) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const tier = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  const prev = modelRanks[mk];
  if (prev == null) { modelRanks[mk] = tier; localStorage.setItem(RANKS_KEY, JSON.stringify(modelRanks)); return; }
  if (tier > prev) {
    modelRanks[mk] = tier;
    localStorage.setItem(RANKS_KEY, JSON.stringify(modelRanks));
    if (Date.now() - bootedAt > 4000) showRankUp(MODEL_LABELS[mk], currentRank(pct), pct);
  }
}
function showRankUp(modelName, rank, pct) {
  toast(`${modelName} RANK UP \u2192 ${rank} (${pct}%)`, 'success');
  let banner = document.querySelector('.rank-up-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'rank-up-banner';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<span class="ru-flash"></span><span class="ru-text">RANK UP \u2192 ${rank}</span><span class="ru-model">${modelName}</span>`;
  banner.classList.remove('go');
  void banner.offsetWidth;
  banner.classList.add('go');
  Starfield.warp(1200);
}

/* harness completion confetti (item 8) */
function confettiAlong(el) {
  if (REDUCED_MOTION || !el) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.className = 'confetti-bit';
    s.style.left = (r.left + Math.random() * r.width) + 'px';
    s.style.top = (r.top + r.height / 2) + 'px';
    s.style.background = ['#fde68a', '#4ade80', '#67e8f9', '#c084fc'][i % 4];
    document.body.appendChild(s);
    const dx = (Math.random() - 0.5) * 120;
    const dy = -(30 + Math.random() * 60);
    s.animate(
      [
        { transform: 'translate(-50%,-50%)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 60}px)) rotate(${(Math.random() * 180 - 90)}deg)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).onfinish = () => s.remove();
  }
}

function updateOverall() {
  let totalDone = 0;
  MODEL_KEYS.forEach((mk) => {
    totalDone += prompts.reduce(
      (n, p) => n + HARNESS_KEYS.filter((hk) => statusFor(p.id, comboKey(mk, hk)) === 'done').length,
      0
    );
    updateSectionCount(mk);
  });
  const total = MODEL_KEYS.length * HARNESS_KEYS.length * prompts.length;
  const percent = total ? Math.round((totalDone / total) * 100) : 0;
  const statsEl = document.getElementById('overallStats');
  if (statsEl) statsEl.textContent = `${totalDone} / ${total} TASKS COMPLETED`;
  const fillEl = document.getElementById('overallFill');
  if (fillEl) fillEl.style.width = `${percent}%`;
  const pctEl = document.getElementById('percentLabel');
  if (pctEl) {
    pctEl.textContent = `${percent}%`;
    pctEl.style.left = `clamp(3%, ${percent}%, 97%)`;
  }

  const rankLabel = document.getElementById('rankLabel');
  if (rankLabel) rankLabel.textContent = `OPERATOR \u00B7 ${currentRank(percent)}`;

  const mhFill = document.getElementById('mhFill');
  const mhPct = document.getElementById('mhPct');
  if (mhFill) mhFill.style.width = `${percent}%`;
  if (mhPct) mhPct.textContent = `${percent}%`;
  MODEL_KEYS.forEach((mk) => {
    const dot = document.querySelector(`.mh-dot[data-hk="${mk}"]`);
    if (!dot) return;
    const all = !!prompts.length && prompts.every((p) =>
      HARNESS_KEYS.every((hk) => statusFor(p.id, comboKey(mk, hk)) === 'done'));
    dot.classList.toggle('complete', all);
  });

  updateFavicon(percent);
  document.title = `${percent}% \u00B7 OX ALPHA`;

  if (
    total &&
    totalDone === total &&
    lastTotalDone >= 0 &&
    lastTotalDone < total &&
    Date.now() - bootedAt > 2500
  ) {
    fireWarp();
  }
  lastTotalDone = totalDone;
}

function fireWarp() {
  toast('ALL SYSTEMS MASTERED - ENTERING HYPERSPACE', 'success');
  Starfield.warp(1700);
  const wf = document.getElementById('warpFlash');
  if (wf && !REDUCED_MOTION) {
    wf.classList.remove('go');
    void wf.offsetWidth;
    wf.classList.add('go');
  }
}

let faviconLink = null;
function updateFavicon(pct) {
  try {
    if (!faviconLink) {
      faviconLink = document.getElementById('favicon');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.id = 'favicon';
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
    }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#04060c';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#22d3ee';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(148,180,220,.25)';
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = accent;
    g.lineCap = 'round';
    const frac = pct <= 0 ? 0 : Math.max(pct, 2) / 100;
    g.beginPath();
    g.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e6f5ff';
    g.font = '700 19px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(pct), 32, 33);
    faviconLink.href = c.toDataURL('image/png');
  } catch {}
}

const Starfield = (function () {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let shooting = [];
  let W = 0, H = 0;
  let mouseX = 0, mouseY = 0, mx = 0, my = 0;
  let scrollCur = 0;
  let warpUntil = 0, warpStart = 0;
  const LAYER_F = [0.35, 0.65, 1];

  const nebula = document.createElement('canvas');
  nebula.width = nebula.height = 600;
  (function paintNebula() {
    const n = nebula.getContext('2d');
    const blob = (x, y, r, col) => {
      const grad = n.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = grad;
      n.fillRect(0, 0, 600, 600);
    };
    blob(210, 240, 240, 'rgba(88,60,190,.16)');
    blob(400, 330, 200, 'rgba(30,110,190,.15)');
    blob(320, 190, 140, 'rgba(200,80,180,.07)');
  })();

  function resize() {
    canvas.width = W = window.innerWidth;
    canvas.height = H = window.innerHeight;
    const target = Math.min(340, Math.round((W * H) / 8200));
    stars = Array.from({ length: target }, () => {
      const roll = Math.random();
      const layer = roll < 0.45 ? 0 : roll < 0.82 ? 1 : 2;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * (layer === 2 ? 1.5 : 1.1) + 0.3 + layer * 0.25,
        tw: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005,
        layer,
      };
    });
  }

  function spawnShootingStar() {
    if (shooting.length < 2 && Math.random() < 0.012) {
      shooting.push({
        x: Math.random() * W,
        y: -10,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 4 + 3,
        life: 1,
      });
    }
  }

  function warpPower() {
    if (!warpUntil || Date.now() > warpUntil) return 0;
    const t = (Date.now() - warpStart) / (warpUntil - warpStart);
    return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) ** 0.65;
  }

  function draw() {
    const now = Date.now();
    ctx.clearRect(0, 0, W, H);

    mx += (mouseX - mx) * 0.055;
    my += (mouseY - my) * 0.055;
    const wp = warpPower();

    const driftX = (now * 0.004) % (W + 600);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(nebula, -driftX * 0.3, H * 0.12, 600, 600);
    ctx.drawImage(nebula, W - driftX * 0.22, -H * 0.08, 520, 520);
    ctx.globalAlpha = 1;

    const cx = W / 2, cy = H / 2;
    for (const s of stars) {
      s.tw += s.speed;
      const f = LAYER_F[s.layer];
      let px = s.x + mx * f * 24;
      let py = s.y + my * f * 24 - scrollCur * f * 0.35;
      py = ((py % H) + H) % H;
      px = ((px % W) + W) % W;

      if (wp > 0 && !REDUCED_MOTION) {
        const dx = px - cx, dy = py - cy;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        const tail = wp * (26 + s.r * 44) * (0.35 + d / Math.max(W, H));
        ctx.beginPath();
        ctx.moveTo(px - nx * tail, py - ny * tail);
        ctx.lineTo(px + nx * tail * 0.25, py + ny * tail * 0.25);
        ctx.strokeStyle = `rgba(185,228,255,${0.25 + wp * 0.5})`;
        ctx.lineWidth = s.r + 0.7;
        ctx.stroke();
        s.x += nx * wp * 2.6;
        s.y += ny * wp * 2.6;
        if (s.x < -20) s.x = W + 20;
        if (s.x > W + 20) s.x = -20;
        if (s.y < -20) s.y = H + 20;
        if (s.y > H + 20) s.y = -20;
      } else {
        const alpha = 0.35 + Math.sin(s.tw) * 0.38;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
    }

    if (wp === 0) spawnShootingStar();
    for (let i = shooting.length - 1; i >= 0; i--) {
      const m = shooting[i];
      m.x += m.vx;
      m.y += m.vy;
      m.life -= 0.015;
      if (m.life <= 0) {
        shooting.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 8, m.y - m.vy * 8);
      ctx.strokeStyle = `rgba(180,220,255,${m.life})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener(
    'scroll',
    () => {
      scrollCur = window.scrollY;
    },
    { passive: true }
  );
  if (FINE_POINTER && !REDUCED_MOTION) {
    window.addEventListener(
      'mousemove',
      (e) => {
        mouseX = e.clientX / window.innerWidth - 0.5;
        mouseY = e.clientY / window.innerHeight - 0.5;
      },
      { passive: true }
    );
  }
  resize();
  draw();

  return {
    warp(duration) {
      if (REDUCED_MOTION) return;
      warpStart = Date.now();
      warpUntil = warpStart + duration;
      document.body.classList.add('warp-active');
      setTimeout(() => document.body.classList.remove('warp-active'), duration + 250);
    },
  };
})();

function scrambleDecode(el) {
  if (!el || REDUCED_MOTION) return;
  const finalText = el.textContent;
  const pool = '!<>-_\\/[]{}=+*^?#01';
  const len = finalText.length;
  const frames = Math.min(30, Math.max(12, len));
  let frame = 0;
  const timer = setInterval(() => {
    frame++;
    const reveal = Math.floor((frame / frames) * len);
    let out = finalText.slice(0, reveal);
    for (let i = reveal; i < len; i++) {
      out += finalText[i] === ' ' ? ' ' : pool[Math.floor(Math.random() * pool.length)];
    }
    el.textContent = out;
    if (frame >= frames) {
      el.textContent = finalText;
      clearInterval(timer);
    }
  }, 30);
}

const THEMES = ['cyan', 'violet', 'amber'];
function buildThemeDots() {
  const host = document.getElementById('themeDots');
  if (!host) return;
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'theme-dot';
    b.dataset.t = t;
    b.title = `${t.toUpperCase()} theme`;
    b.addEventListener('click', () => applyTheme(t));
    host.appendChild(b);
  });
}
function applyTheme(t) {
  if (!THEMES.includes(t)) t = 'cyan';
  document.documentElement.dataset.theme = t === 'cyan' ? '' : t;
  localStorage.setItem(THEME_KEY, t);
  document.querySelectorAll('.theme-dot').forEach((d) =>
    d.classList.toggle('active', d.dataset.t === t)
  );
  updateFavicon(lastKnownPct());
}
function cycleTheme() {
  const cur = localStorage.getItem(THEME_KEY) || 'cyan';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  applyTheme(next);
  toast(`ACCENT THEME \u2192 ${next.toUpperCase()}`);
}
function lastKnownPct() {
  const m = document.title.match(/^(\d+)%/);
  return m ? Number(m[1]) : 0;
}

function diffKey(d) {
  return String(d).replace(/\s+/g, '');
}
const DIFF_LABELS = {
  Light: 'LIGHT',
  Medium: 'MEDIUM',
  Hard: 'HARD',
  VeryHard: 'VERY HARD',
};
const STATUS_OPTS = [
  ['notstarted', 'NOT STARTED'],
  ['progress', 'IN PROGRESS'],
  ['done', 'DONE'],
];

function saveFilters() {
  localStorage.setItem(
    FILTER_KEY,
    JSON.stringify({ diff: [...filterState.diff], status: [...filterState.status], hideDone: filterState.hideDone })
  );
}
function restoreFilterUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY));
    if (!saved) return;
    filterState.diff = new Set(saved.diff || []);
    filterState.status = new Set(saved.status || []);
    filterState.hideDone = !!saved.hideDone;
  } catch {}
}
function buildFilterBar() {
  const diffHost = document.getElementById('diffGroup');
  const statusHost = document.getElementById('statusGroup');
  const diffs = [...new Set(prompts.map((p) => diffKey(p.difficulty)))];
  diffs.forEach((dk) => {
    const b = document.createElement('button');
    b.className = 'filter-chip diff-' + dk;
    b.dataset.kind = 'diff';
    b.dataset.val = dk;
    b.textContent = DIFF_LABELS[dk] || dk.toUpperCase();
    b.addEventListener('click', () => {
      if (filterState.diff.has(dk)) filterState.diff.delete(dk);
      else filterState.diff.add(dk);
      b.classList.toggle('on');
      saveFilters();
      applyFilters();
    });
    diffHost.appendChild(b);
  });
  STATUS_OPTS.forEach(([val, lab]) => {
    const b = document.createElement('button');
    b.className = 'filter-chip st-' + val;
    b.dataset.kind = 'status';
    b.dataset.val = val;
    b.textContent = lab;
    b.addEventListener('click', () => {
      if (filterState.status.has(val)) filterState.status.delete(val);
      else filterState.status.add(val);
      b.classList.toggle('on');
      saveFilters();
      applyFilters();
    });
    statusHost.appendChild(b);
  });
  const hideBtn = document.getElementById('hideDoneChip');
  hideBtn.addEventListener('click', () => {
    filterState.hideDone = !filterState.hideDone;
    hideBtn.classList.toggle('on', filterState.hideDone);
    saveFilters();
    applyFilters();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    filterState.diff.clear();
    filterState.status.clear();
    filterState.hideDone = false;
    document.querySelectorAll('.filter-chip.on').forEach((c) => c.classList.remove('on'));
    saveFilters();
    applyFilters();
    toast('FILTERS CLEARED');
  });
  document.querySelectorAll('#diffGroup .filter-chip').forEach((b) =>
    b.classList.toggle('on', filterState.diff.has(b.dataset.val))
  );
  document.querySelectorAll('#statusGroup .filter-chip').forEach((b) =>
    b.classList.toggle('on', filterState.status.has(b.dataset.val))
  );
  hideBtn.classList.toggle('on', filterState.hideDone);
}

function matchFilters(p, hk) {
  if (filterState.diff.size && !filterState.diff.has(diffKey(p.difficulty))) return false;
  const st = statusFor(p.id, hk);
  if (filterState.status.size && !filterState.status.has(st)) return false;
  if (filterState.hideDone && st === 'done') return false;
  return true;
}

function applyFilters() {
  const cards = [...document.querySelectorAll('.prompt-card')];
  const before = new Map();
  cards.forEach((c) => {
    if (c.style.display !== 'none') before.set(c, c.getBoundingClientRect());
  });
  cards.forEach((c) => {
    c.style.display = matchFilters(c.__prompt, c.__hk) ? '' : 'none';
  });
  if (REDUCED_MOTION) return;
  cards.forEach((c) => {
    const wasVisible = before.has(c);
    const isVisible = c.style.display !== 'none';
    if (wasVisible && isVisible) {
      const first = before.get(c);
      const dy = first.top - c.getBoundingClientRect().top;
      if (Math.abs(dy) > 2) {
        c.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 280, easing: 'cubic-bezier(.2,.7,.3,1)' }
        );
      }
    } else if (!wasVisible && isVisible) {
      c.animate(
        [{ transform: 'scale(.94)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 240, easing: 'ease-out' }
      );
    }
  });
}

function buildMiniHudDots() {
  const host = document.getElementById('mhDots');
  if (!host) return;
  MODEL_KEYS.forEach((mk) => {
    const d = document.createElement('button');
    d.className = 'mh-dot';
    d.dataset.hk = mk;
    d.style.color = MODEL_COLORS[mk];
    d.title = `Jump to ${MODEL_LABELS[mk]}`;
    d.addEventListener('click', () => scrollToSection(mk));
    host.appendChild(d);
  });
}

function scrollToSection(hk) {
  const sec = SECTIONS[hk];
  if (!sec) return;
  if (sec.classList.contains('collapsed')) {
    sec.querySelector('.harness-header').click();
  }
  setTimeout(() => {
    sec.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
  }, 140);
}

window.addEventListener(
  'scroll',
  () => {
    const hud = document.getElementById('miniHud');
    if (hud) hud.classList.toggle('visible', window.scrollY > 320);
  },
  { passive: true }
);

function wireTopButtons() {
  document.getElementById('telemetryBtn').addEventListener('click', () => CmdK.open());
  document.getElementById('settingsBtn').addEventListener('click', cycleTheme);
  document.getElementById('exportBtn').addEventListener('click', exportProgress);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importProgress);
  document.getElementById('alertsBtn').addEventListener('click', () => {
    const msgs = [
      'ALL HARNESS CHANNELS NOMINAL',
      'NEW TELEMETRY PACKET RECEIVED',
      'DEEP SPACE NETWORK: SIGNAL STRONG',
      'ORBITAL SYNC COMPLETE',
      'NO ANOMALIES DETECTED IN LAST SWEEP',
    ];
    toast(msgs[Math.floor(Math.random() * msgs.length)]);
  });
}

/* ---------- progress export / import ---------- */
function exportProgress() {
  try {
    const payload = { app: 'epicbench-tracker', exportedAt: new Date().toISOString(), state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `epicbench-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('PROGRESS EXPORTED', 'success');
  } catch (e) {
    toast('EXPORT FAILED: ' + (e && e.message || e));
  }
}
function importProgress(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = parsed && parsed.state ? parsed.state : parsed;
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('unexpected shape');
      let merged = 0;
      for (const pid of Object.keys(incoming)) {
        if (!state[pid]) state[pid] = {};
        for (const key of Object.keys(incoming[pid])) {
          if (['notstarted', 'progress', 'done'].includes(incoming[pid][key])) {
            state[pid][key] = incoming[pid][key];
            merged++;
          }
        }
      }
      saveState();
      document.querySelectorAll('.prompt-card').forEach((card) => {
        const p = card.__prompt, key = card.__hk;
        const st = statusFor(p.id, key);
        applyStatusClass(card, p.id, key);
        if (card._sel) { card._sel.value = st; card._sel.dataset.status = st; }
        const cb = card.querySelector('.checkwrap input');
        if (cb) cb.checked = st === 'done';
      });
      MODEL_KEYS.forEach(updateSectionCount);
      updateOverall();
      toast(`IMPORTED ${merged} STATUSES`, 'success');
    } catch (e) {
      toast('IMPORT FAILED: ' + (e && e.message || e));
    }
  };
  reader.readAsText(file);
}

function initCmdkEntries() {
  CMDK_ENTRIES = [];
  MODEL_KEYS.forEach((mk) => {
    HARNESS_KEYS.forEach((hk) => {
      prompts.forEach((p) => {
        CMDK_ENTRIES.push({
          p,
          mk,
          hk,
          label: `${String(p.id).padStart(2, '0')} \u00B7 ${p.title}`,
          hay: `${p.id} ${p.title} ${p.difficulty} ${MODEL_LABELS[mk]} ${mk} ${HARNESS_LABELS[hk]} ${hk}`.toLowerCase(),
          color: MODEL_COLORS[mk],
        });
      });
    });
  });
}

function fuzzyScore(query, hay) {
  let qi = 0, score = 0, streak = 0;
  for (let i = 0; i < hay.length && qi < query.length; i++) {
    if (hay[i] === query[qi]) {
      streak++;
      score += 2 + streak * 2 + (i === 0 || hay[i - 1] === ' ' ? 4 : 0);
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === query.length ? score : -1;
}

const CmdK = (() => {
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const results = document.getElementById('cmdkResults');
  let selIndex = 0;
  let currentItems = [];
  let isOpen = false;

  function open() {
    if (isOpen) return;
    isOpen = true;
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    input.value = '';
    selIndex = 0;
    renderResults('');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => {
      overlay.hidden = true;
    }, 190);
  }

  function renderResults(qRaw) {
    const q = qRaw.trim().toLowerCase();
    let items;
    if (q) {
      items = CMDK_ENTRIES.map((e) => ({ e, s: fuzzyScore(q, e.hay) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.e);
    } else {
      items = CMDK_ENTRIES.slice().sort((a, b) => a.p.id - b.p.id);
    }
    currentItems = items.slice(0, 14);
    selIndex = Math.min(selIndex, Math.max(0, currentItems.length - 1));
    results.innerHTML = '';
    if (!currentItems.length) {
      const li = document.createElement('li');
      li.className = 'cmdk-empty';
      li.textContent = 'NO TRANSMISSIONS MATCH';
      results.appendChild(li);
      return;
    }
    currentItems.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.dataset.idx = idx;
      if (idx === selIndex) li.classList.add('sel');
      const sw = document.createElement('span');
      sw.className = 'cmdk-swatch';
      sw.style.color = entry.color;
      sw.style.background = entry.color;
      const lab = document.createElement('span');
      lab.className = 'cmdk-label';
      lab.textContent = entry.label;
      const meta = document.createElement('span');
      meta.className = 'cmdk-meta';
      meta.textContent = `${MODEL_LABELS[entry.mk]} \u00B7 ${HARNESS_LABELS[entry.hk].toUpperCase()}`;
      const cp = document.createElement('button');
      cp.className = 'cmdk-copy';
      cp.title = 'Copy prompt text';
      cp.innerHTML = COPY_ICON;
      cp.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        try {
          await navigator.clipboard.writeText(entry.p.text);
        } catch {
          fallbackCopy(entry.p.text);
        }
        cp.style.color = '#4ade80';
        cp.style.borderColor = 'rgba(74,222,128,.6)';
        toast('PROMPT COPIED TO CLIPBOARD', 'success');
        setTimeout(() => {
          cp.style.color = '';
          cp.style.borderColor = '';
        }, 900);
      });
      li.append(sw, lab, meta, cp);
      li.addEventListener('mouseenter', () => {
        selIndex = idx;
        highlight();
      });
      li.addEventListener('click', () => jumpTo(entry));
      results.appendChild(li);
    });
  }

  function highlight() {
    [...results.children].forEach((li, i) => {
      li.classList.toggle('sel', i === selIndex);
    });
    const selLi = results.children[selIndex];
    if (selLi) selLi.scrollIntoView({ block: 'nearest' });
  }

  function jumpTo(entry) {
    close();
    const key = comboKey(entry.mk, entry.hk);
    const targetCard = document.querySelector(`.prompt-card[data-card="${entry.p.id}|${key}"]`);
    if (!targetCard) return;
    const sec = SECTIONS[entry.mk];
    if (sec && sec.classList.contains('collapsed')) {
      sec.querySelector('.harness-header').click();
    }
    const grp = sec && sec.querySelector(`[data-grp="${key}"]`);
    if (grp && grp.classList.contains('collapsed')) {
      grp.querySelector('.harness-sub').click();
    }
    const bodyEl = targetCard.querySelector('.prompt-body');
    if (bodyEl && !bodyEl.classList.contains('open')) bodyEl.classList.add('open');
    setTimeout(() => {
      targetCard.scrollIntoView({
        behavior: REDUCED_MOTION ? 'auto' : 'smooth',
        block: 'center',
      });
      targetCard.classList.add('flash');
      setTimeout(() => targetCard.classList.remove('flash'), 1050);
    }, 160);
  }

  input.addEventListener('input', () => {
    selIndex = 0;
    renderResults(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selIndex = Math.min(selIndex + 1, currentItems.length - 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selIndex = Math.max(selIndex - 1, 0);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentItems[selIndex]) jumpTo(currentItems[selIndex]);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  window.addEventListener('keydown', (e) => {
    const typing =
      (e.target.matches && e.target.matches('input, textarea, select')) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isOpen) close();
      else open();
    } else if (e.key === '/' && !typing && !isOpen) {
      e.preventDefault();
      open();
    }
  });

  return { open, close };
})();

/* ---------- live bench ticker (item 22) ---------- */
(function benchTicker() {
  const host = document.getElementById('benchTicker');
  const track = document.getElementById('btTrack');
  if (!host || !track) return;
  const STATUS_CLS = { pass: 'ok', fail: 'bad', error: 'err', running: 'run', skipped: 'skip' };
  let seen = null;
  async function poll() {
    try {
      const res = await fetch('api/status', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      const runs = (d.runs || []).slice(0, 14);
      if (!runs.length) { host.hidden = true; return; }
      const sig = runs.map((r) => `${r.run}|${r.promptId}|${r.status}`).join(';');
      if (sig === seen) return;
      seen = sig;
      host.hidden = false;
      track.innerHTML = '';
      const build = () => {
        const seq = document.createElement('span');
        seq.className = 'bt-seq';
        runs.forEach((r) => {
          const pill = document.createElement('span');
          pill.className = 'bt-pill bt-' + (STATUS_CLS[r.status] || 'skip');
          const mdl = document.createElement('b');
          mdl.textContent = String(r.model || 'run').slice(0, 22);
          const mission = document.createElement('span');
          mission.textContent = (r.promptId != null ? '#' + String(r.promptId).padStart(2, '0') : '') + ' ' + String(r.status).toUpperCase();
          pill.append(mdl, mission);
          seq.appendChild(pill);
        });
        return seq;
      };
      track.append(build(), build());   // duplicated for a seamless loop
    } catch { host.hidden = true; }
  }
  poll();
  setInterval(poll, 15000);
})();

/* ---------- scroll reveals (item 31) ---------- */
(function sectionReveals() {
  if (REDUCED_MOTION || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('revealed'); io.unobserve(en.target); } });
  }, { threshold: 0.06 });
  document.querySelectorAll('.harness-section').forEach((s) => io.observe(s));
})();

/* ---------- help overlay (?) ---------- */
const HelpOverlay = (() => {
  let overlay = null;
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="help-panel" role="dialog" aria-label="Shortcuts">
        <span class="help-close">\u2715</span>
        <h3>MISSION SHORTCUTS</h3>
        <dl>
          <dt>/</dt><dd>Focus mission search</dd>
          <dt>Ctrl / Cmd + K</dt><dd>Open command palette</dd>
          <dt>?</dt><dd>Toggle this panel</dd>
          <dt>Esc</dt><dd>Close panels / clear search</dd>
          <dt>Click a card row</dt><dd>Expand prompt text</dd>
          <dt>&#9998; on a card</dt><dd>Private local note</dd>
          <dt>&#x27F2; on a harness row</dt><dd>Reset that harness's statuses</dd>
          <dt>Export / Import (top bar)</dt><dd>Back up or restore progress</dd>
        </dl>
        <p class="help-foot">Progress lives in this browser &middot; export before switching machines</p>
        <button class="help-toggle" id="typeToggle" type="button">TYPEWRITER EFFECT: <b>ON</b></button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.help-close').addEventListener('click', close);
    const tt = overlay.querySelector('#typeToggle');
    const syncT = () => {
      const on = localStorage.getItem('oxTypePrompt') !== '0';
      tt.innerHTML = `TYPEWRITER EFFECT: <b>${on ? 'ON' : 'OFF'}</b>`;
    };
    tt.addEventListener('click', () => {
      const on = localStorage.getItem('oxTypePrompt') !== '0';
      localStorage.setItem('oxTypePrompt', on ? '0' : '1');
      syncT();
    });
    syncT();
  }
  function open() { if (!overlay) build(); overlay.hidden = false; requestAnimationFrame(() => overlay.classList.add('open')); }
  function close() { if (!overlay) return; overlay.classList.remove('open'); setTimeout(() => { overlay.hidden = true; }, 180); }
  function toggle() { (overlay && !overlay.hidden) ? close() : open(); }
  return { toggle };
})();

window.addEventListener('keydown', (e) => {
  const typing = (e.target.matches && e.target.matches('input, textarea, select')) || e.target.isContentEditable;
  if (e.key === '?' && !typing) { e.preventDefault(); HelpOverlay.toggle(); }
});

/* ---------- help overlay styles (injected once) ---------- */
(function injectHelpStyles() {
  const css = `
.help-overlay{position:fixed;inset:0;z-index:130;background:rgba(2,6,12,.7);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s ease}
.help-overlay.open{opacity:1}
.help-panel{width:min(460px,92vw);background:#070d16;border:1px solid rgba(34,211,238,.35);border-radius:12px;
  padding:20px 22px;color:#cfe3f2;font-family:Rajdhani,'Segoe UI',sans-serif;position:relative;
  box-shadow:0 0 40px rgba(34,211,238,.14)}
.help-panel h3{font-family:Orbitron,sans-serif;font-size:13px;letter-spacing:.24em;color:#22d3ee;margin:0 0 14px}
.help-panel dl{display:grid;grid-template-columns:130px 1fr;gap:8px 14px;margin:0;font-size:13.5px}
.help-panel dt{font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:.1em;color:#7dd3fc;align-self:center}
.help-panel dd{margin:0;color:#9fb6c9}
.help-close{position:absolute;top:10px;right:14px;cursor:pointer;color:#7f97ab}
.help-close:hover{color:#22d3ee}
.help-foot{margin:14px 0 0;font-size:11px;color:#64809a}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

function toast(msg, type = '') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'success' ? ' success' : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2700);
  setTimeout(() => t.remove(), 3100);
}

(function initClock() {
  const el = document.getElementById('missionClock');
  if (!el) return;
  const start = Date.now();
  function tick() {
    let s = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    s = String(s % 60).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
})();

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

init();
