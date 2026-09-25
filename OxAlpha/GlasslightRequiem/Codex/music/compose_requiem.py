import json
import math
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter


ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "music"
WAV_PATH = MUSIC_DIR / "Glasslight_Requiem.wav"
MP3_PATH = MUSIC_DIR / "Glasslight_Requiem.mp3"
SCORE_PATH = MUSIC_DIR / "score.json"
ANALYSIS_PATH = MUSIC_DIR / "analysis.json"

SR = 48000
BPM = 124.0
BEAT = 60.0 / BPM
BAR = 4.0 * BEAT
BAR_COUNT = 48
TAIL_SECONDS = 4.0
DURATION = BAR_COUNT * BAR + TAIL_SECONDS

SECTIONS = [
    {"id": "waking", "label": "I. Waking Glass", "startBar": 0, "bars": 8, "energy": 0.18},
    {"id": "ember", "label": "II. Ember Current", "startBar": 8, "bars": 8, "energy": 0.48},
    {"id": "choir", "label": "III. Choir of Lines", "startBar": 16, "bars": 12, "energy": 0.72},
    {"id": "fracture", "label": "IV. The Fracture", "startBar": 28, "bars": 4, "energy": 0.96},
    {"id": "afterglow", "label": "V. Afterglow", "startBar": 32, "bars": 8, "energy": 0.38},
    {"id": "ember-return", "label": "VI. Ember Return", "startBar": 40, "bars": 8, "energy": 0.88},
]


def midi_to_hz(note):
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def add_stereo_tone(left, right, note, start, duration, velocity, pan=0.0, timbre="glass", seed=0):
    start_sample = int(round(start * SR))
    length = max(1, int(round(duration * SR)))
    if start_sample >= len(left):
        return
    count = min(length, len(left) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    phase = 2.0 * np.pi * midi_to_hz(note) * t + seed * 0.0013
    if timbre == "glass":
        signal = np.sin(phase) + 0.28 * np.sin(2.01 * phase + 0.18) + 0.1 * np.sin(4.03 * phase + 0.44)
        attack = 0.004 + 0.018 * (seed % 3)
        signal *= np.minimum(1.0, t / attack) * np.exp(-t / 0.62)
    elif timbre == "organ":
        signal = (
            np.sin(phase)
            + 0.58 * np.sin(2.0 * phase + 0.06)
            + 0.34 * np.sin(3.0 * phase + 0.13)
            + 0.18 * np.sin(4.0 * phase + 0.22)
            + 0.08 * np.sin(6.0 * phase)
        ) / 2.25
        attack = min(0.38, duration * 0.22)
        release = min(0.85, duration * 0.34)
        signal *= np.clip(t / max(attack, 0.001), 0.0, 1.0) * np.clip((duration - t) / max(release, 0.001), 0.0, 1.0)
    else:
        signal = np.sin(phase) * np.exp(-t / 0.38)
    signal *= velocity
    left_gain = math.sqrt((1.0 - pan) * 0.5)
    right_gain = math.sqrt((1.0 + pan) * 0.5)
    left[start_sample:start_sample + count] += signal * left_gain
    right[start_sample:start_sample + count] += signal * right_gain


def add_bass(bus, note, start, duration, velocity=0.6):
    start_sample = int(round(start * SR))
    count = min(max(1, int(duration * SR)), len(bus) - start_sample)
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float64) / SR
    phase = 2.0 * np.pi * midi_to_hz(note) * t
    signal = np.sin(phase) + 0.2 * np.sin(2.0 * phase) + 0.05 * np.sin(3.0 * phase)
    signal *= np.minimum(1.0, t / 0.009) * np.exp(-t / max(0.075, duration * 0.4))
    bus[start_sample:start_sample + count] += signal * velocity


