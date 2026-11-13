"""Speaks a voiceover script with Kokoro (local, Apache-2.0): one WAV per line and their lengths.
Setup, once (kokoro-onnx wants Python 3.13 or older): python3.13 -m venv marketing/tts/.venv,
marketing/tts/.venv/bin/pip install kokoro-onnx soundfile, and the two model files from
github.com/thewh1teagle/kokoro-onnx (release model-files-v1.0) in marketing/tts/models.
Usage: marketing/tts/.venv/bin/python marketing/say.py marketing/voice/join.json"""
import json, sys
from pathlib import Path
import soundfile as sf
from kokoro_onnx import Kokoro

here = Path(__file__).parent / "tts"
script = Path(sys.argv[1])
spec = json.loads(script.read_text())
kokoro = Kokoro(str(here / "models/kokoro-v1.0.fp16.onnx"), str(here / "models/voices-v1.0.bin"))
out = script.parent / script.stem
out.mkdir(exist_ok=True)
lengths = {}
for name, text in spec["lines"]:
    samples, rate = kokoro.create(text, voice=spec["voice"], speed=spec["speed"], lang="en-us")
    sf.write(out / f"{name}.wav", samples, rate)
    lengths[name] = round(len(samples) / rate, 3)
    print(f"{name}: {lengths[name]}s")
(out / "lengths.json").write_text(json.dumps(lengths, indent=2))
