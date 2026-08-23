/* ============================================================
   Nyx DAW — WAV encoder (RIFF PCM 16-bit)
   Pure JS, dual environment: browser global + Node require.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.WavEncoder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Encode an AudioBuffer-like object ({numberOfChannels, sampleRate,
   * getChannelData(i) -> Float32Array}) into a WAV file (16-bit PCM).
   * @returns {ArrayBuffer}
   */
  function encode(audioBuffer) {
    const numCh = Math.max(1, audioBuffer.numberOfChannels | 0);
    const sampleRate = audioBuffer.sampleRate | 0;
    const frames = audioBuffer.length | 0;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = frames * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // RIFF header
    writeStr(view, 0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeStr(view, 8, 'WAVE');
    // fmt chunk
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);            // fmt chunk size
    view.setUint16(20, 1, true);             // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    // data chunk
    writeStr(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave + clamp + quantize
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = chans[c][i];
        if (!isFinite(s)) s = 0;
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return buffer;
  }

  /** Decode helper for tests: parse a WAV ArrayBuffer back into {sampleRate, channels:[Float32Array]} */
  function decodeSummary(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF') throw new Error('Not a RIFF file');
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (wave !== 'WAVE') throw new Error('Not a WAVE file');
    let pos = 12, numCh = 0, sampleRate = 0, bits = 0, dataOffset = -1, dataSize = 0;
    while (pos + 8 <= view.byteLength) {
      const id = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
      const size = view.getUint32(pos + 4, true);
      if (id === 'fmt ') {
        numCh = view.getUint16(pos + 10, true);
        sampleRate = view.getUint32(pos + 12, true);
        bits = view.getUint16(pos + 22, true);
      } else if (id === 'data') {
        dataOffset = pos + 8; dataSize = size;
        break;
      }
      pos += 8 + size + (size % 2);
    }
    return { numCh, sampleRate, bits, dataOffset, dataSize, frames: dataSize / (numCh * bits / 8) };
  }

  /** Extract interleaved samples as Float32Array (-1..1) from encoded WAV (for verification). */
  function decodeSamples(arrayBuffer, maxFrames) {
    const meta = decodeSummary(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const frames = maxFrames ? Math.min(meta.frames, maxFrames) : meta.frames;
    const out = [];
    for (let c = 0; c < meta.numCh; c++) out.push(new Float32Array(frames));
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < meta.numCh; c++) {
        const off = meta.dataOffset + (i * meta.numCh + c) * 2;
        const v = view.getInt16(off, true);
        out[c][i] = v < 0 ? v / 0x8000 : v / 0x7fff;
      }
    }
    return { sampleRate: meta.sampleRate, channels: out };
  }

  function writeStr(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  return { encode, decodeSummary, decodeSamples };
});
