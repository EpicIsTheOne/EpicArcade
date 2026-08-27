"""Genre synth kit - drum voices + electronic basses for the c418-songs engine.
All numpy-only, offline. Import alongside templates/diamond-sky.py instruments."""
import numpy as np
import random

SR = 48000
_rng = random.Random(808)
nprng = np.random.default_rng(808)

def midi_f(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)

def _fft_lp(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1.0 / np.sqrt(1.0 + (f / fc) ** 2)
    return np.fft.irfft(X, len(x))

def _fft_hp(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (f / fc) / np.sqrt(1.0 + (f / fc) ** 2)
    return np.fft.irfft(X, len(x))

def _fft_bp(x, flo, fhi):
    return _fft_lp(_fft_hp(x, flo), fhi)

# ---------------- drums -------------------------------------------------------
def kick(fund=48.0, sweep=150.0, sweep_ms=50.0, decay=0.45, click=0.35):
    """Sine pitch-sweep kick. House: fund 50 dec .30; techno: dec .40+;
    punchy DnB: fund 55 sweep_ms 25."""
    n = int((decay + 0.15) * SR)
    t = np.arange(n) / SR
    f = fund + (sweep - fund) * np.exp(-t / (sweep_ms / 1000.0 / 3.0))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t / (decay / 4.0))
    a = max(1, int(0.002 * SR))
    x[:a] *= np.linspace(0, 1, a)
    cn = max(1, int(0.004 * SR))
    x[:cn] += click * nprng.uniform(-1, 1, cn) * np.exp(-np.arange(cn) / (cn / 3))
    return x * 0.9

def kick_808(note, dur_beats=1.5, bpm=140.0, slide_from=None, glide_ms=90.0):
    """TR-808-style kick-bass: sine tuned to note, long boom, optional portamento
    from previous note's pitch (the trap slide)."""
    beat = 60.0 / bpm
    n = int((dur_beats * beat + 0.3) * SR)
    t = np.arange(n) / SR
    f_end = midi_f(note) * 2.0
    if slide_from is not None:
        f_start = midi_f(slide_from) * 2.0
        g = int(glide_ms / 1000.0 * SR)
        f = np.full(n, f_end)
        ramp = (f_start - f_end) * (1 - np.linspace(0, 1, g)) ** 2
        f[:g] += ramp
    else:
        f = f_end * (1 + 2.5 * np.exp(-t / 0.008))  # attack snap only
        x = None
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph)
    rel = int(dur_beats * beat * SR)
    env = np.exp(-np.maximum(t - 0.02, 0) / (dur_beats * beat * 0.85))
    env *= (t <= t[rel] + 0.05) if rel < n else 1.0
    if rel < n:
        rl = min(int(0.06 * SR), n - rel)
        env[rel:rel + rl] *= np.linspace(1, 0, rl)
        env[rel + rl:] = 0.0
    x *= env * 0.85
    cn = int(0.003 * SR)
    x[:cn] += 0.3 * (nprng if False else __import__("numpy").random.default_rng(808)).uniform(-1, 1, cn)
    return x

