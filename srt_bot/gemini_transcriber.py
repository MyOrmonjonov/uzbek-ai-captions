import json
import logging
from pathlib import Path

from google import genai
from google.genai import types

import config
from transcriber import Segment, TranscriptionResult, Word

# Pinned (not "-latest") so cost and quota behavior stay predictable — "-latest" silently
# started resolving to a pricier newer model mid-project and burned through the free-tier daily
# quota. Kept on a full Flash tier (not Flash-Lite) since this call determines the actual
# transcript content and accuracy matters here — unlike spelling_correction.py's simpler
# text-only fixups, which use the cheaper Flash-Lite tier.
#
# NOTE: gemini-2.5-flash was pinned here first but turned out to 404 ("no longer available to
# new users") for this project's API key/key-creation date, even though it still shows up in
# the models-list endpoint — confirmed by testing generateContent directly against this key
# before picking a replacement, rather than guessing again from a pricing page. gemini-3.5-flash
# was verified (3/3 real calls) to actually work for this key.
MODEL_NAME = "gemini-3.5-flash"

# ISO code -> Uzbek phrase, mirrors Java's GeminiTranscriptionService.TRANSLATION_LANGUAGES
# (the Premiere/AE plugin's translation path now proxies here instead of calling Gemini
# directly from each user's machine, so this list has to stay in sync with that one).
TRANSLATION_LANGUAGES = {
    "en": "ingliz",
    "ru": "rus",
    "tr": "turk",
    "kk": "qozoq",
    "ar": "arab",
    "zh": "xitoy",
    "fr": "fransuz",
    "de": "nemis",
}

BASE_PROMPT = """Ushbu audioni BOSHIDAN OXIRIGACHA, TO'LIQ so'zma-so'z transkripsiya qil.
Audioning oxirigacha yetganingizga aniq ishonch hosil qiling — birorta gap yoki segmentni
o'tkazib yubormang, yarim yo'lda to'xtamang.
Nutq o'zbek tilida (lotin alifbosida yoz), ba'zi joylarda ingliz yoki rus so'zlari
aralashgan bo'lishi mumkin — ularni eshitilgan holicha yoz.
"""

TRANSLATION_INSTRUCTION = """
Har bir segmentni transkripsiya qilgandan so'ng, uni {language} tiliga tarjima qil.
"text" maydoniga FAQAT tarjima qilingan matnni yoz, original o'zbekcha matnni yozma.
"""

OUTPUT_INSTRUCTION = """
Natijani FAQAT JSON massiv sifatida qaytar, boshqa hech qanday matn, izoh yoki
markdown belgisi qo'shma:
[{"start": 0.0, "end": 3.2, "text": "..."}, ...]

Qoidalar:
- Har bir segment tabiiy pauza bo'yicha bo'linsin, uzunligi taxminan 1-6 soniya.
- "start" va "end" — audio boshidan soniyalarda hisoblangan aniq vaqt (raqam).
- Faqat ANIQ eshitilgan nutqni yoz. Sukunat, fon shovqini yoki tushunarsiz
  joylarda hech narsa TO'QIMA — bunday joylarni massivga qo'shmasdan tashlab ket.
- Nutq umuman bo'lmasa, bo'sh massiv [] qaytar.
"""


def _build_prompt(translate_to: str | None) -> str:
    parts = [BASE_PROMPT]
    language = TRANSLATION_LANGUAGES.get(translate_to or "")
    if language:
        parts.append(TRANSLATION_INSTRUCTION.format(language=language + " tili"))
    parts.append(OUTPUT_INSTRUCTION)
    return "\n".join(parts)

RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "start": {"type": "NUMBER"},
            "end": {"type": "NUMBER"},
            "text": {"type": "STRING"},
        },
        "required": ["start", "end", "text"],
    },
}

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _interpolate_words(text: str, start: float, end: float) -> list[Word]:
    tokens = text.split()
    if not tokens:
        return []
    duration = max(end - start, 0.01)
    total_len = sum(len(t) for t in tokens)
    words: list[Word] = []
    cursor = start
    for tok in tokens:
        span = duration * (len(tok) / total_len)
        w_start = cursor
        w_end = min(end, cursor + span)
        words.append(Word(text=tok, start=w_start, end=max(w_end, w_start)))
        cursor = w_end
    return words


def transcribe(audio_path: Path, translate_to: str | None = None) -> TranscriptionResult:
    client = get_client()
    uploaded = client.files.upload(file=str(audio_path))
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[uploaded, _build_prompt(translate_to)],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0.0,
            ),
        )
    finally:
        try:
            client.files.delete(name=uploaded.name)
        except Exception:
            pass

    # A cue array that stops mid-audio (reported: "SRT to'liq emas, yarimgacha") could be
    # Gemini genuinely running out of output budget (finish_reason=MAX_TOKENS — the JSON would
    # also usually fail to parse, since it'd be cut off mid-object) or the model just deciding
    # it's done despite audio remaining, which finish_reason alone won't reveal but at least
    # this rules MAX_TOKENS in or out instead of guessing blind next time this is reported.
    try:
        finish_reason = response.candidates[0].finish_reason if response.candidates else None
        # finish_reason is an enum (e.g. FinishReason.STOP) — str() on it includes the class
        # name ("FinishReason.STOP"), which never equals the bare "STOP" this used to compare
        # against, so the warning fired on every single call regardless of the real reason.
        # .name gives the bare member name ("STOP") that's actually comparable.
        reason_name = getattr(finish_reason, "name", str(finish_reason)) if finish_reason else None
        if reason_name and reason_name != "STOP":
            logger.warning("Gemini transcription finished with reason=%s (possible truncation)", reason_name)
    except Exception:
        pass

    data = json.loads(response.text)

    words: list[Word] = []
    segments: list[Segment] = []
    for item in data:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = float(item["start"])
        end = float(item["end"])
        if end < start:
            end = start
        segments.append(Segment(text=text, start=start, end=end))
        words.extend(_interpolate_words(text, start, end))

    return TranscriptionResult(words=words, segments=segments)
