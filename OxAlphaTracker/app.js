const HARNESS_KEYS = ['pi', 'opencode', 'codex', 'claude'];
const HARNESS_LABELS = {
  hermes: 'Hermes',
  pi: 'Pi',
  opencode: 'OpenCode',
  codex: 'Codex CLI',
  claude: 'Claude Code',
};
const PLANET_COLORS = {
  hermes: '#f59e0b',
  pi: '#ec4899',
  opencode: '#22d3ee',
  codex: '#a3e635',
  claude: '#c084fc',
};
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
    return JSON.parse(localStorage.getItem(stateKey)) || {};
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
  }
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
  HARNESS_KEYS.forEach((hk) => {
    const section = buildHarnessSection(hk);
    SECTIONS[hk] = section;
    app.appendChild(section);
  });
  updateOverall();
}

function buildHarnessSection(hk) {
  const section = document.createElement('section');
  section.className = 'harness-section';
  section.dataset.hk = hk;
  section.style.setProperty('--ac', PLANET_COLORS[hk]);
  const collapsed = localStorage.getItem('collapsed_' + hk) !== '0';
  if (collapsed) section.classList.add('collapsed');

  const header = document.createElement('div');
  header.className = 'harness-header';

  const sys = buildOrbitSystem(hk);
  const title = document.createElement('div');
  title.className = 'harness-title';
  const h2 = document.createElement('h2');
  h2.textContent = `${HARNESS_LABELS[hk]} - Harness`;
  const countLabel = document.createElement('span');
  countLabel.className = 'task-count-label';
  countLabel.dataset.count = hk;
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
  prompts.forEach((p) => {
    inner.appendChild(buildPromptCard(p, hk));
  });
  body.appendChild(inner);
  section.appendChild(body);

  header.addEventListener('click', () => {
    const opening = section.classList.contains('collapsed');
    section.classList.toggle('collapsed');
    body.classList.toggle('open');
    localStorage.setItem('collapsed_' + hk, section.classList.contains('collapsed') ? '1' : '0');
    if (opening && !REDUCED_MOTION) {
      section.classList.remove('booting');
      void section.offsetWidth;
      section.classList.add('booting');
    }
  });

  updateSectionCount(hk);
  return section;
}

