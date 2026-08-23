/* ============================================================
   Nyx DAW — audio engine
   Web Audio graph:  [channels] -> mixer inserts (fx chain) -> master -> out
   Sequencer: sample-accurate lookahead scheduler on the AudioContext clock.
   Offline: same graph code runs against any BaseAudioContext, enabling
   OfflineAudioContext renders for export + tests.
   Dual environment: browser global + Node require (pure logic + lazy ctx).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.NyxEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiName(m) { return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function Engine(project, ctx) {
    this.project = project;
    this.ctx = ctx || null;          // lazily created (browser)
    this.playing = false;
    this.mode = 'pattern';           // 'pattern' | 'song'
    this.bpm = project.bpm;
    this.swing = project.swing;
    this.loop = true;
    this.loopStart = 0;              // steps
    this.loopEnd = 16;               // steps
    this.position = 0;               // steps (float, song position)
    this.patternIndex = 0;
    this._nextStepTime = 0;          // AudioContext time of next scheduled step
    this._nextStep = 0;
    this._timer = null;
    this._lookahead = 0.12;          // seconds scheduled ahead
    this._interval = 25;             // ms scheduler tick
    this._activeVoices = 0;
    this._masterMeter = 0;
    this._clip = false;
    this._lastClipAt = 0;
    this._onStep = null;             // callback(step, time)
    this._onState = null;
  }

  Engine.prototype.ensureContext = function () {
    if (this.ctx) return this.ctx;
    const AC = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) throw new Error('Web Audio not available');
    this.ctx = new AC({ latencyHint: 'interactive' });
    this._buildGraph();
    return this.ctx;
  };

  /* ---------------- graph ---------------- */

  Engine.prototype._buildGraph = function () {
    const ctx = this.ctx;
    // master chain FIRST — track strips route into it during construction
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterData = new Float32Array(this.masterAnalyser.fftSize);
    this.freqData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterComp = ctx.createDynamicsCompressor();
    this.masterComp.threshold.value = -2; this.masterComp.knee.value = 6;
    this.masterComp.ratio.value = 8; this.masterComp.attack.value = 0.002; this.masterComp.release.value = 0.1;
    this.masterComp.connect(this.masterGain);
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);
    // per-track strips
    this.mixerIn = [];
    this.fxNodes = [];
    for (let i = 0; i < this.project.mixer.length; i++) this._buildTrack(i);
    this._applyAllMixer();
  };

  Engine.prototype._buildTrack = function (index) {
    const ctx = this.ctx;
    const input = ctx.createGain();       // channel strips connect here
    const pre = ctx.createGain();         // track volume
    const pan = ctx.createStereoPanner();
    input.connect(pre); pre.connect(pan);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const meterData = new Float32Array(analyser.fftSize);
    pan.connect(analyser);
    const t = this.project.mixer[index] || { volume: 0.8, pan: 0, mute: false, effects: [] };
    pre.gain.value = t.mute ? 0 : t.volume;
    pan.pan.value = t.pan || 0;

    // FX chain: input -> fx1 -> fx2 ... -> pre
    let head = input, tail = null;
    const fxNodes = [];
    (t.effects || []).forEach(function (ef) {
      if (ef.enabled === false) return;
      const unit = buildEffect(ctx, ef.type, ef.params);
      if (!unit) return;
      head.connect(unit.input);
      head = unit.output;
      fxNodes.push(unit);
    });
    head.connect(pre);

    if (index === 0) pan.connect(this.masterComp);
    else {
      // route to master via insert chain: connect pan -> master input (track 0's input)
      pan.connect(this.mixerIn[0] ? this.mixerIn[0].input : this.masterComp);
    }
    this.mixerIn[index] = { input, pre, pan, analyser, meterData, fx: fxNodes };
    this.fxNodes[index] = fxNodes;
  };

  Engine.prototype.rebuildGraph = function () {
    if (!this.ctx) return;
    // disconnect all old track heads
    for (const m of this.mixerIn) { try { m.pan.disconnect(); m.input.disconnect(); m.pre.disconnect(); } catch (e) {} }
    this.mixerIn = []; this.fxNodes = [];
    for (let i = 0; i < this.project.mixer.length; i++) this._buildTrack(i);
    this._applyAllMixer();
  };

  Engine.prototype._applyAllMixer = function () {
    for (let i = 0; i < this.mixerIn.length; i++) this.applyMixerTrack(i);
  };

  Engine.prototype.applyMixerTrack = function (index) {
    if (!this.ctx || !this.mixerIn[index]) return;
    const t = this.project.mixer[index];
    const n = this.mixerIn[index];
    const soloed = this.project.mixer.some(function (m) { return m.solo; });
    const audible = t.mute ? false : (soloed ? !!t.solo : true);
    n.pre.gain.setTargetAtTime(audible ? t.volume : 0, this.ctx.currentTime, 0.01);
    n.pan.pan.setTargetAtTime(t.pan || 0, this.ctx.currentTime, 0.01);
  };

  /** Rebuild FX chain for one mixer track (after add/remove/reorder/toggle). */
  Engine.prototype.rebuildFx = function (index) {
    if (!this.ctx || !this.mixerIn[index]) return;
    const n = this.mixerIn[index];
    const t = this.project.mixer[index];
    n.fx.forEach(function (u) { try { u.output.disconnect(); u.input.disconnect(); } catch (e) {} });
    let head = n.input, tail = null;
    const fxNodes = [];
    (t.effects || []).forEach(function (ef) {
      if (ef.enabled === false) return;
      const unit = buildEffect(this.ctx, ef.type, ef.params);
      if (!unit) return;
      head.connect(unit.input); head = unit.output;
      fxNodes.push(unit);
    }, this);
    head.connect(n.pre);
    n.fx = fxNodes; this.fxNodes[index] = fxNodes;
  };

  /* ---------------- channel voices ---------------- */

  Engine.prototype._channelAudible = function (ch) {
    if (ch.mute) return false;
    const anySolo = this.project.channels.some(function (c) { return c.solo; });
    if (anySolo && !ch.solo) return false;
    return true;
  };

  Engine.prototype.triggerChannel = function (ch, midi, time, dur, vel) {
    if (!this.ctx) return;
    if (!this._channelAudible(ch)) return;
    vel = vel == null ? 0.8 : vel;
    if (ch.type === 'drum') { this._triggerDrum(ch, time, vel); return; }
    this._triggerSynth(ch, midi, time, dur, vel);
  };

  Engine.prototype._triggerSynth = function (ch, midi, time, dur, vel) {
    const ctx = this.ctx, P = ch.params;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi + 12 * (P.octave || 0));

    const vca = ctx.createGain();
    vca.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = (P.resonance || 0);
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(ch.pan || 0, -1, 1);

    // osc 1 + osc 2
    const o1 = ctx.createOscillator(); o1.type = P.wave || 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = P.wave2 || 'square';
    const g2 = ctx.createGain(); g2.gain.value = P.wave2Level != null ? P.wave2Level : 0.35;
    o1.frequency.value = freq;
    o2.frequency.value = freq;
    o1.detune.value = -(P.detune || 0);
    o2.detune.value = (P.detune || 0);
    o1.connect(filter);
    o2.connect(g2); g2.connect(filter);

    // filter envelope (simple attack-decay to sustain offset)
    const base = ch._liveCutoff != null ? clamp(ch._liveCutoff, 40, 18000) : clamp(P.cutoff || 5000, 40, 18000);
    const envAmt = clamp(P.filterEnv || 0, 0, 12000);
    const peak = clamp(base + envAmt * vel, 40, 18000);
    const atk = clamp(P.attack || 0.005, 0.001, 4);
    const dec = clamp(P.decay || 0.2, 0.01, 4);
    const sus = clamp(P.sustain != null ? P.sustain : 0.5, 0, 1);
    const rel = clamp(P.release || 0.2, 0.01, 4);
    filter.frequency.setValueAtTime(base, time);
    filter.frequency.linearRampToValueAtTime(peak, time + atk);
    filter.frequency.setTargetAtTime(base, time + atk, dec / 3);

    // amp envelope (channel volume, possibly overridden by automation)
    const chVol = ch._liveVolume != null ? clamp(ch._liveVolume, 0, 1.5) : clamp(ch.volume != null ? ch.volume : 0.8, 0, 1.5);
    const peakGain = vel * 0.32 * chVol;
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(peakGain, time + atk);
    vca.gain.setTargetAtTime(peakGain * sus, time + atk, dec / 3);
    const end = time + Math.max(dur, 0.02);
    vca.gain.setTargetAtTime(0, end, rel / 3);
    const stopAt = end + rel * 1.5 + 0.05;

    filter.connect(vca); vca.connect(pan);
    this._connectChannelOut(ch, pan);
    o1.start(time); o2.start(time);
    o1.stop(stopAt); o2.stop(stopAt);
    this._activeVoices++;
    const self = this;
    o1.onended = function () {
      self._activeVoices--;
      try { pan.disconnect(); } catch (e) {}
    };
  };

  Engine.prototype._connectChannelOut = function (ch, node) {
    const idx = clamp(ch.mixerTrack | 0, 0, this.mixerIn.length - 1);
    node.connect(this.mixerIn[idx].input);
  };

  Engine.prototype._triggerDrum = function (ch, time, vel) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = vel;
    this._connectChannelOut(ch, out);
    switch (ch.sample) {
      case 'kick': drumKick(ctx, out, time); break;
      case 'snare': drumSnare(ctx, out, time); break;
      case 'hatClosed': drumHat(ctx, out, time, false); break;
      case 'hatOpen': drumHat(ctx, out, time, true); break;
      case 'clap': drumClap(ctx, out, time); break;
      case 'tom': drumTom(ctx, out, time); break;
      case 'rim': drumRim(ctx, out, time); break;
      default: drumKick(ctx, out, time);
    }
    const self = this;
    setTimeout(function () { try { out.disconnect(); } catch (e) {} }, Math.max(0, (time - ctx.currentTime) * 1000) + 3000);
  };

  /* ---------------- drums (synthesized, original) ---------------- */

  function drumKick(ctx, out, t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(1.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    // click transient
    const cg = ctx.createGain(); cg.gain.setValueAtTime(0.5, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    const co = ctx.createOscillator(); co.type = 'triangle'; co.frequency.setValueAtTime(900, t); co.frequency.exponentialRampToValueAtTime(300, t + 0.02);
    o.connect(g); co.connect(cg); g.connect(out); cg.connect(out);
    o.start(t); co.start(t); o.stop(t + 0.5); co.stop(t + 0.03);
  }

  function drumSnare(ctx, out, t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const noise = noiseSource(ctx, t, 0.25);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    noise.connect(bp); bp.connect(hp); hp.connect(g);
    o.connect(og); og.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.2);
  }

  function drumHat(ctx, out, t, open) {
    const dur = open ? 0.32 : 0.055;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const noise = noiseSource(ctx, t, dur + 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 1.1;
    noise.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
  }

  function drumClap(ctx, out, t) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // 3 quick bursts + tail
    [0, 0.012, 0.026].forEach(function (d) {
      g.gain.setValueAtTime(0.9, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.011);
    });
    g.gain.setValueAtTime(0.8, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const noise = noiseSource(ctx, t, 0.3);
    noise.connect(bp); bp.connect(g); g.connect(out);
  }

  function drumTom(ctx, out, t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.18);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
  }

  function drumRim(ctx, out, t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.2;
    const noise = noiseSource(ctx, t, 0.08);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 480;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    noise.connect(bp); bp.connect(g); o.connect(og); og.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.05);
  }

  let _noiseBuf = null;
  function noiseSource(ctx, startAt, dur) {
    if (!ctx._nyxNoise) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      ctx._nyxNoise = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = ctx._nyxNoise;
    src.loop = true;
    src.start(startAt, Math.random() * 0.5, dur + 0.05);
    return src;
  }

  /* ---------------- effects ---------------- */

  function buildEffect(ctx, type, params) {
    const P = params || {};
    switch (type) {
      case 'eq3': {
        const input = ctx.createGain(), output = ctx.createGain();
        const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220;
        const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.9;
        const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3800;
        input.connect(low); low.connect(mid); mid.connect(high); high.connect(output);
        return { type, input, output, params: { low, mid, high }, set: function (k, v) {
          const g = clamp(v, -18, 18);
          if (k === 'low') low.gain.value = g; else if (k === 'mid') mid.gain.value = g; else if (k === 'high') high.gain.value = g;
        }, apply: function () { low.gain.value = P.low || 0; mid.gain.value = P.mid || 0; high.gain.value = P.high || 0; } };
      }
      case 'delay': {
        const input = ctx.createGain(), output = ctx.createGain();
        const dl = ctx.createDelay(2.0); dl.delayTime.value = clamp(P.time || 0.28, 0.01, 2);
        const fb = ctx.createGain(); fb.gain.value = clamp(P.feedback != null ? P.feedback : 0.35, 0, 0.92);
        const wet = ctx.createGain(); wet.gain.value = clamp(P.mix != null ? P.mix : 0.3, 0, 1);
        const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
        input.connect(output);                       // dry
        input.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl);
        tone.connect(wet); wet.connect(output);
        return { type, input, output, set: function (k, v) {
          if (k === 'time') dl.delayTime.setTargetAtTime(clamp(v, 0.01, 2), ctx.currentTime, 0.05);
          else if (k === 'feedback') fb.gain.setTargetAtTime(clamp(v, 0, 0.92), ctx.currentTime, 0.05);
          else if (k === 'mix') wet.gain.setTargetAtTime(clamp(v, 0, 1), ctx.currentTime, 0.05);
        }, apply: function () {} };
      }
      case 'reverb': {
        const input = ctx.createGain(), output = ctx.createGain();
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(ctx, clamp(P.size != null ? P.size : 0.5, 0.05, 1), 2.6);
        const wet = ctx.createGain(); wet.gain.value = clamp(P.mix != null ? P.mix : 0.28, 0, 1);
        const dampen = ctx.createBiquadFilter(); dampen.type = 'lowpass'; dampen.frequency.value = 6500;
        input.connect(output);
        input.connect(dampen); dampen.connect(conv); conv.connect(wet); wet.connect(output);
        return { type, input, output, set: function (k, v) {
          if (k === 'size') { conv.buffer = makeImpulse(ctx, clamp(v, 0.05, 1), 2.6); }
          else if (k === 'mix') wet.gain.setTargetAtTime(clamp(v, 0, 1), ctx.currentTime, 0.05);
        }, apply: function () {} };
      }
      case 'distortion': {
        const input = ctx.createGain(), output = ctx.createGain();
        const pre = ctx.createGain(); pre.gain.value = 1;
        const ws = ctx.createWaveShaper();
        const drive = clamp(P.drive != null ? P.drive : 0.3, 0, 1);
        ws.curve = makeDriveCurve(drive);
        ws.oversample = '2x';
        const wet = ctx.createGain(); wet.gain.value = 1;
        const dry = ctx.createGain(); dry.gain.value = 1 - clamp(P.mix != null ? P.mix : 1, 0, 1) * 0.5;
        wet.gain.value = clamp(P.mix != null ? P.mix : 1, 0, 1);
        input.connect(ws); ws.connect(wet); wet.connect(output);
        input.connect(dry); dry.connect(output);
        return { type, input, output, set: function (k, v) {
          if (k === 'drive') ws.curve = makeDriveCurve(clamp(v, 0, 1));
          else if (k === 'mix') { wet.gain.value = clamp(v, 0, 1); dry.gain.value = 1 - clamp(v, 0, 1) * 0.5; }
        }, apply: function () {} };
      }
      case 'compressor': {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = clamp(P.threshold != null ? P.threshold : -22, -60, 0);
        comp.ratio.value = clamp(P.ratio || 4, 1, 20);
        comp.attack.value = clamp(P.attack || 0.005, 0, 0.5);
        comp.release.value = clamp(P.release || 0.15, 0.01, 1);
        return { type, input: comp, output: comp, set: function (k, v) {
          if (k === 'threshold') comp.threshold.value = clamp(v, -60, 0);
          else if (k === 'ratio') comp.ratio.value = clamp(v, 1, 20);
          else if (k === 'attack') comp.attack.value = clamp(v, 0, 0.5);
          else if (k === 'release') comp.release.value = clamp(v, 0.01, 1);
        }, apply: function () {} };
      }
      case 'chorus': {
        // TRUE STEREO chorus: independent L/R delay lines, quadrature LFOs,
        // merged into a 2-channel output -> real width even from mono sources.
        const input = ctx.createGain(), output = ctx.createGain();
        const merger = ctx.createChannelMerger(2);
        const dlL = ctx.createDelay(0.06), dlR = ctx.createDelay(0.06);
        dlL.delayTime.value = 0.014; dlR.delayTime.value = 0.021;
        const lfo = ctx.createOscillator(); lfo.type = 'sine';
        lfo.frequency.value = clamp(P.rate || 1.6, 0.05, 8);
        const depth = clamp(P.depth || 0.004, 0.0005, 0.02);
        const gL = ctx.createGain(), gR = ctx.createGain();
        gL.gain.value = depth; gR.gain.value = depth;
        // quadrature: second gain inverts for ~90 deg phase offset on R
        const invR = ctx.createGain(); invR.gain.value = -1;
        lfo.connect(gL); gL.connect(dlL.delayTime);
        lfo.connect(invR); invR.connect(gR); gR.connect(dlR.delayTime);
        const wet = ctx.createGain(); wet.gain.value = clamp(P.mix != null ? P.mix : 0.4, 0, 1);
        input.connect(output);                       // dry stays centered
        input.connect(dlL); dlL.connect(merger, 0, 0);   // -> L
        input.connect(dlR); dlR.connect(merger, 0, 1);   // -> R
        merger.connect(wet); wet.connect(output);
        try { lfo.start(); } catch (e) {}
        return { type, input, output, set: function (k, v) {
          if (k === 'rate') lfo.frequency.value = clamp(v, 0.05, 8);
          else if (k === 'depth') { const d = clamp(v, 0.0005, 0.02); gL.gain.value = d; gR.gain.value = d; }
          else if (k === 'mix') wet.gain.setTargetAtTime(clamp(v, 0, 1), ctx.currentTime, 0.05);
        }, apply: function () {} };
      }
    }
    return null;
  }

  function makeDriveCurve(amount) {
    const n = 1024, curve = new Float32Array(n);
    const k = 1 + amount * 90;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function makeImpulse(ctx, size, maxLen) {
    const dur = 0.15 + size * maxLen;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2 + size * 1.5);
      }
    }
    return buf;
  }

  /* ---------------- sequencer ---------------- */

  Engine.prototype.stepDur = function () { return 60 / this.bpm / 4; };  // 16th notes

  Engine.prototype.play = function () {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') return ctx.resume().then(function () {}).catch(function () {});
    if (this.playing) return;
    this.playing = true;
    this._nextStep = Math.round(this.position * 4) / 4; // snap to 1/64 for smooth seek
    this._nextStepTime = ctx.currentTime + 0.06;
    this._timer = setInterval(this._tick.bind(this), this._interval);
    this._tick();
    this._emitState();
  };

  Engine.prototype.pause = function () {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this._timer); this._timer = null;
    this.position = this._nextStep > 0 ? Math.max(0, this._nextStep - 0.0001) : this.position;
    this._emitState();
  };

  Engine.prototype.stop = function () {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.position = 0; this._nextStep = 0;
    this._emitState();
  };

  Engine.prototype.seek = function (steps) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.position = Math.max(0, steps);
    if (wasPlaying) this.play(); else this._emitState();
  };

  Engine.prototype.setPattern = function (i) {
    this.patternIndex = clamp(i | 0, 0, Math.max(0, this.project.patterns.length - 1));
    this._emitState();
  };

  Engine.prototype._tick = function () {
    const ctx = this.ctx;
    const stepDur = this.stepDur();
    while (this._nextStepTime < ctx.currentTime + this._lookahead) {
      this._scheduleStep(this._nextStep, this._nextStepTime);
      this._nextStepTime += stepDur;
      this._nextStep += 1;
    }
  };

  Engine.prototype._scheduleStep = function (step, time) {
    const proj = this.project;
    const swingOff = (step % 2 === 1) ? this.swing * this.stepDur() * 0.5 : 0;
    const t = time + swingOff;
    const stepDur = this.stepDur();

    if (this.mode === 'pattern') {
      const pat = proj.patterns[this.patternIndex];
      if (pat) this._schedulePatternNotes(pat, step % pat.length, t, stepDur, proj.channels);
      this._applyAutomation(step, t);   // automation runs against the absolute timeline in both modes
    } else {
      const pos = step % Math.max(1, proj.songLength);
      for (const track of proj.tracks) {
        for (const clip of track.clips) {
          if (pos >= clip.start && pos < clip.start + clip.length) {
            const pat = proj.patterns.find(function (p) { return p.id === clip.patternId; });
            if (pat) {
              const localStep = (((pos - clip.start) % pat.length) + pat.length) % pat.length;
              this._schedulePatternNotes(pat, localStep, t, stepDur, proj.channels);
            }
          }
        }
      }
      this._applyAutomation(pos, t);
    }
    if (this._onStep) this._onStep(step, time, this.mode === 'song' ? (step % Math.max(1, proj.songLength)) : (step % (proj.patterns[this.patternIndex] ? proj.patterns[this.patternIndex].length : 16)));
  };

  Engine.prototype._schedulePatternNotes = function (pat, localStep, t, stepDur, channels) {
    for (const chId in pat.notes) {
      const arr = pat.notes[chId];
      if (!arr || !arr.length) continue;
      const ch = channels.find(function (c) { return c.id === chId; });
      if (!ch) continue;
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (Math.floor(n.step) === Math.floor(localStep)) {
          const noteFrac = n.step - Math.floor(n.step);   // sub-step offset of the NOTE
          const dur = n.len * stepDur;
          this.triggerChannel(ch, n.key, t + noteFrac * stepDur, dur, n.vel);
        }
      }
    }
  };

  Engine.prototype._applyAutomation = function (pos, t) {
    const proj = this.project;
    for (const a of proj.automation) {
      if (a.points.length === 0) continue;
      const val = evalAutomation(a.points, pos);
      if (a.target.mixerTrack != null) {
        const trk = proj.mixer[a.target.mixerTrack];
        const node = this.mixerIn[a.target.mixerTrack];
        if (trk && node && a.target.param === 'volume') {
          const soloed = proj.mixer.some(m => m.solo);
          const audible = trk.mute ? false : (soloed ? trk.solo : true);
          node.pre.gain.setTargetAtTime(audible ? val : 0, t, 0.02);
        } else if (trk && node && a.target.param === 'pan') {
          node.pan.pan.setTargetAtTime(clamp(val, -1, 1), t, 0.02);
        }
      } else if (a.target.channelId) {
        const ch = proj.channels.find(c => c.id === a.target.channelId);
        if (!ch) continue;
        if (a.target.param === 'volume') ch._liveVolume = val;
        else if (a.target.param === 'cutoff') ch._liveCutoff = val;
        else if (a.target.param === 'pan') ch._livePan = val;
      }
    }
  };

  function evalAutomation(points, pos) {
    if (pos <= points[0].step) return points[0].value;
    for (let i = 1; i < points.length; i++) {
      if (pos <= points[i].step) {
        const a = points[i - 1], b = points[i];
        const f = (pos - a.step) / Math.max(1e-6, b.step - a.step);
        return a.value + (b.value - a.value) * f;
      }
    }
    return points[points.length - 1].value;
  }

  Engine.prototype._emitState = function () {
    if (this._onState) this._onState({ playing: this.playing, position: this.position, mode: this.mode });
  };

  /** UI poll: current audible song position (uses audio clock, not wall clock). */
  Engine.prototype.currentPosition = function () {
    if (!this.playing || !this.ctx) return this.position;
    const elapsed = (this.ctx.currentTime - this._nextStepTime) / this.stepDur();
    return this._nextStep + Math.min(0, elapsed);
  };

  /* ---------------- metering ---------------- */

  Engine.prototype.readMaster = function () {
    if (!this.ctx) return { level: 0, clip: false, freq: null };
    this.masterAnalyser.getFloatTimeDomainData(this.masterData);
    let peak = 0;
    for (let i = 0; i < this.masterData.length; i++) {
      const a = Math.abs(this.masterData[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0.99) { this._clip = true; this._lastClipAt = performance.now(); }
    else if (performance.now() - this._lastClipAt > 700) this._clip = false;
    return { level: peak, clip: this._clip, freq: this.freqData };
  };

  Engine.prototype.readTrack = function (index) {
    if (!this.ctx || !this.mixerIn[index]) return 0;
    const n = this.mixerIn[index];
    n.analyser.getFloatTimeDomainData(n.meterData);
    let peak = 0;
    for (let i = 0; i < n.meterData.length; i++) { const a = Math.abs(n.meterData[i]); if (a > peak) peak = a; }
    return peak;
  };

  /* ---------------- offline render / export ---------------- */

  /**
   * Render the song (or a pattern) offline. Returns Promise<AudioBuffer>.
   * opts: {mode:'song'|'pattern', patternIndex, fromStep, toStep, tailSeconds, sampleRate}
   */
  Engine.prototype.renderOffline = function (opts) {
    opts = opts || {};
    const proj = this.project;
    const mode = opts.mode || 'song';
    const sampleRate = opts.sampleRate || 44100;
    const from = Math.max(0, opts.fromStep | 0);
    let to = opts.toStep != null ? opts.toStep :
      (mode === 'song' ? proj.songLength : (proj.patterns[opts.patternIndex || this.patternIndex] || { length: 16 }).length);
    to = Math.max(from + 1, to);
    const tail = opts.tailSeconds != null ? opts.tailSeconds : 2.0;

    const stepDur = 60 / this.bpm / 4;
    const duration = (to - from) * stepDur + tail;

    const OfflineAC = (typeof window !== 'undefined') ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
    if (!OfflineAC) return Promise.reject(new Error('OfflineAudioContext not available'));

    const savedCtx = this.ctx, savedPlaying = this.playing;
    const octx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    // Build a shadow engine sharing project data but bound to the offline ctx.
    // _buildGraph is idempotent and does NOT touch ctx.state, so it is safe offline.
    const shadow = new Engine(proj, octx);
    shadow._buildGraph();
    shadow.mode = mode;
    shadow.bpm = this.bpm; shadow.swing = this.swing;
    if (mode === 'pattern') shadow.patternIndex = opts.patternIndex != null ? opts.patternIndex : this.patternIndex;

    // schedule every step directly (deterministic; no lookahead needed offline)
    for (let step = from; step < to; step++) {
      const time = 0.05 + (step - from) * stepDur;
      const swingOff = (step % 2 === 1) ? shadow.swing * stepDur * 0.5 : 0;
      if (mode === 'pattern') {
        const pat = proj.patterns[shadow.patternIndex];
        if (pat) shadow._schedulePatternNotes(pat, step % pat.length, time + swingOff, stepDur, proj.channels);
      } else {
        const pos = step % Math.max(1, proj.songLength);
        for (const track of proj.tracks) {
          for (const clip of track.clips) {
            if (pos >= clip.start && pos < clip.start + clip.length) {
              const pat = proj.patterns.find(function (p) { return p.id === clip.patternId; });
              if (pat) {
                const localStep = (((pos - clip.start) % pat.length) + pat.length) % pat.length;
                shadow._schedulePatternNotes(pat, localStep, time + swingOff, stepDur, proj.channels);
              }
            }
          }
        }
      }
      // automation applies in both modes against the absolute step timeline
      shadow._applyAutomation(step, time);
    }

    return octx.startRendering().then(function (buf) {
      return buf;
    }).finally(function () {
      this.ctx = savedCtx; this.playing = savedPlaying;
    }.bind(this));
  };

  /* ---------------- exports ---------------- */

  /** Chunked offline render: renders the song in 8-bar slices and concatenates
      in plain JS. Avoids the single-render CPU ceiling on long/dense songs.
      Returns Promise<AudioBuffer-like {numberOfChannels,sampleRate,length,duration,getChannelData}>. */
  Engine.prototype.renderOfflineChunked = function (opts) {
    opts = opts || {};
    const proj = this.project;
    const mode = opts.mode || 'song';
    const to = opts.toStep != null ? opts.toStep :
      (mode === 'song' ? proj.songLength : (proj.patterns[opts.patternIndex != null ? opts.patternIndex : this.patternIndex] || { length: 16 }).length);
    const CHUNK = 128;   // steps per chunk (8 bars)
    const tail = opts.tailSeconds != null ? opts.tailSeconds : 2;
    const sampleRate = opts.sampleRate || 44100;

    const chunks = [];
    const self = this;
    let p = Promise.resolve();
    for (let from = 0; from < to; from += CHUNK) {
      (function (f, t) {
        const isLast = t >= to;
        p = p.then(function () {
          return self.renderOffline({ mode, patternIndex: opts.patternIndex, fromStep: f, toStep: t, tailSeconds: isLast ? tail : 0.5, sampleRate });
        }).then(function (buf) { chunks.push(buf); });
      })(from, Math.min(to, from + CHUNK));
    }
    return p.then(function () {
      // overlap-add stitch: each non-final chunk rendered with 0.5s tail; that
      // tail is MIXED into the start of the next chunk so (a) reverb/delay
      // releases continue seamlessly and (b) total timing stays exact.
      const TAIL_SEC = 0.5;
      const overlap = Math.floor(TAIL_SEC * sampleRate);
      let total = 0;
      for (let i = 0; i < chunks.length; i++) total += chunks[i].length - (i > 0 ? overlap : 0);
      const outChans = [new Float32Array(total), new Float32Array(total)];
      let off = 0;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const start = i === 0 ? 0 : off - overlap;
        for (let ch = 0; ch < 2; ch++) {
          const src = c.getChannelData(Math.min(ch, c.numberOfChannels - 1));
          const dst = outChans[ch];
          for (let j = 0; j < src.length; j++) {
            const o = start + j;
            if (i === 0 && j < src.length) dst[o] = src[j];
            else if (o < total) dst[o] += src[j];   // overlap-add
          }
        }
        off = start + c.length;
      }
      return {
        numberOfChannels: 2, sampleRate: sampleRate, length: total,
        duration: total / sampleRate,
        getChannelData: function (i) { return outChans[i]; }
      };
    });
  };

  return {
    Engine, midiToFreq, midiName, NOTE_NAMES, buildEffect, makeDriveCurve,
    drumKick, drumSnare, drumHat, drumClap
  };
});
