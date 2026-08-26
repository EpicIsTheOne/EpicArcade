"""Diamond Sky - Minecraft-type piece, sounds synthesized from scratch.
C418 research applied: mangled lo-fi felt piano, Mellotron-style wobble pads,
pure-pentatonic melody, minimalism, huge cave reverb, slow buildup/fadeout.
Offline numpy render -> WAV -> MP3."""
import numpy as np
import wave, os, subprocess, random

SR = 48000
BPM = 72.0
BEAT = 60.0 / BPM
DESKTOP = os.path.expanduser("~/Desktop")
WAV = os.path.join(DESKTOP, "Diamond Sky - Minecraft Type.wav")
MP3 = os.path.join(DESKTOP, "Diamond Sky - Minecraft Type.mp3")
rng = random.Random(418)
nprng = np.random.default_rng(418)

def midi_f(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)

# ---------------- global Mellotron-style wow (shared tape drift) -------------
WOW_SECONDS = 220
_ct = np.arange(0.0, WOW_SECONDS + 0.25, 0.25)
_cw = nprng.normal(0, 1, len(_ct))
_cw = np.convolve(_cw, np.ones(13) / 13, mode="same")
_wow_slow = np.interp(np.arange(WOW_SECONDS * SR) / SR, _ct, _cw)
WOW = (0.0028 * np.sin(2 * np.pi * 0.31 * np.arange(WOW_SECONDS * SR) / SR
                       + rng.uniform(0, 6.28)) + 0.0013 * _wow_slow)

def phase_drift(t0, length):
    idx = (np.arange(length) + int(t0 * SR)) % (WOW_SECONDS * SR - 2)
    return WOW[idx]

# ---------------- instruments -------------------------------------------------
def felt_piano(note, t0, dur_beats, vel):
    """Mangled lo-fi felt piano: soft hammer, drifted partials, pedal ring."""
    dur = dur_beats * BEAT
    tail = 2.2
    length = int((dur + tail) * SR)
    t = np.arange(length) / SR
    f = midi_f(note) * 2 ** (rng.uniform(-3, 3) / 1200.0)
    ph = 2 * np.pi * f * t + 2 * np.pi * f * np.cumsum(phase_drift(t0, length)) / SR
    bright = 0.22 + (vel / 127.0) * 0.85
    partials = [(1.0, 1.0, 1.35), (2.0, 0.42 * bright, 1.95),
                (3.0, 0.17 * bright, 2.6), (4.02, 0.075 * bright, 3.3),
                (5.13, 0.038 * bright, 4.1)]
    x = np.zeros(length)
    for (ratio, amp, dec) in partials:
        x += amp * np.exp(-t * dec) * np.sin(ratio * ph)
    v = (vel / 127.0) ** 1.5
    x *= 0.5 * v
    a = max(1, int(0.006 * SR))
    x[:a] *= np.linspace(0, 1, a) ** 1.5
    rel = int(dur * SR)
    if rel < length:
        rl = min(int(0.28 * SR), length - rel)
        x[rel:rel + rl] *= np.cos(np.linspace(0, np.pi / 2, rl)) ** 2
        x[rel + rl:] = 0.0
    hn = int(0.018 * SR)
    thump = nprng.normal(0, 1, hn) * np.exp(-np.arange(hn) / (0.004 * SR))
    x[:hn] += 0.045 * v * thump
    return x