function buildOrbitSystem(hk) {
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
    <div class="planet-icon" style="background: radial-gradient(circle at 32% 32%, #ffffff, ${PLANET_COLORS[hk]} 42%, #000000 100%); color:${PLANET_COLORS[hk]}"></div>
  `;
  const field = sys.querySelector('.moon-field');
  const moons = [];
  for (let i = 0; i < MOON_COUNT; i++) {
    const m = document.createElement('span');
    m.className = 'moon';
    m.style.setProperty('--ma', `${(360 / MOON_COUNT) * i + 12}deg`);
    field.appendChild(m);
    moons.push(m);
  }
  sys._moons = moons;
  sys._arc = sys.querySelector('.arc-fill');
  return sys;
}

function applyStatusClass(card, promptId, hk) {
  card.classList.remove('status-done', 'status-progress', 'status-notstarted');
  card.classList.add('status-' + statusFor(promptId, hk));
}

function buildPromptCard(p, hk) {
  const card = document.createElement('article');
  card.className = 'prompt-card';
  card.dataset.card = `${p.id}|${hk}`;
  card.__prompt = p;
  card.__hk = hk;
  applyStatusClass(card, p.id, hk);

  const row = document.createElement('div');
  row.className = 'card-row';

  const wrap = document.createElement('label');
  wrap.className = 'checkwrap';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = statusFor(p.id, hk) === 'done';
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
    setStatus(p.id, hk, val);
    syncSelect(card, val);
    applyStatusClass(card, p.id, hk);
    updateSectionCount(hk);
    updateOverall();
    if (val === 'done') celebrate(checkbox, hk);
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
  statusSel.value = statusFor(p.id, hk);
  statusSel.dataset.status = statusSel.value;
  statusSel.addEventListener('click', (ev) => ev.stopPropagation());
  statusSel.addEventListener('change', () => {
    setStatus(p.id, hk, statusSel.value);
    statusSel.dataset.status = statusSel.value;
    checkbox.checked = statusSel.value === 'done';
    applyStatusClass(card, p.id, hk);
    updateSectionCount(hk);
    updateOverall();
    if (statusSel.value === 'done') celebrate(statusSel, hk);
  });
  card._sel = statusSel;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.innerHTML = `${COPY_ICON}<span>Copy prompt</span>`;
  copyBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(p.text);
    } catch {
      fallbackCopy(p.text);
    }
    copyBtn.classList.add('copied');
    const label = copyBtn.querySelector('span');
    if (label) {
      label.textContent = 'Copied \u2713';
      setTimeout(() => { label.textContent = 'Copy prompt'; }, 1600);
    }
    setTimeout(() => copyBtn.classList.remove('copied'), 1600);
  });

  row.append(wrap, title, diff, statusSel, copyBtn);

  const body = document.createElement('div');
  body.className = 'prompt-body';
  const pre = document.createElement('pre');
  pre.className = 'prompt-text';
  pre.textContent = p.text;
  body.appendChild(pre);

  row.addEventListener('click', () => body.classList.toggle('open'));

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

function updateSectionCount(hk) {
  const section = SECTIONS[hk];
  if (!section) return;
  const labelEl = section.querySelector(`[data-count="${hk}"]`);
  const sys = section.querySelector('.orbit-system');
  const done = prompts.filter((p) => statusFor(p.id, hk) === 'done').length;
  const total = prompts.length;
  if (labelEl) labelEl.textContent = `${total} TASKS \u00B7 ${done} DONE`;
  if (sys) {
    const pct = total ? done / total : 0;
    sys._arc.style.strokeDashoffset = (ARC_CIRC * (1 - pct)).toFixed(2);
    const lit = total && done === total ? MOON_COUNT : Math.floor(pct * MOON_COUNT);
    sys._moons.forEach((m, i) => m.classList.toggle('lit', i < lit));
    sys.classList.toggle('complete', !!total && done === total);
  }
  section.classList.toggle('complete', !!total && done === total);
}

function currentRank(pct) {
  if (pct >= 100) return 'OX ALPHA';
  if (pct >= 75) return 'COMMANDER';
  if (pct >= 50) return 'SPECIALIST';
  if (pct >= 25) return 'PILOT';
  return 'CADET';
}

function updateOverall() {
  let totalDone = 0;
  HARNESS_KEYS.forEach((hk) => {
    totalDone += prompts.filter((p) => statusFor(p.id, hk) === 'done').length;
    updateSectionCount(hk);
  });
  const total = HARNESS_KEYS.length * prompts.length;
  const percent = total ? Math.round((totalDone / total) * 100) : 0;
  document.getElementById('overallStats').textContent =
    `${totalDone} / ${total} TASKS COMPLETED`;
  document.getElementById('overallFill').style.width = `${percent}%`;
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
  HARNESS_KEYS.forEach((hk) => {
    const dot = document.querySelector(`.mh-dot[data-hk="${hk}"]`);
    if (!dot) return;
    const all = !!prompts.length && prompts.every((p) => statusFor(p.id, hk) === 'done');
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
  HARNESS_KEYS.forEach((hk) => {
    const d = document.createElement('button');
    d.className = 'mh-dot';
    d.dataset.hk = hk;
    d.style.color = PLANET_COLORS[hk];
    d.title = `Jump to ${HARNESS_LABELS[hk]}`;
    d.addEventListener('click', () => scrollToSection(hk));
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

function initCmdkEntries() {
  CMDK_ENTRIES = [];
  HARNESS_KEYS.forEach((hk) => {
    prompts.forEach((p) => {
      CMDK_ENTRIES.push({
        p,
        hk,
        label: `${String(p.id).padStart(2, '0')} \u00B7 ${p.title}`,
        hay: `${p.id} ${p.title} ${p.difficulty} ${HARNESS_LABELS[hk]} ${hk}`.toLowerCase(),
        color: PLANET_COLORS[hk],
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
      meta.textContent = `${entry.p.difficulty} \u00B7 ${HARNESS_LABELS[entry.hk].toUpperCase()}`;
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
    const targetCard = document.querySelector(`.prompt-card[data-card="${entry.p.id}|${entry.hk}"]`);
    if (!targetCard) return;
    const sec = SECTIONS[entry.hk];
    if (sec && sec.classList.contains('collapsed')) {
      sec.querySelector('.harness-header').click();
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
