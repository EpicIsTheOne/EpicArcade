// Blood Moon controller: clock tracking, transitions, visuals, host director.
// The pure schedule lives in bloodmoon.js; this part touches the game.
import { bmStatus, bmDaysOnline, bmTargetAlive } from './bloodmoon.js';
import { globalUniforms } from './materials.js';

const DAY_MS = 600000;

export class BloodMoon {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.intensity = 0;        // 0..1 ramp for visuals
    this.nightId = null;
    this._soloDays = 0;
    this._prevFrac = 0;
    this._lastElapsed = 0;
  }

  /** current elapsed-days value from whichever clock applies */
  _elapsedDays() {
    const g = this.game;
    if (g.net && g.net.connected && Number.isFinite(g.net.t0)) {
      return bmDaysOnline(Date.now(), g.net.t0, g.net.clockOffset);
    }
    return this._soloDays + this.game.timeOfDay;   // solo: local wrap counting
  }

  update(dt) {
    const g = this.game;

    if (!(g.net && g.net.connected)) {
      const f = this.game.timeOfDay;
      if (f < this._prevFrac - 0.5) this._soloDays++;   // wrapped past dawn
      this._prevFrac = f;
    }

    const d = this._elapsedDays();
    this._lastElapsed = d;
    const st = bmStatus(d);
    this.nightId = st.nightId;
    const wasActive = this.active;
    this.active = st.active || !!g.bmForce;

    // intensity: 40s fade-in, 15s fade-out
    const target = this.active ? 1 : 0;
    const rate = dt / (target > this.intensity ? 40 : 15);
    this.intensity += Math.sign(target - this.intensity) * Math.min(Math.abs(target - this.intensity), rate);

    // transitions
    if (this.active && !wasActive) {
      g.ui?.toast('The moon rises red — Blood Moon! Survive until dawn.');
      const isAuthority = !g.net || !g.net.connected || g.mobNet?.isHost;
      if (isAuthority) g.net?.sendChat('A Blood Moon has risen. Band together.');
    } else if (!this.active && wasActive) {
      g.ui?.toast('Dawn breaks — the siege is over.');
    }

    g.siegeActive = this.active;

    // director: host only (mirrors receive the horde via mob snapshots)
    const iAmAuthority = !g.net || !g.net.connected || g.mobNet?.isHost;
    if (g.entities) {
      g.entities.siegeMode = this.active;
      if (this.active && iAmAuthority) {
        const peers = g.net && g.net.remotes ? g.net.remotes.count() : 0;
        g.entities.siegeTick(dt, bmTargetAlive(peers + 1));
      }
    }

    applyVisuals(this.intensity);
  }
}

function applyVisuals(intensity) {
  globalUniforms.uSiege.value = intensity;
  const el = document.getElementById('vignette-siege');
  if (el) el.style.opacity = String(Math.min(0.85, intensity * 0.85));
}
