"""Concatenate TTS clips into one 'talk' WAV with natural pauses (for fake-microphone E2E tests).
Usage: python scripts/make-talk-wav.py OUT.wav clip1 clip2 ...   (clips from test/fixtures/audio)"""
import sys, wave
out, names = sys.argv[1], sys.argv[2:]
RATE, GAP, LEAD, TAIL = 16000, 1.3, 1.0, 45.0
frames = bytearray(b'\x00\x00' * int(RATE * LEAD))
for n in names:
    with wave.open(f'test/fixtures/audio/{n}.wav') as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        frames += w.readframes(w.getnframes())
    frames += b'\x00\x00' * int(RATE * GAP)
frames += b'\x00\x00' * int(RATE * TAIL)
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(frames))
print(out, round(len(frames) / 2 / RATE, 1), 's')
