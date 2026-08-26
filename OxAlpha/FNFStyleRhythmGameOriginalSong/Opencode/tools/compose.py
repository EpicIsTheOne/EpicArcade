"""
NEON VOLTAGE - original song composer + chart exporter
Renders an original call-and-response battle track (KAZ vs VEXX) to WAV->MP3
and exports js/chart-data.js generated from the exact same note grid,
guaranteeing audio/chart sync by construction.
"""
import numpy as np
import wave, os, sys, json, subprocess, zlib, struct, math

SR = 44100
BPM = 148.0
SPB = 60.0 / BPM              # seconds per beat
BAR = SPB * 4.0               # seconds per bar
TOTAL_BARS = 61               # 8 intro + 16 verse + 16 build + 16 climax + 5 outro
TAIL_S = 1.2
N_SAMPLES = int((TOTAL_BARS * BAR + TAIL_S) * SR)
rng = np.random.default_rng(20260825)

# ---------------------------------------------------------------- helpers
def t_bar(b): return b * BAR

def add(busL, busR, start_s, sig, gain=1.0, pan=0.0):
    """pan -1..1 equal power; sig mono ndarray"""
    i0 = int(start_s * SR)
    if i0 >= N_SAMPLES: return
    seg = sig[:N_SAMPLES - i0]
    th = (pan + 1.0) * 0.25 * math.pi   # -1..1 -> 0..pi/2
    gl, gr = math.cos(th), math.sin(th)
    busL[i0:i0+len(seg)] += seg * gain * gl
    busR[i0:i0+len(seg)] += seg * gain * gr

def env_pluck(n, tau, att=0.004, sus=0.0):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = int(att * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e

def env_pad(n, att, rel):
    t = np.arange(n) / SR
    e = np.ones(n)
    a = int(att * SR); r = int(rel * SR)
    if a > 0: e[:a] = np.linspace(0, 1, a)
    if r > 0 and r < n: e[-r:] *= np.linspace(1, 0, r)
    elif r >= n: e[:] = 0
    return e

def onepole_lp(x, fc, passes=1):
    a = 1.0 - math.exp(-2.0 * math.pi * fc / SR)
    y = x.copy()
    for _ in range(passes):
        acc = 0.0
        out = np.empty_like(y)
        # vectorized-ish via lfilter manual loop is slow in py; use scipy-free trick:
        # recursive filter via np.frompyfunc is still slow. Use cumulative approach:
        # y[n] = y[n-1] + a*(x[n]-y[n-1])  == exponential smoothing
        out = _exp_smooth(y, a)
        y = out
    return y

def _exp_smooth(x, a):
    """exact one-pole y[n]=(1-a)y[n-1]+a x[n] via FFT frequency response (no scipy)."""
    n = len(x)
    N = 1 << (int(math.log2(n + 1)) + 1)
    d = 1.0 - a
    k = np.fft.rfftfreq(N, 1.0 / SR) * 2 * math.pi
    H = a / (1.0 - d * np.exp(-1j * k))
    return np.fft.irfft(np.fft.rfft(x, N) * H, N)[:n]

def bl_saw(f, n, detune_cents=0.0, phase=None):
    """band-limited additive sawtooth"""
    kmax = min(int(17000.0 / max(f, 20.0)), 56)
    t = np.arange(n) / SR
    out = np.zeros(n)
    det = 2.0 ** (detune_cents / 1200.0)
    for k in range(1, kmax + 1):
        ph = rng.uniform(0, 2 * math.pi) if phase is None else phase
        out += math.sin(ph) * np.sin(2 * math.pi * f * k * det * t + ph)
    return out / max(kmax / 6.0, 1.0)

def bl_square(f, n, detune_cents=0.0):
    kmax = min(int(17000.0 / max(f, 20.0)), 48)
    t = np.arange(n) / SR
    out = np.zeros(n)
    det = 2.0 ** (detune_cents / 1200.0)
    ks = range(1, kmax + 1, 2)
    norm = sum(1.0 / k for k in ks)
    for k in ks:
        ph = rng.uniform(0, 2 * math.pi)
        out += np.sin(2 * math.pi * f * k * det * t + ph) / k
    return out / norm

def sine(f, n, detune_cents=0.0):
    t = np.arange(n) / SR
    return np.sin(2 * math.pi * f * 2.0 ** (detune_cents / 1200.0) * t)

def vibrato_mod(n, rate, depth, ramp=0.1):
    t = np.arange(n) / SR
    r = np.clip(t / ramp, 0, 1)
    return 1.0 + depth * np.sin(2 * math.pi * rate * t) * r

# ---------------------------------------------------------------- drums
def mk_kick():
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    f = 42 + 118 * np.exp(-t / 0.028)
    ph = 2 * math.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.085)
    click_n = int(0.006 * SR)
    click = rng.standard_normal(click_n) * np.linspace(1, 0, click_n) ** 2
    out = body.copy(); out[:click_n] += click * 0.7
    return out * 1.15

