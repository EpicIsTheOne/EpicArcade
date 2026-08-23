// Procedural WebAudio synth: music, SFX. No external assets. Node-safe stub.
(function (root) {
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var enabled = true, started = false;
  var seqTimer = null, step = 0;

  function ensure() {
    if (ctx) return true;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    return true;
  }
  function now() { return ctx.currentTime; }
  function env(gain, t, a, peak, d, sus) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + d);
  }
  function tone(freq, t, dur, type, peak, dest, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    env(g, t, 0.008, peak || 0.3, dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noiseBurst(t, dur, peak, filterFreq, dest) {
    var len = Math.max(1, (dur * ctx.sampleRate) | 0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain(); g.gain.value = peak || 0.3;
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t);
  }
  var SFX = {
    jump: function () { if (!ok()) return; var t = now(); tone(300, t, 0.18, 'square', 0.16, null, 640); },
    land: function () { if (!ok()) return; var t = now(); noiseBurst(t, 0.09, 0.22, 500); tone(140, t, 0.1, 'sine', 0.2, null, 90); },
    roll: function () { if (!ok()) return; var t = now(); noiseBurst(t, 0.22, 0.2, 700); },
    lane: function () { if (!ok()) return; var t = now(); tone(500, t, 0.07, 'triangle', 0.08, null, 700); },
    coin: function (n) {
      if (!ok()) return; var t = now();
      var base = 880 + Math.min(12, n || 0) * 40;
      tone(base, t, 0.09, 'square', 0.12); tone(base * 1.5, t + 0.05, 0.12, 'square', 0.1);
    },
    gem: function () { if (!ok()) return; var t = now(); [660, 880, 1320].forEach(function (f, i) { tone(f, t + i * 0.06, 0.18, 'sine', 0.16); }); },
    power: function () { if (!ok()) return; var t = now(); [440, 554, 659, 880].forEach(function (f, i) { tone(f, t + i * 0.07, 0.22, 'sawtooth', 0.1); }); },
    powerEnd: function () { if (!ok()) return; var t = now(); tone(600, t, 0.3, 'sine', 0.12, null, 200); },
    stumble: function () { if (!ok()) return; var t = now(); noiseBurst(t, 0.3, 0.4, 900); tone(200, t, 0.25, 'sawtooth', 0.2, null, 80); },
    crash: function () {
      if (!ok()) return; var t = now();
      noiseBurst(t, 0.6, 0.6, 2500); tone(160, t, 0.5, 'sawtooth', 0.3, null, 40); tone(90, t + 0.05, 0.6, 'square', 0.25, null, 30);
    },
    whistle: function () { if (!ok()) return; var t = now(); tone(2100, t, 0.35, 'sine', 0.12, null, 2400); tone(2100, t + 0.4, 0.35, 'sine', 0.12, null, 2400); },
    train: function () { if (!ok()) return; var t = now(); noiseBurst(t, 0.5, 0.12, 300); },
    ui: function () { if (!ok()) return; var t = now(); tone(700, t, 0.06, 'sine', 0.1); },
    buy: function () { if (!ok()) return; var t = now(); [523, 659, 784, 1046].forEach(function (f, i) { tone(f, t + i * 0.06, 0.15, 'triangle', 0.12); }); },
    deny: function () { if (!ok()) return; var t = now(); tone(220, t, 0.15, 'square', 0.12, null, 160); },
    mission: function () { if (!ok()) return; var t = now(); [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, t + i * 0.09, 0.25, 'sine', 0.14); }); },
    nearMiss: function () { if (!ok()) return; var t = now(); noiseBurst(t, 0.12, 0.14, 3000); }
  };
  function ok() { return enabled && ensure(); }

  // --- music: driving 4-on-floor synth loop, minor key, tempo scales with speed ---
  var SCALE = [0, 3, 5, 7, 10]; // minor pentatonic offsets
  var BASS_ROOT = 55; // A1
  function stepMusic(speedNorm) {
    var bpm = 118 + speedNorm * 62;
    var spb = 60 / bpm / 2; // 8th notes
    var t = now() + 0.05;
    var s = step % 16;
    // kick
    if (s % 4 === 0) { tone(150, t, 0.14, 'sine', 0.5, musicGain, 42); }
    // hat
    if (s % 2 === 1) noiseBurst(t, 0.04, 0.06, 7000, musicGain);
    // bass
    var bassPat = [0, 0, 3, 0, 5, 0, 3, 2];
    if (s % 2 === 0) {
      var semi = bassPat[(s / 2) % 8];
      tone(BASS_ROOT * Math.pow(2, semi / 12), t, spb * 0.9, 'sawtooth', 0.16, musicGain);
    }
    // lead arp (sparse)
    if (s % 4 === 2 || (step % 32 >= 16 && s % 2 === 0)) {
      var n = SCALE[(step * 3 + s) % SCALE.length];
      var oct = 4 + ((step >> 3) % 2);
      tone(BASS_ROOT * Math.pow(2, n / 12 + oct), t, spb * 1.4, 'square', 0.05, musicGain);
    }
    step++;
    seqTimer = setTimeout(function () { if (started) stepMusic(speedNorm); }, spb * 1000);
  }
  var api = {
    init: function () { ensure(); },
    setEnabled: function (v) { enabled = v; if (master) master.gain.value = v ? 0.55 : 0; },
    startMusic: function () { if (!ok() || started) return; started = true; step = 0; stepMusic(0); },
    stopMusic: function () { started = false; if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; } },
    updateMusic: function (speedNorm) { },
    sfx: SFX,
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
  root.AudioSys = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
