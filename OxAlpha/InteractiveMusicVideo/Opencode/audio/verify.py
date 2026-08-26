import os
import subprocess
import numpy as np

MP3 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Neon Drifter.mp3")
raw = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", MP3, "-f", "f32le", "-ac", "1", "-"],
    capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
sr = 48000
n = len(x)
head = x[int(30 * sr):int(60 * sr)]
tail = x[int((163.2 + 1.0) * sr):int(165.5 * sr)] if n > int(165.5 * sr) else x[-int(1 * sr):]
mid = x[int(110 * sr):int(140 * sr)]
print(f"samples={n} duration={n / sr:.2f}s")
print(f"peak={np.max(np.abs(x)):.3f}")
print(f"rms head(30-60s)={np.sqrt(np.mean(head ** 2)):.4f}")
print(f"rms drop(110-140s)={np.sqrt(np.mean(mid ** 2)):.4f}")
print(f"rms tail(after fade)={np.sqrt(np.mean(tail ** 2)):.6f}")
ok = (0.55 <= np.max(np.abs(x)) <= 1.02 and np.sqrt(np.mean(head ** 2)) > 0.04
      and np.sqrt(np.mean(tail ** 2)) < 0.01 * np.sqrt(np.mean(head ** 2)))
print("VERIFY:", "PASS" if ok else "FAIL")
