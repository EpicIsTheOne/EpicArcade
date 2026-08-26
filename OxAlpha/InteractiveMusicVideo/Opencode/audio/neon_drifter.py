"""NEON DRIFTER - original synthwave piece for the interactive music video.
Engine: synth-song-engine templates (diamond-sky.py instruments + synth_kit.py
drums/basses), adapted per the Synthwave playbook:
  85-110 BPM cruise, big 80s GATED-reverb snare, steady 8th hats,
  detuned analog pads (+/-12 cents), 16th arpeggiated sequencer,
  supersaw lead w/ portamento slides, warm LP'd analog bass 8ths,
  minor nostalgia (vi-IV-I-V => Am-F-C-G), everything wide and drenched.
Offline deterministic numpy render -> WAV -> MP3 -> timeline.js/json.
"""
import os
import sys
import gc
import wave
import json
import random
import subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "templates"))

import synth_kit as kit  # noqa: E402

SR = 48000
BPM = 100.0
BEAT = 60.0 / BPM            # 0.6 s
BAR = 4 * BEAT               # 2.4 s
TOTAL_BEATS = 272            # 68 bars
rng = random.Random(2077)
nprng = np.random.default_rng(2077)

WAV = os.path.join(HERE, "Neon Drifter.wav")
MP3 = os.path.join(HERE, "Neon Drifter.mp3")

def midi_f(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)

# ---------------- shared tape drift (from diamond-sky engine) -----------------
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

