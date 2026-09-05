/* EpicBench landing — starfield, boot, warp, themes, odometer, palette */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const g = (id) => document.getElementById(id);

  /* ---------- themes (synced with tracker) ---------- */
  const THEMES = ["cyan", "violet", "amber"];
  const THEME_KEY = "oxAlphaTheme";
  const THEME_ACCENTS = {
    cyan: { main: "#22d3ee", soft: "#67e8f9" },
    violet: { main: "#a855f7", soft: "#d8b4fe" },
    amber: { main: "#fbbf24", soft: "#fde68a" },
  };
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = "cyan";
    const a = THEME_ACCENTS[t];
    const root = document.documentElement;
    root.style.setProperty("--cyan", a.main);
    root.style.setProperty("--cyan-soft", a.soft);
    root.style.setProperty("--violet", t === "violet" ? "#c084fc" : "#a78bfa");
    localStorage.setItem(THEME_KEY, t);
    document.querySelectorAll(".theme-dot").forEach((d) =>
      d.classList.toggle("active", d.dataset.t === t));
    // trail enabled per theme: cyan = off, others = on (override via storage)
    const stored = localStorage.getItem("ebTrail");
    root.style.setProperty("--trail", stored != null ? stored : (t === "cyan" ? "0" : "1"));
  }
  (function buildThemeDots() {
    const host = g("themeDots");
    if (!host) return;
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "theme-dot";
      b.dataset.t = t;
      b.title = t.toUpperCase() + " theme";
      b.addEventListener("click", () => applyTheme(t));
      host.appendChild(b);
    });
    applyTheme(localStorage.getItem(THEME_KEY) || "cyan");
  })();

  /* ---------- starfield (nebula + parallax + shooting stars + warp) ---------- */
  const canvas = g("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [], shooting = [];
  let W = 0, H = 0;
  let mouseX = 0, mouseY = 0, mx = 0, my = 0;
  let scrollCur = 0;
  let warpUntil = 0, warpStart = 0;
  const LAYER_F = [0.35, 0.65, 1];

  const nebula = document.createElement("canvas");
  nebula.width = nebula.height = 600;
  (function paintNebula() {
    const n = nebula.getContext("2d");
    const blob = (x, y, r, col) => {
      const grad = n.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, col);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      n.fillStyle = grad;
      n.fillRect(0, 0, 600, 600);
    };
    blob(210, 240, 240, "rgba(88,60,190,.16)");
    blob(400, 330, 200, "rgba(30,110,190,.15)");
    blob(320, 190, 140, "rgba(200,80,180,.07)");
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

  function spawnShootingStar(fromX) {
    if (shooting.length < 4) {
      shooting.push({
        x: fromX != null ? fromX : Math.random() * W,
        y: fromX != null ? -10 : Math.random() * W - H / 2 > 0 ? -10 : -10,
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
      if (wp > 0 && !REDUCED) {
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

    if (wp === 0 && Math.random() < 0.012) spawnShootingStar();
    for (let i = shooting.length - 1; i >= 0; i--) {
      const m = shooting[i];
      m.x += m.vx;
      m.y += m.vy;
      m.life -= 0.015;
      if (m.life <= 0) { shooting.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 8, m.y - m.vy * 8);
      ctx.strokeStyle = `rgba(180,220,255,${m.life})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (!REDUCED) requestAnimationFrame(draw);
  }

  function warp(duration) {
    if (REDUCED) return;
    warpStart = Date.now();
    warpUntil = warpStart + duration;
    document.body.classList.add("warp-active");
    setTimeout(() => document.body.classList.remove("warp-active"), duration + 250);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", () => { scrollCur = window.scrollY; }, { passive: true });
  if (FINE && !REDUCED) {
    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX / window.innerWidth - 0.5;
      mouseY = e.clientY / window.innerHeight - 0.5;
      // title hue shift (item 3) + decor parallax (item 17)
      const hue = (e.clientX / window.innerWidth - 0.5) * 24;
      document.documentElement.style.setProperty("--hue-shift", hue.toFixed(1) + "deg");
      const py = (e.clientY / window.innerHeight - 0.5);
      const planet = document.querySelector(".planet-earth");
      const station = document.querySelector(".station-ring");
      if (planet) planet.style.transform = `translate(${mx * 14}px, ${my * 10 + py * 6}px)`;
      if (station) station.style.transform = `translate(${mx * -8}px, ${my * -6}px)`;
    }, { passive: true });
  }
  resize();
  draw();

  /* ---------- click bursts + click meteor (item 5) ---------- */
  if (!REDUCED) {
    document.addEventListener("click", (e) => {
      spawnBurst(e.clientX, e.clientY);
      if (Math.random() < 0.18) spawnShootingStar(e.clientX);
    });
  }
  function spawnBurst(x, y) {
    if (REDUCED) return;
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("span");
      s.className = "fx-particle";
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.background = i % 3 === 0 ? "#fff" : i % 3 === 1 ? "#4ade80" : "#67e8f9";
      document.body.appendChild(s);
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 34;
      s.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist - 8}px)) scale(.15)`, opacity: 0 },
        ],
        { duration: 460 + Math.random() * 220, easing: "cubic-bezier(.1,.7,.3,1)" }
      ).onfinish = () => s.remove();
    }
  }

  /* ---------- boot sequence (item 1) ---------- */
  (function boot() {
    const el = g("boot");
    if (!el) return;
    const done = () => el.classList.add("done");
    if (REDUCED || sessionStorage.getItem("eb-booted")) { done(); return; }
    sessionStorage.setItem("eb-booted", "1");
    const lines = ["EPICBENCH v2.1", "ESTABLISHING UPLINK… OK", "TRACKER ONLINE", "ARCADE ONLINE", "READY_"];
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
      requestAnimationFrame(() => requestAnimationFrame(() => {
        reel.style.transform = `translateY(-${(nums.length - 1) * 100}%)`;
      }));
    });
    setTimeout(() => { el.classList.remove("rolling"); }, 1400);
  }

  /* ---------- scroll reveals (item 31) ---------- */
  (function revealObserver() {
    if (REDUCED || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("revealed"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".portal, .foot, .stat").forEach((el) => io.observe(el));
  })();

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
  if (mega) mega.addEventListener("click", () => {
    warp(1200);
    const wf = document.querySelector(".warp-flash");
    if (wf && !REDUCED) { wf.classList.remove("go"); void wf.offsetWidth; wf.classList.add("go"); }
  });

  /* ---------- `epic` warp easter egg (item 20) ---------- */
  let eggBuf = "";
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); Palette.open(); return; }
    if (e.key.length !== 1) return;
    const typing = (e.target.matches && e.target.matches("input, textarea")) || e.target.isContentEditable;
    if (typing) return;
    eggBuf = (eggBuf + e.key.toLowerCase()).slice(-4);
    if (eggBuf === "epic") {
      eggBuf = "";
      warp(1700);
      const wf = document.querySelector(".warp-flash");
      if (wf && !REDUCED) { wf.classList.remove("go"); void wf.offsetWidth; wf.classList.add("go"); }
      if (mega) { mega.classList.add("glitch"); setTimeout(() => mega.classList.remove("glitch"), 900); }
    }
  });

  /* ---------- cursor comet trail (item 32, theme-gated) ---------- */
  (function trail() {
    const cv = g("trail");
    if (!cv || REDUCED) return;
    const enabled = () => getComputedStyle(document.documentElement).getPropertyValue("--trail").trim() === "1";
    const cctx = cv.getContext("2d");
    let pts = [];
    let raf = 0;
    function size() { cv.width = innerWidth; cv.height = innerHeight; }
    addEventListener("resize", size);
    size();
    addEventListener("mousemove", (e) => {
      if (!enabled()) { pts.length = 0; return; }
      pts.push({ x: e.clientX, y: e.clientY, life: 1 });
      if (pts.length > 26) pts.shift();
      if (!raf) raf = requestAnimationFrame(drawTrail);
    });
    function drawTrail() {
      raf = 0;
      cctx.clearRect(0, 0, cv.width, cv.height);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--cyan-soft").trim() || "#67e8f9";
      pts.forEach((p, i) => {
        p.life -= 0.06;
        const t = i / pts.length;
        cctx.globalAlpha = Math.max(0, p.life * 0.5 * t);
        cctx.beginPath();
        cctx.arc(p.x, p.y, 1 + t * 2.4, 0, Math.PI * 2);
        cctx.fillStyle = accent;
        cctx.fill();
      });
      pts = pts.filter((p) => p.life > 0);
      if (pts.length) raf = requestAnimationFrame(drawTrail);
    }
  })();

  /* ---------- health LED heartbeat (item 18) ---------- */
  function healthBeat() {
    fetch("/api/health").then((r) => r.json()).then((d) => {
      const led = g("uplink-led");
      if (!led) return;
      if (!d.ok) { led.classList.add("bad"); g("foot-note").textContent = "SIGNAL DEGRADED"; }
      else {
        led.classList.remove("bad");
        led.classList.remove("beat");
        void led.offsetWidth;
        led.classList.add("beat");
      }
    }).catch(() => {
      const led = g("uplink-led");
      if (led) led.classList.add("bad");
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
          items.push({ kind: "PROMPT", label: String(p.id).padStart(2, "0") + " · " + p.title, meta: "TRACKER · " + (p.difficulty || "").toUpperCase(), url: "/Tracker/", hay: (p.id + " " + p.title + " prompt tracker").toLowerCase() });
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
    scrambleDecode(g("eyebrow"), 80);
    scrambleDecode(mega, 240);
    scrambleDecode(g("consoleSubtitle"), 460);
  };
  if (bootEl && !bootEl.classList.contains("done")) {
    const obs = new MutationObserver(() => {
      if (bootEl.classList.contains("done")) { obs.disconnect(); startScrambles(); }
    });
    obs.observe(bootEl, { attributes: true });
  } else startScrambles();
})();
