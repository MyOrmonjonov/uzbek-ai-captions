"""HTTP endpoint the Java backend calls for word-precise transcription: Gemini transcribes the
audio (content is more reliable than Whisper for a low-resource language like Uzbek) and
Whisper's frame-accurate timestamps are aligned onto Gemini's words (see hybrid_transcriber).
Runs in the same aiohttp app as the license verify server, gated by the same device+token check
so only activated plugin installs can use it.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from aiohttp import web

import hybrid_transcriber
import licensing

logger = logging.getLogger(__name__)


async def handle_transcribe(request: web.Request) -> web.Response:
    device_code = request.headers.get("X-Device-Code", "")
    token = request.headers.get("X-License-Token", "")
    license_result = licensing.verify(device_code, token)
    if not license_result.valid:
        return web.json_response({"error": "license_invalid", "reason": license_result.reason}, status=402)

    audio_bytes = await request.read()
    if not audio_bytes:
        return web.json_response({"error": "empty_body"}, status=400)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "audio.wav"
            wav_path.write_bytes(audio_bytes)
            result = await asyncio.to_thread(hybrid_transcriber.transcribe, wav_path)
    except Exception:
        logger.exception("Hybrid transcription failed")
        return web.json_response({"error": "transcription_failed"}, status=500)

    return web.json_response(
        {
            "words": [{"text": w.text, "start": w.start, "end": w.end} for w in result.words],
            "segments": [{"text": s.text, "start": s.start, "end": s.end} for s in result.segments],
        }
    )


def register(app: web.Application) -> None:
    app.router.add_post("/transcribe", handle_transcribe)