# ---------------- melodic voices (diamond-sky engine, widened pads) -----------
def felt_piano(note, t0, dur_beats, vel):
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
    """Analog detuned pad - synthwave spec widens detune to +/-12 cents."""
    length = int((dur_beats * BEAT + 2.0) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    x = np.zeros(length)
    for det in (-12.0, 12.0):
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

# ---------------- synthwave voices (kit-derived, cached) -----------------------
_CACHE = {}

def _cached(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]

def sw_kick():
    """Mid-tempo analog kick: punchy body, short-ish tail."""
    return kit.kick(fund=51.0, sweep=170.0, sweep_ms=45.0, decay=0.34, click=0.4)

def gated_snare():
    """THE 80s sound: crack snare + hall tail truncated hard after 0.25 s."""
    dry = kit.snare(tone_hz=200.0, noise_lo=1500.0, noise_hi=7200.0,
                    tone_dec=0.09, noise_dec=0.17, bright=1.05)
    ir_len = int(2.2 * SR)
    tir = np.arange(ir_len) / SR
    g = np.random.default_rng(77)
    ir = g.normal(0, 1, ir_len) * np.exp(-tir / 0.9)
    ir[:int(0.02 * SR)] = 0.0
    ir /= np.sqrt(np.sum(ir ** 2))
    N = 1 << int(np.ceil(np.log2(len(dry) + ir_len)))
    wet = np.fft.irfft(np.fft.rfft(dry, N) * np.fft.rfft(ir, N), N)[:len(dry)]
    wet *= 1.9
    out = kit.gate_env(wet, 0.25)
    return dry * 0.75 + out

def hat_c(vel=None):
    return kit.hat(False)

def hat_o():
    o = kit.hat(True)
    return o[:int(0.18 * SR)]  # choke against next kick

def crash():
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    x = kit._fft_hp(nprng.uniform(-1, 1, n), 4500.0)
    x *= np.exp(-t / 0.55) * 0.5
    shimmer = np.sin(2 * np.pi * 6200 * t) * np.exp(-t / 0.4) * 0.04
    return x + shimmer

def bass_pluck(note, dur_beats=0.5, cutoff=650.0):
    """Warm LP'd analog bass 8ths."""
    def make():
        return kit.pluck_bass(note, dur_beats, bpm=BPM, cutoff=cutoff, decay=0.30)
    return _cached(("bp", note, round(cutoff)), make)

def arp_pluck(note, cutoff=2600.0):
    """Bright sequencer arp voice."""
    def make():
        x = kit._bl_saw(midi_f(note), int(0.30 * SR))
        x = kit._fft_lp(x, cutoff)
        t = np.arange(len(x)) / SR
        x *= np.exp(-t / 0.075)
        a = max(1, int(0.002 * SR))
        x[:a] *= np.linspace(0, 1, a)
        return x * 0.55
    return _cached(("arp", note, round(cutoff, -2)), make)

def lead_saw(note, dur_beats, seed):
    """Supersaw stack (7 voices), mono; caller doubles for width."""
    def make():
        return kit.supersaw(note, dur_beats, bpm=BPM, voices=7,
                            spread_cents=20.0, cutoff=5200.0)
    return _cached(("ld", note, round(dur_beats * 4) / 4.0, seed), make)

def riser(dur_s):
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    nz = nprng.uniform(-1, 1, n)
    # stepped bandpass sweep 500 -> 7000 Hz
    x = np.zeros(n)
    steps = 24
    for i in range(steps):
        s0, s1 = int(i * n / steps), int((i + 1) * n / steps)
        fc = 500.0 * (7000.0 / 500.0) ** (i / (steps - 1))
        seg = kit._fft_bp(nz[s0:s1], fc * 0.6, fc * 1.4)
        x[s0:s1] = seg
    env = (t / dur_s) ** 2.2
    wob = 1.0 + 0.25 * np.sin(2 * np.pi * (t / dur_s) * 14.0)
    return x * env * wob * 0.8

# ---------------- composition --------------------------------------------------
events = []          # (kind, note, beat, dur, vel, extra)
KICK_ONSETS = []     # beats, for sidechain duck

P_PAD, P_PIANO, P_BOX, P_SUB = "pad", "piano", "box", "sub"
P_KICK, P_SNARE, PHAT_C, PHAT_O, P_CRASH = "kick", "snare", "hatc", "hato", "crash"
P_BASS, P_ARP, P_LEAD, P_RISER, P_BOOM = "bass", "arp", "lead", "riser", "boom"

# chord loop: Am - Fmaj7 - Cadd9 - G, one chord per 2 bars
CHORDS = [
    dict(pad=[57, 60, 64, 71], arp=[57, 64, 69, 72], root=33),   # Am add9
    dict(pad=[53, 57, 60, 64], arp=[53, 60, 65, 69], root=29),   # F maj7
    dict(pad=[52, 55, 60, 64], arp=[52, 60, 64, 67], root=36),   # C add9
    dict(pad=[50, 55, 59, 62], arp=[50, 59, 62, 67], root=31),   # G
]
def chord_at(bar):
    return CHORDS[(bar // 2) % 4]

SECTION_BARS = [
    ("dawn", 0, 8), ("ignition", 8, 16), ("drive", 16, 32),
    ("starlight", 32, 40), ("convergence", 40, 44),
    ("hyperdrive", 44, 60), ("afterglow", 60, 68),
]
SEC_OF_BAR = {}
for (sid, b0, b1) in SECTION_BARS:
    for b in range(b0, b1):
        SEC_OF_BAR[b] = sid

# ---- pads: every 2 bars, whole-loop span ----
for bar in range(0, 68, 2):
    ch = chord_at(bar)
    sec = SEC_OF_BAR[bar]
    vel = 13 if sec == "dawn" else (15 if sec == "afterglow" else 22)
    if sec == "hyperdrive":
        vel = 24
    if sec == "starlight":
        vel = 20
    for j, n in enumerate(ch["pad"]):
        events.append((P_PAD, n, float(bar) * 4.0 + j * 0.06, 8.6, vel + j * 2))

# ---- arpeggio sequencer ----
def sec_arp_density(sec):
    return {"dawn": 0.5, "ignition": 0.5, "drive": 1.0, "starlight": 0.0,
            "convergence": 1.0, "hyperdrive": 1.0, "afterglow": 0.5}[sec]

arp_step = 0
for bar in range(0, 68):
    sec = SEC_OF_BAR[bar]
    dens = sec_arp_density(sec)
    if dens == 0.0:
        continue
    ch = chord_at(bar)
    tones = ch["arp"]
    steps_per_beat = 2 if dens == 0.5 else 4
    n_steps = 4 * steps_per_beat
    for i in range(n_steps):
        bt = bar * 4.0 + i / steps_per_beat
        if sec == "convergence":
            prog = (bt - 160.0) / 16.0
            vel = int(28 + 34 * min(1.0, max(0.0, prog)))
            co = 900.0 * (4.5 ** min(1.0, max(0.0, prog)))
        elif sec == "dawn":
            vel = 26 + (6 if i % steps_per_beat == 0 else 0)
            co = 1800.0
        elif sec == "afterglow":
            vel = max(14, 34 - (bt - 240.0) * 0.45)
            co = 2000.0
        elif sec == "hyperdrive":
            vel = 40 + (8 if i % 4 == 0 else 0) + rng.randint(-4, 4)
            co = 3400.0
        else:
            vel = 34 + (7 if i % steps_per_beat == 0 else 0) + rng.randint(-3, 3)
            co = 2600.0
        if steps_per_beat == 2:
            pat = [0, 1, 2, 3, 2, 1, 3, 2]
            nt = tones[pat[(i % 4) * 2 % 8]]
        else:
            pat = [0, 1, 2, 3, 1, 3, 2, 0, 1, 2, 3, 2, 1, 3, 0, 3]
            nt = tones[pat[i % 16]]
        pan = 0.45 if (arp_step % 2 == 0) else -0.45
        events.append((P_ARP, nt, bt + rng.uniform(-0.008, 0.008), 0.24, int(vel), co, pan))
        arp_step += 1

# ---- bass ----
for bar in range(0, 68):
    sec = SEC_OF_BAR[bar]
    ch = chord_at(bar)
    root = ch["root"]
    if sec in ("dawn", "starlight"):
        if bar % 2 == 0:
            events.append((P_SUB, root + 12, float(bar) * 4.0, 8.4,
                           26 if sec == "starlight" else 18))
        continue
    if sec == "afterglow":
        if bar % 2 == 0:
            events.append((P_SUB, root + 12, float(bar) * 4.0, 8.4,
                           max(10, 24 - (bar - 60))))
        if bar < 64:
            for h in range(4):
                events.append((P_BASS, root, bar * 4.0 + h * 1.0, 0.5, 26))
        continue
    # driving 8ths
    for h in range(8):
        bt = bar * 4.0 + h * 0.5
        v = 30 + (8 if h % 2 == 0 else 0) + rng.randint(-4, 4)
        nt = root
        if sec == "hyperdrive" and h == 7:
            nt = root + 12   # octave lift into next bar
        events.append((P_BASS, nt, bt, 0.48, v))

# ---- drums ----
for bar in range(0, 68):
    sec = SEC_OF_BAR[bar]
    b = float(bar) * 4.0
    if sec == "ignition":
        for k in (0.0, 2.0):
            events.append((P_KICK, 0, b + k, 0.5, 78)); KICK_ONSETS.append(b + k)
        if bar >= 14:
            events.append((P_KICK, 0, b + 2.5, 0.5, 60)); KICK_ONSETS.append(b + 2.5)
        hv = 24 + (bar - 8) * 5
        for i in range(8):
            v = hv + (10 if i % 2 == 0 else 0) + rng.randint(-4, 4)
            events.append((PHAT_C, 0, b + i * 0.5, 0.25, int(min(v, 64)), 0.2))
        if bar >= 12:
            for s in (1.0, 3.0):
                events.append((P_SNARE, 0, b + s, 0.5, 88))
    elif sec == "drive":
        for k in (0.0, 2.0):
            events.append((P_KICK, 0, b + k, 0.5, 84)); KICK_ONSETS.append(b + k)
        for s in (1.0, 3.0):
            events.append((P_SNARE, 0, b + s, 0.5, 92 + rng.randint(-3, 3)))
        for i in range(8):
            v = (64 if i % 2 == 0 else 38) + rng.randint(-5, 5)
            events.append((PHAT_C, 0, b + i * 0.5, 0.25, int(v), 0.2))
        if bar % 4 == 3:
            events.append((PHAT_O, 0, b + 3.5, 0.5, 56, -0.15))
    elif sec == "convergence":
        if bar < 42:
            for k in (0.0, 2.0):
                events.append((P_KICK, 0, b + k, 0.5, 82)); KICK_ONSETS.append(b + k)
            for i in range(8):
                v = 30 + (bar - 40) * 8 + (10 if i % 2 == 0 else 0) + rng.randint(-4, 4)
                events.append((PHAT_C, 0, b + i * 0.5, 0.25, int(v), 0.25))
            for s in (1.0, 3.0):
                events.append((P_SNARE, 0, b + s, 0.5, 86))
        else:
            for q in range(4):
                events.append((P_KICK, 0, b + q, 0.5, 86)); KICK_ONSETS.append(b + q)
            if bar == 42:
                for i in range(8):
                    events.append((P_SNARE, 0, b + i * 0.5, 0.25, int(46 + i * 4)))
            else:
                for i in range(16):
                    if bar == 43 and i >= 14:
                        continue  # half-beat of silence before the slam
                    events.append((P_SNARE, 0, b + i * 0.25, 0.25,
                                   int(44 + i * 3.4)))
    elif sec == "hyperdrive":
        for q in range(4):
            events.append((P_KICK, 0, b + q, 0.5, 88)); KICK_ONSETS.append(b + q)
        for s in (1.0, 3.0):
            events.append((P_SNARE, 0, b + s, 0.5, 94 + rng.randint(-3, 3)))
        for i in range(16):
            v = 30 + (14 if i % 4 == 0 else 0) + rng.randint(-5, 5)
            events.append((PHAT_C, 0, b + i * 0.25, 0.125, int(v), 0.25))
        for a in (0.5, 1.5, 2.5, 3.5):
            events.append((PHAT_O, 0, b + a, 0.5, 52, 0.18))
        if bar % 8 == 4:
            events.append((P_CRASH, 0, b, 2.0, 62, -0.1))
    elif sec == "afterglow":
        if bar <= 61:
            for k in (0.0, 2.0):
                events.append((P_KICK, 0, b + k, 0.5, 64)); KICK_ONSETS.append(b + k)
            for s in (1.0, 3.0):
                events.append((P_SNARE, 0, b + s, 0.5, 70))
            for i in range(8):
                v = max(18, 46 - (bar - 60) * 10) + rng.randint(-4, 4)
                events.append((PHAT_C, 0, b + i * 0.5, 0.25, int(v), 0.2))

# crashes at structural downbeats
for cb, cvv in ((16.0, 70), (176.0, 78)):
    events.append((P_CRASH, 0, cb, 2.0, cvv, 0.1))

# impact boom at hyperdrive drop
events.append((P_BOOM, 33, 176.0 - 0.001, 2.0, 90))

# riser into the drop (last 2 bars of convergence)
events.append((P_RISER, 0, 168.0, 8.0, 74))

# ---- lead melodies ----
THEME_A = [
    (64.0, 76, 1.5, 50), (65.5, 79, 0.5, 44), (66.0, 81, 2.0, 54),
    (69.0, 79, 0.5, 42), (69.5, 76, 1.5, 46), (71.5, 74, 1.0, 42),
    (72.0, 72, 1.5, 48), (74.0, 76, 0.5, 42), (74.5, 77, 1.5, 52),
    (76.5, 76, 0.5, 40), (77.0, 74, 1.0, 44),
    (80.0, 76, 2.5, 52), (83.0, 79, 0.5, 44), (84.0, 81, 3.0, 56),
    (88.0, 74, 1.5, 48), (90.0, 71, 0.5, 40), (90.5, 74, 1.0, 44),
    (92.0, 76, 1.5, 48), (94.0, 74, 2.0, 50),
    (96.0, 81, 1.0, 52), (97.0, 79, 0.5, 44), (97.5, 81, 1.0, 50),
    (99.0, 84, 2.0, 58), (101.5, 81, 0.5, 46), (102.0, 79, 1.5, 48),
    (104.0, 77, 1.0, 46), (105.5, 76, 0.5, 42), (106.0, 77, 2.0, 50),
    (108.5, 76, 0.5, 42), (109.0, 74, 1.5, 46),
    (112.0, 76, 2.5, 52), (115.0, 79, 0.5, 44), (116.0, 84, 3.0, 56),
    (120.0, 86, 1.5, 54), (122.0, 83, 0.5, 46), (122.5, 86, 1.0, 50),
    (124.0, 83, 1.5, 48), (126.0, 81, 2.0, 52),
]
for (t, n, d, v) in THEME_A:
    tt = t + rng.uniform(-0.03, 0.03)
    events.append((P_LEAD, n, tt, d, v, -0.28, 0))
    events.append((P_LEAD, n, tt + 0.015, d, int(v * 0.92), 0.28, 1))
    events.append((P_LEAD, n + 12, tt + 0.01, d * 0.92, int(v * 0.30), 0.0, 2))

# hyperdrive: theme A up an octave + sub-octave support
for (t, n, d, v) in THEME_A:
    tt = t - 64.0 + 176.0 + rng.uniform(-0.02, 0.02)
    events.append((P_LEAD, n + 12, tt, d * 0.95, min(80, v + 10), -0.28, 0))
    events.append((P_LEAD, n + 12, tt + 0.015, d * 0.95, int(min(80, v + 10) * 0.92), 0.28, 1))
    events.append((P_LEAD, n, tt + 0.01, d * 0.88, int(v * 0.42), 0.0, 2))

# starlight piano melody (felt piano - the emotional core)
STARLIGHT_MEL = [
    (128.5, 69, 3.0, 40), (132.0, 72, 2.0, 42), (134.5, 76, 3.0, 44),
    (138.0, 74, 1.5, 40), (140.0, 72, 1.0, 38), (141.5, 74, 2.5, 42),
    (144.5, 76, 2.0, 44), (147.0, 79, 1.5, 46), (149.0, 76, 1.0, 40),
    (150.5, 74, 3.0, 42), (154.0, 72, 1.5, 40), (156.0, 69, 4.0, 44),
]
mel_sorted = sorted(STARLIGHT_MEL, key=lambda e: e[0])
mel_adj = []
for (t, n, d, v) in mel_sorted:
    tt = t + rng.uniform(-0.04, 0.06)
    if d >= 2.5:
        tt += 0.08
    mel_adj.append([tt, n, d, v])
for i in range(len(mel_adj) - 1):
    gap = mel_adj[i + 1][0] - mel_adj[i][0]
    if mel_adj[i][2] < gap + 0.5:
        mel_adj[i][2] = gap + 0.5
for (tt, n, d, v) in mel_adj:
    events.append((P_PIANO, n, tt, d, v))

# music-box sparkles at structural moments
for (bt, n, v) in ((64.0, 88, 24), (128.0, 81, 22), (136.0, 93, 18),
                   (152.0, 88, 20), (176.0, 93, 26), (264.0, 81, 20)):
    events.append((P_BOX, n, bt, 1.2, v))

n_events = len(events)
print(f"score: {n_events} events, {TOTAL_BEATS * BEAT:.1f}s @ {BPM} BPM", flush=True)

# ---------------- render & mix ---------------------------------------------------
total_len = int((TOTAL_BEATS * BEAT + 4.5) * SR)
STEM_NAMES = ["pad", "arp", "bass", "sub", "drums", "lead", "piano", "box", "fx"]
# float32 stems: ~576 MB instead of ~1.15 GB (machine runs parallel agents)
stems = {k: np.zeros((total_len, 2), dtype=np.float32) for k in STEM_NAMES}
PANS = {"pad": 0.10, "arp": 0.0, "bass": 0.0, "sub": 0.0, "drums": 0.0,
        "lead": 0.0, "piano": 0.0, "box": -0.35, "fx": 0.0}

def add_to(stem, buf, t0_beats, pan):
    L = np.cos((pan + 1) * np.pi / 4)
    R = np.sin((pan + 1) * np.pi / 4)
    s = int(round(t0_beats * BEAT * SR))
    if s < 0:
        buf = buf[-s:]
        s = 0
    e = min(s + len(buf), total_len)
    if e <= s:
        return
    stems[stem][s:e, 0] += buf[:e - s] * L
    stems[stem][s:e, 1] += buf[:e - s] * R

KICK_BUF = sw_kick()
SNARE_BUF = gated_snare()
CRASH_BUF = crash()

for ev in events:
    kind = ev[0]
    if kind == P_PAD:
        _, note, t0, dur, vel = ev
        buf = pad_voice(note, t0 * BEAT, dur, vel)
        add_to("pad", buf, t0, PANS["pad"])
    elif kind == P_PIANO:
        _, note, t0, dur, vel = ev
        buf = felt_piano(note, t0 * BEAT, dur, vel)
        add_to("piano", buf, t0, 0.0)
    elif kind == P_BOX:
        _, note, t0, dur, vel = ev
        buf = music_box(note, t0 * BEAT, dur, vel)
        add_to("box", buf, t0, PANS["box"])
    elif kind == P_SUB:
        _, note, t0, dur, vel = ev
        buf = sub_note(note, t0 * BEAT, dur, vel)
        add_to("sub", buf, t0, 0.0)
    elif kind == P_KICK:
        _, _, t0, dur, vel = ev
        add_to("drums", KICK_BUF * (vel / 88.0), t0, 0.0)
    elif kind == P_SNARE:
        _, _, t0, dur, vel = ev
        add_to("drums", SNARE_BUF * (vel / 94.0), t0, 0.0)
    elif kind == PHAT_C:
        _, _, t0, dur, vel, pan = ev
        add_to("drums", hat_c() * (vel / 64.0), t0, pan)
    elif kind == PHAT_O:
        _, _, t0, dur, vel, pan = ev
        add_to("drums", hat_o() * (vel / 56.0), t0, pan)
    elif kind == P_CRASH:
        _, _, t0, dur, vel, pan = ev
        add_to("fx", CRASH_BUF * (vel / 78.0), t0, pan)
    elif kind == P_BASS:
        _, note, t0, dur, vel = ev
        buf = bass_pluck(note) * (vel / 38.0)
        add_to("bass", buf, t0, 0.0)
    elif kind == P_ARP:
        _, note, t0, dur, vel, co, pan = ev
        buf = arp_pluck(note, co) * (vel / 42.0)
        add_to("arp", buf, t0, pan)
    elif kind == P_LEAD:
        _, note, t0, dur, vel, pan, variant = ev
        buf = lead_saw(note, dur, variant) * (vel / 58.0)
        add_to("lead", buf, t0, pan)
    elif kind == P_RISER:
        _, _, t0, dur, vel = ev
        buf = riser(dur * BEAT) * (vel / 74.0)
        add_to("fx", buf, t0, 0.0)
    elif kind == P_BOOM:
        _, note, t0, dur, vel = ev
        buf = kit.kick_808(note, 3.0, bpm=BPM) * (vel / 90.0)
        add_to("fx", buf, t0, 0.0)
print("rendered notes", flush=True)

# ---- sidechain pump (pads/arp/bass/sub duck under kicks) ----
env_acc = np.zeros(total_len)
for tb in KICK_ONSETS:
    s = int(tb * BEAT * SR)
    n = int(0.55 * SR)
    e = min(s + n, total_len)
    if e <= s:
        continue
    env_acc[s:e] += np.exp(-np.arange(e - s) / (0.14 * SR))
duck = 1.0 - 0.45 * np.clip(env_acc, 0.0, 1.0)
for k in ("pad", "arp", "bass", "sub"):
    stems[k] *= duck[:, None]
stems["lead"] *= (1.0 - 0.22 * np.clip(env_acc, 0.0, 1.0))[:, None]
print("sidechain done", flush=True)

# gains
GAINS = {"pad": 0.92, "arp": 0.72, "bass": 0.95, "sub": 0.85, "drums": 1.0,
         "lead": 0.9, "piano": 1.0, "box": 0.8, "fx": 0.9}
WETS = {"pad": 0.45, "arp": 0.25, "bass": 0.07, "sub": 0.08, "drums": 0.06,
        "lead": 0.32, "piano": 0.5, "box": 0.6, "fx": 0.4}
for k in STEM_NAMES:
    stems[k] *= GAINS[k]

# ---------------- FFT convolution reverb --------------------------------------
def _rms_at(buf, t0, dur=4.0):
    s = int(t0 * SR); e = int((t0 + dur) * SR)
    seg = buf[s:e]
    return float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0

print("PER-STEM RMS @ [30s, 60s, 120s]:", flush=True)
for k in STEM_NAMES:
    print(f"  {k:>6}: {_rms_at(stems[k][:, 0], 30):.4f} {_rms_at(stems[k][:, 0], 60):.4f} "
          f"{_rms_at(stems[k][:, 0], 120):.4f}", flush=True)

ir_len = int(2.6 * SR)
tir = np.arange(ir_len) / SR
def make_ir(seed):
    g = np.random.default_rng(seed)
    ir = g.normal(0, 1, ir_len) * np.exp(-tir / 1.05)
    ir[:int(0.04 * SR)] = 0.0
    return ir / np.sqrt(np.sum(ir ** 2))

N_FFT = 1 << int(np.ceil(np.log2(total_len + ir_len)))
wetL = np.zeros(total_len)
wetR = np.zeros(total_len)
gc.collect()
for ch, seed in ((0, 11), (1, 23)):
    ir = make_ir(seed)
    IR = np.fft.rfft(ir, N_FFT)
    for k in STEM_NAMES:
        X = np.fft.rfft(stems[k][:, ch].astype(np.float64), N_FFT)
        w = np.fft.irfft(X * IR, N_FFT)[:total_len]
        del X
        if ch == 0:
            wetL += WETS[k] * w
        else:
            wetR += WETS[k] * w
        del w
del IR
print("reverb done", flush=True)

# progressive mix: fold each dry stem in and free it immediately
mix = np.zeros((total_len, 2))
for k in STEM_NAMES:
    mix += stems[k]
    stems[k] = None
del stems
gc.collect()
print("dry mix folded", flush=True)
mix[:, 0] += wetL
mix[:, 1] += wetR

# ---------------- master --------------------------------------------------------
S = np.fft.rfft(mix, axis=0)
freqs = np.fft.rfftfreq(total_len, 1 / SR)
hp = np.clip((freqs - 26.0) / 34.0, 0, 1)
lp = 1.0 - 0.42 * np.clip((freqs - 9500.0) / 6000.0, 0, 1)
S *= (hp * lp)[:, None]
mix = np.fft.irfft(S, total_len, axis=0)
mix = np.tanh(mix * 1.15)

# global arc fades: 0.4s fade-in, long outro fade 156.5 -> 164.5 s
t_ax = np.arange(total_len) / SR
fade_in = np.clip(t_ax / 0.4, 0, 1)
u = np.clip((t_ax - 156.5) / 8.0, 0, 1)
fade_out = 0.5 * (1 + np.cos(np.pi * u))
mix *= (fade_in * fade_out)[:, None]

peak = float(np.max(np.abs(mix)))
# 0.69 (not 0.89): leaves headroom so the MP3 decode lands <= 1.0
# (tanh-saturated material overshoots ~+3 dB through lossy coding)
mix *= 0.69 / peak
rms_head = float(np.sqrt(np.mean(mix[int(30 * SR):int(60 * SR)] ** 2)))
rms_tail = float(np.sqrt(np.mean(mix[int((TOTAL_BEATS * BEAT + 1.5) * SR):] ** 2)))
print(f"master: peak pre-norm {peak:.3f} | rms head {rms_head:.4f} tail {rms_tail:.5f}", flush=True)

pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(WAV, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("WAV:", WAV, os.path.getsize(WAV), flush=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", WAV, "-codec:a",
                "libmp3lame", "-b:a", "192k", MP3], check=True)
print("MP3:", MP3, os.path.getsize(MP3), flush=True)

# ---------------- timeline export (single source of truth for the video) -------
dur = TOTAL_BEATS * BEAT + 3.0
sections = []
for (sid, b0, b1) in SECTION_BARS:
    label = {"dawn": "I · DAWN", "ignition": "II · IGNITION",
             "drive": "III · NEON DRIVE", "starlight": "IV · STARLIGHT",
             "convergence": "V · CONVERGENCE", "hyperdrive": "VI · HYPERDRIVE",
             "afterglow": "VII · AFTERGLOW"}[sid]
    sections.append(dict(id=sid, name=label,
                         start=round(b0 * BAR, 3), end=round(b1 * BAR, 3)))
tl = dict(title="Neon Drifter", bpm=BPM, duration=round(dur, 3),
          beatsPerBar=4, audio="audio/Neon Drifter.mp3", sections=sections)
with open(os.path.join(HERE, "timeline.json"), "w", encoding="utf-8") as f:
    json.dump(tl, f, indent=1)
js = "window.TIMELINE = " + json.dumps(tl, indent=1) + ";\n"
with open(os.path.join(os.path.dirname(HERE), "js", "timeline.js"), "w",
          encoding="utf-8") as f:
    f.write(js)
print("timeline exported:", json.dumps(tl)[:200], "...", flush=True)
