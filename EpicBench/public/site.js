/* EpicBench landing — tracker-grade starfield + scramble + live uplinks */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- starfield (nebula + parallax + shooting stars) ---------- */
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [], shooting = [];
  let W = 0, H = 0;
  let mouseX = 0, mouseY = 0, mx = 0, my = 0;
  let scrollCur = 0;
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

  function draw() {
    ctx.clearRect(0, 0, W, H);

    mx += (mouseX - mx) * 0.055;
    my += (mouseY - my) * 0.055;

    const driftX = (Date.now() * 0.004) % (W + 600);
    ctx.globalAlpha = 0.75;
    ctx.drawImage(nebula, -driftX * 0.3, H * 0.12, 600, 600);
    ctx.drawImage(nebula, W - driftX * 0.22, -H * 0.08, 520, 520);
    ctx.globalAlpha = 1;

    for (const s of stars) {
      s.tw += s.speed;
      const f = LAYER_F[s.layer];
      let px = s.x + mx * f * 24;
      let py = s.y + my * f * 24 - scrollCur * f * 0.35;
      py = ((py % H) + H) % H;
      px = ((px % W) + W) % W;
      const alpha = 0.35 + Math.sin(s.tw) * 0.38;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }

    spawnShootingStar();
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
    if (!REDUCED) requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.addEventListener(
    "scroll",
    () => { scrollCur = window.scrollY; },
    { passive: true }
  );
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !REDUCED) {
    window.addEventListener(
      "mousemove",
      (e) => {
        mouseX = e.clientX / window.innerWidth - 0.5;
        mouseY = e.clientY / window.innerHeight - 0.5;
      },
      { passive: true }
    );
  }
  resize();
  draw();

  /* ---------- scramble decode (tracker style) ---------- */
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
        if (frame >= frames) {
          el.textContent = finalText;
          clearInterval(timer);
        }
      }, 30);
    }, delay || 0);
  }
  scrambleDecode(document.getElementById("eyebrow"), 100);
  scrambleDecode(document.getElementById("megaTitle"), 250);
  scrambleDecode(document.getElementById("consoleSubtitle"), 450);

  /* ---------- count-up ---------- */
  function countUp(el, target, suffix) {
    if (target == null) { el.textContent = "—"; return; }
    const dur = 700, t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + (suffix || "");
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- uplinks ---------- */
  const note = document.getElementById("foot-note");
  let pending = 3;
  function settled(ok) {
    pending--;
    if (pending <= 0) note.textContent = ok ? "UPLINK ESTABLISHED" : "PARTIAL UPLINK";
  }
  const g = (id) => document.getElementById(id);

  fetch("/Tracker/api/meta").then((r) => r.json()).then((d) => {
    countUp(g("st-prompts"), d.total != null ? d.total : d.totalPrompts);
    settled(true);
  }).catch(() => settled(false));

  fetch("/Tracker/api/status").then((r) => r.json()).then((d) => {
    countUp(g("st-pass"), d.count);
    g("pm-done").textContent = `${d.count} CONFIRMED RESULTS`;
    settled(true);
  }).catch(() => settled(false));

  fetch("/Arcade/api/builds").then((r) => r.json()).then((d) => {
    countUp(g("st-ex"), d.count);
    g("pm-ex").textContent = `${d.count} EXHIBITS ON DISPLAY`;
    settled(true);
  }).catch(() => settled(false));

  g("st-models").textContent = "2";
  setTimeout(() => { if (pending > 0) settled(false); }, 4000);
})();
