/* SKYRUSH — HUD & overlays */
"use strict";

const UI = {
  el: {},

  init() {
    const ids = ["hud","timer","bestLine","progressFill","progressCps","splits",
      "dashPip","speedBar","hintBar","popup","cpFlash","startOverlay","pauseOverlay",
      "resultsOverlay","resMedal","resTitle","resTime","resDelta","resSplits",
      "tgtGold","tgtSilver","tgtBronze","pbNote","pauseStats","resSaveNote"];
    ids.forEach(id => this.el[id] = document.getElementById(id));

    document.getElementById("btnStart").addEventListener("click", () => Game.startRun());
    document.getElementById("btnResume").addEventListener("click", () => Game.resume());
    document.getElementById("btnRestartP").addEventListener("click", () => { Game.restart(); });
    document.getElementById("btnQuit").addEventListener("click", () => Game.toMenu());
    document.getElementById("btnAgain").addEventListener("click", () => Game.restart());
    document.getElementById("btnMenu").addEventListener("click", () => Game.toMenu());

    // medal targets on menu
    this.el.tgtGold.textContent = U.fmtTime(Game.MEDALS.gold);
    this.el.tgtSilver.textContent = U.fmtTime(Game.MEDALS.silver);
    this.el.tgtBronze.textContent = U.fmtTime(Game.MEDALS.bronze);
    this.refreshPBNote();
  },

  refreshPBNote() {
    const pb = U.store.get("pb", null);
    if (pb) {
      this.el.pbNote.classList.remove("hidden");
      const d = new Date(pb.date || Date.now());
      this.el.pbNote.textContent =
        "Personal best: " + U.fmtTime(pb.time) + "  ·  " +
        d.toLocaleDateString() + "  ·  ghost loaded — race your past self!";
    } else {
      this.el.pbNote.classList.add("hidden");
    }
  },

  show(id) { this.el[id].classList.remove("hidden"); },
  hide(id) { this.el[id].classList.add("hidden"); },

  setHUDVisible(v) { if (v) this.el.hud.classList.remove("hidden"); else this.el.hud.classList.add("hidden"); },

  setTimer(t, running) {
    this.el.timer.textContent = U.fmtTime(t);
    this.el.timer.classList.toggle("running", !!running);
  },
  setBest(t) {
    this.el.bestLine.textContent = t != null ? "PB " + U.fmtTime(t) : "PB —";
  },

  buildSplits(cps) {
    this.el.splits.innerHTML = "";
    cps.forEach((cp, i) => {
      const d = document.createElement("div");
      d.className = "split"; d.id = "split" + i;
      d.innerHTML = '<span class="nm">' + (i + 1) + ". " + cp.name + '</span><span><span class="tm">—</span></span>';
      this.el.splits.appendChild(d);
      const tick = document.createElement("i");
      tick.style.left = (((i + 1) / cps.length) * 100).toFixed(1) + "%";
      this.el.progressCps.appendChild(tick);
    });
  },

  hitSplit(i, time, deltaVsPb) {
    const d = document.getElementById("split" + i);
    if (!d) return;
    d.classList.add("hit");
    let html = '<span class="tm">' + U.fmtTime(time) + "</span>";
    if (deltaVsPb != null) {
      const up = deltaVsPb <= 0;
      html += '<span class="dl ' + (up ? "up" : "down") + '">' + U.fmtDelta(deltaVsPb) + "</span>";
    }
    d.querySelector("span:last-child").innerHTML = html;
  },

  resetSplits() {
    this.el.progressCps.innerHTML = "";
    this.buildSplits(Level.checkpoints);
  },

  setProgress(frac) { this.el.progressFill.style.width = (U.clamp(frac, 0, 1) * 100).toFixed(1) + "%"; },

  setDash(ready, frac) {
    const p = this.el.dashPip;
    p.classList.toggle("ready", ready);
    p.classList.toggle("cooling", !ready);
    p.querySelector("i").style.transform = "scaleX(" + (ready ? 1 : 1 - frac) + ")";
  },
  setSpeed(v01) { this.el.speedBar.firstElementChild.style.width = (U.clamp(v01, 0, 1) * 100).toFixed(0) + "%"; },

  popup(text, color) {
    const span = document.createElement("span");
    span.textContent = text;
    if (color) span.style.textShadow = "0 0 24px " + color + ", 0 3px 8px #000c";
    this.el.popup.appendChild(span);
    span.classList.add("show");
    setTimeout(() => span.remove(), 1500);
  },

  cpFlash() {
    this.el.cpFlash.classList.remove("go");
    void this.el.cpFlash.offsetWidth; // restart animation
    this.el.cpFlash.classList.add("go");
  },

  medalFor(time) {
    if (time <= Game.MEDALS.gold) return "gold";
    if (time <= Game.MEDALS.silver) return "silver";
    if (time <= Game.MEDALS.bronze) return "bronze";
    return "none";
  },

  showResults(time, splits, pb, isNewBest) {
    const medal = this.medalFor(time);
    this.el.resMedal.className = "resMedal " + medal;
    this.el.resMedal.querySelector("i").textContent = medal === "none" ? "·" : "★";
    this.el.resTitle.textContent = isNewBest ? "NEW RECORD!" :
      ({ gold: "GOLD RUN!", silver: "SILVER RUN", bronze: "BRONZE RUN" }[medal] || "FINISH");
    this.el.resTime.textContent = U.fmtTime(time);
    if (pb && !isNewBest) {
      const d = time - pb.time;
      this.el.resDelta.textContent = U.fmtDelta(d) + " vs PB " + U.fmtTime(pb.time);
      this.el.resDelta.className = "resDelta " + (d <= 0 ? "up" : "down");
    } else if (isNewBest) {
      this.el.resDelta.textContent = pb ? "beat " + U.fmtTime(pb.time) : "first finish recorded!";
      this.el.resDelta.className = "resDelta up";
    } else {
      this.el.resDelta.textContent = "";
    }
    // split table
    let rows = "";
    splits.forEach((s, i) => {
      let dlHtml = "";
      if (pb && pb.splits && pb.splits[i] != null) {
        const d = s.time - pb.splits[i];
        dlHtml = '<td class="' + (d <= 0 ? "up" : "down") + '">' + U.fmtDelta(d) + "</td>";
      } else dlHtml = "<td></td>";
      rows += "<tr><td>" + (i + 1) + ". " + s.name + "</td><td>" + U.fmtTime(s.time) + "</td>" + dlHtml + "</tr>";
    });
    rows += '<tr><td><b>FINAL</b></td><td><b>' + U.fmtTime(time) + "</b></td><td></td></tr>";
    this.el.resSplits.innerHTML = rows;
    this.el.resSaveNote.classList.add("hidden");
    if (isNewBest) {
      this.el.resSaveNote.classList.remove("hidden");
      this.el.resSaveNote.textContent = "Saved as personal best ✓ ghost updated — now chase it down.";
    }
    this.show("resultsOverlay");
  },

  showPause(time, cpHit, total) {
    this.el.pauseStats.innerHTML =
      "time <b>" + U.fmtTime(time) + "</b> · checkpoints <b>" + cpHit + "/" + total + "</b>";
    this.show("pauseOverlay");
  },
};