def mk_snare():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - onepole_lp(noise, 900.0)
    tone = np.sin(2 * math.pi * 186 * t) * np.exp(-t / 0.03)
    return (hp * np.exp(-t / 0.065) * 0.9 + tone * 0.8) * 0.95

def mk_clap():
    n = int(0.25 * SR)
    out = np.zeros(n)
    for k, off in enumerate([0.0, 0.011, 0.023]):
        i = int(off * SR)
        m = n - i
        t = np.arange(m) / SR
        nz = rng.standard_normal(m)
        bp = onepole_lp(nz, 5200) - onepole_lp(nz, 900)
        out[i:] += bp * np.exp(-t / (0.02 if k < 2 else 0.10)) * (0.7 if k < 2 else 1.0)
    return out * 0.9

def mk_hat(open_=False):
    dur = 0.28 if open_ else 0.05
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    hp = nz - onepole_lp(nz, 6500.0)
    hp = hp - onepole_lp(hp, 8000.0) * 0.4
    return hp * np.exp(-t / (0.09 if open_ else 0.014))

def mk_rim():
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    bp = onepole_lp(nz, 3800) - onepole_lp(nz, 1500)
    return bp * np.exp(-t / 0.008) * 1.4

def mk_crash():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    hp = nz - onepole_lp(nz, 4500.0)
    shimmer = 1.0 + 0.3 * np.sin(2 * math.pi * 7.3 * t)
    return hp * np.exp(-t / 0.45) * shimmer * 0.8

def mk_riser(dur, f0=300, f1=5500):
    n = int(dur * SR)
    t = np.arange(n) / SR
    prog = t / dur
    nz = rng.standard_normal(n)
    center = f0 * (f1 / f0) ** prog
    # sweeping bandpass approximated by differencing two smoothing filters with varying cutoff
    out = np.zeros(n)
    chunk = 2048
    for i in range(0, n, chunk):
        j = min(i + chunk, n)
        c = center[i:j].mean()
        lp1 = onepole_lp(nz[i:j], c * 1.4)
        bp = lp1 - onepole_lp(lp1, c * 0.55)
        out[i:j] = bp
    sweep_f = 220 * (2.6) ** prog
    ph = 2 * math.pi * np.cumsum(sweep_f) / SR
    out += np.sin(ph) * 0.22 * (prog ** 2)
    return out * (0.25 + 0.75 * prog ** 1.6)

def mk_impact():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    f = 55 * np.exp(-t / 0.09) + 34
    ph = 2 * math.pi * np.cumsum(f) / SR
    boom = np.sin(ph) * np.exp(-t / 0.22)
    nz = rng.standard_normal(n)
    hp = nz - onepole_lp(nz, 3500)
    return boom * 1.3 + hp * np.exp(-t / 0.30) * 0.5

# ---------------------------------------------------------------- instruments
def inst_lead_opp(midi, dur, vel):
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    n = int((dur + 0.10) * SR)
    vib = vibrato_mod(n, 5.5, 0.007, ramp=0.12)
    a = bl_saw(f, n, -6) * vib
    b = bl_saw(f, n, +6) * vib
    s = (a + b) * 0.5
    s = onepole_lp(s, 2100, passes=2)
    s = np.tanh(s * 1.9) * 0.62                      # grit drive
    trem = 1.0 - 0.15 * (0.5 + 0.5 * np.sin(2 * math.pi * 6.0 * np.arange(n) / SR))
    s *= trem
    s *= env_pluck(n, dur * 0.9 + 0.06, att=0.006)
    rel = int(0.08 * SR)
    if rel < n: s[-rel:] *= np.linspace(1, 0, rel)
    return s * vel

def inst_lead_plr(midi, dur, vel):
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    n = int((dur + 0.10) * SR)
    vib = vibrato_mod(n, 5.8, 0.006, ramp=0.10)
    sq = bl_square(f, n) * vib
    sa = bl_saw(f, n, -10) * vib * 0.6
    sb = bl_saw(f, n, +10) * vib * 0.6
    s = sq + sa + sb
    s = onepole_lp(s, 3100, passes=2)
    s *= env_pluck(n, dur * 0.85 + 0.07, att=0.004)
    rel = int(0.08 * SR)
    if rel < n: s[-rel:] *= np.linspace(1, 0, rel)
    return s * vel

def inst_bass(midi, dur, vel):
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    n = int((dur + 0.05) * SR)
    saw = bl_saw(f, n)
    saw = onepole_lp(saw, 720, passes=2)
    sub = sine(max(f * 0.5, 27.0), n)
    s = saw * 0.8 + sub * 0.75
    e = env_pluck(n, max(dur * 1.1, 0.14), att=0.003)
    s = s * e
    rel = int(0.04 * SR)
    if rel < n: s[-rel:] *= np.linspace(1, 0, rel)
    return s * vel

def inst_pad_chord(midis, dur, vel, bright=1400.0):
    n = int((dur + 0.7) * SR)
    s = np.zeros(n)
    for m in midis:
        f = 440.0 * 2 ** ((m - 69) / 12.0)
        for det, w in ((-8, .8), (0, 1.0), (+8, .8)):
            v = bl_saw(f, n, det) * w
            v = onepole_lp(v, bright, passes=2)
            s += v / len(midis) / 2.2
    s *= env_pad(n, 0.35, 0.65)
    return s * vel

