"""HTTP endpoints the Java backend calls to keep the Gemini/Pexels/Giphy API keys off of every
distributed plugin install: translation transcription (Gemini) and B-roll suggestions
(Gemini scene grouping + Pexels/Giphy search). Gated by the same device+token license check as
transcribe_server.py, in the same aiohttp app.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from aiohttp import web

import broll
import gemini_transcriber
import licensing

logger = logging.getLogger(__name__)


def _check_license(request: web.Request) -> licensing.VerifyResult:
    device_code = request.headers.get("X-Device-Code", "")
    token = request.headers.get("X-License-Token", "")
    return licensing.verify(device_code, token)


async def handle_transcribe_translate(request: web.Request) -> web.Response:
    license_result = _check_license(request)
    if not license_result.valid:
        return web.json_response({"error": "license_invalid", "reason": license_result.reason}, status=402)

    translate_to = request.query.get("translateTo") or None

    audio_bytes = await request.read()
    if not audio_bytes:
        return web.json_response({"error": "empty_body"}, status=400)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "audio.wav"
            wav_path.write_bytes(audio_bytes)
            result = await asyncio.to_thread(gemini_transcriber.transcribe, wav_path, translate_to)
    except Exception:
        logger.exception("Gemini translation transcription failed")
        return web.json_response({"error": "transcription_failed"}, status=500)

    return web.json_response(
        {
            "words": [{"text": w.text, "start": w.start, "end": w.end} for w in result.words],
            "segments": [{"text": s.text, "start": s.start, "end": s.end} for s in result.segments],
        }
    )


async def handle_broll_suggestions(request: web.Request) -> web.Response:
    license_result = _check_license(request)
    if not license_result.valid:
        return web.json_response({"error": "license_invalid", "reason": license_result.reason}, status=402)

    try:
        body = await request.json()
    except ValueError:
        return web.json_response({"error": "bad_json"}, status=400)

    segments = body.get("segments") or []
    if not segments:
        return web.json_response({"error": "segments_required"}, status=400)

    try:
        suggestions = await broll.suggestions_for_segments(segments)
    except Exception:
        logger.exception("B-roll suggestion lookup failed")
        return web.json_response({"error": "broll_failed"}, status=500)

    return web.json_response({"suggestions": suggestions})


def register(app: web.Application) -> None:
    app.router.add_post("/transcribe-translate", handle_transcribe_translate)
    app.router.add_post("/broll-suggestions", handle_broll_suggestions)
