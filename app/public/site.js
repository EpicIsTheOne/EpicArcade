/* Ephix landing — brand themes, boot, static flash, hero parallax, odometer, palette */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const g = (id) => document.getElementById(id);

  /* ---------- themes (synced with tracker) : electric / paper / steel ---------- */
  const THEMES = ["electric", "paper", "steel"];
  const THEME_KEY = "oxAlphaTheme";
  function flashStatic() {
    if (REDUCED) return;
    const wf = document.querySelector(".warp-flash");
    if (!wf) return;
    wf.classList.remove("go");
    void wf.offsetWidth;
    wf.classList.add("go");
  }
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = "electric";
    document.documentElement.dataset.theme = t;
    localStorage.setItem(THEME_KEY, t);
    document.querySelectorAll(".theme-dot").forEach((d) =>
      d.classList.toggle("active", d.dataset.t === t));
    // locked-logo rule: full-color on dark, black mono on paper, white mono on steel
    document.querySelectorAll("[data-logo-auto]").forEach((img) => {
      const src = t === "paper" ? img.dataset.logoLight
        : t === "steel" ? (img.dataset.logoSteel || img.dataset.logoDark)
        : img.dataset.logoDark;
      if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
    });
  }
  (function buildThemeDots() {
    const host = g("themeDots");
    if (!host) return;
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "theme-dot";
      b.dataset.t = t;
      b.title = t.toUpperCase() + " theme";
      b.addEventListener("click", () => { applyTheme(t); flashStatic(); });
      host.appendChild(b);
    });
    applyTheme(localStorage.getItem(THEME_KEY) || "electric");
  })();

  /* ---------- hero parallax (replaces the starfield engine) ---------- */
  const collageImg = document.querySelector(".hero-collage-img");
  const slashEls = document.querySelectorAll(".hero-slash");
  if (FINE && !REDUCED && (collageImg || slashEls.length)) {
    let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
    window.addEventListener("mousemove", (e) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    function tick() {
      raf = 0;
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;
      if (collageImg) collageImg.style.transform = `translate(${(px * 10).toFixed(2)}px, ${(py * 8).toFixed(2)}px) scale(1.04)`;
      slashEls.forEach((el, i) => {
        const dir = i % 2 ? -1 : 1;
        el.style.transform = `translate(${(px * 22 * dir).toFixed(2)}px, ${(py * 16 * dir).toFixed(2)}px)`;
      });
      if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) raf = requestAnimationFrame(tick);
    }
  }

  /* ---------- boot sequence (item 1) ---------- */
  (function boot() {
    const el = g("boot");
    if (!el) return;
    const done = () => el.classList.add("done");
    if (REDUCED || sessionStorage.getItem("eb-booted")) { done(); return; }
    sessionStorage.setItem("eb-booted", "1");
    const lines = ["EPHIX v3", "ESTABLISHING UPLINK… OK", "PROMPTS ONLINE", "ARCADE ONLINE", "READY_"];
    const pre = g("boot-text");
    let li = 0, ci = 0;
    const skip = () => { done(); cleanup(); };
    function cleanup() {
      el.removeEventListener("click", skip);
      removeEventListener("keydown", keySkip);
    }
    function keySkip(e) { if (e.key === "Escape") skip(); }
    el.addEventListener("click", skip);
    addEventListener("keydown", keySkip);
    setTimeout(() => {
      (function type() {
        if (li >= lines.length) { setTimeout(() => { done(); cleanup(); }, 300); return; }
        const line = lines[li];
        if (ci < line.length) {
          pre.textContent = lines.slice(0, li).join("\n") + "\n" + line.slice(0, ++ci);
          setTimeout(type, line.includes("…") ? 14 : 30);
        } else { li++; ci = 0; setTimeout(type, 120); }
      })();
    }, 150);
  })();

  /* ---------- system sweep line (item 34) ---------- */
  setTimeout(() => document.body.classList.add("swept"), 2600);

  /* ---------- scramble decode ---------- */
  function scrambleDecode(el, delay) {
    if (!el || REDUCED) return;
    const finalText = el.textContent;
    const pool = "!<>-_\\/[]{}=+*^?#01";
    const len = finalText.length;
    const frames = Math.min(30, Math.max(12, len));
    let frame = 0;
    setTimeout(() => {
      const timer = setInterval(() => {
        frame++;
        const reveal = Math.floor((frame / frames) * len);
        let out = finalText.slice(0, reveal);
        for (let i = reveal; i < len; i++) {
          out += finalText[i] === " " ? " " : pool[Math.floor(Math.random() * pool.length)];
        }
        el.textContent = out;
        if (frame >= frames) { el.textContent = finalText; clearInterval(timer); }
      }, 30);
    }, delay || 0);
  }

  /* ---------- odometer count-up (item 4) ---------- */
  function odometer(el, target, suffix) {
    if (target == null) { el.textContent = "—"; return; }
    el.classList.add("rolling");
    const str = String(Math.round(target)) + (suffix || "");
    const digits = str.split("");
    el.innerHTML = "";
    digits.forEach((d, i) => {
      const col = document.createElement("span");
      col.className = "odo-col";
      const reel = document.createElement("span");
      reel.className = "odo-reel";
      const nums = d.match(/\d/) ? ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", d] : ["", d];
      nums.forEach((n) => {
        const s = document.createElement("span");
        s.textContent = n;
        reel.appendChild(s);
      });
      col.appendChild(reel);
      reel.style.transitionDelay = (i * 60) + "ms";
      el.appendChild(col);
      // shift by ROWS in em, not % — translateY(%) is relative to the reel's
      // own (11-row) height, which overshoots the 1.25em viewport entirely
      requestAnimationFrame(() => requestAnimationFrame(() => {
        reel.style.transform = `translateY(calc(${-1 * (nums.length - 1)} * 1.25em))`;
      }));
    });
    setTimeout(() => { el.classList.remove("rolling"); }, 1400);
  }

  /* ---------- scroll reveals (shared data-reveal system) ---------- */
  function revealScan() {
    if (REDUCED || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("js-reveal");
    const targets = document.querySelectorAll("[data-reveal]:not(.is-in)");
    if (!targets.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    targets.forEach((el, i) => { if (!el.style.getPropertyValue("--reveal-i")) el.style.setProperty("--reveal-i", Math.min(i, 9)); io.observe(el); });
  }

  /* ---------- portal 3D tilt (item 2) ---------- */
  if (FINE && !REDUCED) {
    document.querySelectorAll(".portal").forEach((portal) => {
      portal.addEventListener("mousemove", (ev) => {
        const r = portal.getBoundingClientRect();
        const nx = (ev.clientX - r.left) / r.width - 0.5;
        const ny = (ev.clientY - r.top) / r.height - 0.5;
        portal.style.transform = `perspective(750px) rotateX(${(-ny * 4).toFixed(2)}deg) rotateY(${(nx * 5).toFixed(2)}deg) translateY(-4px)`;
      });
      portal.addEventListener("mouseleave", () => { portal.style.transform = ""; });
    });
  }

  /* ---------- title warp on click (item 3) ---------- */
  const mega = g("megaTitle");
  if (mega) mega.addEventListener("click", () => flashStatic());

  /* ---------- `ephix` warp easter egg (item 20) ---------- */
  let eggBuf = "";
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); Palette.open(); return; }
    if (e.key.length !== 1) return;
    const typing = (e.target.matches && e.target.matches("input, textarea")) || e.target.isContentEditable;
    if (typing) return;
    eggBuf = (eggBuf + e.key.toLowerCase()).slice(-5);
    if (eggBuf === "ephix") {
      eggBuf = "";
      flashStatic();
      if (mega) { mega.classList.add("glitch"); setTimeout(() => mega.classList.remove("glitch"), 900); }
    }
  });

  /* ---------- health LED heartbeat (item 18) ---------- */
  function healthBeat() {
    fetch("/api/health").then((r) => r.json()).then((d) => {
      const led = g("uplink-led");
      if (!led) return;
      const lb = g("liveBadge");
      if (!d.ok) { led.classList.add("bad"); if (lb) lb.hidden = true; g("foot-note").textContent = "SIGNAL DEGRADED"; }
      else {
        led.classList.remove("bad");
        led.classList.remove("beat");
        void led.offsetWidth;
        led.classList.add("beat");
        if (lb) lb.hidden = false;
      }
    }).catch(() => {
      const led = g("uplink-led");
      if (led) led.classList.add("bad");
      const lb = g("liveBadge");
      if (lb) lb.hidden = true;
      g("foot-note").textContent = "SIGNAL LOST";
    });
  }
  healthBeat();
  setInterval(healthBeat, 30000);

  /* ---------- shared command palette (item 30) ---------- */
  const Palette = (() => {
    const overlay = g("paletteOverlay");
    const input = g("paletteInput");
    const results = g("paletteResults");
    let items = [];
    let sel = 0;
    let loaded = false;
    let open_ = false;

    async function ensureData() {
      if (loaded) return;
      results.innerHTML = "<li class='palette-empty'>LOADING INDEX…</li>";
      const [arc, prompts] = await Promise.all([
        fetch("/Arcade/api/builds").then((r) => r.json()).catch(() => null),
        fetch("/Tracker/api/prompts?fields=id,title,difficulty").then((r) => r.json()).catch(() => null),
      ]);
      items = [];
      if (arc && Array.isArray(arc.builds)) {
        arc.builds.filter((b) => b.status === "playable").forEach((b) => {
          items.push({ kind: "GAME", label: b.title, meta: "ARCADE · " + (b.model ? String(b.model).toUpperCase() : "BUILD"), url: "/Arcade/#/m/" + encodeURIComponent((String(b.model || "misc").toLowerCase().replace(/^(openrouter[-_])?(stealth[-_])?/i, ""))) + "/h/" + encodeURIComponent(b.harness || "untagged"), hay: (b.title + " game arcade " + b.model).toLowerCase() });
        });
      }
      if (prompts && Array.isArray(prompts.prompts)) {
        prompts.prompts.forEach((p) => {
          items.push({ kind: "PROMPT", label: String(p.id).padStart(2, "0") + " · " + p.title, meta: "PROMPTS · " + (p.difficulty || "").toUpperCase(), url: "/Tracker/", hay: (p.id + " " + p.title + " prompt tracker").toLowerCase() });
        });
      }
      loaded = true;
    }
    function fuzzy(q, hay) {
      let qi = 0, score = 0, streak = 0;
      for (let i = 0; i < hay.length && qi < q.length; i++) {
        if (hay[i] === q[qi]) { streak++; score += 2 + streak * 2 + (i === 0 || hay[i - 1] === " " ? 4 : 0); qi++; }
        else streak = 0;
      }
      return qi === q.length ? score : -1;
    }
    function render(q) {
      let list = items;
      if (q) list = items.map((it) => ({ it, s: fuzzy(q, it.hay) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.it);
      else list = items.slice().sort((a, b) => (a.kind === "GAME" ? -1 : 1) - (b.kind === "GAME" ? -1 : 1));
      list = list.slice(0, 12);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      results.innerHTML = "";
      if (!list.length) { results.innerHTML = "<li class='palette-empty'>NO MATCHES</li>"; return; }
      list.forEach((it, idx) => {
        const li = document.createElement("li");
        li.dataset.idx = idx;
        if (idx === sel) li.classList.add("sel");
        const sw = document.createElement("span");
        sw.className = "palette-swatch " + (it.kind === "GAME" ? "k-game" : "k-prompt");
        const lab = document.createElement("span");
        lab.className = "palette-label";
        lab.textContent = it.label;
        const meta = document.createElement("span");
        meta.className = "palette-meta";
        meta.textContent = it.meta;
        li.append(sw, lab, meta);
        li.addEventListener("mouseenter", () => { sel = idx; mark(); });
        li.addEventListener("click", () => go(it));
        results.appendChild(li);
      });
      current = list;
    }
    let current = [];
    function mark() {
      [...results.children].forEach((li, i) => li.classList.toggle("sel", i === sel));
      const s = results.children[sel];
      if (s) s.scrollIntoView({ block: "nearest" });
    }
    function go(it) { if (it) location.href = it.url; }
    function open() {
      if (open_) return;
      open_ = true;
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add("open"));
      input.value = "";
      sel = 0;
      ensureData().then(() => render(""));
      document.body.style.overflow = "hidden";
      setTimeout(() => input.focus(), 30);
    }
    function close() {
      if (!open_) return;
      open_ = false;
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      setTimeout(() => { overlay.hidden = true; }, 180);
    }
    input.addEventListener("input", () => { sel = 0; render(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, current.length - 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); go(current[sel]); }
      else if (e.key === "Escape") close();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    return { open, close };
  })();

  /* ---------- uplinks + odometers ---------- */
  const note = g("foot-note");
  let pending = 3;
  function settled(ok) {
    pending--;
    if (pending <= 0) note.textContent = ok ? "UPLINK ESTABLISHED" : "PARTIAL UPLINK";
  }

  fetch("/Tracker/api/meta").then((r) => r.json()).then((d) => {
    odometer(g("st-prompts"), d.total != null ? d.total : d.totalPrompts);
    settled(true);
  }).catch(() => settled(false));

  fetch("/Tracker/api/status").then((r) => r.json()).then((d) => {
    odometer(g("st-pass"), d.count);
    g("pm-done").textContent = `${d.count} CONFIRMED RESULTS`;
    settled(true);
  }).catch(() => settled(false));

  fetch("/Arcade/api/builds").then((r) => r.json()).then((d) => {
    odometer(g("st-ex"), d.count);
    g("pm-ex").textContent = `${d.count} EXHIBITS ON DISPLAY`;
    settled(true);
  }).catch(() => settled(false));

  odometer(g("st-models"), 3);
  setTimeout(() => { if (pending > 0) settled(false); }, 4000);

  /* scramble the hero after boot finishes (or immediately when skipped) */
  const bootEl = g("boot");
  const startScrambles = () => {
    revealScan();
    scrambleDecode(document.querySelector(".kicker-en"), 80);
    scrambleDecode(g("consoleSubtitle"), 300);
  };
  if (bootEl && !bootEl.classList.contains("done")) {
    const obs = new MutationObserver(() => {
      if (bootEl.classList.contains("done")) { obs.disconnect(); startScrambles(); }
    });
    obs.observe(bootEl, { attributes: true });
  } else startScrambles();
})();