def snare(tone_hz=190.0, noise_lo=1400.0, noise_hi=6500.0, tone_dec=0.10,
          noise_dec=0.20, bright=1.0):
    """Body (tone) + wires (bandpassed noise). Trap: big verb after;
    DnB: tone 200, tight; lofi: lowpass whole thing 6k."""
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    tri = 2 * np.abs(((tone_hz * t) % 1.0) - 0.5) - 0.5
    body = tri * np.exp(-t / (tone_dec / 3)) * 0.5
    nz = nprng.uniform(-1, 1, n) * np.exp(-t / (noise_dec / 3))
    wire = _fft_bp(nz, noise_lo, noise_hi) * bright
    x = body + 0.8 * wire
    a = max(1, int(0.001 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.8

def hat(open_hat=False, metallic=True):
    """Closed/open hi-hat. Metallic path = 808 circuit homage: 6 detuned
    sines, rectified (intermodulation = metal), HP'd hard."""
    dec = 0.32 if open_hat else 0.05
    n = int((dec + 0.08) * SR)
    t = np.arange(n) / SR
    if metallic:
        ratios = [263.6, 400.0, 421.5, 474.5, 587.4, 845.5]
        x = np.zeros(n)
        for i, r in enumerate(ratios):
            x += np.sin(2 * np.pi * r * (t + i * 0.0007))
        x = np.abs(x) - 0.5
        x = _fft_hp(x, 7000.0)
    else:
        x = _fft_hp(nprng.uniform(-1, 1, n), 8000.0)
    x *= np.exp(-t / (dec / 3)) * 0.5
    a = max(1, int(0.0005 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x

def clap(spacing_ms=11.0, bursts=3, tail=0.18):
    """Multi-burst noise clap: staggered slaps + longer tail burst."""
    sp = spacing_ms / 1000.0
    n = int((bursts * sp + tail + 0.1) * SR)
    x = np.zeros(n)
    for b in range(bursts):
        s = int(b * sp * SR)
        ln = int(0.012 * SR)
        x[s:s + ln] += nprng.uniform(-1, 1, ln) * (0.5 + 0.1 * b)
    s = int(bursts * sp * SR)
    ln = min(int(tail * SR), n - s)
    env = np.exp(-np.arange(ln) / (tail / 3.5))
    x[s:s + ln] += nprng.uniform(-1, 1, ln) * env * 0.9
    x = _fft_bp(x, 900.0, 9000.0)
    return x * 0.75

def ride():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    x = _fft_bp(nprng.uniform(-1, 1, n), 4000.0, 12000.0)
    ping = np.sin(2 * np.pi * 950 * t) * np.exp(-t / 0.12) * 0.3
    x = (x * np.exp(-t / 0.28) + ping) * 0.4
    return x

# ---------------- electronic basses -------------------------------------------
def _bl_saw(f, length, drift_cents=0.0):
    """Band-limited-ish sawtooth via additive partials (cap 96 harmonics)."""
    t = np.arange(length) / SR
    fd = f * 2 ** (drift_cents / 1200.0)
    K = min(96, int(SR / (2 * fd)))
    x = np.zeros(length)
    for k in range(1, K + 1):
        x += np.sin(2 * np.pi * k * fd * t + k * 0.7) / k
    return x / (2.0 * np.log(K + 1))

def reese(note, dur_beats, bpm=174.0, detune_cents=10.0, cutoff=650.0,
          drive=2.2, lfo_rate=0.8):
    """Two detuned saws -> moving LP -> saturation. The filter sweep IS the
    sound; automate cutoff per-note for neuro movement."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    f = midi_f(note)
    x = (_bl_saw(f, n, 0.0) + _bl_saw(f, n, detune_cents)) * 0.5
    t = np.arange(n) / SR
    lo = _fft_lp(x, cutoff * 0.55)
    hi = _fft_lp(x, cutoff * 1.45)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * lfo_rate * t + _rng.uniform(0, 6.28))
    x = lo * (1 - lfo) + hi * lfo
    x = np.tanh(x * drive) * 0.55
    a = max(1, int(0.006 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.08 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def sub_sine(note, dur_beats, bpm=174.0):
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * midi_f(note) * t)
    a = max(1, int(0.01 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.05 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x * 0.8

def pluck_bass(note, dur_beats, bpm=124.0, cutoff=900.0, decay=0.25):
    """Filtered saw pluck for house offbeat basslines."""
    beat = 60.0 / bpm
    n = int(max(decay, dur_beats * beat) * SR)
    t = np.arange(n) / SR
    x = _bl_saw(midi_f(note), n)
    x = _fft_lp(x, cutoff)
    x *= np.exp(-t / (decay / 3))
    a = max(1, int(0.003 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.7

def kick_hardstyle(note=33, drive=6.0):
    """Hardstyle 3-layer kick: click transient + distorted pitched body
    sweeping to the root note + CLEAN sub tail. The body carries the growl;
    never distort the sub tail."""
    f_root = midi_f(note)
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    # body: 300 Hz -> root over ~300ms, heavy drive, bandpassed mid
    fb = f_root + (300.0 - f_root) * np.exp(-t / 0.12)
    body = np.sin(2 * np.pi * np.cumsum(fb) / SR)
    body = _fft_bp(body, 150.0, 800.0)
    body = np.tanh(body * drive)
    body *= np.exp(-t / 0.16)
    # sub tail: clean pure sine at root
    sub = np.sin(2 * np.pi * f_root * t) * np.exp(-t / 0.35)
    sub = _fft_lp(sub, 80.0)
    # click: short HP noise burst
    cn = int(0.008 * SR)
    click = _fft_hp(nprng.uniform(-1, 1, cn), 2000.0) * np.exp(-np.arange(cn) / (cn / 3)) * 1.2
    x = body * 0.8 + sub * 0.7
    x[:cn] += click
    a = max(1, int(0.001 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.85

def reverse_bass(note, dur_beats=0.5, bpm=150.0, cutoff=320.0, swell=0.13):
    """Hardstyle reverse bass: silent -> swell -> hard cut, one per off-beat.
    Kick + reverse bass are ONE unit; the cut must land exactly on the kick."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    x = _bl_saw(midi_f(note), n)
    x = _fft_lp(x, cutoff)
    env = np.linspace(0, 1, n) ** 1.6
    cut = max(1, int(0.01 * SR))
    env[-cut:] *= np.linspace(1, 0, cut)
    return x * env * 0.7

def supersaw(note, dur_beats, bpm=150.0, voices=7, spread_cents=18.0,
             cutoff=6000.0):
    """Festival lead stack: many detuned saws, wide-ish via per-voice pan mix.
    Returns mono; caller pans or duplicates with delay for width."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    x = np.zeros(n)
    for i in range(voices):
        det = spread_cents * ((i / max(1, voices - 1)) - 0.5) * 2
        x += _bl_saw(midi_f(note), n, det)
    x /= voices
    x = _fft_lp(x, cutoff)
    a = max(1, int(0.02 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.10 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x * 0.8

def screech(note, dur_beats, bpm=150.0, drive=5.0, glide_from=None):
    """Rawstyle screech lead: square-ish wave, resonant character, distortion,
    optional ±2 semitone pitch glides."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    if glide_from is not None:
        g = int(0.05 * SR)
        f_arr = np.full(n, f)
        f_arr[:g] = f + (midi_f(glide_from) - f) * (1 - np.linspace(0, 1, g))
    else:
        f_arr = np.full(n, f)
    ph = 2 * np.pi * np.cumsum(f_arr) / SR
    sq = np.sign(np.sin(ph))
    sq = _fft_lp(sq, 4500.0)
    x = np.tanh(sq * drive) * 0.45
    a = max(1, int(0.004 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.06 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def cowbell(tune_note=None, drive=3.0, decay=0.28):
    """TR-808 cowbell (two detuned squares through bandpass) - phonk's lead
    instrument when pitched across a scale."""
    # Tune relative to the reference cowbell, not to raw Hz. Passing an absolute
    # MIDI frequency into the oscillator ratios would alias almost everything.
    base = midi_f(tune_note) / midi_f(69) if tune_note is not None else 1.0
    n = int((decay + 0.1) * SR)
    t = np.arange(n) / SR
    x = np.sign(np.sin(2 * np.pi * 540.0 * base * t)) + \
        np.sign(np.sin(2 * np.pi * 800.0 * base * t))
    x = _fft_bp(x / 2.0, 500.0, 3800.0)
    x = np.tanh(x * drive)
    env = np.exp(-t / (decay / 3))
    env[:int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    return x * env * 0.55

def wobble_bass(note, dur_beats, bpm=140.0, rate_div=0.5, cutoff_lo=180.0,
                cutoff_hi=2400.0, drive=3.5):
    """Dubstep wobble: saw -> LP whose cutoff is gated by a tempo-synced
    square LFO (rate_div = fraction of a bar per wobble: .5 classic,
    .25 aggressive) -> drive. Layer sub_sine below separately."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    x = _bl_saw(midi_f(note), n)
    lo = _fft_lp(x, cutoff_lo)
    hi = _fft_lp(x, cutoff_hi)
    bar = beat * 4
    lfo = np.sign(np.sin(2 * np.pi * (bar * rate_div) ** -1 *
                         np.arange(n) / SR + 1.57))
    lfo = (lfo + 1) / 2 * 0.75 + 0.25
    x = lo * (1 - lfo) + hi * lfo
    x = np.tanh(x * drive) * 0.5
    a = max(1, int(0.004 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.06 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def log_drum(note, dur_beats=0.5, bpm=112.0, punch_hz=220.0):
    """Amapiano/afrobeats log drum: sine thump bending down into a woody
    bandpassed body. The signature melodic bass voice."""
    beat = 60.0 / bpm
    n = int(max(dur_beats * beat, 0.22) * SR + 0.05 * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    fb = f + (punch_hz - f) * np.exp(-t / 0.02)
    x = np.sin(2 * np.pi * np.cumsum(fb) / SR)
    body = _fft_bp(x, 90.0, 420.0)
    x = x * 0.6 + body * 0.7
    x *= np.exp(-t / (dur_beats * beat * 0.9 + 0.08))
    a = max(1, int(0.002 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.8

def pulse(note, dur_beats, bpm=140.0, duty=0.25):
    """Chiptune pulse wave (naive aliasing IS the aesthetic). duty .125/.25/.5"""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    ph = (np.arange(n) / SR * midi_f(note)) % 1.0
    x = np.where(ph < duty, 1.0, -1.0) * 0.4
    a = max(1, int(0.001 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.01 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def rumble(note, dur_beats, bpm=132.0):
    """Peak-time techno rumble: overlapping 808 booms lowpassed into a drone.
    Render one per chord change, let them overlap."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    hits = []
    step = beat
    pos = 0
    while pos < n:
        h = kick_808(note, max(1.0, dur_beats - pos / beat / 1.0), bpm)
        e = min(pos + len(h), n)
        if e <= pos:
            break
        hits.append((pos, h[:e - pos]))
        pos += step * SR if False else int(step * SR)
    x = np.zeros(n)
    for (s, h) in hits:
        x[s:s + len(h)] += h
    x = _fft_lp(x, 160.0)
    return x * 0.6

def slap_bass(note, dur_beats=0.25, bpm=100.0, mode="pop"):
    """Funk slap: 'pop' = sharp rising pitch snap (thumb popped string),
    'thump' = low fundamental punch with fast decay. Alternate for the
    classic pop-thump-thump-pop groove."""
    beat = 60.0 / bpm
    n = int(max(dur_beats * beat, 0.12) * SR + 0.03 * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    if mode == "pop":
        fb = f * (1 + 1.5 * np.exp(-t / 0.008))  # string snap upward
        x = np.sin(2 * np.pi * np.cumsum(fb) / SR)
        x = _fft_bp(x, 180.0, 2600.0)
        env = np.exp(-t / 0.045)
    else:
        fb = f * (1 + 0.9 * np.exp(-t / 0.010))
        x = np.sin(2 * np.pi * np.cumsum(fb) / SR)
        x += 0.3 * np.sin(4 * np.pi * f * t)
        env = np.exp(-t / 0.09)
    x *= env
    a = max(1, int(0.0015 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.75

def hoover(note, dur_beats, bpm=170.0, drive=2.5):
    """Rave hoover (hardcore/gabber/happy-hardcore lead): detuned saw stack,
    downward pitch bend at attack, formant-ish bandpass."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    fb = f * (1 + 0.35 * np.exp(-t / 0.05))  # the dive
    x = (_bl_saw(f, n, -14) + _bl_saw(f, n, 0) + _bl_saw(f, n, 14))
    ph_fix = 2 * np.pi * f * np.exp(-t / 0.05) * 0.35
    x *= 0.33
    x = _fft_bp(x, 300.0, 3400.0)
    x = np.tanh(x * drive) * 0.55
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t)
    idx = np.minimum((np.cumsum(vib) / SR * SR).astype(int), n - 1)
    x = x[idx] if len(idx) == n else x
    a = max(1, int(0.003 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.05 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def organ(note, dur_beats, bpm=80.0, drawbars=(1.0, 0.6, 0.35, 0.2),
          key_click=True):
    """Drawbar tonewheel organ (reggae bubbling, gospel, noir). Slight
    leslie-ish amplitude wobble built in."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    ratios = [0.5, 1.0, 2.0, 3.0]
    x = np.zeros(n)
    for (r, amp) in zip(ratios, drawbars):
        x += amp * np.sin(2 * np.pi * f * r * t)
    wob = 1 + 0.12 * np.sin(2 * np.pi * 6.2 * t) * np.sin(2 * np.pi * 0.9 * t)
    x *= wob * 0.3
    if key_click:
        cn = int(0.004 * SR)
        x[:cn] += 0.15 * _fft_hp(nprng.uniform(-1, 1, cn), 3000.0) * \
            np.linspace(1, 0, cn)
    a = max(1, int(0.01 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.08 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x

def brass_stab(notes, dur_beats=0.5, bpm=110.0, drive=1.8):
    """Horn-section stab (spy/soul/balkan/boss battle): stacked saws with a
    blatty attack transient and formant body."""
    beat = 60.0 / bpm
    n = int(max(dur_beats * beat, 0.15) * SR + 0.05 * SR)
    x = np.zeros(n)
    for nt in notes:
        x += _bl_saw(midi_f(nt), n, _rng.uniform(-6, 6))
    x /= max(1, len(notes))
    x = _fft_bp(x, 220.0, 3200.0)
    x = np.tanh(x * drive)
    t = np.arange(n) / SR
    env = np.exp(-t / (dur_beats * beat * 0.8 + 0.05))
    blat = int(0.02 * SR)
    env[:blat] *= np.linspace(0.4, 1.0, blat)
    r = min(int(0.06 * SR), n - 1)
    env[n - r:] *= np.linspace(1, 0, r)
    return x * env * 0.7

def whistle_lead(note, dur_beats, bpm=110.0, vibrato_hz=5.0):
    """Spaghetti-western / g-funk whistle: near-sine with wide vibrato."""
    beat = 60.0 / bpm
    n = int(dur_beats * beat * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    vib = 1 + 0.012 * np.sin(2 * np.pi * vibrato_hz * t +
                             _rng.uniform(0, 6.28)) * \
        np.minimum(t / 0.25, 1.0)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = np.sin(ph) + 0.04 * np.sin(2 * ph)
    breath = _fft_hp(nprng.uniform(-1, 1, n), 4000.0) * 0.015
    x = x + breath
    a = max(1, int(0.05 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.15 * SR), n - 1)
    x[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return x * 0.6

def koto_pluck(note, dur_beats=0.5, bpm=90.0):
    """East-Asian pluck (guzheng/koto/shamisen family): noise attack into
    bright decaying partials with slight downward bend."""
    beat = 60.0 / bpm
    n = int(max(dur_beats * beat, 0.2) * SR + 0.3 * SR)
    t = np.arange(n) / SR
    f = midi_f(note)
    fb = f * (1 + 0.012 * np.exp(-t / 0.06))
    ph = 2 * np.pi * np.cumsum(fb) / SR
    x = np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.22 * np.sin(3 * ph) + \
        0.10 * np.sin(4.16 * ph)
    x *= np.exp(-t / 0.5)
    an = int(0.006 * SR)
    x[:an] += 0.25 * _fft_hp(nprng.uniform(-1, 1, an), 2500.0) * \
        np.exp(-np.arange(an) / (an / 2))
    a = max(1, int(0.001 * SR))
    x[:a] *= np.linspace(0, 1, a)
    return x * 0.6

def gate_env(buf, hold_s):
    """Truncate-with-edge helper: synthwave gated reverb (apply to wet tail).
    Returns buf shaped: full until hold_s then hard cosine-off."""
    hold = min(len(buf), int(hold_s * SR))
    out = np.zeros_like(buf)
    out[:hold] = buf[:hold]
    rl = min(int(0.01 * SR), len(buf) - hold)
    if rl > 0:
        out[hold:hold + rl] = buf[hold:hold + rl] * np.linspace(1, 0, rl)
    return out

if __name__ == "__main__":
    import wave, os
    voices = {
        "kick": kick(), "kick_house": kick(52, 160, 40, 0.28),
        "k808": kick_808(33, 2.0), "k808_slide": kick_808(31, 1.5, slide_from=38),
        "snare": snare(), "snare_dnb": snare(200, 1800, 8000, 0.07, 0.13),
        "hat_c": hat(False), "hat_o": hat(True),
        "clap": clap(), "ride": ride(),
        "reese": reese(38, 4.0), "sub": sub_sine(33, 4.0),
        "pluck": pluck_bass(45, 0.5),
        "hs_kick": kick_hardstyle(33), "rev_bass": reverse_bass(33),
        "supersaw": supersaw(69, 2.0), "screech": screech(69, 1.0),
        "cowbell": cowbell(), "cowbell_tuned": cowbell(67),
        "wobble": wobble_bass(33, 2.0, 140.0, 0.5),
        "log_drum": log_drum(45), "pulse": pulse(76, 0.5),
        "rumble": rumble(33, 4.0),
        "slap_pop": slap_bass(45, mode="pop"), "slap_thump": slap_bass(33, mode="thump"),
        "hoover": hoover(69, 1.5), "organ": organ(60, 2.0),
        "brass": brass_stab([53, 57, 60]), "whistle": whistle_lead(88, 2.0),
        "koto": koto_pluck(69),
    }
    ok = True
    for name, v in voices.items():
        pk = float(np.max(np.abs(v)))
        rms = float(np.sqrt(np.mean(v ** 2)))
        stat = "OK" if pk > 0.05 and pk < 2.0 else "BAD"
        if stat == "BAD":
            ok = False
        print(f"{name:>12}: {len(v)/SR:.2f}s peak={pk:.3f} rms={rms:.4f} {stat}")
    out = os.path.join(os.path.expanduser("~/Desktop"), "_kit_smoke.wav")
    mx = max(len(v) for v in voices.values())
    mix = np.zeros((mx,))
    pos = 0
    for v in voices.values():
        if pos >= mx:
            break
        end = min(pos + len(v), mx)
        mix[pos:end] += v[:end - pos] * 0.12
        pos += len(v) // 3
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("smoke wav:", out, "ALL OK" if ok else "FAILURES PRESENT")