def inst_arp(midi, dur, vel):
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    n = int(0.20 * SR)
    s = bl_saw(f, n) * 0.5 + bl_square(f, n) * 0.5
    s = onepole_lp(s, 2600)
    s *= env_pluck(n, 0.055, att=0.002)
    return s * vel

def inst_shimmer(midi, dur, vel):
    f = 440.0 * 2 ** ((midi - 69) / 12.0)
    n = int((dur + 0.5) * SR)
    s = bl_saw(f, n, 0) + bl_saw(f, n, +9) * 0.7
    s = onepole_lp(s, 3800, passes=1)
    s *= env_pad(n, 0.02, 0.5) * env_pluck(n, dur * 0.5)
    return s * vel * 0.8

# ---------------------------------------------------------------- buses
bus_names = ["drums", "bass", "pads", "arp", "leadO", "leadP", "fx", "send_rev", "send_dly"]
BUSES = {n: (np.zeros(N_SAMPLES), np.zeros(N_SAMPLES)) for n in bus_names}

def add_note(bus, t0, sig, gain, pan):
    L, R = BUSES[bus]
    add(L, R, t0, sig, gain, pan)

def add_center(bus, t0, sig, gain):
    L, R = BUSES[bus]
    add(L, R, t0, sig, gain, 0.0)

# ---------------------------------------------------------------- arrangement data
CHORD_CYCLE = ["Em", "C", "G", "D"]
PAD_VOICINGS = {
    "Em": [52, 59, 64, 67],
    "C":  [48, 55, 60, 64],
    "G":  [55, 62, 67, 71],
    "D":  [57, 62, 66, 69],
}
BASS_ROOTS = {"Em": 40, "C": 36, "G": 43, "D": 38}

def chord_at(bar): return CHORD_CYCLE[int(bar) % 4]

# melody phrases -------------------------------------------------------------
# each: list of (beat_in_phrase, dur_beats, midi[, vel])
O1 = [(0,.5,52),(1,.5,52),(1.5,.5,55),(2,1,59),(3.5,.5,57),
      (4,.5,59),(5.5,.5,57),(6,.5,55),(7,.5,52),
      (10,1,50),(11,.5,52),
      (12,1.5,55),(14,.5,54),(14.5,.5,55),(15,1,57)]
O2 = [(0,.5,52),(0.5,.5,52),(1,.5,55),(1.5,.5,59),(2,1,59),(3,.5,62),(3.5,.5,59),
      (4,.5,60),(5,.5,59),(5.5,.5,55),(6,1,57),
      (8,.5,55),(8.5,.5,52),(9,.5,55),(9.5,.5,59),(10,1,62),(11,.5,59),
      (12,.5,57),(12.5,.5,59),(13,1,62),(14,.5,61),(14.5,.5,62),(15,1,66)]
P1 = [(0,.5,64),(0.5,.5,67),(1,.75,71),(1.75,.25,69),(2,.5,67),(2.5,.5,64),(3,1,62),
      (4,.5,64),(4.5,.5,67),(5,.75,71),(5.75,.25,72),(6,.5,71),(6.5,.5,67),(7,1,64),
      (10,.75,74),(10.75,.25,71),(11,.5,69),(11.5,.5,67),
      (12,2,76),(14,.5,71),(14.5,.5,67),(15,1,66)]
P2 = [(0,.5,67),(0.5,.5,71),(1,.75,74),(1.75,.25,69),(2,.5,71),(2.5,.5,67),(3,1,64),
      (4,.5,67),(4.5,.5,72),(5,.75,76),(5.75,.25,74),(6,.5,72),(6.5,.5,71),(7,1,67),
      (8,.5,71),(8.5,.5,74),(9,.5,79),(9.5,.5,76),(10,.75,74),(10.75,.25,72),(11,1,71),
      (12,.5,74),(12.5,.5,76),(13,.5,78),(13.5,.5,76),(14,.5,74),(14.5,.5,71),(15,1,69)]
LO = [(0,.5,52),(0.5,.5,55),(1,.5,59),(1.75,.5,57),(2,.5,55),(3,.5,52),(3.5,.5,50),
      (4,1,55),(5,.5,57),(5.5,.5,55),(6,1,52),(7,.5,50),(7.5,.5,52)]
LP = [(0,.5,64),(0.75,.5,67),(1.5,.5,71),(2,.75,74),(2.75,.25,72),(3,.5,71),(3.5,.5,67),
      (4,.5,64),(4.75,.5,67),(5.5,.5,71),(6,.75,69),(6.75,.25,67),(7,.5,64),(7.5,1,62)]
