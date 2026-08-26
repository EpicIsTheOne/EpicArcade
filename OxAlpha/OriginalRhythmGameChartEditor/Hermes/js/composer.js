// PRISM PULSE — offline song renderer ("Neon Meridian").
// Renders the composed events from song-data.js into an AudioBuffer via
// OfflineAudioContext. Deterministic: same events -> same audio every boot.
import { composeSong, SONG } from './song-data.js';

const SR = 44100;

function env(param, t0, a, peak, d, sus, dur, r) {
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.exponentialRampToValueAtTime(Math.max(sus * peak, 1e-4), t0 + a + d);
  const rel = t0 + Math.max(a + d, dur);
  param.setValueAtTime(Math.max(sus * peak, 1e-4), rel);
  param.exponentialRampToValueAtTime(1e-4, rel + r);
}

export async function renderSong(onProgress) {
  const { events, totalBeats } = composeSong();
  const spb = 60 / SONG.bpm;
  // tail: last note ring-out + delay wash
  const lengthS = totalBeats * spb + 3.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(lengthS * SR), SR);

  // --- master chain: glue compressor + soft clipper ---
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 3;
  comp.attack.value = 0.01; comp.release.value = 0.18;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.4) * 0.92; }
  shaper.curve = curve;
  master.connect(comp); comp.connect(shaper); shaper.connect(ctx.destination);

  // --- shared send FX: dotted-8th feedback delay ---
  const delaySend = ctx.createGain(); delaySend.gain.value = 1;
  const delay = ctx.createDelay(2); delay.delayTime.value = spb * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const dampen = ctx.createBiquadFilter(); dampen.type = 'lowpass'; dampen.frequency.value = 3200;
  delaySend.connect(delay); delay.connect(dampen); dampen.connect(fb); fb.connect(delay);
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  delay.connect(wet); wet.connect(master);

  // brightness per section style (lowpass target Hz)
  const BRIGHT = { intro: 1400, verse: 2600, verse2: 2200, build: 4200, chorus: 6500, final: 7500, bridge: 1800, outro: 1200 };

  const panLR = (node, p) => {
    if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = p; node.connect(pan); return pan; }
    return node;
  };

  let done = 0;
  for (const e of events) {
    const t0 = e.t * spb;
    switch (e.kind) {
      case 'drum': {
        if (e.drum === 'kick') {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(150, t0);
          o.frequency.exponentialRampToValueAtTime(44, t0 + 0.09);
          g.gain.setValueAtTime((e.vel ?? 1) * 0.95, t0);
          g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.24);
          o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.26);
        } else if (e.drum === 'snare' || e.drum === 'clap') {
          const len = e.drum === 'clap' ? 0.12 : 0.16;
          const buf = noiseBuf(ctx, len);
          const src = ctx.createBufferSource(); src.buffer = buf;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass';
          f.frequency.value = e.drum === 'clap' ? 1500 : 1900; f.Q.value = 0.8;
          const g = ctx.createGain();
          g.gain.setValueAtTime((e.vel ?? 1) * 0.5, t0);
          g.gain.exponentialRampToValueAtTime(1e-4, t0 + len);
          src.connect(f); f.connect(g); g.connect(master);
          g.connect(delaySend);
          src.start(t0);
          if (e.drum === 'snare') { // body tone
            const o = ctx.createOscillator(), og = ctx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(196, t0);
            og.gain.setValueAtTime((e.vel ?? 1) * 0.22, t0);
            og.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.08);
            o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 0.1);
          }
        } else if (e.drum === 'hat' || e.drum === 'openhat') {
          const len = e.drum === 'hat' ? 0.04 : 0.28;
          const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, len);
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8200;
          const g = ctx.createGain();
          g.gain.setValueAtTime((e.vel ?? 1) * 0.16, t0);
          g.gain.exponentialRampToValueAtTime(1e-4, t0 + len);
          src.connect(f); f.connect(g);
          panLR(g, 0.18).connect(master);
          src.start(t0);
        } else if (e.drum === 'crash') {
          const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, 1.6);
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5200;
          const g = ctx.createGain();
          g.gain.setValueAtTime((e.vel ?? 1) * 0.3, t0);
          g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.6);
          src.connect(f); f.connect(g);
          panLR(g, -0.15).connect(master); g.connect(delaySend);
          src.start(t0);
        }
        break;
      }
      case 'bass': {
        const hz = 55 * Math.pow(2, (e.semi ?? -12) / 12);
        const o = ctx.createOscillator(), sub = ctx.createOscillator();
        const f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz * 2;
        sub.type = 'sine'; sub.frequency.value = hz;
        f.type = 'lowpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(e.acc ? 900 : 520, t0);
        f.frequency.exponentialRampToValueAtTime(240, t0 + Math.min(e.dur * spb, 0.5));
        env(g.gain, t0, 0.004, 0.30, 0.06, 0.72, e.dur * spb * 0.9, 0.05);
        o.connect(f); sub.connect(f); f.connect(g); g.connect(master);
        o.start(t0); sub.start(t0);
        const stopT = t0 + e.dur * spb + 0.15;
        o.stop(stopT); sub.stop(stopT);
        break;
      }
      case 'pad': {
        const brightHz = BRIGHT[e.bright] ?? 2000;
        const durS = e.dur * spb;
        e.chord.forEach((semi, idx) => {
          [-6, 5].forEach((det, k) => {
            const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.value = 110 * Math.pow(2, semi / 12) * (idx === 0 ? 1 : 1);
            o.detune.value = det;
            f.type = 'lowpass'; f.frequency.value = brightHz; f.Q.value = 0.5;
            env(g.gain, t0, 0.35, e.finale ? 0.10 : 0.055, 0.8, 0.85, durS * 0.92, 0.7);
            o.connect(f); f.connect(g);
            panLR(g, idx === 0 ? -0.3 : (k ? 0.35 : -0.1)).connect(master);
            o.start(t0); o.stop(t0 + durS + 0.9);
          });
        });
        break;
      }
      case 'pluck': {
        const hz = 110 * Math.pow(2, (e.semi ?? 0) / 12);
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = hz;
        f.type = 'lowpass'; f.frequency.value = 3600;
        env(g.gain, t0, 0.002, (e.vel ?? 0.7) * 0.16, 0.09, 0.25, e.dur * spb, 0.12);
        o.connect(f); f.connect(g);
        panLR(g, ((e.semi ?? 0) % 5) / 8 - 0.25).connect(master);
        g.connect(delaySend);
        o.start(t0); o.stop(t0 + e.dur * spb + 0.3);
        break;
      }
      case 'lead': {
        const durS = e.dur * spb;
        const o = ctx.createOscillator(), o2 = ctx.createOscillator();
        const g = ctx.createGain(), f = ctx.createBiquadFilter();
        const vib = ctx.createOscillator(), vibG = ctx.createGain();
        o.type = 'square'; o2.type = 'sawtooth';
        o.frequency.value = e.hz; o2.frequency.value = e.hz;
        o2.detune.value = 7;
        vib.frequency.value = 5.4; vibG.gain.value = e.hz * 0.006;
        vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(Math.min(e.hz * 6, 8000), t0);
        f.frequency.exponentialRampToValueAtTime(Math.max(e.hz * 2, 900), t0 + durS * 0.7);
        const lvl = e.soft ? 0.10 : 0.155;
        env(g.gain, t0, 0.006, lvl, 0.07, 0.62, durS * 0.88, 0.09);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        g.connect(delaySend);
        vib.start(t0);
        o.start(t0); o2.start(t0);
        const stopT = t0 + durS + 0.3;
        o.stop(stopT); o2.stop(stopT); vib.stop(stopT);
        break;
      }
    }
    if (++done % 400 === 0 && onProgress) onProgress(done / events.length);
  }

  const buffer = await ctx.startRendering();
  return { buffer, markersSec: composeSong().markers.map(m => ({ ...m, sec: m.beats * spb })) };
}

let _noise = null;
function noiseBuf(ctx, seconds) {
  // small cached noise bursts, reused via BufferSource (cheap)
  const key = Math.round(seconds * 1000);
  _noise = _noise || new Map();
  if (_noise.has(key)) return _noise.get(key);
  const b = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  _noise.set(key, b);
  return b;
}

// Downsampled peaks for the editor overview strip.
export function computePeaks(buffer, buckets = 1200) {
  const ch = buffer.getChannelData(0);
  const per = Math.floor(ch.length / buckets);
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const s = i * per, e = s + per;
    for (let j = s; j < e; j += 16) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    peaks[i] = m;
  }
  return peaks;
}