def music_box(note, t0, dur_beats, vel):
    length = int((dur_beats * BEAT + 2.5) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    ph = 2 * np.pi * f * t + 2 * np.pi * f * np.cumsum(phase_drift(t0, length)) / SR
    x = (np.sin(ph) + 0.26 * np.sin(2.756 * ph) + 0.06 * np.sin(5.4 * ph))
    x *= np.exp(-t / 1.05) * (vel / 127.0) * 0.5
    a = max(1, int(0.002 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x

def pad_voice(note, t0, dur_beats, vel):
    """Warm detuned pad with shared tape wow (the Mellotron feel)."""
    length = int((dur_beats * BEAT + 2.0) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    x = np.zeros(length)
    for det in (-7.0, 7.0):
        fd = f * 2 ** (det / 1200.0)
        ph = 2 * np.pi * fd * t + 2 * np.pi * fd * np.cumsum(phase_drift(t0, length)) / SR
        x += np.sin(ph) + 0.32 * np.sin(2 * ph) + 0.11 * np.sin(3 * ph)
    x *= 0.5
    trem = 1.0 + 0.08 * np.sin(2 * np.pi * 0.12 * t + rng.uniform(0, 6.28))
    x *= trem
    a = int(1.3 * SR)
    if a < length:
        x[:a] *= np.linspace(0, 1, a) ** 1.6
    rel = int(dur_beats * BEAT * SR)
    if rel < length:
        rl = min(int(1.9 * SR), length - rel)
        x[rel:rel + rl] *= np.cos(np.linspace(0, np.pi / 2, rl)) ** 2
        x[rel + rl:] = 0.0
    return x * (vel / 127.0) * 0.34

def sub_note(note, t0, dur_beats, vel):
    length = int((dur_beats * BEAT + 1.0) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    x = np.sin(2 * np.pi * f * t) + 0.06 * np.sin(4 * np.pi * f * t)
    a = int(0.35 * SR)
    x[:a] *= np.linspace(0, 1, a)
    rel = int(dur_beats * BEAT * SR)
    if rel < length:
        rl = min(int(0.45 * SR), length - rel)
        x[rel:rel + rl] *= np.cos(np.linspace(0, np.pi / 2, rl)) ** 2
        x[rel + rl:] = 0.0
    return x * (vel / 127.0) * 0.62

# ---------------- composition --------------------------------------------------
P_PIANO, P_PAD, P_SUB, P_BOX = "piano", "pad", "sub", "box"
events = []  # (kind, note, beat, dur, vel)

SECTIONS = [
    (0,   [50, 57, 64, 66], [50, 57, 64, 66, 57, 64, 66, 69]),
    (16,  [55, 62, 66, 69], [55, 62, 66, 69, 62, 66, 69, 66]),
    (32,  [59, 64, 66, 71], [59, 64, 66, 71, 64, 66, 71, 64]),
    (48,  [57, 62, 64, 67], [57, 62, 64, 69, 62, 64, 69, 64]),
    (64,  [50, 57, 64, 66], [50, 57, 64, 66, 57, 64, 66, 69]),
    (80,  [59, 62, 66, 69], [59, 64, 66, 71, 64, 66, 71, 64]),
    (96,  [55, 62, 66, 69], [55, 62, 66, 69, 62, 66, 69, 66]),
    (112, [52, 59, 64, 66], [52, 59, 64, 66, 59, 64, 66, 64]),
    (128, [57, 59, 64],     [57, 59, 64, 69, 59, 64, 69, 64]),
    (144, [50, 57, 64, 66], None),
]

for (b0, voic, cyc) in SECTIONS:
    vpad = 14 if b0 == 0 else (17 if b0 >= 144 else 24)
    for j, n in enumerate(voic):
        events.append((P_PAD, n, float(b0) + j * 0.06, 9.4,
                       vpad + j * 2 + (2 if 96 <= b0 < 128 else 0)))
    if cyc is not None:
        lift = 1 if 96 <= b0 < 128 else 0
        for i in range(32):
            bt = b0 + i
            if bt >= 144:
                break
            v = 24 + (3 if i % 8 in (2, 3, 6) else 0) + (5 if lift else 0)
            events.append((P_PIANO, cyc[i % 8], bt + rng.uniform(-0.02, 0.02),
                           1.9, v + rng.randint(-3, 3)))

SUBS = [(0, 38, 40), (16, 31, 38), (32, 35, 40), (48, 33, 42), (48.02, 40, 34),
        (64, 38, 46), (80, 35, 44), (80.02, 42, 34), (96, 43, 44),
        (112, 40, 42), (112.02, 47, 33), (128, 33, 40), (128.02, 40, 34),
        (144, 38, 36)]
for (bt, n, v) in SUBS:
    events.append((P_SUB, n, bt, 8.4, v))

MEL = [
    (33.0, 74, 3.2, 42), (37.5, 71, 5.0, 44),
    (49.0, 71, 2.6, 44), (52.0, 69, 2.4, 42), (55.5, 66, 5.5, 42),
    (65.0, 74, 3.2, 46), (68.5, 76, 1.5, 44), (70.0, 78, 4.6, 48),
    (77.0, 81, 2.6, 52), (80.5, 78, 1.5, 46), (82.5, 76, 5.8, 48),
    (89.0, 74, 2.2, 46), (92.0, 71, 1.4, 44), (93.5, 69, 1.4, 46),
    (97.0, 74, 3.2, 54), (101.0, 78, 2.2, 56), (104.0, 76, 1.4, 52),
    (106.0, 74, 5.0, 54),
    (113.0, 71, 2.4, 52), (116.5, 69, 1.6, 50), (118.5, 71, 2.2, 54),
    (121.5, 74, 1.6, 52), (123.5, 76, 6.5, 56),
    (129.5, 74, 3.4, 46), (134.0, 71, 2.2, 44), (137.0, 69, 5.5, 46),
    (145.0, 69, 2.6, 42), (148.5, 71, 2.2, 44), (151.5, 74, 8.5, 48),
]
mel_sorted = sorted(MEL, key=lambda e: e[0])
mel_adj = []
for i, (t, n, d, v) in enumerate(mel_sorted):
    tt = t + rng.uniform(-0.05, 0.07)
    if d >= 4.5:
        tt += 0.10
    mel_adj.append([tt, n, d, v])
for i in range(len(mel_adj) - 1):
    gap = mel_adj[i + 1][0] - mel_adj[i][0]
    if mel_adj[i][2] < gap + 0.6:
        mel_adj[i][2] = gap + 0.6
for (tt, n, d, v) in mel_adj:
    events.append((P_PIANO, n, tt, d, v))
    if abs(tt - 97.0) < 0.3 or abs(tt - 106.0) < 0.3:
        events.append((P_PIANO, n + 12, tt, d * 0.9, int(v * 0.45)))

for (bt, n) in [(97.0, 90), (124.5, 86), (151.5, 93)]:
    events.append((P_BOX, n, bt, 1.2, 26))

print(f"score: {len(events)} events, {160 * BEAT:.0f}s @ {BPM} BPM", flush=True)

# ---------------- render & mix -----------------------------------------------
total_len = int((160 * BEAT + 8.0) * SR)
stems = {"piano": np.zeros((total_len, 2)), "pad": np.zeros((total_len, 2)),
         "sub": np.zeros((total_len, 2)), "box": np.zeros((total_len, 2))}
PANS = {"piano": 0.0, "pad": 0.12, "sub": 0.0, "box": -0.35}

def add_pan(stem, buf, t0_beats, pan):
    L = np.cos((pan + 1) * np.pi / 4)
    R = np.sin((pan + 1) * np.pi / 4)
    s = int(t0_beats * BEAT * SR)
    if s < 0:
        buf = buf[-s:]
        s = 0
    e = min(s + len(buf), total_len)
    if e <= s:
        return
    stems[stem][s:e, 0] += buf[:e - s] * L
    stems[stem][s:e, 1] += buf[:e - s] * R

for (kind, note, t0, dur, vel) in events:
    t0s = t0 * BEAT
    if kind == P_PIANO:
        buf = felt_piano(note, t0s, dur, vel)
    elif kind == P_BOX:
        buf = music_box(note, t0s, dur, vel)
    elif kind == P_PAD:
        buf = pad_voice(note, t0s, dur, vel)
    else:
        buf = sub_note(note, t0s, dur, vel)
    try:
        add_pan(kind, buf, t0, PANS[kind])
    except ValueError:
        print(f"FAIL kind={kind} note={note} t0={t0} dur={dur} "
              f"s={int(t0 * BEAT * SR)} len(buf)={len(buf)} "
              f"total_len={total_len}", flush=True)
        raise
print("rendered notes", flush=True)

GAINS = {"piano": 1.0, "pad": 0.9, "sub": 0.85, "box": 0.8}
WETS = {"piano": 0.42, "pad": 0.5, "sub": 0.12, "box": 0.6}
for k in stems:
    stems[k] *= GAINS[k]

# ---------------- FFT convolution cave reverb ---------------------------------
ir_len = int(3.2 * SR)
tir = np.arange(ir_len) / SR
def make_ir(seed):
    g = np.random.default_rng(seed)
    ir = g.normal(0, 1, ir_len) * np.exp(-tir / 1.05)
    ir[:int(0.045 * SR)] = 0.0
    return ir / np.sqrt(np.sum(ir ** 2))

ER_TAPS = [(0.013, .50), (0.021, -.38), (0.029, .27), (0.041, -.19),
           (0.053, .12)]
N_FFT = 1 << int(np.ceil(np.log2(total_len + ir_len)))
wetL = np.zeros(total_len)
wetR = np.zeros(total_len)
for ch, seed in ((0, 11), (1, 23)):
    ir = make_ir(seed)
    IR = np.fft.rfft(ir, N_FFT)
    for k in stems:
        X = np.fft.rfft(stems[k][:, ch], N_FFT)
        w = np.fft.irfft(X * IR, N_FFT)[:total_len]
        if ch == 0:
            wetL += WETS[k] * w
        else:
            wetR += WETS[k] * w
del X
erL = np.zeros(total_len)
erR = np.zeros(total_len)
for k in ("piano", "pad", "box"):
    for (dt, gpansard) in ER_TAPS:
        d = int(dt * SR)
        erL[d:] += stems[k][:-d or None, 0] * gpansard * 0.5
        erR[d:] += stems[k][:-d or None, 1] * gpansard * 0.5
print("reverb done", flush=True)

mix = np.zeros((total_len, 2))
for k in stems:
    mix += stems[k]
mix[:, 0] += wetL + erL
mix[:, 1] += wetR + erR

# ---------------- master ------------------------------------------------------
S = np.fft.rfft(mix, axis=0)
freqs = np.fft.rfftfreq(total_len, 1 / SR)
hp = np.clip((freqs - 78.0) / 70.0, 0, 1)
lp = 1.0 - 0.45 * np.clip((freqs - 9000.0) / 5000.0, 0, 1)
S *= (hp * lp)[:, None]
mix = np.fft.irfft(S, total_len, axis=0)
floor = nprng.normal(0, 1, (total_len, 2)) * 0.0006
kern = np.exp(-np.arange(800) / 160.0)
kern /= kern.sum()
fl_L = np.convolve(floor[:, 0], kern, mode="same")
fl_R = np.convolve(floor[:, 1], kern, mode="same")
mix[:, 0] += fl_L
mix[:, 1] += fl_R
mix = np.tanh(mix * 1.2) / np.tanh(1.2) * 0.92
peak = float(np.max(np.abs(mix)))
mix *= 0.89 / peak
print(f"master: peak normalized from {peak:.3f}", flush=True)

pcm = (mix * 32767).astype(np.int16)
with wave.open(WAV, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("WAV:", WAV, os.path.getsize(WAV), flush=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", WAV, "-codec:a",
                "libmp3lame", "-b:a", "192k", MP3], check=True)
print("MP3:", MP3, os.path.getsize(MP3), flush=True)