CO_EM = [(0,.5,52),(0.5,.5,55),(1,.5,59),(1.5,.5,62),(2,.5,59),(2.75,.5,55),(3.5,.5,52)]
CP_C  = [(0,.5,60),(0.75,.5,64),(1.5,.5,67),(2,.5,72),(2.5,.5,67),(3,.5,64),(3.5,.5,60)]
CO_G  = [(0,.5,55),(0.5,.5,59),(1,.5,62),(1.5,.5,67),(2,.5,62),(2.75,.5,59),(3.5,.5,55)]
CP_D  = [(0,.5,57),(0.75,.5,62),(1.5,.5,66),(2,.5,69),(2.5,.5,66),(3,.5,62),(3.5,.5,57)]
HOOK = [(0,.5,64),(0.5,.5,67),(1,.75,71),(1.75,.25,69),(2,.5,67),(2.5,.5,64),(3,1,62),
        (4,.5,64),(4.5,.5,67),(5,.75,71),(5.75,.25,72),(6,.5,71),(6.5,.5,67),(7,1.5,76)]

melody_events_O = []   # (abs_time_s, dur_s, midi, vel)
melody_events_P = []

def emit(phrase, start_bar, target, vel_mul=1.0, transpose=0):
    base_t = t_bar(start_bar)
    for ev in phrase:
        b, d, m = ev[0], ev[1], ev[2]
        v = ev[3] if len(ev) > 3 else (1.0 if abs(b % 1.0) < 1e-6 else 0.85)
        melody_events_target = melody_events_O if target == 'O' else melody_events_P
        melody_events_target.append((base_t + b * SPB, d * SPB, m + transpose, v * vel_mul))

# --- assemble melodies ---
emit(O1, 8, 'O')
emit(P1, 12, 'P')
emit(O2, 16, 'O')
emit(P2, 20, 'P', vel_mul=1.05)

tr_pairs = [24, 28, 32, 36]
for i, b0 in enumerate(tr_pairs):
    tr = [0, 3, 5, 7][i]
    emit(LO, b0, 'O', transpose=tr)
    emit(LP, b0 + 2, 'P', transpose=tr)

climax_bars = [(40, CO_EM, 'O'), (41, CP_C, 'P'), (42, CO_G, 'O'), (43, CP_D, 'P'),
               (44, CO_EM, 'O'), (45, CP_C, 'P'), (46, CO_G, 'O'), (47, CP_D, 'P')]
for b, ph, who in climax_bars:
    oct = 12 if (who == 'P' and b >= 44) else 0
    emit(ph, b, who, vel_mul=1.1, transpose=oct)

for rep in range(3):
    b0 = 48 + rep * 2
    emit(HOOK, b0, 'O', transpose=-12, vel_mul=0.8)
    if rep < 2:
        emit(HOOK, b0, 'P')
    else:
        emit([(0,.5,64),(0.5,.5,67),(1,.75,71),(1.75,.25,69),(2,.5,67),(2.5,.5,64),(3,1,62),
              (4,.5,64),(4.5,.5,67),(5,.75,71),(5.75,.25,72),(6,.5,71),(6.5,.5,67),
              (7,.5,74),(7.5,1.5,71)], b0, 'P')

emit([(0,2,76),(2,.5,74),(2.5,.5,71),(3,2.5,64)], 54, 'P', vel_mul=1.15)
emit([(0,.5,55),(0.5,.5,59),(1,1,62),(3,.5,59)], 55, 'O', vel_mul=0.95)

# ---------------------------------------------------------------- drums & bass scheduling
kick_times = []
DRUM_G = {"kick": 1.0, "snare": 0.72, "clap": 0.30, "hatc": 0.24, "hato": 0.30,
          "rim": 0.30, "crash": 0.42}
SAMPLES = {}

def drum(name, t0, gain=1.0, pan=0.0):
    if name not in SAMPLES:
        SAMPLES[name] = {"kick": mk_kick(), "snare": mk_snare(), "clap": mk_clap(),
                         "hatc": mk_hat(False), "hato": mk_hat(True), "rim": mk_rim(),
                         "crash": mk_crash()}[name]
    add_note("drums", t0, SAMPLES[name], DRUM_G[name] * gain, pan)

def bass_hit(t0, dur, midi, vel=1.0):
    add_note("bass", t0, inst_bass(midi, dur, vel), 0.62, 0.0)

def bass_pattern(bar, style):
    r = BASS_ROOTS[chord_at(bar)]
    t0 = t_bar(bar)
    b7 = r + 12   # octave approach pop
    if style == "verse":
        pat = [(0,.42,r,1.0),(0.75,.18,r,.8),(1.5,.42,r,.95),(2.25,.18,r+12,.85),
               (2.5,.42,r,.95),(3.0,.18,b7,.8),(3.5,.42,r+12,.9)]
    elif style == "build":
        pat = [(0,.42,r,1.0),(0.5,.18,r,.75),(0.75,.18,r,.75),(1.5,.42,r,.9),
               (2,.42,r,.95),(2.5,.18,r+12,.8),(2.75,.18,r+12,.8),(3,.42,b7,.9),(3.5,.18,r,.8)]
    else:  # drive
        pat = [(i*0.5, .22 if i%2 else .42, r+12 if (i==3 or i==7) else r, 1.0 if i%2==0 else .8)
               for i in range(8)]
    for off, d, m, v in pat:
        bass_hit(t0 + off*SPB, d*SPB, m, v)

