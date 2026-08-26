(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const U = DS.util;

  function $(id) { return document.getElementById(id); }

  const HUD = {
    init() {
      this.el = {
        hud: $("hud"), mode: $("hudMode"), cam: $("hudCam"), hdg: $("hudHdg"),
        thrPct: $("thrPct"), thrFill: $("thrFill"),
        batPct: $("batPct"), batFill: $("batFill"), batEst: $("batEst"),
        spd: $("spdVal"), alt: $("altVal"), vsi: $("vsiVal"),
        raceState: $("raceState"), raceTime: $("raceTime"), raceBest: $("raceBest"),
        raceGate: $("raceGate"), raceGateRow: $("raceGateRow"),
        centerMsg: $("centerMsg"), warnBox: $("warnBox"),
        flash: $("flash"), arrow: $("gateArrow"),
        introBest: $("introBest")
      };
      this.compassC = $("compass"); this.compassX = this.compassC.getContext("2d");
      this.mapC = $("minimap"); this.mapX = this.mapC.getContext("2d");
      this.horC = $("horizon"); this.horX = this.horC.getContext("2d");
      this._warns = new Map();
      this._textAcc = 0;
    },

    show(on) {
      this.el.hud.classList.toggle("hidden", !on);
    },

    setIntroBest(t) { this.el.introBest.textContent = t; },

    centerMsg(text) {
      const el = this.el.centerMsg;
      el.classList.remove("pop");
      void el.offsetWidth;
      el.textContent = text;
      el.classList.add("pop");
    },

    warn(id, text, cls, ttl) {
      const until = ttl ? performance.now() + ttl : Infinity;
      const ex = this._warns.get(id);
      if (ex && ex.text === text && ex.cls === cls) {
        if (Math.abs(ex.until - until) < 600) { ex.until = until; return; }
      }
      this._warns.set(id, { text, cls, until });
      this._renderWarns();
    },
    clearWarn(id) {
      this._warns.delete(id);
      this._renderWarns();
    },
    _renderWarns() {
      const box = this.el.warnBox;
      box.innerHTML = "";
      for (const w of this._warns.values()) {
        const d = document.createElement("div");
        d.className = "warn" + (w.cls ? " " + w.cls : "");
        d.textContent = w.text;
        box.appendChild(d);
      }
    },
    _tickWarns(now) {
      let changed = false;
      for (const [id, w] of this._warns) {
        if (now > w.until) { this._warns.delete(id); changed = true; }
      }
      if (changed) this._renderWarns();
    },

    flashRed() {
      const f = this.el.flash;
      f.style.transition = "none";
      f.style.opacity = "1";
      requestAnimationFrame(() => {
        f.style.transition = "opacity 0.55s ease-out";
        f.style.opacity = "0";
      });
    },

    update(dt, snap) {
      const now = performance.now();
      this._tickWarns(now);

      this.el.thrFill.style.transform = "scaleX(" + snap.thr.toFixed(3) + ")";
      this.el.batFill.style.transform = "scaleX(" + Math.max(0, snap.bat) / 100 + ")";
      let batCls = "bar-fill green";
      if (snap.bat <= 15) batCls = "bar-fill crit";
      else if (snap.bat <= 30) batCls = "bar-fill low";
      this.el.batFill.className = batCls;

      this._textAcc += dt;
      if (this._textAcc > 0.08) {
        this._textAcc = 0;
        this.el.thrPct.textContent = Math.round(snap.thr * 100) + "%";
        this.el.batPct.textContent = Math.max(0, Math.round(snap.bat)) + "%";
        this.el.batEst.textContent = snap.charging ? "CHARGING" : "est " + U.fmtSec(snap.batEst);
        this.el.spd.textContent = Math.round(snap.speed);
        this.el.alt.textContent = snap.alt.toFixed(1);
        const v = snap.vsi;
        this.el.vsi.textContent = (v >= 0 ? "+" : "") + v.toFixed(1);
        this.el.hdg.textContent = String(Math.round(snap.hdg)).padStart(3, "0") + "°";
        this.el.mode.textContent = snap.modeLabel;
        this.el.cam.textContent = snap.camLabel;
        this.el.raceState.textContent = snap.raceStateLabel;
        this.el.raceTime.textContent = U.fmtTime(snap.raceTime);
        this.el.raceBest.textContent = U.fmtTime(snap.best);
        this.el.raceGate.textContent = snap.gateIdx + "/" + snap.gateTotal;
        this.el.raceGateRow.style.visibility = snap.showGates ? "visible" : "hidden";
      }

      this._drawCompass(snap.hdg);
      if (snap.camFpv) {
        this.horC.style.display = "";
        this._drawHorizon(snap.pitchDeg, snap.rollDeg);
      } else {
        this.horC.style.display = "none";
      }
      this._drawMap(snap);
      this._updateArrow(snap);
    },

    _drawCompass(hdg) {
      const x = this.compassX, W = this.compassC.width, H = this.compassC.height;
      x.clearRect(0, 0, W, H);
      const ppd = W / 130;
      x.save();
      x.translate(W / 2, H - 8);
      x.font = "700 17px Consolas, monospace";
      x.textAlign = "center";
      const names = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
      for (let d = -70; d <= 70; d += 5) {
        const abs = ((hdg + d) % 360 + 360) % 360;
        const px = d * ppd;
        if (abs % 45 === 0) {
          x.fillStyle = names[abs] ? "#ffd54a" : "#9fc2da";
          x.fillText(names[abs] || abs, px, -14);
          x.fillRect(px - 1.5, -6, 3, 10);
        } else if (abs % 15 === 0) {
          x.fillStyle = "#5f7f96";
          x.fillRect(px - 1, -4, 2, 8);
        } else {
          x.fillStyle = "#3c5568";
          x.fillRect(px - 0.5, -3, 1, 6);
        }
      }
      x.restore();
      x.fillStyle = "#4fd8ff";
      x.beginPath();
      x.moveTo(W / 2 - 7, H); x.lineTo(W / 2 + 7, H); x.lineTo(W / 2, H - 10);
      x.fill();
    },

    _drawHorizon(pitchDeg, rollDeg) {
      const x = this.horX, S = this.horC.width, c = S / 2;
      const ppd = 3.4;
      x.clearRect(0, 0, S, S);
      x.save();
      x.beginPath();
      x.arc(c, c, c - 6, 0, Math.PI * 2);
      x.clip();
      x.translate(c, c);
      x.rotate(-rollDeg * Math.PI / 180);
      const py = pitchDeg * ppd;
      x.fillStyle = "#5e93c4";
      x.fillRect(-S, -S * 2 + py, S * 2, S * 2);
      x.fillStyle = "#7a6238";
      x.fillRect(-S, py, S * 2, S * 2);
      x.strokeStyle = "#ffffff"; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(-S, py); x.lineTo(S, py); x.stroke();
      x.lineWidth = 1.5; x.font = "600 13px Consolas, monospace"; x.fillStyle = "#fff";
      x.textAlign = "center";
      for (let p = -30; p <= 30; p += 15) {
        if (p === 0) continue;
        const ly = py - p * ppd;
        const wl = Math.abs(p) % 30 === 0 ? 26 : 16;
        x.beginPath(); x.moveTo(-wl, ly); x.lineTo(wl, ly); x.stroke();
        x.fillText(String(Math.abs(p)), -wl - 12, ly + 4);
        x.fillText(String(Math.abs(p)), wl + 12, ly + 4);
      }
      x.restore();
      x.strokeStyle = "#ffb347"; x.lineWidth = 3;
      x.beginPath(); x.moveTo(c - 22, c); x.lineTo(c - 7, c); x.lineTo(c - 2, c + 5);
      x.moveTo(c + 22, c); x.lineTo(c + 7, c); x.lineTo(c + 2, c + 5);
      x.stroke();
      x.beginPath(); x.arc(c, c, 2.5, 0, Math.PI * 2); x.fill();
    },

    _drawMap(snap) {
      const x = this.mapX, S = this.mapC.width, c = S / 2;
      const k = (S / 2 - 16) / 270;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, S, S);
      x.translate(c, c);

      const md = snap.mapData;
      x.lineWidth = 1;
      x.strokeStyle = "rgba(120,190,230,0.35)";
      x.beginPath();
      x.moveTo(md.start.x * k, md.start.z * k);
      for (const g of md.gates) x.lineTo(g.x * k, g.z * k);
      x.lineTo(md.finish.x * k, md.finish.z * k);
      x.stroke();

      x.strokeStyle = "rgba(255,255,255,0.25)";
      x.strokeRect(-15 * k, -15 * k, 30 * k, 30 * k);

      for (const lm of snap.landmarks) {
        x.fillStyle = lm.color;
        x.beginPath();
        x.arc(lm.x * k, lm.z * k, 2.2, 0, Math.PI * 2);
        x.fill();
      }

      x.fillStyle = "#59e0ff";
      x.fillRect(md.start.x * k - 2.5, md.start.z * k - 2.5, 5, 5);
      x.fillStyle = "#ffd54a";
      x.fillRect(md.finish.x * k - 2.5, md.finish.z * k - 2.5, 5, 5);

      for (const g of md.gates) {
        x.beginPath();
        x.arc(g.x * k, g.z * k, 3, 0, Math.PI * 2);
        if (g.state === "passed") x.fillStyle = "#2fb56a";
        else if (g.state === "next") x.fillStyle = "#ffd54a";
        else x.fillStyle = "rgba(79,216,255,0.55)";
        x.fill();
      }

      const dx = snap.droneMap.x * k, dz = snap.droneMap.z * k;
      x.save();
      x.translate(dx, dz);
      x.rotate(snap.hdg * Math.PI / 180);
      x.fillStyle = "#ff5252";
      x.beginPath();
      x.moveTo(0, -5.5); x.lineTo(4, 4.5); x.lineTo(0, 2.2); x.lineTo(-4, 4.5);
      x.closePath(); x.fill();
      x.restore();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = "#9fc2da";
      x.font = "700 9px 'Segoe UI'";
      x.textAlign = "left";
      x.fillText("N", 4, 12);
    },

    _updateArrow(snap) {
      const el = this.el.arrow;
      if (!snap.arrowTarget) { el.classList.add("hidden"); return; }
      const cam = snap.camera;
      const p = snap.arrowTarget.clone();
      const camDir = new THREE.Vector3();
      cam.getWorldDirection(camDir);
      const toT = p.sub(cam.position);
      const inFront = camDir.dot(toT) > 0;
      const proj = snap.arrowTarget.clone().project(cam);
      let nx = proj.x, ny = proj.y;
      if (!inFront) { nx = -nx; ny = -ny; }
      if (inFront && Math.abs(nx) < 0.88 && Math.abs(ny) < 0.82 && proj.z < 1) {
        el.classList.add("hidden");
        return;
      }
      const a = 0.84, b = 0.76;
      const s = 1 / Math.max(Math.abs(nx) / a, Math.abs(ny) / b, 1e-6);
      const cx = nx * s, cy = ny * s;
      const W = window.innerWidth, H = window.innerHeight;
      const px = (cx * 0.5 + 0.5) * W;
      const py = (-cy * 0.5 + 0.5) * H;
      const rot = Math.atan2(-cy, cx) * 180 / Math.PI + 90;
      el.classList.remove("hidden");
      el.style.transform = "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px) translate(-50%,-50%) rotate(" + rot.toFixed(1) + "deg)";
    }
  };

  DS.HUD = HUD;
})();
