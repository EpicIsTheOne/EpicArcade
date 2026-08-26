// Party Blitz — WebAudio SFX + music loop (no assets, all synthesized).
(function () {
  const Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: localStorage.getItem('pb.muted') === '1',
    musicTimer: null, nextNote: 0, step: 0,
  };

  function ensure() {
    if (Audio.ctx) { if (Audio.ctx.state === 'suspended') Audio.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      Audio.ctx = new AC();
      Audio.master = Audio.ctx.createGain();
      Audio.master.gain.value = Audio.muted ? 0 : 1;
      Audio.master.connect(Audio.ctx.destination);
      Audio.sfxGain = Audio.ctx.createGain();
      Audio.sfxGain.gain.value = 0.5;
      Audio.sfxGain.connect(Audio.master);
      Audio.musicGain = Audio.ctx.createGain();
      Audio.musicGain.gain.value = 0.12;
      Audio.musicGain.connect(Audio.master);
      startMusic();
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type = 'square', vol = 0.5, when = 0, slide = 0) {
    if (!ensure()) return;
    const t0 = Audio.ctx.currentTime + when;
    const o = Audio.ctx.createOscillator();
    const g = Audio.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(Audio.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.3, when = 0, hp = 800) {
    if (!ensure()) return;
    const t0 = Audio.ctx.currentTime + when;
    const len = Math.max(1, (dur * Audio.ctx.sampleRate) | 0);
    const buf = Audio.ctx.createBuffer(1, len, Audio.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = Audio.ctx.createBufferSource(); src.buffer = buf;
    const f = Audio.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = Audio.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(Audio.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    click:   () => tone(660, .06, 'square', .25),
    tick:    () => tone(880, .07, 'square', .35),
    go:      () => { tone(523, .09, 'square', .4); tone(784, .18, 'square', .45, .08); },
    score:   () => { tone(659, .08, 'triangle', .5); tone(988, .14, 'triangle', .5, .07); },
    bad:     () => tone(220, .22, 'sawtooth', .4, 0, .55),
    hit:     () => { noise(.15, .4, 0, 400); tone(140, .18, 'sawtooth', .45, 0, .6); },
    elim:    () => { tone(392, .12, 'sawtooth', .4); tone(262, .2, 'sawtooth', .4, .1, .6); noise(.25, .25, .05, 300); },
    pop:     () => tone(520, .05, 'sine', .4, 0, 1.6),
    flip:    () => tone(340, .06, 'triangle', .35),
    pair:    () => { tone(587, .08, 'triangle', .45); tone(880, .16, 'triangle', .5, .08); },
    boost:   () => tone(300, .18, 'sawtooth', .3, 0, 2.4),
    stumble: () => tone(200, .16, 'sawtooth', .35, 0, .5),
    whoosh:  () => noise(.22, .18, 0, 1200),
    fanfare: () => {
      const n = [523, 659, 784, 1047];
      n.forEach((f, i) => { tone(f, .16, 'square', .42, i * .13); tone(f / 2, .16, 'triangle', .3, i * .13); });
      tone(1319, .4, 'square', .4, .52);
    },
    join:    () => { tone(440, .07, 'triangle', .3); tone(660, .1, 'triangle', .3, .06); },
    leave:   () => { tone(440, .07, 'triangle', .3); tone(330, .1, 'triangle', .3, .06); },
  };

  // ---- tiny music loop: bass + arp, 112 BPM, 16 steps
  const BPM = 112, STEP = 60 / BPM / 4;
  const BASS = [110, 110, 0, 110, 87.3, 87.3, 0, 87.3, 98, 98, 0, 98, 130.8, 130.8, 98, 82.4];
  const ARP = [440, 523, 659, 523, 349, 440, 523, 440, 392, 494, 587, 494, 523, 659, 784, 659];

  function schedule() {
    const ahead = 0.25;
    while (Audio.nextNote < Audio.ctx.currentTime + ahead) {
      const s = Audio.step % 16;
      const b = BASS[s];
      if (b) playMusicNote(b, STEP * 0.9, 'triangle', .5, Audio.nextNote);
      playMusicNote(ARP[s] * (s % 8 >= 4 ? 2 : 1), STEP * 0.55, 'square', .16, Audio.nextNote);
      if (s % 4 === 0) playMusicNoise(Audio.nextNote);
      Audio.nextNote += STEP;
      Audio.step++;
    }
  }
  function playMusicNote(f, dur, type, vol, when) {
    const o = Audio.ctx.createOscillator(), g = Audio.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g); g.connect(Audio.musicGain);
    o.start(when); o.stop(when + dur + .02);
  }
  function playMusicNoise(when) {
    const len = (0.05 * Audio.ctx.sampleRate) | 0;
    const buf = Audio.ctx.createBuffer(1, len, Audio.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = Audio.ctx.createBufferSource(); src.buffer = buf;
    const g = Audio.ctx.createGain();
    g.gain.setValueAtTime(.25, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + .05);
    src.connect(g); g.connect(Audio.musicGain);
    src.start(when);
  }
  function startMusic() {
    if (Audio.musicTimer) return;
    Audio.nextNote = Audio.ctx.currentTime + 0.1;
    Audio.musicTimer = setInterval(schedule, 120);
  }

  Audio.play = (name) => { if (SFX[name]) { ensure(); SFX[name](); } };
  Audio.unlock = ensure;
  Audio.toggleMute = () => {
    Audio.muted = !Audio.muted;
    localStorage.setItem('pb.muted', Audio.muted ? '1' : '0');
    if (Audio.master) Audio.master.gain.value = Audio.muted ? 0 : 1;
    return Audio.muted;
  };
  Audio.isMuted = () => Audio.muted;

  window.PBAudio = Audio;
})();