def drums_bar(bar, sect):
    t0 = t_bar(bar)
    fill = bar in (7, 23, 39, 55)
    if sect == "intro":
        if bar >= 4:
            for b in (0, 2): drum("kick", t0 + b*SPB)
            if bar % 2 == 1: drum("kick", t0 + 2.75*SPB, 0.85)
            drum("snare", t0 + 1*SPB, 0.8); drum("snare", t0 + 3*SPB, 0.8)
        hat_div = 1.0 if bar < 2 else 0.5
        b = 0
        while b < 4:
            drum("hatc", t0 + b*SPB, 0.8 if abs(b%1)<1e-9 else 0.55, pan=0.12)
            b += hat_div
        if bar == 7:
            for k in range(8):
                drum("snare", t0 + (2 + k*0.25)*SPB, 0.35 + 0.06*k)
            drum("crash", t_bar(8), 0.5)
        if bar == 6: add_center("fx", t0 + 2*SPB, mk_riser(2*BAR), 0.30)
    elif sect == "verse":
        drum("kick", t0)
        if bar % 2 == 0: drum("kick", t0 + 2.5*SPB)
        else: drum("kick", t0 + 1.75*SPB, 0.9)
        if bar % 4 == 3: drum("kick", t0 + 3.25*SPB, 0.7)
        drum("snare", t0 + 1*SPB); drum("snare", t0 + 3*SPB)
        if bar % 2 == 1: drum("clap", t0 + 3*SPB, 0.9)
        for k in range(8):
            drum("hatc", t0 + k*0.5*SPB, 1.0 if k%2==0 else 0.6, pan=0.12)
        if bar % 4 == 3: drum("hato", t0 + 3.5*SPB, 0.8)
        if bar % 8 == 7:
            for k in range(4): drum("rim", t0 + (3+k*0.25)*SPB, 0.5)
    elif sect == "build":
        drum("kick", t0); drum("kick", t0 + 2*SPB); drum("kick", t0 + 2.75*SPB, 0.85)
        drum("snare", t0 + 1*SPB); drum("snare", t0 + 3*SPB)
        drum("clap", t0 + 3*SPB, 0.9)
        for k in range(16):
            v = 1.0 if k % 4 == 0 else (0.65 if k % 2 == 0 else 0.45)
            drum("hatc", t0 + k*0.25*SPB, v, pan=0.12)
        if bar % 2 == 1: drum("hato", t0 + 3.5*SPB, 0.75)
        for k in range(4):
            drum("rim", t0 + (k*0.5+0.25)*SPB, 0.4)
        if bar == 38: add_center("fx", t0, mk_riser(2*BAR, 500, 7500), 0.38)
        if bar == 39:
            for k in range(8):
                drum("snare", t0 + (2 + k*0.25)*SPB, 0.4 + 0.06*k)
            drum("crash", t_bar(40), 0.55)
    elif sect == "climax":
        for b in range(4): drum("kick", t0 + b*SPB)
        drum("snare", t0 + 1*SPB); drum("snare", t0 + 3*SPB)
        drum("clap", t0 + 3*SPB)
        for k in range(16):
            v = 1.0 if k % 4 == 0 else (0.7 if k % 2 == 0 else 0.5)
            drum("hatc", t0 + k*0.25*SPB, v, pan=0.12)
        drum("hato", t0 + 1.5*SPB, 0.8); drum("hato", t0 + 3.5*SPB, 0.8)
        if bar % 4 == 0: drum("crash", t0, 0.5)
        if bar % 8 == 7:
            for k in range(4): drum("rim", t0 + (2.5+k*0.25)*SPB, 0.5)
    elif sect == "outro":
        if bar == 56:
            drum("kick", t0); drum("crash", t0, 0.55)
            drum("snare", t0 + 1*SPB, 0.6)
        if bar == 57: drum("kick", t0, 0.8)
        for k in range(4 if bar <= 58 else 0):
            drum("hatc", t0 + k*SPB, 0.5 - bar*0.06, pan=0.12)

def pads_bar(bar, sect):
    chord = PAD_VOICINGS[chord_at(bar)]
    bright = 750.0 if (sect == "intro" and bar < 6) else (1050.0 if sect == "intro" else 1500.0)
    vel = 0.5 if sect == "intro" else (0.62 if sect == "build" else (0.7 if sect == "climax" else 0.8))
    add_note("pads", t_bar(bar), inst_pad_chord(chord, BAR*0.98, vel, bright), 0.5, 0.0)
    if sect == "outro":
        add_note("pads", t_bar(bar), inst_pad_chord([52,59,64,71], BAR, 0.7, 1600), 0.5, 0.0)

