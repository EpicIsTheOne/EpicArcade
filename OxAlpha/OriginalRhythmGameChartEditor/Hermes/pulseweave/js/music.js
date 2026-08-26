/* ============================================================
   PULSEWEAVE · music.js
   Procedurally composed original track ("Neon Meridian") +
   WebAudio synthesis + offline render + live playback control.
   A single deterministic SCORE drives BOTH the audio and the
   generated charts, so charts are synced to real musical events.
   ============================================================ */
window.PW = window.PW || {};
PW.Music = (function () {
  'use strict';

  // ---------- global musical constants ----------
  const BPM = 132;
  const SPB = 60 / BPM;                 // seconds per beat
  const BEAT_SUB = 4;                   // 16th resolution
  const TAIL = 2.8;                     // seconds after last beat

  // chord voicings (midi)
  const CHORDS = {
    Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62],
    Em: [52, 55, 59], Dm: [50, 53, 57], E: [52, 56, 59]
  };

  // ---------- melodies: [startBeatInPhrase, midi, durBeats] ----------
  const MELS = {
    verse: [
      [0,69,1],[1,72,1],[2,71,1],[3,69,.5],[3.5,67,.5],
      [4,69,1.5],[6,67,1],[7,65,1],
      [8,67,1],[9,72,1],[10,71,1],[11,67,.5],[11.5,64,.5],
      [12,67,1.5],[14,69,1],[15,71,1],
      [16,69,1],[17,72,1],[18,74,1],[19,72,.5],[19.5,71,.5],
      [20,69,1.5],[22,67,1],[23,65,1],
      [24,76,.5],[24.5,74,.5],[25,72,1],[26,71,1],[27,67,1],
      [28,71,2],[30,69,2]
    ],
    pre: [
      [0,77,.5],[.5,76,.5],[1,77,1],[2,79,1.5],[3.5,76,.5],
      [4,74,.5],[4.5,76,.5],[5,79,2],[7,81,1],
      [8,81,.5],[8.5,79,.5],[9,76,1.5],[10.5,77,.5],[11,76,.5],
      [12,74,2],[14,72,1],[15,71,1],
      [16,77,.5],[16.5,76,.5],[17,77,1],[18,81,2],
      [20,79,1],[21,76,1],[22,74,1],[23,72,1],
      [24,71,1],[25,72,1],[26,74,1],[27,76,1],
      [28,68,1],[29,71,1],[30,74,2]
    ],
    chorus: [
      [0,76,.5],[.5,77,.5],[1,76,1],[2,72,1.5],[3.5,69,.5],
      [4,71,.5],[4.5,72,.5],[5,74,1.5],[6.5,71,1.5],
      [8,72,.5],[8.5,71,.5],[9,69,1.5],[10.5,76,1],[11.5,72,.5],
      [12,71,1],[13,67,1],[14,69,2],
      [16,76,.5],[16.5,77,.5],[17,76,1],[18,72,1.5],[19.5,69,.5],
      [20,71,.5],[20.5,72,.5],[21,74,1],[22,79,1],
      [24,76,.5],[24.5,74,.5],[25,72,1],[26,69,1],[27,72,1],
      [28,71,1],[29,69,3]
    ],
    bridge: [
      [0,74,3],[3,72,1],
      [4,77,2],[6,74,2],
      [8,72,2],[10,69,2],
      [12,74,3],[15,72,1],
      [16,77,2],[18,81,2],
      [20,79,2],[22,77,2],
      [24,80,2],[26,76,1],[27,74,1],
      [28,68,2],[30,71,2]
    ]
  };

  // ---------- arrangement ----------
  const SECTIONS = [
    { name:'intro',   bars:8,  prog:['Am','F','C','G'],            kick:'sparse', clap:false, hats:'intro', bass:null,     pad:true, arp:'ramp', pluck:false, lead:null },
    { name:'verseA',  bars:16, prog:['Am','F','C','G'],            kick:'groove', clap:true,  hats:'e8',    bass:'groove', pad:true, arp:null,   pluck:true,  lead:'verse' },
    { name:'preB',    bars:8,  prog:['F','G','Am','Am','F','G','E','E'], kick:'four', clap:true, hats:'pre', bass:'eighth', pad:true, arp:null,  pluck:true,  lead:'pre', fill:true },
    { name:'chorus',  bars:16, prog:['F','G','Am','Em','F','G','Am','Am'], kick:'four', clap:true, hats:'s16', bass:'drive', pad:true, arp:'on', pluck:false, lead:'chorus', fill:true },
    { name:'bridge',  bars:8,  prog:['Dm','Dm','Am','Am','Dm','Dm','E','E'], kick:'half', clap:false, hats:'sparse', bass:'whole', pad:true, arp:null, pluck:false, lead:'bridge', fill:true },
    { name:'chorus2', bars:16, prog:['F','G','Am','Em','F','G','Am','Am'], kick:'four2', clap:true, hats:'s16', bass:'drive', pad:true, arp:'on', pluck:false, lead:'chorus', lead2:true, fill:true },
    { name:'outro',   bars:4,  prog:['F','G','Am','Am'],           kick:'fade', clap:false, hats:null, bass:'whole', pad:true, arp:'fade', pluck:false, lead:null }
  ];

  let TOTAL_BARS = 0, START_BEATS = [];
  SECTIONS.forEach((s, i) => { START_BEATS[i] = TOTAL_BARS * 4; TOTAL_BARS += s.bars; });
  const TOTAL_BEATS = TOTAL_BARS * 4;
  const DURATION = TOTAL_BEATS * SPB + TAIL;

  // ============================================================
  // SCORE BUILD (deterministic; shared by renderer + chart gen)
  // ============================================================
  function buildScore() {
    const ev = []; // {kind, b(eat), ...}
    const push = (o) => ev.push(o);

    SECTIONS.forEach((s, si) => {
      const b0 = START_BEATS[si];
      const last = si === SECTIONS.length - 1;
      const nextIsDrop = si === 2 || si === 4 || si === 5; // before chorus-ish energy

      // crash + downbeat marker each section
      push({ kind:'crash', b:b0, g: si === 0 ? .5 : .9 });

      for (let bar = 0; bar < s.bars; bar++) {
        const bb = b0 + bar * 4;
        const chordName = s.prog[bar % s.prog.length];
        const chord = CHORDS[chordName];
        const rootMidi = chord[0] - 12;              // bass register
        const isLastBar = bar === s.bars - 1;

        // ---- drums ----
        let kicks = [], snares = [];
        switch (s.kick) {
          case 'sparse': if (bar >= 4) kicks = [0, 2]; break;
          case 'groove': kicks = (bar % 2 === 1) ? [0, 1.75, 2.5] : [0, 2.5]; break;
          case 'four':   kicks = [0, 1, 2, 3]; break;
          case 'four2':  kicks = [0, 1, 2, 3].concat(bar % 2 === 1 ? [2.75] : []); break;
          case 'half':   kicks = [0]; snares = [2]; break;
          case 'fade':   kicks = (isLastBar ? [] : [0]); break;
        }
        if (s.clap && !snares.length) snares = [1, 3];
        kicks.forEach(k => push({ kind:'kick', b:bb + k, g:.95 }));
        snares.forEach(k => push({ kind: s.clap ? 'clap' : 'snare', b: bb + k, g:.85 }));

        // hats
        if (s.hats === 'intro') {
          const g = .25 + .55 * (bar / s.bars);
          for (let e = 0; e < 8; e++) push({ kind:'hat', b: bb + e * .5, g: g * (e % 2 ? .7 : 1) });
        } else if (s.hats === 'e8') {
          for (let e = 0; e < 8; e++) push({ kind:'hat', b: bb + e * .5, g: e % 2 ? .55 : .8 });
        } else if (s.hats === 'pre') {
          if (bar < 4) { for (let e = 0; e < 8; e++) push({ kind:'hat', b: bb + e * .5, g: e % 2 ? .55 : .8 }); }
          else {
            for (let x = 0; x < 16; x++) push({ kind:'hat', b: bb + x * .25, g: x % 4 === 0 ? .85 : (x % 2 ? .4 : .6) });
            if (bar % 2 === 0) push({ kind:'ohat', b: bb + 3.5, g:.7 });
          }
        } else if (s.hats === 's16') {
          for (let x = 0; x < 16; x++) push({ kind:'hat', b: bb + x * .25, g: x % 4 === 0 ? .85 : (x % 2 ? .38 : .58) });
          push({ kind:'ohat', b: bb + (bar % 2 ? 3.5 : 1.5), g:.7 });
        } else if (s.hats === 'sparse') {
          for (let q = 0; q < 4; q++) push({ kind:'hat', b: bb + q, g:.3 });
        }

        // end-of-section fill + riser
        if (s.fill && isLastBar) {
          [3, 3.25, 3.5, 3.75].forEach((f, i) =>
            push({ kind:'snare', b: bb + f, g:.5 + i * .16 }));
          if (nextIsDrop || !last)
            push({ kind:'riser', b: bb + 2, d: 2 });
        }
        if (si === 0 && isLastBar) push({ kind:'riser', b: bb + 2, d: 2 });

        // ---- bass ----
        const bl = (b, m, d) => push({ kind:'bass', b: bb + b, d, midi: m });
        if (s.bass === 'groove') {
          bl(0, rootMidi, .7); bl(1.5, rootMidi, .45); bl(2.25, rootMidi, .22);
          bl(2.5, rootMidi, .45); bl(3.5, rootMidi + 12, .4);
        } else if (s.bass === 'eighth') {
          for (let e = 0; e < 8; e++) bl(e * .5, rootMidi, .42);
          bl(3.5, rootMidi + 12, .42);
        } else if (s.bass === 'drive') {
          for (let e = 0; e < 8; e++) bl(e * .5, rootMidi, .4);
          bl(3.5, rootMidi + 12, .4); bl(3.75, rootMidi, .2);
        } else if (s.bass === 'whole') {
          bl(0, rootMidi, 4);
        }

        // ---- pad ----
        if (s.pad) push({ kind:'pad', b: bb, d: 4, midis: chord });

        // ---- pluck stabs (offbeats) ----
        if (s.pluck) [.5, 1.5, 2.5, 3.5].forEach(o =>
          push({ kind:'pluck', b: bb + o, d: .3, midis: chord }));

        // ---- arp (16ths) ----
        if (s.arp) {
          const seq = [0, 1, 2, 1, 3, 1, 2, 1];
          const tones = [chord[0]+12, chord[1]+12, chord[2]+12, chord[0]+24];
          for (let x = 0; x < 16; x++) {
            let g = .16;
            if (s.arp === 'ramp') g *= Math.max(0, (bar - 3) / s.bars);
            if (s.arp === 'fade') g *= Math.max(0, 1 - bar / s.bars);
            if (g > .02) push({ kind:'arp', b: bb + x * .25, midi: tones[seq[x % 8]], g });
          }
        }
      }

      // ---- lead melody (phrase = 32 beats, repeated to fill section) ----
      if (s.lead) {
        const mel = MELS[s.lead];
        const reps = Math.floor(s.bars * 4 / 32);
        for (let r = 0; r < reps; r++)
          mel.forEach(m => push({ kind:'lead', b: b0 + r * 32 + m[0], d: m[2], midi: m[1], layer:1 }));
        if (s.lead2)
          mel.forEach(m => push({ kind:'lead', b: b0 + m[0], d: m[2], midi: m[1] - 12, layer:2 }));
      }
    });

    // final hit
    push({ kind:'crash', b: TOTAL_BEATS, g: 1 });
    push({ kind:'pad', b: TOTAL_BEATS, d: 6, midis: CHORDS.Am });
    push({ kind:'bass', b: TOTAL_BEATS, d: 6, midi: 33 });

    ev.sort((a, b) => a.b - b.b);
    return ev;
  }

  const SCORE = buildScore();

  /** Musical events relevant for charting */
  function getChartEvents() {
    return {
      bpm: BPM,
      spb: SPB,
      totalBeats: TOTAL_BEATS,
      duration: DURATION,
      sections: SECTIONS.map((s, i) => ({ name: s.name, startBar: START_BEATS[i] / 4, bars: s.bars })),
      melody: SCORE.filter(e => e.kind === 'lead' && e.layer === 1),
      drums: SCORE.filter(e => ['kick','snare','clap'].includes(e.kind)),
      score: SCORE
    };
  }

  // ============================================================
  // OFFLINE RENDER
  // ============================================================
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  async function renderSong(onProgress) {
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OfflineCtx(2, Math.ceil(DURATION * 44100), 44100);

    // master chain
    const master = ctx.createGain(); master.gain.value = .82;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 3.5;
    comp.attack.value = .004; comp.release.value = .18;
    master.connect(comp); comp.connect(ctx.destination);

    // delay bus (dotted-eighth echo)
    const delaySend = ctx.createGain(); delaySend.gain.value = 1;
    const delay = ctx.createDelay(1); delay.delayTime.value = SPB * .75;
    const delayFb = ctx.createGain(); delayFb.gain.value = .32;
    const delayFilter = ctx.createBiquadFilter(); delayFilter.type='lowpass'; delayFilter.frequency.value = 4200;
    const delayOut = ctx.createGain(); delayOut.gain.value = .19;
    delaySend.connect(delay); delay.connect(delayFilter); delayFilter.connect(delayFb);
    delayFb.connect(delay); delay.connect(delayOut); delayOut.connect(master);

    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // ---------- instrument primitives ----------
    const env = (node, t, a, peak, d, susT, rel) => {
      const p = node.gain;
      p.setValueAtTime(.0001, t);
      p.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
      if (susT !== undefined) {
        p.setValueAtTime(Math.max(.0002, peak), t + a + Math.max(0, susT - a));
        p.exponentialRampToValueAtTime(.0001, t + a + Math.max(0, susT - a) + rel);
      } else {
        p.exponentialRampToValueAtTime(.0001, t + a + d);
      }
    };

    function noiseHit(t, g, type, freq, q, dec) {
      const src = ctx.createBufferSource(); src.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || .8;
      const gn = ctx.createGain();
      env(gn, t, .002, g, dec);
      src.connect(f); f.connect(gn); gn.connect(master);
      src.start(t, Math.random() * 1.2); src.stop(t + dec + .05);
    }
    const kick = (t, g) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(44, t + .13);
      env(gn, t, .002, g, .2);
      o.connect(gn); gn.connect(master); o.start(t); o.stop(t + .25);
      noiseHit(t, g * .28, 'highpass', 3800, .7, .02);
    };
    const snare = (t, g) => {
      noiseHit(t, g * .8, 'bandpass', 1900, .9, .17);
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(210, t);
      env(gn, t, .001, g * .5, .07);
      o.connect(gn); gn.connect(master); o.start(t); o.stop(t + .1);
    };
    const clap = (t, g) => { [0, .012, .026].forEach(d => noiseHit(t + d, g * .55, 'bandpass', 1150, 1.1, .1)); };
    const hat = (t, g, open) => noiseHit(t, g * .34, 'highpass', 7600, .7, open ? .3 : .045);
    const crash = (t, g) => noiseHit(t, g * .3, 'highpass', 5200, .5, 1.5);
    const riser = (t, d) => {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(280, t);
      f.frequency.exponentialRampToValueAtTime(6400, t + d);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(.0001, t);
      gn.gain.exponentialRampToValueAtTime(.3, t + d * .92);
      gn.gain.exponentialRampToValueAtTime(.0001, t + d + .05);
      src.connect(f); f.connect(gn); gn.connect(master);
      src.start(t); src.stop(t + d + .1);
    };
    const bass = (t, midi, dur, g=.62) => {
      const f = mtof(midi);
      const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value = f / 2;
      const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.Q.value = 2;
      flt.frequency.setValueAtTime(140, t);
      flt.frequency.exponentialRampToValueAtTime(760, t + .04);
      flt.frequency.exponentialRampToValueAtTime(170, t + dur);
      const gn = ctx.createGain(); env(gn, t, .006, g, 0, dur * .85, .09);
      const g2 = ctx.createGain(); g2.gain.value = .55;
      o.connect(flt); o2.connect(g2); g2.connect(flt); flt.connect(gn); gn.connect(master);
      o.start(t); o2.start(t); o.stop(t + dur + .2); o2.stop(t + dur + .2);
    };
    const pad = (t, midis, dur, g=.05) => {
      midis.forEach(m => {
        [-6, 6].forEach(cents => {
          const o = ctx.createOscillator(); o.type='sawtooth';
          o.frequency.value = mtof(m); o.detune.value = cents;
          const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value = 950;
          const gn = ctx.createGain();
          gn.gain.setValueAtTime(.0001, t);
          gn.gain.exponentialRampToValueAtTime(g, t + .5);
          gn.gain.setValueAtTime(g, t + dur * .7);
          gn.gain.exponentialRampToValueAtTime(.0001, t + dur + .5);
          o.connect(flt); flt.connect(gn); gn.connect(master);
          o.start(t); o.stop(t + dur + .7);
        });
      });
    };
    const pluck = (t, midis, dur, g=.14) => {
      midis.forEach(m => {
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value = mtof(m);
        const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.Q.value = 1.5;
        flt.frequency.setValueAtTime(2400, t);
        flt.frequency.exponentialRampToValueAtTime(420, t + dur);
        const gn = ctx.createGain(); env(gn, t, .004, g, dur);
        o.connect(flt); flt.connect(gn); gn.connect(master);
        o.start(t); o.stop(t + dur + .1);
      });
    };
    const arp = (t, midi, g) => {
      const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value = mtof(midi);
      const gn = ctx.createGain(); env(gn, t, .003, g, .16);
      o.connect(gn); gn.connect(master); gn.connect(delaySend);
      o.start(t); o.stop(t + .22);
    };
    const lead = (t, midi, dur, g=.2) => {
      const f = mtof(midi);
      const flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.Q.value = 1;
      flt.frequency.setValueAtTime(1500, t);
      flt.frequency.exponentialRampToValueAtTime(3400, t + .08);
      const gn = ctx.createGain();
      env(gn, t, .012, g, 0, Math.max(.09, dur * .88), .1);
      [['square', -5, 1], ['square', 7, .55]].forEach(([type, cents, amp]) => {
        const o = ctx.createOscillator(); o.type=type; o.frequency.value=f; o.detune.value=cents;
        const og = ctx.createGain(); og.gain.value = amp;
        o.connect(og); og.connect(flt);
        o.start(t); o.stop(t + dur + .25);
      });
      flt.connect(gn); gn.connect(master);
      const send = ctx.createGain(); send.gain.value = .5;
      gn.connect(send); send.connect(delaySend);
    };

    // ---------- schedule score ----------
    if (onProgress) onProgress(.15);
    for (const e of SCORE) {
      const t = e.b * SPB;
      switch (e.kind) {
        case 'kick': kick(t, e.g); break;
        case 'snare': snare(t, e.g); break;
        case 'clap': clap(t, e.g); break;
        case 'hat': hat(t, e.g, false); break;
        case 'ohat': hat(t, e.g, true); break;
        case 'crash': crash(t, e.g); break;
        case 'riser': riser(t, (e.d || 2) * SPB); break;
        case 'bass': bass(t, e.midi, e.d * SPB); break;
        case 'pad': pad(t, e.midis, e.d * SPB); break;
        case 'pluck': pluck(t, e.midis, e.d * SPB); break;
        case 'arp': arp(t, e.midi, e.g); break;
        case 'lead': lead(t, e.midi, e.d * SPB, e.layer === 2 ? .12 : .2); break;
      }
    }
    if (onProgress) onProgress(.55);
    const buffer = await ctx.startRendering();
    if (onProgress) onProgress(.92);

    // waveform peaks (~20ms buckets) for editor timeline
    const bucket = Math.floor(44100 * .02);
    const nPeaks = Math.ceil(buffer.duration / bucket);
    const peaks = new Float32Array(nPeaks);
    const ch0 = buffer.getChannelData(0), ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
    for (let p = 0; p < nPeaks; p++) {
      let mx = 0;
      const s0 = p * bucket, s1 = Math.min(s0 + bucket, buffer.length);
      for (let i = s0; i < s1; i += 2) {
        const v = Math.max(Math.abs(ch0[i]), Math.abs(ch1[i]));
        if (v > mx) mx = v;
      }
      peaks[p] = mx;
    }
    if (onProgress) onProgress(1);
    return { buffer, peaks, duration: buffer.duration };
  }

  // ============================================================
  // LIVE PLAYBACK (realtime AudioContext)
  // ============================================================
  let liveCtx = null, masterGain = null, analyser = null, currentSource = null;
  let volume = .9;

  function ensureCtx() {
    if (!liveCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      liveCtx = new AC({ latencyHint: 'interactive' });
      masterGain = liveCtx.createGain();
      masterGain.gain.value = volume;
      analyser = liveCtx.createAnalyser();
      analyser.fftSize = 256;
      masterGain.connect(analyser);
      analyser.connect(liveCtx.destination);
    }
    if (liveCtx.state === 'suspended') liveCtx.resume();
    return liveCtx;
  }
  function getAnalyser() { return analyser; }

  function setVolume(v01) {
    volume = v01;
    if (masterGain) masterGain.gain.setTargetAtTime(volume, liveCtx.currentTime, .05);
  }

  /** Start playing `buffer` at `offset` seconds. Returns clock handle. */
  function playBuffer(buffer, offset = 0) {
    stopPlayback();
    const ctx = ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(masterGain);
    const startAt = ctx.currentTime + .08;
    src.start(startAt, Math.max(0, offset));
    currentSource = src;
    return {
      source: src,
      /** song position in seconds (may be negative while counting in) */
      pos() { return (ctx.currentTime - startAt) + offset; },
      stop() { try { src.stop(); } catch (e) {} },
      pause() { return ctx.suspend(); },
      resume() { return ctx.resume(); }
    };
  }

  function suspend() { if (liveCtx && liveCtx.state === 'running') return liveCtx.suspend(); return Promise.resolve(); }
  function resume() { if (liveCtx && liveCtx.state === 'suspended') return liveCtx.resume(); return Promise.resolve(); }
  function stopPlayback() {
    if (currentSource) { try { currentSource.onended = null; currentSource.stop(); } catch (e) {} currentSource = null; }
  }

  // tiny UI sounds
  function tick(high) {
    const ctx = ensureCtx();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = high ? 1568 : 1046;
    g.gain.setValueAtTime(.25, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .12);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + .14);
  }
  function uiClick() {
    const ctx = ensureCtx();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(340, t + .07);
    g.gain.setValueAtTime(.14, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .09);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + .1);
  }
  function flourish(good) {
    const ctx = ensureCtx();
    const base = good ? [69, 72, 76, 81] : [69, 67, 64];
    base.forEach((m, i) => {
      const t = ctx.currentTime + i * .1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(m + 12);
      g.gain.setValueAtTime(.16, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .4);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + .45);
    });
  }

  const SECTIONS_META = SECTIONS.map((s, i) => ({ name: s.name, startBeat: START_BEATS[i], bars: s.bars }));

  return {
    BPM, SPB, TOTAL_BEATS, DURATION, SECTIONS, SECTIONS_META,
    getChartEvents, renderSong,
    ensureCtx, getAnalyser, setVolume,
    playBuffer, suspend, resume, stopPlayback,
    tick, uiClick, flourish,
    mtof
  };
})();
