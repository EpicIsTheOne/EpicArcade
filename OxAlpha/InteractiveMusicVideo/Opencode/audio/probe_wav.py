import os
import wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
with wave.open(os.path.join(HERE, "Neon Drifter.wav"), "rb") as w:
    sr = w.getframerate()
    n = w.getnframes()
    pcm = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32767.0
x = pcm.reshape(-1, 2)
mono = x.mean(axis=1)
print("nan/inf:", np.isnan(mono).any(), np.isinf(mono).any())

# coarse RMS profile, 2s windows
win = 2 * sr
prof = [np.sqrt(np.mean(mono[i:i + win] ** 2)) for i in range(0, len(mono) - win, win)]
print("RMS profile (t_s:rms):")
line = []
for i, v in enumerate(prof):
    line.append(f"{i * 2}:{v:.3f}")
print(" ".join(line))

# spectral bands at several times
def bands(t0):
    seg = x[int(t0 * sr):int((t0 + 20) * sr)]
    L = np.abs(np.fft.rfft(seg[:, 0] * np.hanning(len(seg))))
    f = np.fft.rfftfreq(len(seg), 1 / sr)
    out = {}
    for bn, lo, hi in (("sub", 0, 80), ("bass", 80, 250), ("mid", 250, 2000), ("hi", 2000, 20000)):
        m = (f >= lo) & (f < hi)
        out[bn] = float(np.sqrt(np.mean(L[m] ** 2)))
    return out

for t0 in (10, 30, 50, 90, 120, 150):
    b = bands(t0)
    print(f"t={t0:>3}s  sub={b['sub']:.1f} bass={b['bass']:.1f} mid={b['mid']:.1f} hi={b['hi']:.1f}")
