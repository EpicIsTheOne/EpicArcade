/* SKYLINE DASH — HUD + overlays */
window.PKUI = (function () {
  const $ = id => document.getElementById(id);
  const els = {
    timer: $('timerVal'), timerBox: $('timerBox'), pb: $('pbVal'), cp: $('cpVal'),
    speed: $('speedVal'), speedBox: $('speedBox'),
    pips: [...document.querySelectorAll('#pips i')],
    toast: $('toast'), stateTag: $('stateTag'),
    flash: $('flash'),
    intro: $('intro'), pause: $('pause'), finishO: $('finishO'), help: $('help'),
    finalTime: $('finalTime'), medalChip: $('medalChip'), medalName: $('medalName'),
    newPB: $('newPB'), finalPB: $('finalPB'), finalDeaths: $('finalDeaths'), finalCps: $('finalCps')
  };
  let toastTimer = null;

  function fmt(ms) {
    if (ms == null) return '--:--.--';
    const cs = Math.floor(ms / 10) % 100;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  }

  const MEDALS = { gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE', none: 'FINISHER' };

  return {
    fmt, MEDALS,
    setTimer: ms => { els.timer.textContent = fmt(ms); },
    setRunning: r => els.timerBox.classList.toggle('running', !!r),
    setPB: ms => { els.pb.textContent = fmt(ms); },
    setCp: (n, total) => { els.cp.textContent = n + ' / ' + total; },
    setSpeed: v => {
      els.speed.textContent = v.toFixed(1);
      els.speedBox.classList.toggle('fast', v > 12);
    },
    setDash: (charges, max) => {
      for (let i = 0; i < els.pips.length; i++) {
        const full = charges >= i + 1;
        els.pips[i].classList.toggle('empty', !full);
        els.pips[i].classList.toggle('charging', !full && charges > i);
      }
    },
    setState: t => { els.stateTag.textContent = t; },
    toast(msg, cls, dur) {
      els.toast.textContent = msg;
      els.toast.className = 'show' + (cls ? ' ' + cls : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { els.toast.className = ''; }, dur || 1600);
    },
    flash(color) {
      els.flash.classList.toggle('white', color === 'white');
      els.flash.style.transition = 'none';
      els.flash.style.opacity = color ? '0.55' : '0';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        els.flash.style.transition = 'opacity .45s ease-out';
        els.flash.style.opacity = '0';
      }));
    },
    show(name) { els[name].classList.remove('hidden'); },
    hide(name) { els[name].classList.add('hidden'); },
    toggleHelp() { els.help.classList.toggle('hidden'); },
    helpVisible: () => !els.help.classList.contains('hidden'),
    showFinish(data) {
      els.finalTime.textContent = fmt(data.ms);
      const medal = data.medal in MEDALS ? data.medal : 'none';
      els.medalName.textContent = MEDALS[medal];
      els.medalChip.className = 'medal ' + (medal === 'none' ? 'bronze' : medal);
      if (medal === 'none') els.medalChip.querySelector('i').style.background = '#8b93c8';
      else els.medalChip.querySelector('i').style.background = '';
      els.newPB.classList.toggle('hidden', !data.newPB);
      els.finalPB.textContent = fmt(data.pb);
      els.finalDeaths.textContent = data.deaths;
      els.finalCps.textContent = data.cps + ' / ' + data.cpTotal;
      this.show('finishO');
    },
    marker: 'SKYDASH-UI-r01'
  };
})();