def arp_bar(bar, sect):
    if sect not in ("build", "climax"): return
    tones = PAD_VOICINGS[chord_at(bar)][:]
    seq = [tones[0]+12, tones[1]+12, tones[2]+12, tones[3]+12,
           tones[2]+24, tones[1]+12, tones[3]+12, tones[0]+24]
    t0 = t_bar(bar)
    step = 0.25 if sect == "climax" else 0.5
    n_steps = int(4 / step)
    for k in range(n_steps):
        m = seq[k % len(seq)]
        add_note("arp", t0 + k*step*SPB, inst_arp(m, step*SPB, 0.9 if k%4==0 else 0.7),
                 0.34 if sect == "climax" else 0.26, pan=(-0.25 if k%2 else 0.25))

def outro_shimmer():
    notes = [76, 71, 67, 71, 76, 79]
    for i, m in enumerate(notes):
        t0 = t_bar(56) + i * SPB * 1.0
        add_note("arp", t0, inst_shimmer(m, SPB*0.9, 0.8 - i*0.1), 0.30, pan=0.2*(1 if i%2 else -1))

# ---------------------------------------------------------------- schedule everything
for bar in range(TOTAL_BARS):
    if bar < 8: sect = "intro"
    elif bar < 24: sect = "verse"
    elif bar < 40: sect = "build"
    elif bar < 56: sect = "climax"
    else: sect = "outro"
    drums_bar(bar, sect)
    if sect != "intro" and sect != "outro":
        bass_pattern(bar, "verse" if sect == "verse" else ("build" if sect == "build" else "drive"))
    pads_bar(bar, sect)
    arp_bar(bar, sect)
    if sect == "intro" and bar == 0:
        add_center("fx", t_bar(0), mk_impact(), 0.5)
    if bar == 40:
        add_center("fx", t_bar(40), mk_impact(), 0.6)
    if bar == 56:
        add_center("fx", t_bar(56), mk_crash(), 0.5)

outro_shimmer()

# melody rendering
for t0, dur, midi, vel in melody_events_O:
    add_note("leadO", t0, inst_lead_opp(midi, dur, vel), 0.46, 0.30)
for t0, dur, midi, vel in melody_events_P:
    add_note("leadP", t0, inst_lead_plr(midi, dur, vel), 0.50, -0.30)

# delay send: rebuild properly (leads duplicated into send bus)
BUSES["send_dly"] = (np.zeros(N_SAMPLES), np.zeros(N_SAMPLES))
for t0, dur, midi, vel in melody_events_O:
    add(BUSES["send_dly"][0], BUSES["send_dly"][1], t0, inst_lead_opp(midi, dur, vel), 0.30, 0.3)
for t0, dur, midi, vel in melody_events_P:
    add(BUSES["send_dly"][0], BUSES["send_dly"][1], t0, inst_lead_plr(midi, dur, vel), 0.34, -0.3)

# reverb send: pads + crash-ish + leads light
rev_src_L = BUSES["pads"][0] * 0.55 + BUSES["leadP"][0] * 0.25 + BUSES["leadO"][0] * 0.25 + BUSES["drums"][0] * 0.06
rev_src_R = BUSES["pads"][1] * 0.55 + BUSES["leadP"][1] * 0.25 + BUSES["leadO"][1] * 0.25 + BUSES["drums"][1] * 0.06
ir_n = int(1.5 * SR)
ir_t = np.arange(ir_n) / SR
ir = rng.standard_normal(ir_n) * np.exp(-ir_t / 0.38)
ir = onepole_lp(ir, 5200, passes=1)
ir /= math.sqrt(float(np.sum(ir ** 2)))

print("convolving reverb...", flush=True)
fft_len = 1 << (int(math.log2(len(rev_src_L) + ir_n) + 1))
RL = np.fft.rfft(rev_src_L, fft_len) * np.fft.rfft(ir, fft_len)
RR = np.fft.rfft(rev_src_R, fft_len) * np.fft.rfft(ir, fft_len)
revL = np.fft.irfft(RL, fft_len)[:N_SAMPLES]
revR = np.fft.irfft(RR, fft_len)[:N_SAMPLES]

# delay effect (dotted-8th feedback x3)
d = int(0.75 * SPB * SR)
dlyL = BUSES["send_dly"][0].copy(); dlyR = BUSES["send_dly"][1].copy()
srcL = dlyL.copy(); srcR = dlyR.copy()
g = 0.42
for k in range(1, 4):
    dlyL[k*d:] += srcL[:-k*d or None] * (g ** k)
    dlyR[k*d:] += srcR[:-k*d or None] * (g ** k)

# sidechain duck for bass/pads/arp driven by kicks
kick_times = []
for bar in range(TOTAL_BARS):
    if bar < 8: sect = "intro"
    elif bar < 24: sect = "verse"
    elif bar < 40: sect = "build"
    elif bar < 56: sect = "climax"
    else: sect = "outro"
    t0 = t_bar(bar)
    if sect == "intro" and bar >= 4:
        kick_times += [t0, t0+2*SPB] + ([t0+2.75*SPB] if bar%2==1 else [])
    elif sect == "verse":
        kick_times += [t0, t0+(2.5 if bar%2==0 else 1.75)*SPB] + ([t0+3.25*SPB] if bar%4==3 else [])
    elif sect == "build":
        kick_times += [t0, t0+2*SPB, t0+2.75*SPB]
    elif sect == "climax":
        kick_times += [t0+b*SPB for b in range(4)]
    elif sect == "outro":
        if bar <= 57: kick_times.append(t0)
