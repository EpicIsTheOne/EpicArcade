"""NEON DRIFT - synthwave interactive-music-video track.
Engine from synth-song-engine (diamond-sky instruments + synth_kit drums).
Score: 88 bars @ 96 BPM, A minor, sections mapped to visual scenes.
Renders song.wav + song.mp3 + song_events.json (beat grid, hits, notes)."""
import numpy as np
import wave, os, json, subprocess, random
import synth_kit as kit

SR = 48000
BPM = 96.0
BEAT = 60.0 / BPM            # 0.625 s
BAR = 4 * BEAT               # 2.5 s
TOTAL_BARS = 88
DURATION = TOTAL_BARS * BAR  # 220 s
TAIL = 5.0
HERE = os.path.dirname(os.path.abspath(__file__))
WAV = os.path.join(HERE, "song.wav")
MP3 = os.path.join(HERE, "song.mp3")
EVJ = os.path.join(HERE, "song_events.json")

rng = random.Random(9608)
nprng = np.random.default_rng(9608)

def midi_f(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)

# ------------- shared tape drift (Mellotron glue) ----------------------------
WOW_SECONDS = 236
_ct = np.arange(0.0, WOW_SECONDS + 0.25, 0.25)
_cw = nprng.normal(0, 1, len(_ct))
_cw = np.convolve(_cw, np.ones(13) / 13, mode="same")
_wow_slow = np.interp(np.arange(WOW_SECONDS * SR) / SR, _ct, _cw)
WOW = (0.0026 * np.sin(2 * np.pi * 0.31 * np.arange(WOW_SECONDS * SR) / SR
                       + rng.uniform(0, 6.28)) + 0.0012 * _wow_slow).astype(np.float64)

def phase_drift(t0, length):
    idx = (np.arange(length) + int(t0 * SR)) % (WOW_SECONDS * SR - 2)
    return WOW[idx]

