import numpy as np, wave, json, math

SR = 44100
with wave.open("tools/build/song.wav", "rb") as w:
    n = w.getnframes()
    data = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2)
mono = data.astype(np.float64).mean(axis=1) / 32768.0

print("DC offset:", float(np.mean(mono)))

# spectral balance in thirds
fftN = 8192
win = np.hanning(fftN)
frames = (len(mono) - fftN) // fftN
bands = {"low(<150)": (0, 150), "mid(150-2k)": (150, 2000), "high(2k-8k)": (2000, 8000), "air(8k+)": (8000, 22050)}
acc = {k: 0.0 for k in bands}
cnt = 0
for i in range(0, frames, 7):
    seg = mono[i*fftN:(i+1)*fftN] * win
    mag = np.abs(np.fft.rfft(seg))
    freqs = np.fft.rfftfreq(fftN, 1.0/SR)
    for k, (f0, f1) in bands.items():
        m = (freqs >= f0) & (freqs < f1)
        acc[k] += float(np.sum(mag[m]**2))
    cnt += 1
tot = sum(acc.values())
for k, v in acc.items():
    print(f"{k:12s} {10*math.log10(v/cnt + 1e-20):7.1f} dB  ({100*v/tot:.1f}%)")

# melody onset check: bandpass 700-4000Hz envelope, find peaks, compare to player+opp chart times
b = np.array([1.0, -1.0])
x = mono.copy()
for fc in (600.0, 4200.0):
    a = 1.0 - math.exp(-2*math.pi*fc/SR)
    # FFT one-pole
    N = 1 << (int(math.log2(len(x)+1))+1)
    kk = np.fft.rfftfreq(N, 1.0/SR)*2*math.pi
    if fc == 600.0:
        H = a/(1-(1-a)*np.exp(-1j*kk)); x = np.fft.irfft(np.fft.rfft(x, N)*H, N)[:len(x)]
    else:
        H = (1-a)*np.exp(-1j*kk)/(1-(1-a)*np.exp(-1j*kk)); x = x - np.fft.irfft(np.fft.rfft(x, N)*H, N)[:len(x)]
env = np.abs(x)
k = int(0.006*SR)
kernel = np.ones(k)/k
env = np.convolve(env, kernel, mode="same")

chart = json.loads(open("js/chart-data.js").read().split("= ",1)[1].rsplit(";",1)[0])
times = [t/1000.0 for t,_,_,_,_ in chart["player"]] + [t/1000.0 for t,_,_,_,_ in chart["opponent"]]
times.sort()
hits = 0; misses = []
for t in times:
    i0 = int((t-0.03)*SR); i1 = int((t+0.05)*SR)
    seg = env[max(0,i0):i1]
    if len(seg) and seg.max() > env.max()*0.04:
        hits += 1
    else:
        misses.append(round(t,2))
print(f"melody-band onset presence: {hits}/{len(times)} ({100*hits/len(times):.0f}%)")
print("sample misses:", misses[:12])
