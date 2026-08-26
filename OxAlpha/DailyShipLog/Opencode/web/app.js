/* Daily Ship Log frontend */
"use strict";

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

const S = {
  view: "day",
  date: null,
  month: null,
  dayData: null,
  calData: null,
  live: [],
  projects: [],
  q: "",
  hits: [],
  projPath: null,
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const pad = (n) => String(n).padStart(2, "0");
function monthOf(dateStr) { return dateStr.slice(0, 7); }

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function ago(tsMs) {
  if (!tsMs) return "";
  const s = Math.max(0, (Date.now() - tsMs) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ================= CALENDAR ================= */
async function loadCalendar() {
  try {
    S.calData = await api(`/api/calendar?month=${S.month}`);
    renderCalendar();
  } catch (e) { console.error(e); }
}

function renderCalendar() {
  const [y, m] = S.month.split("-").map(Number);
  const label = new Date(y, m - 1, 1)
    .toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
  $("#calLabel").textContent = label;

  const grid = $("#calGrid");
  grid.innerHTML = "";
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  let lead = (first.getDay() + 6) % 7; // Monday-first
  const byDate = {};
  (S.calData.days || []).forEach((d) => { byDate[d.date] = d; });
  const liveDays = new Set(
    (S.live || []).map((x) => {
      const d = new Date(x.last_activity_ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })
  );

  const prevMonthDays = new Date(y, m - 1, 0).getDate();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-day";
    let dayNum, dateStr;
    if (i < lead) {
      dayNum = prevMonthDays - lead + 1 + i;
      cell.classList.add("other");
      const pm = new Date(y, m - 2, 1);
      dateStr = `${pm.getFullYear()}-${pad(pm.getMonth() + 1)}-${pad(dayNum)}`;
    } else if (i >= lead + daysInMonth) {
      dayNum = i - (lead + daysInMonth) + 1;
      cell.classList.add("other");
      const nm = new Date(y, m, 1);
      dateStr = `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}-${pad(dayNum)}`;
    } else {
      dayNum = i - lead + 1;
      dateStr = `${S.month}-${pad(dayNum)}`;
      cell.textContent = dayNum;
      const d = byDate[dateStr];
      if (d && d.score > 0) {
        cell.classList.add("has-data");
        if (d.score >= 300) cell.classList.add("lvl3");
        else if (d.score >= 80) cell.classList.add("lvl2");
        else cell.classList.add("lvl1");
        cell.title = `${d.prompts} prompts · ${d.commits} commits · ${d.sessions} sessions`;
      }
      if (liveDays.has(dateStr)) {
        const dot = document.createElement("i");
        dot.className = "live-dot";
        cell.appendChild(dot);
      }
      if (dateStr === S.date) cell.classList.add("selected");
      if (dateStr === todayStr()) cell.classList.add("today");
      cell.addEventListener("click", () => gotoDay(dateStr));
    }
    grid.appendChild(cell);
  }
}

/* ================= DAY VIEW ================= */
async function loadDay(date) {
  try {
    S.dayData = await api(`/api/day?date=${date}`);
    renderDay();
  } catch (e) {
    $("#content").innerHTML = `<div class="empty"><div class="glyph">&#9888;</div><h4>Failed to load</h4><p>${esc(String(e))}</p></div>`;
  }
}

function statusChip(st) {
  if (!st) return "";
  return `<span class="status-chip st-${esc(st)}">${esc(st)}</span>`;
}

function renderDay() {
  const d = S.dayData;
  if (!d) return;
  const dt = new Date(d.date + "T12:00:00");
  $("#dateTitle").textContent = dt.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const s = d.summary;
  const activeToday = S.view === "day" && d.date === todayStr() ? S.live : [];

  let html = "";

  /* summary tiles */
  html += `<div class="sect"><div class="summary-strip">
    <div class="stat-tile"><div class="stat-num">${s.prompts}</div><div class="stat-lbl">PROMPTS SENT</div></div>
    <div class="stat-tile"><div class="stat-num">${s.sessions}</div><div class="stat-lbl">SESSIONS</div></div>
    <div class="stat-tile"><div class="stat-num">${s.commits}</div><div class="stat-lbl">VERIFIED COMMITS</div></div>
    <div class="stat-tile"><div class="stat-num">${s.projects.length}</div><div class="stat-lbl">PROJECTS</div></div>
  </div></div>`;

  /* active now */
  if (activeToday.length) {
    html += `<div class="sect"><div class="sect-head"><h3>ACTIVE NOW</h3><span class="sh-extra">live \u00b7 refreshes automatically</span></div>`;
    activeToday.slice(0, 6).forEach((x) => { html += liveCardHtml(x); });
    html += `</div>`;
  }

  /* projects worked */
  if (s.projects.length) {
    html += `<div class="sect"><div class="sect-head"><h3>PROJECTS WORKED ON</h3></div><div class="proj-cards">`;
    s.projects.forEach((p) => {
      html += `<div class="proj-card" data-path="${esc(p.path)}" data-act="proj">
        <div class="pc-name">${esc(p.display_name || p.name)}</div>
        <div class="pc-stats"><span><b>${p.prompts}</b> prompts</span><span><b>${p.commits}</b> commits</span>${p.fs_changes ? `<span><b>${p.fs_changes}</b> files</span>` : ""}</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  /* prompts */
  html += `<div class="sect"><div class="sect-head"><h3>PROMPTS SENT</h3><span class="sh-extra">${d.prompts.length} total</span></div>`;
  if (!d.prompts.length) {
    html += emptyHtml(d.date);
  } else {
    const seenFirst = new Set();
    d.prompts.forEach((p) => {
      const initial = p.seq === 1 && !seenFirst.has(p.session_id);
      if (p.seq === 1) seenFirst.add(p.session_id);
      html += promptCardHtml(p, initial);
    });
  }
  html += `</div>`;

  /* git + filesystem verification */
  if ((d.git && d.git.length) || (d.verified_fs && d.verified_fs.length)) {
    html += `<div class="sect"><div class="sect-head"><h3>GIT / FILE ACTIVITY</h3><span class="sh-extra">independently verified</span></div>`;
    (d.git || []).slice(-40).forEach((c) => {
      html += `<div class="git-row"><span class="git-hash">${esc(c.hash.slice(0, 7))}</span>
        <span class="git-sub" title="${esc(c.subject)}">${esc(c.subject)}</span>
        <span class="git-stat">+${c.additions}/\u2212${c.deletions} \u00b7 ${c.files_changed}f</span>
        <span class="git-repo" title="${esc(c.repo_path)}">${esc((c.repo_path || "").split("/").pop())}</span></div>`;
    });
    (d.verified_fs || []).forEach((a) => {
      html += `<div class="git-row"><span class="git-hash">\u2295</span>
        <span class="git-sub">${a.n_items} files changed under ${esc(a.project_path.split("/").pop())}</span>
        <span class="git-repo" title="${esc(a.detail)}">details</span></div>`;
    });
    html += `</div>`;
  }

  /* timeline */
  if (d.timeline.length) {
    html += `<div class="sect"><div class="sect-head"><h3>TIMELINE</h3></div><div class="timeline">`;
    d.timeline.slice().reverse().forEach((t) => {
      const time = new Date(t.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      html += `<div class="tl-item tl-${esc(t.kind)}">
        <span class="tl-time">${time}</span>
        <span class="tl-label"> ${esc(t.label)}</span>
        ${t.detail ? `<div class="tl-detail">${esc(t.detail)}</div>` : ""}
      </div>`;
    });
    html += `</div></div>`;
  }

  $("#content").innerHTML = html;
  wirePromptCards($("#content"));
}

function emptyHtml(date) {
  const isToday = date === todayStr();
  return `<div class="empty"><div class="glyph">${isToday ? "\u2693" : "\u2298"}</div>
    <h4>${isToday ? "No entries yet today" : "Quiet log for this day"}</h4>
    <p>Nothing was recorded${isToday ? " so far. Active agents will appear here." : "."}</p></div>`;
}

function promptCardHtml(p, initial) {
  const long = p.chars > 480;
  return `<div class="prompt-card" data-pid="${esc(p.id)}">
    <div class="prompt-head">
      <span class="pk-label ${initial ? "pk-initial" : "pk-followup"}">${initial ? "INITIAL PROMPT" : "FOLLOW-UP"}</span>
      <span class="pk-time">${esc(p.time || "")}</span>
      <span class="pk-proj" title="${esc(p.project_path || "")}">${esc((p.project_path || "").split("/").pop() || "")}</span>
      <span class="pk-actions">
        ${p.redacted ? '<span class="prompt-text redacted-note">redacted secrets</span>' : ""}
        <button class="pk-btn" data-act="copy">COPY</button>
      </span>
    </div>
    <div class="prompt-body">
      <div class="prompt-text ${long ? "prompt-clamp" : ""}">${esc(p.text)}</div>
      ${long ? `<button class="prompt-fade-btn" data-act="expand">EXPAND \u25bc</button>` : ""}
    </div>
  </div>`;
}

function liveCardHtml(x) {
  return `<div class="live-card" data-sid="${esc(x.id)}" data-act="livecard" title="${esc(x.project_path || "")}">
    <div class="live-top">${statusChip(x.status)}
      <span class="live-title">${esc(x.title || "(untitled)")}</span></div>
    <div class="live-sub">${esc(x.activity || "\u2026")}</div>
    <div class="live-meta"><span>${esc(x.phase || "")}</span><span>${esc(x.project_name || "")}</span><span>${ago(x.last_activity_ts)}</span>
      <span class="conf-tag">${esc(x.confidence || "")}</span></div>
  </div>`;
}

function wirePromptCards(root) {
  $$(".prompt-fade-btn", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = btn.closest(".prompt-body");
      const txt = $(".prompt-text", body);
      const open = !txt.classList.contains("prompt-clamp");
      txt.classList.toggle("prompt-clamp", open);
      btn.innerHTML = open ? "EXPAND \u25bc" : "COLLAPSE \u25b2";
    });
  });
  $$('[data-act="copy"]', root).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".prompt-card");
      const pid = card.getAttribute("data-pid");
      const p = (S.dayData.prompts || []).find((x) => x.id === pid) ||
                (S.hits || []).find(() => false);
      const text = p ? p.text : $(".prompt-text", card).textContent;
      try {
        await navigator.clipboard.writeText(text);
        toast("Prompt copied to clipboard");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast("Prompt copied"); }
        catch (e2) { toast("Copy failed"); }
        ta.remove();
      }
    });
  });
}

/* ================= LIVE ================= */
async function loadLive() {
  try {
    const res = await api("/api/live");
    S.live = res.sessions || [];
    renderLive();
    renderCalendar();
  } catch (e) { console.error(e); }
}

function renderLive() {
  const n = S.live.length;
  const pill = $("#livePill");
  pill.hidden = n === 0;
  $("#liveCount").textContent = n;
  $("#activeBadge").textContent = n;
  const list = $("#liveList");
  if (!n) {
    list.innerHTML = `<div class="muted pad">No active primary sessions.</div>`;
    return;
  }
  list.innerHTML = S.live.slice(0, 12).map(liveCardHtml).join("");
}

/* ================= PROJECTS ================= */
async function loadProjects() {
  try {
    const res = await api("/api/projects");
    S.projects = res.projects || [];
    $("#projBadge").textContent = S.projects.length;
    $("#projList").innerHTML = S.projects.slice(0, 14).map((p) =>
      `<div class="proj-row" data-path="${esc(p.path)}" data-act="projrow">
        <span class="pname" title="${esc(p.path)}">${esc(p.name)}</span>
        <span class="pstats">${p.prompts}p\u00b7${p.commits}c</span>
      </div>`).join("") || `<div class="muted pad">No projects yet.</div>`;
  } catch (e) { console.error(e); }
}

async function openProject(path) {
  S.view = "project";
  S.projPath = path;
  $("#dayNav").style.display = "none";
  $("#content").innerHTML = `<div class="empty"><div class="glyph">\u231b</div><h4>Loading project history\u2026</h4></div>`;
  try {
    const hist = await api(`/api/project?path=${encodeURIComponent(path)}`);
    renderProject(hist);
  } catch (e) {
    $("#content").innerHTML = `<div class="empty"><div class="glyph">\u2691</div><h4>Failed to load project</h4><p>${esc(String(e))}</p></div>`;
  }
}

function renderProject(hist) {
  let html = `<div class="sect"><div class="sect-head"><h3>PROJECT HISTORY</h3>
    <span class="sh-extra">${hist.total_prompts} prompts archived</span>
    <span class="spacer"></span>
    <button class="btn" id="backToDay">\u2190 BACK TO LOG</button></div>`;
  html += `<div class="pc-name" style="padding:4px 0 10px;font-size:16px">${esc(hist.name)}</div>`;
  if (!hist.days.length) {
    html += `<div class="empty"><div class="glyph">\u2691</div><h4>No recorded activity</h4></div>`;
  }
  hist.days.forEach((d) => {
    html += `<div class="session-row" style="cursor:pointer" data-date="${d.date}" data-act="gotoday">
      <div class="sr-main">
        <div class="sr-title">${esc(new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</div>
        <div class="sr-path">${d.prompts} prompts \u00b7 ${d.commits} commits</div>
        ${d.notes.map((n) => `<div class="tl-detail">\u2022 ${esc(n)}</div>`).join("")}
      </div></div>`;
  });
  html += `</div>`;
  $("#content").innerHTML = html;
  const back = $("#backToDay");
  if (back) back.addEventListener("click", () => { $("#dayNav").style.display = ""; gotoDay(S.date); });
}

/* ================= SEARCH ================= */
let searchTimer = null;
function onSearchInput(v) {
  S.q = v.trim();
  clearTimeout(searchTimer);
  if (!S.q) {
    if (S.view === "search") { $("#dayNav").style.display = ""; gotoDay(S.date); }
    return;
  }
  searchTimer = setTimeout(doSearch, 280);
}
async function doSearch() {
  if (!S.q) return;
  S.view = "search";
  $("#dayNav").style.display = "none";
  $("#content").innerHTML = `<div class="empty"><div class="glyph">\u231b</div><h4>Searching\u2026</h4></div>`;
  try {
    const res = await api(`/api/search?q=${encodeURIComponent(S.q)}`);
    S.hits = res.hits || [];
    renderSearch();
  } catch (e) {
    $("#content").innerHTML = `<div class="empty"><h4>Search failed</h4><p>${esc(String(e))}</p></div>`;
  }
}
function renderSearch() {
  let html = `<div class="sect"><div class="sect-head"><h3>SEARCH RESULTS</h3>
    <span class="sh-extra">${S.hits.length} hits for \u201c${esc(S.q)}\u201d</span>
    <span class="spacer"></span><button class="btn" id="clearSearch">CLEAR</button></div></div>`;
  if (!S.hits.length) {
    html += `<div class="empty"><div class="glyph">\u2691</div><h4>No matches</h4><p>Try another term.</p></div>`;
  }
  const rx = new RegExp(`(${S.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  S.hits.forEach((h) => {
    html += `<div class="hit" data-date="${h.date}" data-act="gotoday">
      <div class="hit-type">${esc(h.type.toUpperCase())} \u00b7 ${esc(h.date)}</div>
      <div class="hit-frag">${esc(h.fragment).replace(rx, "<mark>$1</mark>")}</div>
      <div class="hit-meta">${esc(h.session_title || "")} ${h.status ? "\u00b7 " + esc(h.status) : ""}</div>
    </div>`;
  });
  $("#content").innerHTML = html;
  const c = $("#clearSearch");
  if (c) c.addEventListener("click", () => { $("#searchInput").value = ""; S.q = ""; $("#dayNav").style.display = ""; gotoDay(S.date); });
}

/* ================= NAV ================= */
function gotoDay(date) {
  S.view = "day";
  S.date = date;
  $("#dayNav").style.display = "";
  if (monthOf(date) !== S.month) { S.month = monthOf(date); loadCalendar(); }
  else renderCalendar();
  loadDay(date);
}
function shiftDay(n) {
  const d = new Date(S.date + "T12:00:00");
  d.setDate(d.getDate() + n);
  gotoDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}
function shiftMonth(n) {
  const [y, m] = S.month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  S.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  loadCalendar();
}

/* ================= BOOT ================= */
function wire() {
  $("#prevMonth").addEventListener("click", () => shiftMonth(-1));
  $("#nextMonth").addEventListener("click", () => shiftMonth(1));
  $("#todayBtn").addEventListener("click", () => { S.q = ""; $("#searchInput").value = ""; gotoDay(todayStr()); });
  $("#prevDay").addEventListener("click", () => shiftDay(-1));
  $("#nextDay").addEventListener("click", () => shiftDay(1));
  $("#brandHome").addEventListener("click", () => gotoDay(todayStr()));
  $("#searchInput").addEventListener("input", (e) => onSearchInput(e.target.value));
  $("#refreshBtn").addEventListener("click", async () => {
    $("#refreshBtn").disabled = true;
    try {
      await api("/api/refresh", { method: "POST", body: JSON.stringify({ kind: "light" }) });
      toast("Refreshed");
      await Promise.all([loadLive(), loadCalendar()]);
      if (S.view === "day") await loadDay(S.date);
      if (S.view === "project" && S.projPath) await openProject(S.projPath);
    } finally { $("#refreshBtn").disabled = false; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#searchInput")) {
      e.preventDefault(); $("#searchInput").focus();
    }
  });
  document.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.getAttribute("data-act");
    if (act === "proj" || act === "projrow") {
      e.stopPropagation();
      openProject(t.getAttribute("data-path"));
    } else if (act === "gotoday") {
      gotoDay(t.getAttribute("data-date"));
    }
  });
  setInterval(async () => {
    if (document.hidden) return;
    await loadLive();
    if (S.view === "day" && S.date === todayStr()) await loadDay(S.date);
  }, 30000);
}

async function boot() {
  S.date = todayStr();
  S.month = monthOf(S.date);
  wire();
  renderCalendar();
  await Promise.all([loadCalendar(), loadDay(S.date), loadLive(), loadProjects()]);
}

boot();
