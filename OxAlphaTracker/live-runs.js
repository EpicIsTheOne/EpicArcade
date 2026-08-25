(function () {
  const FEED = document.getElementById('benchFeed');
  if (!FEED) return;
  const rowsEl = document.getElementById('bfRows');
  const summaryEl = document.getElementById('bfSummary');
  const toggleBtn = document.getElementById('bfToggle');
  const head = document.getElementById('bfHead');
  const COLLAPSE_KEY = 'oxAlphaBenchFeedCollapsed';
  const STATUS_CLASS = {
    running: 'running',
    pass: 'pass',
    fail: 'fail',
    error: 'error',
    skipped: 'skipped',
  };
  const STATUS_LABEL = {
    running: 'RUNNING',
    pass: 'PASS',
    fail: 'FAIL',
    error: 'ERROR',
    skipped: 'SKIP',
  };
  let titles = {};
  if (Array.isArray(window.PROMPTS_DATA)) {
    window.PROMPTS_DATA.forEach((p) => { titles[p.id] = p.title; });
  }

  function timeAgo(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  let progressEl = document.getElementById('benchProgress');
  if (!progressEl) {
    progressEl = document.createElement('div');
    progressEl.id = 'benchProgress';
    progressEl.style.cssText =
      'position:fixed;top:10px;right:12px;z-index:60;font-family:Rajdhana,Rajdhani,monospace;' +
      'font-size:12px;letter-spacing:.04em;color:#9fb6c9;background:rgba(4,8,14,.72);' +
      'border:1px solid rgba(34,211,238,.25);border-radius:6px;padding:6px 10px;';
    document.body.appendChild(progressEl);
  }

  async function pollProgress() {
    try {
      const res = await fetch('api/progress', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      const hash8 = String(d.packHash || '').replace('sha256:', '').slice(0, 8);
      const parts = [`<b style=\"color:#22d3ee\">${d.promptsPassed}/${d.totalPrompts}</b> complete`];
      const bs = d.byStatus || {};
      if (bs.running) parts.push(`${bs.running} running`);
      if (bs.fail) parts.push(`${bs.fail} failed`);
      if (bs.error) parts.push(`${bs.error} error`);
      progressEl.innerHTML =
        parts.join(' <span style=\"opacity:.5\">·</span> ') +
        `<span style=\"opacity:.45\"> · pack ${hash8}${d.lastUpdate ? ' · ' + timeAgo(d.lastUpdate) : ''}</span>`;
    } catch {
      /* transient — next poll retries */
    }
  }

  function render(data) {
    const runs = data.runs || [];
    if (!runs.length) {
      FEED.hidden = true;
      return;
    }
    FEED.hidden = false;
    const parts = [];
    ['running', 'pass', 'fail', 'error', 'skipped'].forEach((st) => {
      const n = data.byStatus && data.byStatus[st];
      if (n) parts.push(`<b class="bf-c-${st}">${n}</b> ${STATUS_LABEL[st]}`);
    });
    summaryEl.innerHTML = parts.join('<i class="bf-sep"></i>');
    rowsEl.innerHTML = '';
    runs.slice(0, 8).forEach((r) => {
      const li = document.createElement('li');
      li.className = 'bf-row st-' + (STATUS_CLASS[r.status] || 'skipped');
      const dot = document.createElement('span');
      dot.className = 'bf-dot';
      const model = document.createElement('span');
      model.className = 'bf-model';
      model.textContent = r.model;
      model.title = `run: ${r.run}`;
      const mission = document.createElement('span');
      mission.className = 'bf-mission';
      const title = r.promptId != null ? (titles[r.promptId] || `#${r.promptId}`) : '(run-level)';
      mission.textContent = r.promptId != null ? `${String(r.promptId).padStart(2, '0')} · ${title}` : title;
      mission.title = r.notes || '';
      const pill = document.createElement('span');
      pill.className = 'bf-pill';
      pill.textContent = STATUS_LABEL[r.status] || String(r.status).toUpperCase();
      if (typeof r.score === 'number') {
        const score = document.createElement('span');
        score.className = 'bf-score';
        score.textContent = `${Math.round(r.score)}`;
        li.append(dot, model, mission, score, pill);
      } else {
        li.append(dot, model, mission, pill);
      }
      const ago = document.createElement('span');
      ago.className = 'bf-ago';
      ago.textContent = timeAgo(r.updatedAt);
      li.appendChild(ago);
      rowsEl.appendChild(li);
    });
  }

  async function poll() {
    try {
      const res = await fetch('api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch {
      FEED.hidden = true;
    }
  }

  const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  function applyCollapse() {
    rowsEl.classList.toggle('open', !collapsed);
    toggleBtn.textContent = collapsed ? 'SHOW' : 'HIDE';
    FEED.classList.toggle('collapsed', collapsed);
  }
  head.addEventListener('click', (ev) => {
    if (ev.target === toggleBtn || toggleBtn.contains(ev.target)) return;
    collapsed = !collapsed;
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    applyCollapse();
  });
  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    applyCollapse();
  });
  applyCollapse();
  poll();
  pollProgress();
  setInterval(poll, 5000);
  setInterval(pollProgress, 5000);
})();