duck = np.ones(N_SAMPLES)
REC = int(0.001 * SR)
REL_TAU = 0.085
kick_times = sorted(kick_times)
prev_end = 0
for kt in kick_times:
    i0 = int(kt * SR)
    if i0 >= N_SAMPLES: continue
    i1 = min(i0 + REC, N_SAMPLES)
    duck[i0:i1] = np.minimum(duck[i0:i1], 0.5)
    nxt = int((kt + BAR) * SR)  # recovery window until roughly next beat region
    j = max(i1, prev_end)
    k2 = min(max(nxt, j + 1), N_SAMPLES)
    if j < k2:
        t = np.arange(k2 - j) / SR
        seg = 0.5 + 0.5 * (1.0 - np.exp(-t / REL_TAU))
        duck[j:k2] = np.minimum(duck[j:k2], seg)
    prev_end = k2

# ---------------------------------------------------------------- mix
section_gain = np.ones(N_SAMPLES)
fade_start = t_bar(59.2)
fi = int(fade_start * SR)
if fi < N_SAMPLES:
    section_gain[fi:] = np.linspace(1, 0, N_SAMPLES - fi)

mixL = (BUSES["drums"][0] * 1.00 + BUSES["bass"][0] * duck + BUSES["pads"][0] * duck +
        BUSES["arp"][0] * duck + BUSES["leadO"][0] + BUSES["leadP"][0] +
        dlyL * 0.55 + revL * 0.9 + BUSES["fx"][0])
mixR = (BUSES["drums"][1] * 1.00 + BUSES["bass"][1] * duck + BUSES["pads"][1] * duck +
        BUSES["arp"][1] * duck + BUSES["leadO"][1] + BUSES["leadP"][1] +
        dlyR * 0.55 + revR * 0.9 + BUSES["fx"][1])

mixL *= section_gain; mixR *= section_gain

peak_pre = max(np.abs(mixL).max(), np.abs(mixR).max())
drive = 1.15
mixL = np.tanh(mixL * drive) / math.tanh(drive)
mixR = np.tanh(mixR * drive) / math.tanh(drive)
peak = max(np.abs(mixL).max(), np.abs(mixR).max())
target = 0.92
scale = target / peak
mixL *= scale; mixR *= scale

rms_all = math.sqrt(float(np.mean(mixL**2 + mixR**2)) / 2)
print(f"peak_pre={peak_pre:.3f} peak_final={target:.3f} rms={20*math.log10(rms_all+1e-12):.1f} dBFS")

# per-section loudness report
for name, b0, b1 in [("intro",0,8),("verse",8,24),("build",24,40),("climax",40,56),("outro",56,61)]:
    i0, i1 = int(t_bar(b0)*SR), min(int(t_bar(b1)*SR), N_SAMPLES)
    r = math.sqrt(float(np.mean(mixL[i0:i1]**2 + mixR[i0:i1]**2))/2)
    pk = float(np.abs(mixL[i0:i1]).max())
    print(f"  {name:7s} rms={20*math.log10(r+1e-12):6.1f} dBFS peak={20*math.log10(pk+1e-12):6.1f}")

# ---------------------------------------------------------------- write wav
os.makedirs(os.path.join("assets", "audio"), exist_ok=True)
os.makedirs("tools/build", exist_ok=True)
wav_path = os.path.join("tools", "build", "song.wav")
data = np.empty((N_SAMPLES, 2), dtype=np.int16)
data[:, 0] = np.clip(mixL * 32767, -32768, 32767).astype(np.int16)
data[:, 1] = np.clip(mixR * 32767, -32768, 32767).astype(np.int16)
with wave.open(wav_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(data.tobytes())
print("wav written:", wav_path, os.path.getsize(wav_path)//1024, "KB")

mp3_path = os.path.join("assets", "audio", "song.mp3")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
                "-codec:a", "libmp3lame", "-b:a", "192k", "-write_xing", "1", mp3_path],
               check=True)
