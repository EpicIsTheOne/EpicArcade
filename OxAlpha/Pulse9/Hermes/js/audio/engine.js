/* PULSE-9 audio engine
 * One graph builder used by BOTH the live AudioContext and OfflineAudioContext rendering,
 * so export/tests verify exactly what live playback plays.
 *
 * Graph: [instrument voices] -> channel gain/pan -> mixer strip (insert FX chain) -> master chain -> destination
 */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  /* ================= FX builders =================
   * Each factory: (ctx, paramsObj) -> {input, output, update(params), dispose()}
   */

  const FX_DEFS = {
    delay: {
      label: 'Delay', defaults: { time: 0.28, feedback: 0.35, mix: 0.25 },
      build(ctx, p) {
        const input = ctx.createGain(), output = ctx.createGain();
        const wet = ctx.createGain(); wet.gain.value = p.mix;
        const dry = ctx.createGain(); dry.gain.value = 1;
        const dl = ctx.createDelay(2.0); dl.delayTime.value = clamp(p.time, 0.01, 2);
        const fb = ctx.createGain(); fb.gain.value = clamp(p.feedback, 0, 0.92);
        input.connect(dry).connect(output);
        input.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(output);
        return {
          input, output,
          update(q) {
            dl.delayTime.setTargetAtTime(clamp(q.time, 0.01, 2), ctx.currentTime, 0.03);
            fb.gain.setTargetAtTime(clamp(q.feedback, 0, 0.92), ctx.currentTime, 0.03);
            wet.gain.setTargetAtTime(clamp(q.mix, 0, 1), ctx.currentTime, 0.03);
          },
          dispose() {},
        };
      },
    },
    reverb: {
      label: 'Reverb', defaults: { size: 0.5, damp: 0.5, mix: 0.3 },
      build(ctx, p, noiseBuf) {
        // simple multi-tap FDN-ish reverb from a short noise IR convolver
        const input = ctx.createGain(), output = ctx.createGain();
        const dry = ctx.createGain(); dry.gain.value = 1;
        const conv = ctx.createConvolver();
        conv.buffer = makeIR(ctx, clamp(p.size, 0.05, 1), clamp(p.damp, 0, 1), noiseBuf);
        const wet = ctx.createGain(); wet.gain.value = p.mix;
        const pre = ctx.createBiquadFilter(); pre.type = 'lowpass'; pre.frequency.value = 8000;
        input.connect(dry).connect(output);
        input.connect(pre).connect(conv).connect(wet).connect(output);
        return {
          input, output,
          update(q) {
            conv.buffer = makeIR(ctx, clamp(q.size, 0.05, 1), clamp(q.damp, 0, 1), noiseBuf);
            wet.gain.setTargetAtTime(clamp(q.mix, 0, 1), ctx.currentTime, 0.05);
          },
          dispose() { conv.buffer = null; },
        };
      },
    },
    filter: {
      label: 'Filter', defaults: { type: 'lowpass', cutoff: 12000, resonance: 1 },
      build(ctx, p) {
        const f = ctx.createBiquadFilter();
        f.type = ['lowpass', 'highpass', 'bandpass'].includes(p.type) ? p.type : 'lowpass';
        f.frequency.value = clamp(p.cutoff, 30, 20000);
        f.Q.value = clamp(p.resonance, 0.0001, 24);
        return {
          input: f, output: f,
          update(q) {
            f.type = ['lowpass', 'highpass', 'bandpass'].includes(q.type) ? q.type : 'lowpass';
            f.frequency.setTargetAtTime(clamp(q.cutoff, 30, 20000), ctx.currentTime, 0.02);
            f.Q.setTargetAtTime(clamp(q.resonance, 0.0001, 24), ctx.currentTime, 0.02);
          },
          dispose() {},
        };
      },
    },
    distortion: {
      label: 'Distortion', defaults: { drive: 0.3, tone: 0.6, level: 0.8 },
      build(ctx, p) {
        const ws = ctx.createWaveShaper();
        const curve = P9.driveCurve(clamp(p.drive, 0, 1));
        ws.curve = curve; ws.oversample = '2x';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.value = 1200 + clamp(p.tone, 0, 1) * 11000;
        const out = ctx.createGain(); out.gain.value = clamp(p.level, 0, 1.5);
        ws.connect(lp).connect(out);
        return {
          input: ws, output: out,
          update(q) {
            ws.curve = P9.driveCurve(clamp(q.drive, 0, 1));
            lp.frequency.setTargetAtTime(1200 + clamp(q.tone, 0, 1) * 11000, ctx.currentTime, 0.02);
            out.gain.setTargetAtTime(clamp(q.level, 0, 1.5), ctx.currentTime, 0.02);
          },
          dispose() { ws.curve = null; },
        };
      },
    },
    compressor: {
      label: 'Compressor', defaults: { threshold: -20, ratio: 4, attack: 0.005, release: 0.15 },
      build(ctx, p) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = clamp(p.threshold, -60, 0);
        comp.ratio.value = clamp(p.ratio, 1, 20);
        comp.attack.value = clamp(p.attack, 0.001, 0.5);
        comp.release.value = clamp(p.release, 0.02, 1);
        return {
          input: comp, output: comp,
          update(q) {
            comp.threshold.value = clamp(q.threshold, -60, 0);
            comp.ratio.value = clamp(q.ratio, 1, 20);
            comp.attack.value = clamp(q.attack, 0.001, 0.5);
            comp.release.value = clamp(q.release, 0.02, 1);
          },
          dispose() {},
        };
      },
    },
    chorus: {
      label: 'Chorus', defaults: { rate: 1.2, depth: 0.0035, mix: 0.4 },
      build(ctx, p) {
        const input = ctx.createGain(), output = ctx.createGain();
        const dry = ctx.createGain(); dry.gain.value = 1;
        const mkVoice = () => {
          const dl = ctx.createDelay(0.06); dl.delayTime.value = 0.012;
          const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = p.rate;
          const lg = ctx.createGain(); lg.gain.value = clamp(p.depth, 0, 0.02);
          lfo.connect(lg).connect(dl.delayTime);
          lfo.start();
          return { dl, lfo };
        };
        const vL = mkVoice(), vR = mkVoice();
        vR.lfo.frequency.value = p.rate * 0.83;
        const panL = ctx.createStereoPanner(); panL.pan.value = -0.7;
        const panR = ctx.createStereoPanner(); panR.pan.value = 0.7;
        const wet = ctx.createGain(); wet.gain.value = p.mix;
        input.connect(dry).connect(output);
        input.connect(vL.dl); vL.dl.connect(panL).connect(wet);
        input.connect(vR.dl); vR.dl.connect(panR).connect(wet);
        wet.connect(output);
        let alive = true;
        return {
          input, output,
          update(q) {
            if (!alive) return;
            vL.lfo.frequency.setTargetAtTime(q.rate, ctx.currentTime, 0.05);
            vR.lfo.frequency.setTargetAtTime(q.rate * 0.83, ctx.currentTime, 0.05);
            lg_set(vL, q.depth); lg_set(vR, q.depth);
            wet.gain.setTargetAtTime(clamp(q.mix, 0, 1), ctx.currentTime, 0.05);
          },
          dispose() { alive = false; try { vL.lfo.stop(); vR.lfo.stop(); } catch (e) {} },
        };
      },
    },
  };

  function lg_set(v, d) { /* helper kept separate for clarity */ v.lg.gain.setTargetAtTime(clamp(d, 0, 0.02), v.lg.gain.context.currentTime, 0.05); }

  /** Small exponential-decay stereo-ish impulse response for the reverb convolver. */
  function makeIR(ctx, sizeSec, damp, noiseBuf) {
    const len = Math.max(256, Math.floor(ctx.sampleRate * (0.15 + sizeSec * 2)));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let s = 12345 + c * 777;
      const rnd = () => { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return (s & 0xffff) / 0x8000 - 1; };
      let z1 = 0;
      const dampCoef = 0.1 + damp * 0.85;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.2 + sizeSec * 2);
        const white = rnd();
        z1 += dampCoef * (white - z1); // one-pole lowpass = damping
        d[i] = z1 * env;
      }
      // tiny predelay burst for definition
      d[0] += 0.35;
    }
    return buf;
  }

  const FX_LIST = Object.keys(FX_DEFS);

  /* ================= instrument voice builders ================= */

  /**
   * Build one note voice for melodic channels (synth/bass/keys).
   * Returns {output, stop(t)} — stop schedules release.
   */
  function buildMelodicVoice(ctx, ch, pitch, vel, time, durStepsToSec, dest) {
    const prm = Object.assign(P9.defaultParams(ch.type), ch.params || {});
    const freq = P9.midiToFreq(pitch);
    const out = ctx.createGain();

    // amp envelope
    const a = Math.max(0.001, prm.attack), d = Math.max(0.01, prm.decay),
      s = clamp(prm.sustain, 0, 1), r = Math.max(0.01, prm.release);
    const peak = vel;
    const susLevel = peak * s;

    // per-oscillator mix
    const gA = ctx.createGain(), gB = ctx.createGain();
    gA.gain.value = 1 - prm.mix * 0.5;
    gB.gain.value = prm.mix;

    // filter with envelope
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = clamp(prm.resonance, 0.0001, 24);
    const baseCut = clamp(prm.cutoff, 40, 18000);
    const envAmt = clamp(prm.filterEnv, 0, 12000);

    const unison = clamp(prm.unison | 0, 1, 3);
    const spread = clamp(prm.spread, 0, 1);
    const oscs = [];

    const mkOsc = (type, detuneCents, panVal, gainNode) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detuneCents;
      let last = o;
      if (ctx.createStereoPanner && panVal !== 0) {
        const pn = ctx.createStereoPanner(); pn.pan.value = panVal;
        o.connect(pn); last = pn;
      }
      last.connect(gainNode);
      oscs.push(o);
      return o;
    };

    const glideT = clamp(prm.glide, 0, 0.3);
    if (unison === 1) {
      mkOsc(prm.waveA, 0, 0, gA);
      if ((prm.mix || 0) > 0.001) mkOsc(prm.waveB, prm.detune || 0, 0, gB);
    } else {
      const offs = unison === 2 ? [-1, 1] : [-1, 0, 1];
      for (const k of offs) {
        const cents = k * (prm.detune || 8);
        const panv = spread * k * 0.8;
        mkOsc(prm.waveA, cents, panv, gA);
      }
      if ((prm.mix || 0) > 0.001) mkOsc(prm.waveB, -(prm.detune || 8) * 0.5, 0, gB);
    }

    // start all oscillators at note-on
    for (const o of oscs) { try { o.start(time); } catch (e) {} }

    gA.connect(filt); gB.connect(filt);
    filt.connect(out); out.connect(dest);

    // envelope scheduling
    out.gain.setValueAtTime(0, time);
    out.gain.linearRampToValueAtTime(peak, time + a);
    out.gain.linearRampToValueAtTime(susLevel, time + a + d);
    // filter env
    filt.frequency.setValueAtTime(baseCut, time);
    if (envAmt > 10) {
      filt.frequency.linearRampToValueAtTime(clamp(baseCut + envAmt, 40, 19000), time + a);
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, baseCut), time + a + d);
    }
    if (glideT > 0.001) {
      // subtle pitch drop-in for bass plucks
      const f0 = freq * 0.88;
      for (const o of oscs) {
        o.frequency.setValueAtTime(f0, time);
        o.frequency.exponentialRampToValueAtTime(freq, time + glideT);
      }
    }

    let stopped = false;
    const stop = (tStop) => {
      if (stopped) return; stopped = true;
      const now = ctx.currentTime;
      const tEff = Math.max(tStop, time + 0.02);
      // never schedule in the past: hold from "now" if note-off already passed
      const relStart = Math.max(tEff, now + 0.005);
      const relEnd = relStart + r + 0.02;
      try {
        if (out.gain.cancelAndHoldAtTime) out.gain.cancelAndHoldAtTime(relStart);
        else { out.gain.cancelScheduledValues(relStart); out.gain.setValueAtTime(susLevel || peak, relStart); }
        out.gain.exponentialRampToValueAtTime(0.0008, relEnd);
      } catch (e) {}
      try {
        if (filt.frequency.cancelAndHoldAtTime) filt.frequency.cancelAndHoldAtTime(relStart);
        else filt.frequency.cancelScheduledValues(relStart);
      } catch (e) {}
      for (const o of oscs) { try { o.stop(relEnd + 0.02); } catch (e) {} }
      return relEnd;
    };

    // auto-stop safety: never run forever even if caller forgets
    const hardEnd = time + durStepsToSec + r + 0.5;
    return { output: out, stop, oscs, hardEnd };
  }

  /**
   * Trigger a drum voice on a channel.
   */
  function triggerDrum(ctx, ch, pitchTag, vel, time, dest, noiseBuf) {
    const prm = ch.params || {};
    const decayScale = clamp(prm.decayScale == null ? 1 : prm.decayScale, 0.2, 3);
    const drive = clamp(prm.drive == null ? 0.12 : prm.drive, 0, 1);
    const tune = clamp(prm.tune || 0, -12, 12);
    const snap = clamp(prm.snap == null ? 0.5 : prm.snap, 0, 1);
    const tone = clamp(prm.tone == null ? 0.5 : prm.tone, 0, 1);
    const noiseAmt = clamp(prm.noise == null ? 0.5 : prm.noise, 0, 1);
    const laneMap = {
      36: () => P9.buildKick(ctx, dest, time, { freq: 118 * Math.pow(2, tune / 12), decay: 0.42 * decayScale, drive: Math.max(drive, snap * 0.3), vel }),
      38: () => P9.buildSnare(ctx, dest, time, { decay: 0.2 * decayScale, tone, noise: noiseAmt, vel, noiseBuf }),
      42: () => P9.buildHat(ctx, dest, time, { open: false, decay: 0.04 * decayScale, hpFreq: 7000 + tone * 3000, vel: vel * 0.8, noiseBuf, metallic: snap }),
      39: () => P9.buildClap(ctx, dest, time, { decay: 0.16 * decayScale, vel: vel * 0.9, noiseBuf }),
      46: () => P9.buildHat(ctx, dest, time, { open: true, decay: 0.09 * decayScale, hpFreq: 6500, vel: vel * 0.7, noiseBuf, metallic: snap }),
      45: () => P9.buildTom(ctx, dest, time, { freq: 150 * Math.pow(2, tune / 12), decay: 0.28 * decayScale, vel }),
      37: () => P9.buildRim(ctx, dest, time, { vel: vel * 0.8 }),
      49: () => P9.buildCrash(ctx, dest, time, { decay: 1.1 * decayScale, vel: vel * 0.7, noiseBuf }),
    };
    const builder = laneMap[pitchTag] || laneMap[36];
    return builder();
  }

  /* ================= FX chain assembly ================= */

  function buildFxChain(ctx, fxList, noiseBuf) {
    // returns {input, output, instances:[{def,inst}]}
    const instances = [];
    let head = null;
    for (const fx of fxList || []) {
      const def = FX_DEFS[fx.type];
      if (!def) continue;
      const inst = def.build(ctx, Object.assign({}, def.defaults, fx.params || {}), noiseBuf);
      instances.push({ def, inst, state: fx });
      head = head || inst;
    }
    // link them
    for (let i = 0; i < instances.length - 1; i++) {
      instances[i].inst.output.connect(instances[i + 1].inst.input);
    }
    if (!instances.length) {
      const g = ctx.createGain();
      return { input: g, output: g, instances, bypassGain: g };
    }
    return { input: instances[0].inst.input, output: instances[instances.length - 1].inst.output, instances };
  }

  /* ================= full graph builder ================= */

  const MAX_STRIPS = 32;

  /**
   * Build the entire playback graph into `ctx` for the given project.
   * Returns handles to schedule notes and to reach master analyser nodes.
   */
  function buildGraph(ctx, project, opts) {
    opts = opts || {};
    const noiseBuf = P9.makeNoiseBuffer(ctx, 1.2, 'drums');

    // ---- master chain ----
    const masterIn = ctx.createGain();       // summing bus (strip inputs land here)
    const masterFxBus = ctx.createGain();    // master FX chain sits here
    masterIn.connect(masterFxBus);
    const masterVol = ctx.createGain();      // master volume stage
    masterVol.gain.value = clamp(project.masterVolume == null ? 0.85 : project.masterVolume, 0, 1.5);
    const masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -8; masterComp.knee.value = 12;
    masterComp.ratio.value = 3; masterComp.attack.value = 0.004; masterComp.release.value = 0.18;
    const softClip = ctx.createWaveShaper();
    softClip.curve = P9.softClipCurve(0.92); // safety limiter: transparent below 0.92
    const masterOut = ctx.createGain();
    masterFxBus.connect(masterVol).connect(masterComp).connect(softClip).connect(masterOut).connect(ctx.destination);

    const strips = []; // index 0 = master
    strips.push({
      idx: 0, isMaster: true, name: 'Master',
      volume: clamp(project.masterVolume == null ? 0.85 : project.masterVolume, 0, 1.5),
      pan: 0, muted: false, solo: false,
      input: masterIn, gainNode: masterIn, panner: null,
      fxBus: masterFxBus,
      fxChain: { instances: [] },
      meterTap: masterOut,
    });

    // ---- channel strips 1..N (create for channels that reference them, up to MAX_STRIPS) ----
    const stripCount = new Set((project.channels || []).map(c => clamp(c.mixer | 0, 0, MAX_STRIPS - 1)));
    const needed = new Set([1]);
    for (const c of project.channels || []) needed.add(clamp(c.mixer | 0, 0, MAX_STRIPS - 1));

    const stripInputs = new Map(); // stripIdx -> GainNode
    stripInputs.set(0, masterIn);
    for (const idx of Array.from(needed).sort((a, b) => a - b)) {
      if (idx === 0) continue;
      const inp = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const post = ctx.createGain(); // final stage feeding master
      inp.connect(pan).connect(post).connect(masterIn);
      stripInputs.set(idx, inp);
      strips.push({
        idx, isMaster: false, name: 'Insert ' + idx,
        volume: 0.85, pan: 0, muted: false, solo: false,
        input: inp, gainNode: inp, panner: pan, postGain: post,
        fxChain: { instances: [] }, meterTap: post,
      });
    }

    // apply mixer strip settings/fx from project.mixer data if present
    if (Array.isArray(project.mixerStrips)) {
      for (const ms of project.mixerStrips) {
        const st = strips.find(s => s.idx === ms.index);
        if (!st || st.isMaster && ms.index !== 0) continue;
        if (typeof ms.volume === 'number') st.volume = clamp(ms.volume, 0, 1.5);
        if (typeof ms.pan === 'number' && st.panner) st.pan = clamp(ms.pan, -1, 1);
        if (typeof ms.muted === 'boolean') st.muted = ms.muted;
        st.fxList = Array.isArray(ms.fx) ? ms.fx.slice(0, 6) : [];
        st.name = typeof ms.name === 'string' ? ms.name.slice(0, 16) : st.name;
      }
    } else {
      for (const st of strips) st.fxList = [];
    }

    // build FX chains per strip
    for (const st of strips) {
      if (!st.isMaster) {
        st.gainNode.gain.value = st.volume;
        if (st.panner) st.panner.pan.value = st.pan;
      }
      if (st.muted) st.postGain && (st.postGain.gain.value = 0);
      if (st.fxList && st.fxList.length) {
        if (st.isMaster) {
          // master FX: insert into the master bus (masterIn -> fx -> volume stage)
          const chain = buildFxChain(ctx, st.fxList, noiseBuf);
          try { masterIn.disconnect(masterFxBus); } catch (e) {}
          masterIn.connect(chain.input);
          chain.output.connect(masterVol);
          st.fxChain = chain;
        } else {
          // insert strip: reroute input -> chain -> post stage
          const chain = buildFxChain(ctx, st.fxList, noiseBuf);
          try { st.gainNode.disconnect(); } catch (e) {}
          st.gainNode.connect(chain.input);
          chain.output.connect(st.postGain || masterIn);
          st.fxChain = chain;
        }
      }
    }

    // ---- channel -> strip routing with mute/solo ----
    const anySolo = (project.channels || []).some(c => c.solo);
    const chanNodes = [];
    for (const ch of project.channels || []) {
      const cg = ctx.createGain();
      const cpn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const audible = P9.channelAudible(project.channels, project.channels.indexOf(ch));
      cg.gain.value = audible ? clamp(ch.volume, 0, 1.4) : 0;
      if (cpn) cpn.pan.value = clamp(ch.pan, -1, 1);
      if (cpn) { cg.connect(cpn); cpn.connect(stripInputs.get(clamp(ch.mixer | 0, 0, MAX_STRIPS - 1)) || masterIn); }
      else cg.connect(stripInputs.get(clamp(ch.mixer | 0, 0, MAX_STRIPS - 1)) || masterIn);
      chanNodes.push({ gain: cg, pan: cpn });
    }

    return {
      ctx, noiseBuf, strips, chanNodes, masterOut, masterVolNode: masterVol,
      fxDefs: FX_DEFS, fxList: FX_LIST,
      buildMelodicVoice: (chIdx, pitch, vel, time, durSec) =>
        buildMelodicVoice(ctx, project.channels[chIdx], pitch, vel, time, durSec, chanNodes[chIdx].gain),
      triggerDrum: (chIdx, pitchTag, vel, time) =>
        triggerDrum(ctx, project.channels[chIdx], pitchTag, vel, time, chanNodes[chIdx].gain, noiseBuf),
    };
  }

  return {
    FX_DEFS, FX_LIST, buildGraph, buildFxChain, makeIR,
    buildMelodicVoice, triggerDrum,
  };
});
