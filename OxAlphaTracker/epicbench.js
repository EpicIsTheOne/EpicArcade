/* Epic Bench — community feedback / prompt suggestions (prompt browser side).
   Self-contained; talks to the same tracker API as results.html. */
(function () {
  const overlay = document.getElementById("ebOverlay");
  if (!overlay) return;
  const fab = document.getElementById("ebFab");
  const msg = { fb: document.getElementById("ebFbMsg"), rq: document.getElementById("ebRqMsg") };

  function open(tab) {
    overlay.classList.add("open");
    switchTab(tab || "fb");
  }
  function close() {
    overlay.classList.remove("open");
  }
  function switchTab(tab) {
    document.querySelectorAll(".eb-tab").forEach((el) =>
      el.classList.toggle("active", el.dataset.tab === tab));
    document.getElementById("ebFb").style.display = tab === "fb" ? "" : "none";
    document.getElementById("ebRq").style.display = tab === "rq" ? "" : "none";
  }

  document.querySelectorAll(".eb-tab").forEach((el) =>
    el.addEventListener("click", () => switchTab(el.dataset.tab)));
  document.getElementById("ebClose").addEventListener("click", close);
  fab.addEventListener("click", () => open("fb"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  // cmdk opens its own palette on its hotkey; don't fight it.

  async function post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  }
  function context() {
    return { page: "prompts", title: document.title };
  }

  document.getElementById("ebFbSend").addEventListener("click", async () => {
    const { ok, d } = await post("/api/feedback", {
      category: document.getElementById("ebFbCat").value,
      title: document.getElementById("ebFbTitle").value,
      details: document.getElementById("ebFbDetails").value,
      context: context(),
    });
    msg.fb.textContent = ok ? "Received — thank you! (#" + d.id + ")" : d.error || "Failed to send.";
    if (ok) { document.getElementById("ebFbTitle").value = ""; document.getElementById("ebFbDetails").value = ""; }
  });

  document.getElementById("ebRqSend").addEventListener("click", async () => {
    const { ok, d } = await post("/api/prompt-request", {
      title: document.getElementById("ebRqTitle").value,
      idea: document.getElementById("ebRqIdea").value,
      why: document.getElementById("ebRqWhy").value,
      difficulty: document.getElementById("ebRqDiff").value,
      capability: document.getElementById("ebRqCap").value,
      context: context(),
    });
    msg.rq.textContent = ok
      ? "In the review queue (#" + d.id + "). Epic personally reviews every suggestion."
      : d.error || "Failed to send.";
    if (ok) { document.getElementById("ebRqTitle").value = ""; document.getElementById("ebRqIdea").value = ""; document.getElementById("ebRqWhy").value = ""; }
  });

  window.EB = { open, close };
})();