print("mp3 written:", mp3_path, os.path.getsize(mp3_path)//1024, "KB")

# ---------------------------------------------------------------- chart export
def build_lane_track(events):
    """events: (t,dur,midi,vel) -> sorted list of dicts with lane assignment"""
    evs = sorted(events, key=lambda e: e[0])
    out = []
    prev_midi = None
    rot = 0
    for i, (t, dur, m, v) in enumerate(evs):
        if prev_midi is None:
            lane = 1
        else:
            dd = m - prev_midi
            last = out[-1]["lane"]
            if dd == 0:
                rot += 1
                lane = (last + (1 if rot % 2 else 3)) % 4
            elif abs(dd) <= 2:
                lane = (last + (1 if dd > 0 else 3)) % 4
            elif abs(dd) <= 5:
                lane = 2 if dd > 0 else 1
                if lane == last: lane = (lane + 2) % 4
            else:
                lane = 2 if dd > 0 else 0
                if lane == last: lane = (lane + 1) % 4
        out.append({"t": t, "dur": dur, "lane": lane})
        prev_midi = m
    # enforce min gap
    MIN_GAP = 0.128
    cleaned = []
    for n in out:
        if cleaned and (n["t"] - (cleaned[-1]["t"])) < MIN_GAP:
            # keep the earlier note; extend it if the later was longer
            cleaned[-1]["dur"] = max(cleaned[-1]["dur"], (n["t"] + n["dur"]) - cleaned[-1]["t"])
            continue
        cleaned.append(n)
    # limit triple-repeat lanes
    for i in range(2, len(cleaned)):
        if cleaned[i]["lane"] == cleaned[i-1]["lane"] == cleaned[i-2]["lane"]:
            cleaned[i]["lane"] = (cleaned[i]["lane"] + 2) % 4
    return cleaned

opp_chart = build_lane_track(melody_events_O)
plr_chart = build_lane_track(melody_events_P)

def serialize(chart):
    arr = []
    for n in chart:
        t_ms = round(n["t"] * 1000)
        dur_ms = round(n["dur"] * 1000)
        is_hold = dur_ms >= 420
        hold_ms = min(1600, max(250, int(dur_ms * 0.82))) if is_hold else 0
        arr.append([t_ms, dur_ms, n["lane"], 1 if is_hold else 0, hold_ms])
    return arr

song_end_ms = int((TOTAL_BARS * BAR + TAIL_S) * 1000)
chart_js = {
    "title": "NEON VOLTAGE",
    "subtitle": "KAZ vs VEXX - Rooftop Showdown",
    "bpm": BPM,
    "spbMs": round(SPB * 1000, 3),
    "lengthMs": song_end_ms,
    "sections": [
        {"name": "INTRO", "ms": 0},
        {"name": "BATTLE", "ms": int(t_bar(8) * 1000)},
        {"name": "ESCALATE", "ms": int(t_bar(24) * 1000)},
        {"name": "FINAL", "ms": int(t_bar(40) * 1000)},
        {"name": "OUTRO", "ms": int(t_bar(56) * 1000)},
    ],
    "opponent": serialize(opp_chart),
    "player": serialize(plr_chart),
}
os.makedirs("js", exist_ok=True)
with open(os.path.join("js", "chart-data.js"), "w") as f:
    f.write("// AUTO-GENERATED by tools/compose.py - do not edit\n")
    f.write("window.SONG_DATA = ")
    f.write(json.dumps(chart_js, separators=(",", ":")))
    f.write(";\n")
pl = [n for n in plr_chart]
print(f"chart: player notes={len(pl)} opponent={len(opp_chart)} "
      f"density={(len(pl))/(song_end_ms/1000):.2f}/s holds={sum(1 for n in pl if n['dur']*1000>=420)}")

# ---------------------------------------------------------------- diagnostics images (no deps)
def write_png(path, img):
    h, w = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(tag, payload):
        c = struct.pack(">I", len(payload)) + tag + payload
        return c + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    hdr = struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", hdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)

mono = (mixL + mixR) * 0.5
W, H = 1400, 360
cols_min = np.zeros(W); cols_max = np.zeros(W)
idx = np.linspace(0, len(mono), W + 1).astype(int)
for i in range(W):
    seg = mono[idx[i]:idx[i+1]]
    if len(seg): cols_min[i], cols_max[i] = seg.min(), seg.max()
img_wf = np.zeros((H, W), dtype=np.uint8)
mid = H // 2
for i in range(W):
    y0 = int(mid - cols_max[i] * (mid - 6)); y1 = int(mid - cols_min[i] * (mid - 6))
    img_wf[min(y0,y1):max(y0,y1)+1, i] = 255
write_png("tools/build/waveform.png", img_wf[::-1])

frame_n, hop = 2048, 2048 * 4
nf = (len(mono) - frame_n) // hop + 1
spec_cols = []
win = np.hanning(frame_n)
for fi in range(0, nf, max(1, nf // W)):
    seg = mono[fi*hop:fi*hop+frame_n] * win
    mag = np.abs(np.fft.rfft(seg))
    spec_cols.append(mag)
spec = np.array(spec_cols).T  # freq x time
spec_db = 20 * np.log10(spec + 1e-9)
spec_db -= spec_db.max()
spec_db = np.clip(spec_db, -80, 0)
small = spec_db[::4, :]       # downsample freq
ih, iw = small.shape
img_sp = ((small + 80) / 80 * 255).astype(np.uint8)
img_out = np.zeros((360, min(iw, 1400)), dtype=np.uint8)
hh = min(360, ih)
img_out[:hh, :img_out.shape[1]] = (img_sp[:hh, :img_out.shape[1]] * 1.0)
write_png("tools/build/spectrogram.png", img_sp[::-1][:360, :1400].astype(np.uint8))
print("diagnostic images written")
print("DONE")
