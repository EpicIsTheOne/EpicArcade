/* PULSE-9 core: WAV encoder (16-bit PCM, mono or stereo) — no dependencies */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  /**
   * Encode Float32 channel data into a WAV ArrayBuffer.
   * @param {Float32Array|Float32Array[]} channels interleaved as array of channel arrays
   * @param {number} sampleRate
   */
  function encodeWav(channels, sampleRate) {
    const chArr = Array.isArray(channels) ? channels : [channels];
    const numCh = chArr.length;
    const numFrames = chArr[0].length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const wstr = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

    wstr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);          // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    wstr(36, 'data');
    view.setUint32(40, dataSize, true);

    let off = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = chArr[c][i];
        s = s < -1 ? -1 : s > 1 ? 1 : s; // clamp
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return buffer;
  }

  /** Parse a WAV header minimally; returns null if not a WAV. */
  function parseWavHeader(buffer) {
    const v = new DataView(buffer);
    if (buffer.byteLength < 44) return null;
    const tag = (o, n) => String.fromCharCode(...new Uint8Array(buffer, o, n));
    if (tag(0, 4) !== 'RIFF' || tag(8, 4) !== 'WAVE') return null;
    return {
      channels: v.getUint16(22, true),
      sampleRate: v.getUint32(24, true),
      bitsPerSample: v.getUint16(34, true),
      dataSize: v.getUint32(40, true),
    };
  }

  /** RMS + peak stats over interleaved or mono Float32 data. */
  function audioStats(data) {
    let sum = 0, peak = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      sum += x * x;
      const a = Math.abs(x);
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sum / Math.max(1, data.length)), peak, frames: data.length };
  }

  return { encodeWav, parseWavHeader, audioStats };
});
