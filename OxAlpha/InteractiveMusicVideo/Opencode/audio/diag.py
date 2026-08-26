import os
import subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000

def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

for name in ("Neon Drifter.wav", "Neon Drifter.mp3"):
    x = load(os.path.join(HERE, name))
    print(f"== {name}: {len(x)/SR:.2f}s peak={np.max(np.abs(x)):.3f} "
          f"nan={int(np.sum(~np.isfinite(x)))}")
    for t0 in range(0, int(len(x) / SR), 10):
        seg = x[t0 * SR:min((t0 + 10) * SR, len(x))]
        if len(seg):
            print(f"  {t0:3d}-{min(t0+10, int(len(x)/SR)):3d}s "
                  f"rms={np.sqrt(np.mean(seg ** 2)):.4f}")