# ------------- melodic voices -------------------------------------------------
def pad_voice(note, t0, dur_beats, vel, det=11.0):
    length = int((dur_beats * BEAT + 2.2) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    x = np.zeros(length)
    for d in (-det, det):
        fd = f * 2 ** (d / 1200.0)
        ph = 2 * np.pi * fd * t + 2 * np.pi * fd * np.cumsum(phase_drift(t0, length)) / SR
        x += np.sin(ph) + 0.32 * np.sin(2 * ph) + 0.11 * np.sin(3 * ph)
    x *= 0.5
    trem = 1.0 + 0.08 * np.sin(2 * np.pi * 0.12 * t + rng.uniform(0, 6.28))
    x *= trem
    a = int(min(1.3, dur_beats * BEAT * 0.45) * SR)
    if a < length:
        x[:a] *= np.linspace(0, 1, a) ** 1.6
    rel = int(dur_beats * BEAT * SR)
    if rel < length:
        rl = min(int(1.9 * SR), length - rel)
        x[rel:rel + rl] *= np.cos(np.linspace(0, np.pi / 2, rl)) ** 2
        x[rel + rl:] = 0.0
    return x * (vel / 127.0) * 0.30

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

def sub_note(note, t0, dur_beats, vel):
    length = int((dur_beats * BEAT + 1.0) * SR)
    t = np.arange(length) / SR
    f = midi_f(note)
    x = np.sin(2 * np.pi * f * t) + 0.06 * np.sin(4 * np.pi * f * t)
    a = int(0.25 * SR)
    x[:a] *= np.linspace(0, 1, a)
    rel = int(dur_beats * BEAT * SR)
    if rel < length:
        rl = min(int(0.45 * SR), length - rel)
        x[rel:rel + rl] *= np.cos(np.linspace(0, np.pi / 2, rl)) ** 2
        x[rel + rl:] = 0.0
    return x * (vel / 127.0) * 0.62

def supersaw(note, dur_beats, vel, voices=4, spread_cents=16.0, cutoff=5200.0):
    beat = BEAT
    n = int(dur_beats * beat * SR)
    f = midi_f(note)
    x = np.zeros(n)
    for i in range(voices):
        det = spread_cents * ((i / max(1, voices - 1)) - 0.5) * 2
        x += kit._bl_saw(f, n, det)
    x /= voices
    x = kit._fft_lp(x, cutoff)
    a = max(1, int(0.02 * SR))
    x[:a] *= np.linspace(0, 1, a)
    r = min(int(0.10 * SR), n - 1)
    x[-r:] *= np.linspace(1, 0, r)
    return x * 0.62 * (vel / 127.0)

def arp_pluck(note, t0, dur_beats, vel):
    return kit.koto_pluck(note, dur_beats, BPM)[:int((dur_beats * BEAT + 0.18) * SR)]

def pluck_bass8(note, dur_beats, vel, cutoff=650.0):
    buf = kit.pluck_bass(note, dur_beats, BPM, cutoff=cutoff, decay=0.22)
    return buf * (vel / 100.0) * 1.15

def riser_buf(dur_beats, vel):
    n = int(dur_beats * BEAT * SR)
    t = np.arange(n) / SR
    x = kit._fft_hp(nprng.uniform(-1, 1, n), 500.0)
    ramp = (t / t[-1]) ** 2.2
    fs = np.linspace(260.0, 1100.0, n)
    sweep = np.sin(2 * np.pi * np.cumsum(fs) / SR) * 0.45
    y = (x * 0.55 + sweep * 0.45) * ramp * (vel / 100.0)
    y[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
    return y * 0.5

def crash_buf(vel):
    n = int(1.5 * SR)
    t = np.arange(n) / SR
    a = kit._fft_hp(nprng.uniform(-1, 1, n), 4500.0) * np.exp(-t / 0.42)
    b = kit._fft_bp(nprng.uniform(-1, 1, n), 6000.0, 12000.0) * np.exp(-t / 0.85) * 0.5
    x = a + b
    cn = int(0.003 * SR)
    x[:cn] *= np.linspace(0, 1, cn)
    return x * (vel / 100.0) * 0.5

def tom_buf(hi, vel):
    f0 = 240.0 if hi else 150.0
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    fb = f0 * (1 + 0.6 * np.exp(-t / 0.02)) 
    x = np.sin(2 * np.pi * np.cumsum(fb) / SR) * np.exp(-t / 0.11)
    cn = int(0.003 * SR)
    x[:cn] += 0.3 * nprng.uniform(-1, 1, cn) * np.exp(-np.arange(cn) / (cn / 2))
    return x * (vel / 100.0) * 0.7

def kick_sw(vel, fund=52.0, decay=0.30, click=0.25):
    return kit.kick(fund=fund, sweep=170.0, sweep_ms=40.0, decay=decay,
                    click=click) * (vel / 100.0)

def snare_buf(vel):
    return kit.snare(185.0, 1200.0, 7000.0, 0.10, 0.20) * (vel / 100.0)

def clap_buf(vel):
    return kit.clap() * (vel / 100.0)

def hat_c_buf(vel):
    b = kit.hat(False)
    return b * (vel / 100.0)

def hat_o_buf(vel):
    b = kit.hat(True)
    keep = int(0.27 * SR)          # choke against next kick
    return b[:keep] * (vel / 100.0)

# ------------- composition ----------------------------------------------------
CHORDS = [
    dict(pad=[57, 60, 64, 71], root=45, sub=33, arp=[69, 72, 76, 81]),   # Am9
    dict(pad=[53, 57, 60, 64], root=41, sub=29, arp=[69, 72, 77, 81]),   # Fmaj7
    dict(pad=[55, 60, 62, 64], root=48, sub=36, arp=[67, 72, 76, 79]),   # Cadd9
    dict(pad=[55, 59, 62, 67], root=43, sub=31, arp=[67, 71, 74, 79]),   # G
]
SEC = dict(INTRO=(0, 8), VERSE=(8, 24), BUILD=(24, 32), CHORUS=(32, 48),
           BREAK=(48, 56), BUILD2=(56, 60), FINAL=(60, 80), OUTRO=(80, 88))

THEME = [(0.0, 69, 1.5, 88), (1.5, 72, 0.5, 74), (2.0, 76, 2.0, 92),
         (4.0, 74, 1.0, 80), (5.0, 72, 1.0, 76), (6.0, 69, 2.0, 84),
         (8.0, 67, 1.5, 82), (9.5, 72, 0.5, 72), (10.0, 76, 1.5, 88),
         (11.5, 79, 0.5, 76), (12.0, 74, 2.0, 90), (14.0, 71, 1.0, 78),
         (15.0, 67, 1.0, 74)]
VERSE_MOTIF = [(0.0, 69, 1.5, 66), (1.5, 72, 0.5, 58), (2.0, 76, 2.0, 70),
               (4.0, 74, 1.0, 62), (5.0, 72, 1.0, 58), (6.0, 69, 2.0, 64)]
BELL_LINE = [(0.0, 81, 3.0, 44), (3.0, 79, 1.0, 38), (4.0, 77, 3.0, 42),
             (7.0, 76, 1.0, 36), (8.0, 72, 3.0, 40), (11.0, 71, 1.0, 34),
             (12.0, 69, 4.0, 46)]

total_len = int((DURATION + TAIL) * SR)
FDTYPE = np.float32
stems = {k: np.zeros((total_len, 2), dtype=FDTYPE)
         for k in ("warm", "air", "bass", "sub", "kick", "snr", "perc", "fx")}
PANS = dict(warm=0.10, air=0.0, bass=0.0, sub=0.0, kick=0.0,
            snr=0.0, perc=0.15, fx=0.0)

hits = []    # [t_sec, kind, vel]
notes = []   # [t_sec, midi, dur_sec, vel]
kicks = []   # seconds, for pump + export
snare_ts = []

def add(stem, buf, t_beats, pan=0.0):
    L = np.cos((pan + 1) * np.pi / 4)
    R = np.sin((pan + 1) * np.pi / 4)
    s = int(t_beats * BEAT * SR)
    if s < 0:
        buf = buf[-s:]
        s = 0
    e = min(s + len(buf), total_len)
    if e <= s:
        return
    st = stems[stem]
    st[s:e, 0] += (buf[:e - s] * L).astype(FDTYPE)
    st[s:e, 1] += (buf[:e - s] * R).astype(FDTYPE)

def hit_at(kind, t_beats, vel, stem, buf, pan=0.0):
    t = t_beats * BEAT
    hits.append([round(t, 4), kind, int(vel)])
    add(stem, buf, t_beats, pan)
    if kind == "kick":
        kicks.append(t)
    elif kind in ("snare", "clap"):
        snare_ts.append(t)
    return t

def chord_at(bar):
    return CHORDS[(bar // 4) % 4]

def bar_in(bar, name):
    a, b = SEC[name]
    return a <= bar < b

# --- pads across whole piece, velocity arc per section ---
for bar in range(0, TOTAL_BARS, 4):
    ch = chord_at(bar)
    if bar_in(bar, "INTRO"):
        vp = 17
    elif bar_in(bar, "OUTRO"):
        vp = 15 if bar < 84 else 12
    elif bar_in(bar, "BREAK"):
        vp = 21
    elif bar_in(bar, "VERSE", ) or bar_in(bar, "BUILD") or bar_in(bar, "BUILD2"):
        vp = 23
    else:
        vp = 26
    for j, n in enumerate(ch["pad"]):
        events_pad_t = bar * 4 + j * 0.06
        add("warm", pad_voice(n, events_pad_t * BEAT, 10.4, vp + j * 2), events_pad_t, PANS["warm"])

# --- sub roots: intro tail, break, outro ---
for bar in range(0, TOTAL_BARS, 4):
    ch = chord_at(bar)
    if bar_in(bar, "INTRO") and bar >= 4:
        add("sub", sub_note(ch["sub"], bar * 4 * BEAT, 15.0, 40), bar * 4)
    elif bar_in(bar, "BREAK"):
        add("sub", sub_note(ch["sub"], bar * 4 * BEAT, 14.0, 44), bar * 4)
    elif bar == 84:
        add("sub", sub_note(33, 84 * 4 * BEAT, 14.0, 34), 84 * 4)

# --- arpeggio 8ths ---
for bar in range(0, TOTAL_BARS):
    ch = chord_at(bar)
    on = False
    base_v = 46
    oct_mode = False
    if bar_in(bar, "INTRO"):
        on = bar >= 4; base_v = 40
    elif bar_in(bar, "VERSE"):
        on = True; base_v = 46
    elif bar_in(bar, "BUILD"):
        on = True
        base_v = 46 + (bar - 24) * 2          # rising into the drop
    elif bar_in(bar, "CHORUS"):
        on = True; base_v = 54
    elif bar_in(bar, "BUILD2"):
        on = True; base_v = 52 + (bar - 56) * 3
    elif bar_in(bar, "FINAL"):
        on = True; base_v = 56; oct_mode = True
    elif bar_in(bar, "OUTRO"):
        on = bar < 84; base_v = 42
    if not on:
        continue
    for i in range(8):                         # 8 eighth-notes per bar
        bt = bar * 4 + i * 0.5
        seq = ch["arp"]
        nt = seq[i % 4]
        if oct_mode and (i // 4) % 2 == 1:
            nt += 12
        v = base_v + (6 if i % 2 == 0 else 0) + rng.randint(-3, 3)
        pan = 0.30 if i % 2 == 0 else -0.30
        add("warm", arp_pluck(nt, bt * BEAT, 0.5, v), bt, pan)

# --- bass driving 8ths (verse/build/chorus/final/outro head) ---
BASS_PAT = [92, 70, 84, 70, 90, 72, 84, 74]
for bar in range(TOTAL_BARS):
    if not (bar_in(bar, "VERSE") or bar_in(bar, "BUILD") or bar_in(bar, "CHORUS")
            or bar_in(bar, "BUILD2") or bar_in(bar, "FINAL") or bar == 80 or bar == 81):
        continue
    ch = chord_at(bar)
    fade = 1.0
    if bar >= 80:
        fade = 0.8 if bar == 80 else 0.6
    for i in range(8):
        bt = bar * 4 + i * 0.5
        nt = ch["root"] + (12 if i in (2, 5) else 0)
        v = BASS_PAT[i] * fade + rng.randint(-4, 4)
        add("bass", pluck_bass8(nt, 0.5, v), bt)

# --- leads ---
def sched_theme(b0, transpose, gain, echo_oct=False):
    for (off, m, d, v) in THEME:
        tt = b0 + off + rng.uniform(-0.015, 0.02)
        vv = min(127, int(v * gain))
        add("air", supersaw(m + transpose, d, vv), tt)
        notes.append([round(tt * BEAT, 4), m + transpose, round(d * BEAT, 4), vv])
        if echo_oct:
            add("air", supersaw(m + transpose + 12, d, int(vv * 0.42)), tt + 0.125)
            notes.append([round((tt + 0.125) * BEAT, 4), m + transpose + 12,
                          round(d * BEAT, 4), int(vv * 0.42)])

for bar in range(SEC["VERSE"][0], SEC["VERSE"][1], 4):
    for (off, m, d, v) in VERSE_MOTIF:
        tt = bar * 4 + off + rng.uniform(-0.02, 0.03)
        add("air", supersaw(m, d, v), tt)
        notes.append([round(tt * BEAT, 4), m, round(d * BEAT, 4), v])

sched_theme(32 * 4, 0, 1.0)                    # chorus A
sched_theme(32 * 4 + 16, 0, 0.94)              # chorus A second half
for k in range(5):                             # final: 5 phrases over 20 bars
    b0 = 60 * 4 + k * 16
    echo = k in (1, 3)
    g = 1.0 if k < 4 else 0.85
    sched_theme(b0, 0, g, echo_oct=echo)

# --- break bell melody (twice through the 8 bars? once, 16 beats) ---
for (off, m, d, v) in BELL_LINE:
    tt = 48 * 4 + off + rng.uniform(-0.03, 0.04)
    add("air", music_box(m, tt * BEAT, d, v), tt, -0.35)
    notes.append([round(tt * BEAT, 4), m, round(d * BEAT, 4), v])

# --- music box sparkles at structural moments ---
for (bt, m, v) in [(0.0, 81, 30), (60 * 4, 88, 34), (86 * 4 + 2.0, 81, 26)]:
    add("air", music_box(m, bt * BEAT, 2.0, v), bt, -0.35)
    notes.append([round(bt * BEAT, 4), m, 1.25, v])

# --- drums ---
HAT_CONTOUR = [96, 48, 70, 50, 88, 48, 70, 54]
for bar in range(TOTAL_BARS):
    verse = bar_in(bar, "VERSE"); build = bar_in(bar, "BUILD")
    chor = bar_in(bar, "CHORUS"); brk = bar_in(bar, "BREAK")
    b2 = bar_in(bar, "BUILD2"); fin = bar_in(bar, "FINAL")
    outro = bar_in(bar, "OUTRO")
    groove = verse or build or chor or b2 or fin or (outro and bar < 82)

    if brk and bar % 2 == 1:
        hit_at("kick", bar * 4, 52, "kick", kick_sw(52, fund=46, decay=0.5, click=0.1))
    if groove:
        kv = 96 if not (chor or fin or b2) else 102
        if outro:
            kv = 96 - (bar - 80) * 18
        for q in range(4):
            hit_at("kick", bar * 4 + q, kv + rng.randint(-2, 2), "kick",
                   kick_sw(kv, decay=0.30))
        for i in range(8):                     # closed hats 8ths
            hv = HAT_CONTOUR[i] + rng.randint(-6, 6)
            if build and bar >= 30:
                hv = min(118, hv + 14)
            hit_at("hat", bar * 4 + i * 0.5, hv, "perc", hat_c_buf(hv), pan=0.15)
        if chor or fin or b2:                  # offbeat open hats, choked
            for q in range(4):
                ov = 68 + rng.randint(-5, 5)
                hit_at("ohat", bar * 4 + q + 0.5, ov, "perc",
                       hat_o_buf(ov), pan=-0.18)
    # snares / claps
    if verse or build or chor or fin or b2:
        sv = 62 if verse else (78 if build else 84)
        cv = 0 if verse else (0 if build and bar < 26 else (86 if (build and bar >= 26) or chor or fin or b2 else 0))
        for qq in (1, 3):
            hit_at("snare", bar * 4 + qq, sv + rng.randint(-3, 3), "snr", snare_buf(sv))
            if cv:
                hit_at("clap", bar * 4 + qq, cv + rng.randint(-3, 3), "snr",
                       clap_buf(cv), pan=rng.choice([-0.08, 0.08]))

# snare-roll crescendos into drops (bars 30-31 and 58-59)
for (rb, base) in ((30, 36), (58, 40)):
    for i in range(16):                        # two bars of 8ths->16ths ramp
        bt = rb * 4 + i * 0.5
        v = base + i * 3
        hit_at("snare", bt, v, "snr", snare_buf(v))
    for i in range(16):                        # last bar 16ths hotter
        bt = (rb + 1) * 4 + i * 0.25
        v = base + 20 + i * 2.5
        hit_at("snare", bt, v, "snr", snare_buf(v))
    for i in range(16):                        # final half-bar 32nds peak
        bt = (rb + 1) * 4 + 2 + i * 0.125
        v = 78 + i * 1.6
        hit_at("snare", bt, v, "snr", snare_buf(v))

# tom fills at block ends
FILL_BARS = (39, 47, 67, 75, 79)
for fb in FILL_BARS:
    seq = [(150, False), (150, False), (240, True), (240, True)]
    for i, (f0, hi) in enumerate(seq):
        bt = fb * 4 + 3 + i * 0.25
        v = 66 + i * 9
        buf = tom_buf(hi, v)
        hit_at("tom", bt, v, "perc", buf, pan=(-0.25 if i % 2 == 0 else 0.25))

# crashes at section/block starts + boom drops
for (cb, cv) in [(32, 96), (40, 78), (48, 60), (60, 100), (68, 80), (76, 80)]:
    add("fx", crash_buf(cv), cb * 4)
    hits.append([round(cb * 4 * BEAT, 4), "crash", cv])
for db in (32, 60):
    add("kick", kit.kick(fund=42, sweep=210, sweep_ms=60, decay=0.8,
                         click=0.3) * 0.95, db * 4)
    kicks.append(db * 4 * BEAT)
    hits.append([round(db * 4 * BEAT, 4), "boom", 110])

# risers into drops
add("fx", riser_buf(16, 72), (SEC["BUILD"][1] - 4) * 4)
add("fx", riser_buf(16, 80), (SEC["BUILD2"][0]) * 4)

print(f"score: {len(hits)} drum hits, {len(notes)} notes, "
      f"{DURATION:.0f}s @ {BPM} BPM", flush=True)

# ------------- sidechain pump -------------------------------------------------
pump_env = np.ones(total_len, dtype=np.float64)
rec = int(0.13 * SR)
dip = 0.55
for kt in kicks:
    s = int(kt * SR)
    e = min(s + rec, total_len)
    if e > s:
        pump_env[s:e] = np.minimum(pump_env[s:e],
                                   dip + (1 - dip) * np.linspace(0, 1, e - s) ** 1.5)
for k in ("warm", "bass"):
    stems[k] *= pump_env.astype(FDTYPE)[..., None]
stems["sub"] *= ((0.8 + 0.2 * pump_env)).astype(FDTYPE)[..., None]
print("sidechain done", flush=True)

# ------------- FFT convolution reverbs ----------------------------------------
ir_len = int(3.0 * SR)
tir = np.arange(ir_len) / SR
def make_ir(seed, tau):
    g = np.random.default_rng(seed)
    ir = g.normal(0, 1, ir_len) * np.exp(-tir / tau)
    ir[:int(0.04 * SR)] = 0.0
    return ir / np.sqrt(np.sum(ir ** 2))

N_FFT = 1 << int(np.ceil(np.log2(total_len + ir_len)))
wetL = np.zeros(total_len); wetR = np.zeros(total_len)
GLOBAL_WET = {"warm": 0.40, "air": 0.55, "sub": 0.06, "fx": 0.20}
IR = make_ir(11, 1.9); IRf = np.fft.rfft(IR, N_FFT)
for ch in (0, 1):
    for k, w in GLOBAL_WET.items():
        X = np.fft.rfft(stems[k][:, ch].astype(np.float64), N_FFT)
        wv = np.fft.irfft(X * IRf, N_FFT)[:total_len]
        if ch == 0:
            wetL += w * wv
        else:
            wetR += w * wv
del X
print("global reverb done", flush=True)

# gated 80s snare verb
g_ir = make_ir(23, 0.9)
GW = np.fft.rfft(g_ir, N_FFT)
gate = np.zeros(total_len)
hold = int(0.24 * SR); ramp = int(0.012 * SR)
one = np.ones(hold); falloff = np.cos(np.linspace(0, np.pi / 2, ramp)) ** 2
for ts in snare_ts:
    s = int(ts * SR)
    e1 = min(s + hold, total_len); e2 = min(s + hold + ramp, total_len)
    gate[s:e1] = 1.0
    if e2 > e1:
        gate[e1:e2] = falloff[:e2 - e1]
gateL = np.zeros(total_len); gateR = np.zeros(total_len)
for ch in (0, 1):
    X = np.fft.rfft(stems["snr"][:, ch].astype(np.float64), N_FFT)
    wv = np.fft.irfft(X * GW, N_FFT)[:total_len] * gate
    if ch == 0:
        gateL += wv
    else:
        gateR += wv
del X
print("gated verb done", flush=True)

ER_TAPS = [(0.013, .50), (0.021, -.38), (0.029, .27), (0.041, -.19), (0.053, .12)]
erL = np.zeros(total_len); erR = np.zeros(total_len)
for k in ("warm", "air"):
    for (dt, g) in ER_TAPS:
        d = int(dt * SR)
        erL[d:] += stems[k][:-d or None, 0] * g * 0.5
        erR[d:] += stems[k][:-d or None, 1] * g * 0.5

# ------------- mix & master -----------------------------------------------------
mix = np.zeros((total_len, 2), dtype=np.float64)
for k in stems:
    mix += stems[k].astype(np.float64)
mix[:, 0] += wetL + gateL + erL
mix[:, 1] += wetR + gateR + erR

S = np.fft.rfft(mix, axis=0)
freqs = np.fft.rfftfreq(total_len, 1 / SR)
hp = np.clip((freqs - 70.0) / 60.0, 0, 1)
lp = 1.0 - 0.40 * np.clip((freqs - 9000.0) / 5000.0, 0, 1)
S *= (hp * lp)[:, None]
mix = np.fft.irfft(S, total_len, axis=0)
floor = nprng.normal(0, 1, (total_len, 2)) * 0.0005
kern = np.exp(-np.arange(800) / 160.0); kern /= kern.sum()
mix[:, 0] += np.convolve(floor[:, 0], kern, mode="same")
mix[:, 1] += np.convolve(floor[:, 1], kern, mode="same")
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
peak = float(np.max(np.abs(mix)))
mix *= 0.89 / peak
print(f"master: peak normalized from {peak:.3f}", flush=True)

# gentle ending fade over last 3.5s of audio content
fade_start = int((DURATION - 1.0) * SR)
fade_n = total_len - fade_start
mix[fade_start:] *= np.linspace(1, 0, fade_n)[:, None] ** 1.5

pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(WAV, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("WAV:", WAV, os.path.getsize(WAV), flush=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", WAV, "-codec:a",
                "libmp3lame", "-b:a", "192k", MP3], check=True)
print("MP3:", MP3, os.path.getsize(MP3), flush=True)

beats = [round(i * BEAT, 4) for i in range(int(DURATION / BEAT) + 1)]
sections = []
labels = dict(INTRO="DAWN", VERSE="NIGHT DRIVE", BUILD="ASCENT",
              CHORUS="NEON BLOOM", BREAK="AFTERGLOW", BUILD2="IGNITION",
              FINAL="SUPERNOVA", OUTRO="FADE")
scenes = dict(INTRO="dawn", VERSE="drive", BUILD="ascent", CHORUS="bloom",
              BREAK="afterglow", BUILD2="ignition", FINAL="supernova",
              OUTRO="fade")
for name, (a, b) in SEC.items():
    sections.append(dict(id=scenes[name], label=labels[name],
                         start=round(a * BAR, 3), end=round(b * BAR, 3)))
ev = dict(bpm=BPM, duration=round(DURATION, 3), totalBars=TOTAL_BARS,
          sections=sections, beats=beats,
          hits=[[h[0], h[1], h[2]] for h in sorted(hits)],
          notes=[n for n in sorted(notes)])
with open(EVJ, "w") as f:
    json.dump(ev, f, separators=(",", ":"))
print("events:", EVJ, os.path.getsize(EVJ), flush=True)
