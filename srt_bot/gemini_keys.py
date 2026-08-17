"""Round-robins across multiple Gemini API keys for the subtitle pipeline
(gemini_transcriber.py, spelling_correction.py). The free tier's request quota is
per-key-per-day, so once one key gets rate-limited (429 RESOURCE_EXHAUSTED), calls
switch to the next configured key instead of failing/degrading for the rest of the day.
"""

import logging
import threading

from google import genai
from google.genai import errors as genai_errors

import config

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_index = 0
_clients: dict[int, genai.Client] = {}


def _client_for(index: int) -> genai.Client:
    if index not in _clients:
        _clients[index] = genai.Client(api_key=config.GEMINI_API_KEYS[index])
    return _clients[index]


def is_quota_error(exc: Exception) -> bool:
    return isinstance(exc, genai_errors.ClientError) and (
        exc.code == 429 or (exc.status or "").upper() == "RESOURCE_EXHAUSTED"
    )


def call_with_rotation(fn):
    """Calls fn(client), advancing to the next configured key and retrying on a quota
    error. fn must perform its entire unit of work (e.g. upload + generate) with the
    single client it's handed -- a file uploaded via one key's client isn't visible to
    another key's client, so a rotated retry can't reuse partial work from a prior one.
    Any non-quota exception from fn propagates immediately, unrotated.
    """
    global _index
    keys_count = len(config.GEMINI_API_KEYS)
    last_error: Exception | None = None
    for _ in range(keys_count):
        with _lock:
            index = _index
        client = _client_for(index)
        try:
            return fn(client)
        except Exception as exc:
            if not is_quota_error(exc):
                raise
            last_error = exc
            logger.warning("Gemini key #%d kunlik kvotasi tugadi, keyingi kalitga o'tilmoqda", index)
            with _lock:
                if _index == index:
                    _index = (_index + 1) % keys_count
    raise last_error