def add_kick(bus, start, velocity=0.62):
    start_sample = int(round(start * SR))
    length = int(0.38 * SR)
    count = min(length, len(bus) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    frequency = 45.0 + 92.0 * np.exp(-t / 0.025)
    phase = 2.0 * np.pi * np.cumsum(frequency) / SR
    signal = np.sin(phase) * np.exp(-t / 0.18)
    noise = np.random.default_rng(int(start * 1000) + 3).normal(0, 1, count)
    signal += noise * np.exp(-t / 0.006) * 0.14
    bus[start_sample:start_sample + count] += signal * velocity


def add_snare(bus, start, velocity=0.32):
    start_sample = int(round(start * SR))
    length = int(0.24 * SR)
    count = min(length, len(bus) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    noise = np.random.default_rng(int(start * 1000) + 17).normal(0, 1, count)
    signal = lfilter([1.0], [1.0, -0.68], noise) * np.exp(-t / 0.064)
    signal += 0.34 * np.sin(2.0 * np.pi * 188.0 * t) * np.exp(-t / 0.04)
    bus[start_sample:start_sample + count] += signal * velocity


def add_hat(bus, start, velocity=0.1, open_hat=False):
    start_sample = int(round(start * SR))
    decay = 0.11 if open_hat else 0.027
    length = int(max(decay * 5.0, 0.18) * SR)
    count = min(length, len(bus) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    noise = np.random.default_rng(int(start * 1000) + 29).normal(0, 1, count)
    signal = lfilter([1.0, -0.82], [1.0], noise) * np.exp(-t / decay)
    bus[start_sample:start_sample + count] += signal * velocity


def add_spark(bus, start, note, velocity=0.12, seed=0):
    start_sample = int(round(start * SR))
    length = int(0.8 * SR)
    count = min(length, len(bus) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    phase = 2.0 * np.pi * midi_to_hz(note) * t
    noise = np.random.default_rng(seed).normal(0, 1, count)
    signal = (np.sin(phase) + 0.48 * np.sin(2.02 * phase) + noise * np.exp(-t / 0.05) * 0.32) * velocity
    signal *= np.minimum(1.0, t / 0.004) * np.exp(-t / 0.16)
    bus[start_sample:start_sample + count] += signal


def add_impact(bus, start, velocity=1.0):
    start_sample = int(round(start * SR))
    length = int(2.6 * SR)
    count = min(length, len(bus) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    frequency = 43.0 + 110.0 * np.exp(-t / 0.055)
    phase = 2.0 * np.pi * np.cumsum(frequency) / SR
    signal = np.sin(phase) * np.exp(-t / 0.62)
    noise = np.random.default_rng(int(start * 1000) + 71).normal(0, 1, count)
    signal += lfilter([1.0], [1.0, -0.92], noise) * np.exp(-t / 0.085) * 0.48
    bus[start_sample:start_sample + count] += signal * velocity


def add_noise_sweep(left, right, start, duration, seed, direction="up", intensity=0.18):
    start_sample = int(round(start * SR))
    length = max(1, int(round(duration * SR)))
    count = min(length, len(left) - start_sample)
    t = np.arange(count, dtype=np.float64) / SR
    progress = np.linspace(0.0, 1.0, count)
    noise = np.random.default_rng(seed).normal(0.0, 1.0, count)
    filtered = lfilter([1.0], [1.0, -0.985], noise)
    pan = np.linspace(-0.75, 0.75, count) if direction == "up" else np.linspace(0.75, -0.75, count)
    left_gain = np.sqrt((1.0 - np.maximum(pan, 0.0)) * 0.5)
    right_gain = np.sqrt((1.0 + np.minimum(pan, 0.0)) * 0.5)
    env = progress ** 2 if direction == "up" else (1.0 - progress) ** 2
    signal = filtered * env * intensity
    left[start_sample:start_sample + count] += signal * left_gain
    right[start_sample:start_sample + count] += signal * right_gain


def make_buses():
    sample_count = int(DURATION * SR)
    return (
        np.zeros(sample_count, dtype=np.float64),
        np.zeros(sample_count, dtype=np.float64),
        np.zeros(sample_count, dtype=np.float64),
    )


def add_bar_drums(mono, bar_start, intensity=0.6, drive=False):
    for beat_index in range(4):
        beat_time = bar_start + beat_index * BEAT
        add_kick(mono, beat_time, intensity * (0.82 if beat_index == 0 else 1.0))
        if beat_index in (1, 3):
            add_snare(mono, beat_time, intensity * 0.58)
        if drive:
            add_kick(mono, beat_time + BEAT * 0.5, intensity * 0.5)
        add_hat(mono, beat_time + BEAT * 0.5, intensity * 0.18, open_hat=beat_index == 3)
        if drive and beat_index in (1, 3):
            for sixteenth in (0.25, 0.5, 0.75):
                add_snare(mono, beat_time + BEAT * sixteenth, intensity * 0.11)


def arrange():
    left, right, mono = make_buses()
    events = [
        {"time": 5 * BAR, "type": "firstPulse", "strength": 0.48},
        {"time": 8 * BAR, "type": "emberIgnite", "strength": 0.68},
        {"time": 15 * BAR, "type": "emberIgnite", "strength": 0.9},
        {"time": 16 * BAR, "type": "choirOpen", "strength": 0.78},
        {"time": 24 * BAR, "type": "choirSurge", "strength": 0.94},
        {"time": 28 * BAR, "type": "fracture", "strength": 1.0},
        {"time": 32 * BAR, "type": "afterglow", "strength": 0.42},
        {"time": 40 * BAR, "type": "emberReturn", "strength": 1.0},
        {"time": 46 * BAR, "type": "resolve", "strength": 0.28},
    ]

    for section in SECTIONS:
        section_start = section["startBar"] * BAR
        section_beats = section["bars"] * 4
        if section["id"] == "waking":
            motif = [74, 76, 81, 79, 76, 72, 69, 67]
            for beat_index in range(section_beats):
                beat_time = section_start + beat_index * BEAT
                if beat_index < len(motif):
                    note = motif[beat_index]
                    add_stereo_tone(left, right, note, beat_time, 0.72, 0.17, -0.32, "glass", beat_index)
                    add_stereo_tone(left, right, note, beat_time, 0.72, 0.12, 0.32, "glass", beat_index + 2)
                    add_spark(mono, beat_time, note + 12, 0.1, beat_index + 1)
                if beat_index >= 16 and beat_index % 4 == 0:
                    add_kick(mono, beat_time, 0.22)
                if beat_index >= 16:
                    add_hat(mono, beat_time + BEAT * 0.5, 0.035, open_hat=beat_index % 4 == 3)
                if beat_index == 16:
                    add_impact(mono, beat_time, 0.3)
                if 24 <= beat_index < section_beats:
                    note = 50 + (0, 0, 3, 3)[beat_index % 4]
                    add_stereo_tone(left, right, note, beat_time, BAR * 0.78, 0.13, -0.58, "organ", beat_index)
                    add_stereo_tone(left, right, note, beat_time, BAR * 0.78, 0.13, 0.58, "organ", beat_index + 1)
                if beat_index == section_beats - 4:
                    add_noise_sweep(left, right, beat_time, BAR, 91, "up", 0.19)
                if beat_index == section_beats - 1:
                    add_impact(mono, beat_time, 0.62)
        elif section["id"] == "ember":
            bass_notes = [38, 41, 43, 46]
            lead_notes = [79, 81, 86, 84, 81, 79, 76, 74]
            for bar_offset in range(section["bars"]):
                bar_start = section_start + bar_offset * BAR
                add_bar_drums(mono, bar_start, 0.48 if section["startBar"] == 8 else 0.76, section["startBar"] != 8)
                for beat_index in range(4):
                    beat_time = bar_start + beat_index * BEAT
                    add_bass(mono, bass_notes[beat_index % 4], beat_time, BEAT * (0.42 if section["startBar"] != 8 else 0.86), 0.46 if section["startBar"] == 8 else 0.62)
                    if beat_index % 2 == 0:
                        note = lead_notes[(bar_offset * 4 + beat_index) // 2 % len(lead_notes)]
                        add_stereo_tone(left, right, note, beat_time, BEAT * 0.52, 0.19, -0.18, "glass", beat_index + bar_offset)
                        add_stereo_tone(left, right, note + 12, beat_time, BEAT * 0.44, 0.075, 0.22, "glass", beat_index + bar_offset + 3)
                        add_spark(mono, beat_time, note + 12, 0.1, 200 + bar_offset * 11 + beat_index)
            add_impact(mono, section_start + (section["bars"] - 1) * BAR, 0.82)
        elif section["id"] == "choir":
            for beat_index in range(section_beats):
                beat_time = section_start + beat_index * BEAT
                note = [50, 53, 57, 60][beat_index % 4]
                if beat_index % 2 == 0:
                    add_stereo_tone(left, right, note + 12, beat_time, BEAT * 1.8, 0.14, -0.44, "organ", beat_index)
                    add_stereo_tone(left, right, note + 12, beat_time, BEAT * 1.8, 0.14, 0.44, "organ", beat_index + 1)
                if beat_index % 4 == 0:
                    add_bass(mono, note, beat_time, BEAT * 2.8, 0.4)
                    add_bar_drums(mono, beat_time, 0.32 + 0.012 * beat_index)
                if beat_index in (0, section_beats // 2):
                    add_impact(mono, beat_time, 0.6)
                if beat_index == 0:
                    add_noise_sweep(left, right, beat_time, BAR, 151, "up", 0.2)
                if beat_index == section_beats // 2:
                    add_noise_sweep(left, right, beat_time, BAR, 152, "down", 0.14)
        elif section["id"] == "fracture":
            for bar_offset in range(section["bars"]):
                bar_start = section_start + bar_offset * BAR
                add_bar_drums(mono, bar_start, 0.9 - bar_offset * 0.12, True)
                for beat_index in range(4):
                    beat_time = bar_start + beat_index * BEAT
                    note = [86, 84, 81, 74][beat_index]
                    add_stereo_tone(left, right, note, beat_time, BEAT * 0.5, 0.24, -0.25 if beat_index % 2 else 0.25, "glass", beat_index + bar_offset)
                    add_spark(mono, beat_time, note + 12, 0.16, 400 + bar_offset * 17 + beat_index)
                if bar_offset == 0:
                    add_impact(mono, bar_start, 1.0)
                    add_noise_sweep(left, right, bar_start, BAR, 401, "up", 0.25)
        elif section["id"] == "afterglow":
            for beat_index in range(section_beats):
                beat_time = section_start + beat_index * BEAT
                note = [74, 76, 79, 76, 74, 72, 69, 67][beat_index % 8]
                add_stereo_tone(left, right, note, beat_time, BEAT * 1.5, 0.14, -0.36, "glass", beat_index)
                add_stereo_tone(left, right, note + 12, beat_time, BEAT * 1.1, 0.08, 0.36, "glass", beat_index + 2)
                if beat_index % 4 == 0:
                    add_bass(mono, 38 if beat_index % 8 == 0 else 43, beat_time, BEAT * 2.4, 0.25)
                if beat_index % 4 == 0:
                    add_kick(mono, beat_time, 0.16)
                if beat_index % 4 == 2:
                    add_hat(mono, beat_time, 0.045, open_hat=True)
                if beat_index == 0 and beat_index == 0:
                    add_impact(mono, beat_time, 0.24)
            add_noise_sweep(left, right, section_start + section_beats * BEAT - BAR, BAR, 501, "down", 0.12)
        elif section["id"] == "ember-return":
            bass_notes = [38, 41, 43, 46]
            lead_notes = [86, 84, 81, 79, 81, 86, 88, 86]
            for bar_offset in range(section["bars"]):
                bar_start = section_start + bar_offset * BAR
                add_bar_drums(mono, bar_start, 0.84, True)
                for beat_index in range(4):
                    beat_time = bar_start + beat_index * BEAT
                    add_bass(mono, bass_notes[beat_index % 4], beat_time, BEAT * 0.42, 0.68)
                    if beat_index % 2 == 0:
                        note = lead_notes[(bar_offset * 4 + beat_index) // 2 % len(lead_notes)]
                        add_stereo_tone(left, right, note, beat_time, BEAT * 0.55, 0.23, -0.2, "glass", beat_index + bar_offset)
                        add_stereo_tone(left, right, note + 12, beat_time, BEAT * 0.42, 0.08, 0.2, "glass", beat_index + bar_offset + 3)
                        add_spark(mono, beat_time, note + 12, 0.13, 600 + bar_offset * 13 + beat_index)
            add_impact(mono, section_start + (section["bars"] - 1) * BAR, 0.98)
    fade_start = int((BAR_COUNT * BAR - 1.4) * SR)
    fade_end = int(DURATION * SR)
    fade = np.ones(fade_end)
    fade[fade_start:fade_end] = np.linspace(1.0, 0.0, fade_end - fade_start, endpoint=True)
    left *= fade
    right *= fade
    mono *= fade
    return left, right, mono, events


def mix_and_normalize(left, right, mono):
    stereo = (left + right) * 0.5 + mono * 0.78
    stereo = np.tanh(stereo * 1.08) / np.tanh(1.08)
    return stereo / (np.max(np.abs(stereo)) + 1e-12) * 0.92


def write_wav(path, signal):
    pcm = np.clip(signal, -1.0, 1.0) * 32767.0
    wavfile.write(path, SR, pcm.astype(np.int16))


def write_mp3(path, wav_path):
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "256k",
            str(path),
        ],
        check=True,
    )


def find_peaks(values, distance):
    threshold = float(np.mean(values) + (np.max(values) - np.mean(values)) * 0.3)
    candidates = np.flatnonzero(
        (values[1:-1] >= values[:-2])
        & (values[1:-1] > values[2:])
        & (values[1:-1] >= threshold)
    ) + 1
    ordered = candidates[np.argsort(values[candidates])[::-1]]
    selected = []
    for index in ordered:
        if all(abs(int(index) - prior) >= distance for prior in selected):
            selected.append(int(index))
    selected.sort()
    return np.array(selected, dtype=int)


def analyze(signal):
    sample_count = min(len(signal), int(DURATION * SR))
    n_fft = 2048
    hop = 512
    frames = np.lib.stride_tricks.sliding_window_view(signal[:sample_count], n_fft)[::hop]
    times = np.arange(frames.shape[0], dtype=np.float64) * hop / SR
    windowed = frames * np.hanning(n_fft)
    spectrum = np.abs(np.fft.rfft(windowed, axis=1))
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-12)
    attack = np.maximum(0.0, np.diff(rms, prepend=rms[0]))
    onset_indices = find_peaks(attack, 12)
    onset_indices = onset_indices[attack[onset_indices] >= np.percentile(attack, 72)]
    onsets = [round(float(times[index]), 3) for index in onset_indices[:120]]
    frequencies = np.fft.rfftfreq(n_fft, 1.0 / SR)
    bands = []
    for low, high in [(20, 160), (160, 900), (900, 4500), (4500, 12000)]:
        mask = (frequencies >= low) & (frequencies < high)
        band_energy = np.sqrt(np.mean(spectrum[:, mask] ** 2, axis=1) + 1e-12)
        peak_indices = find_peaks(band_energy, 8)
        bands.append(
            {
                "lowHz": low,
                "highHz": high,
                "peakTimes": [round(float(times[index]), 3) for index in peak_indices[:48]],
            }
        )
    return {
        "generator": "Glasslight Requiem deterministic analysis",
        "bpm": BPM,
        "bars": BAR_COUNT,
        "duration": round(sample_count / SR, 3),
        "sampleRate": SR,
        "channels": 2,
        "peak": round(float(np.max(np.abs(signal))), 6),
        "rms": round(float(np.sqrt(np.mean(signal * signal))), 6),
        "frequencyBands": bands,
        "onsetTimes": onsets,
        "analysisWindow": n_fft,
        "analysisHop": hop,
    }


def score_document(events):
    section_timings = []
    for section in SECTIONS:
        section_timings.append(
            {
                **section,
                "start": round(section["startBar"] * BAR, 3),
                "end": round((section["startBar"] + section["bars"]) * BAR, 3),
            }
        )
    return {
        "title": "Glasslight Requiem",
        "concept": "A sealed observatory follows one surviving ember through six acts of light, pressure, and release.",
        "audio": "Glasslight_Requiem.mp3",
        "duration": DURATION,
        "sampleRate": SR,
        "tempo": BPM,
        "key": "D minor",
        "meter": "4/4",
        "sections": section_timings,
        "events": [{**event, "time": round(event["time"], 3)} for event in events],
    }


def main():
    left, right, mono, events = arrange()
    signal = mix_and_normalize(left, right, mono)
    report = analyze(signal)
    write_wav(WAV_PATH, signal)
    write_mp3(MP3_PATH, WAV_PATH)
    SCORE_PATH.write_text(json.dumps(score_document(events), indent=2), encoding="utf-8")
    ANALYSIS_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"duration": DURATION, "bpm": BPM, "events": len(events), "onsets": len(report["onsetTimes"])}))


if __name__ == "__main__":
    main()
