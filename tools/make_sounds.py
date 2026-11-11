"""Synthesize the firearm and explosion effects as small WAV files.

Usage:  python tools/make_sounds.py
Writes public/audio/<name>.wav (mono, 22 050 Hz, 16 bit). No library is needed
and no third-party audio is used: every sound is built here from noise, sine
waves and envelopes, so the files are ours to publish.

How the sounds are made:
- A gunshot is a short burst of filtered noise (the crack) on top of a low
  sine "thump" that drops in pitch (the body), with a fast exponential decay.
- A big explosion is long low-passed noise with a rumbling sub tone.
- The reload is two metallic clicks (short high sine pings).
The random generator has a fixed seed, so the files come out the same every run.
"""
import math
import pathlib
import random
import struct
import wave

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "audio"
RATE = 22050
rng = random.Random(7)


def silence(seconds: float) -> list:
    return [0.0] * int(RATE * seconds)


def noise(seconds: float) -> list:
    return [rng.uniform(-1, 1) for _ in range(int(RATE * seconds))]


def lowpass(samples: list, cutoff: float) -> list:
    """One-pole low-pass filter: lower cutoff, darker sound."""
    dt = 1 / RATE
    alpha = dt / (1 / (2 * math.pi * cutoff) + dt)
    out, y = [], 0.0
    for x in samples:
        y += alpha * (x - y)
        out.append(y)
    return out


def highpass(samples: list, cutoff: float) -> list:
    low = lowpass(samples, cutoff)
    return [x - l for x, l in zip(samples, low)]


def envelope(samples: list, attack: float, decay: float) -> list:
    """Linear attack, then exponential decay with time constant `decay` seconds."""
    out = []
    for i, x in enumerate(samples):
        t = i / RATE
        gain = t / attack if t < attack else math.exp(-(t - attack) / decay)
        out.append(x * gain)
    return out


def thump(seconds: float, start_hz: float, end_hz: float, decay: float) -> list:
    """A sine whose pitch falls from start_hz to end_hz: the punch of a shot."""
    out, phase = [], 0.0
    n = int(RATE * seconds)
    for i in range(n):
        t = i / RATE
        hz = end_hz + (start_hz - end_hz) * math.exp(-t / (seconds / 4))
        phase += 2 * math.pi * hz / RATE
        out.append(math.sin(phase) * math.exp(-t / decay))
    return out


def mix(*tracks: tuple) -> list:
    """tracks: (samples, gain, offset_seconds)."""
    length = max(len(s) + int(o * RATE) for s, _, o in tracks)
    out = [0.0] * length
    for samples, gain, offset in tracks:
        start = int(offset * RATE)
        for i, x in enumerate(samples):
            out[start + i] += x * gain
    return out


def normalise(samples: list, peak: float = 0.89) -> list:
    top = max(abs(x) for x in samples) or 1
    # Soft clip after normalising: louder feel without harsh digital clipping.
    return [math.tanh(1.6 * x * peak / top) / math.tanh(1.6) for x in samples]


def ping(hz: float, seconds: float) -> list:
    return [math.sin(2 * math.pi * hz * i / RATE) * math.exp(-i / RATE / 0.012) for i in range(int(RATE * seconds))]


def gunshot(crack_cut: float, body_hz: float, length: float, decay: float, tail: float) -> list:
    crack = envelope(highpass(noise(length), 900), 0.001, decay * 0.5)
    body = envelope(lowpass(noise(length), crack_cut), 0.002, decay)
    punch = thump(length, body_hz * 3, body_hz, decay * 0.8)
    echo = envelope(lowpass(noise(tail), 700), 0.02, tail / 3)
    return normalise(mix((crack, 0.6, 0), (body, 1.0, 0), (punch, 0.9, 0), (echo, 0.25, length * 0.6)))


SOUNDS = {
    "gun-pistol": lambda: gunshot(2600, 110, 0.18, 0.045, 0.25),
    "gun-smg": lambda: gunshot(3200, 140, 0.11, 0.028, 0.12),
    "gun-rifle": lambda: gunshot(2200, 90, 0.26, 0.06, 0.4),
    "gun-sniper": lambda: gunshot(1800, 70, 0.4, 0.09, 0.7),
    "gun-shotgun": lambda: gunshot(1400, 60, 0.35, 0.085, 0.5),
    "cannon": lambda: gunshot(900, 45, 0.5, 0.12, 0.8),
    "rocket": lambda: normalise(mix(
        (envelope(lowpass(noise(0.7), 1600), 0.03, 0.25), 1.0, 0),
        (thump(0.3, 160, 60, 0.08), 0.8, 0),
    )),
    "explosion": lambda: normalise(mix(
        (envelope(lowpass(noise(1.4), 900), 0.004, 0.32), 1.0, 0),
        (envelope(highpass(noise(0.15), 1500), 0.001, 0.03), 0.5, 0),
        (thump(1.2, 120, 32, 0.35), 1.1, 0),
        (envelope(lowpass(noise(1.0), 300), 0.1, 0.4), 0.5, 0.2),
    )),
    "reload": lambda: normalise(mix((ping(2400, 0.06), 1.0, 0), (ping(1700, 0.08), 0.9, 0.11), (lowpass(noise(0.02), 3000), 0.3, 0.11)), 0.6),
}


def write_wav(path: pathlib.Path, samples: list) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 32767)) for x in samples))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in SOUNDS.items():
        write_wav(OUT / f"{name}.wav", make())
        print(f"audio/{name}.wav")


if __name__ == "__main__":
    main()
