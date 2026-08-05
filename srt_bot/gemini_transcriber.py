import json
from pathlib import Path

from google import genai
from google.genai import types

import config
from transcriber import Segment, TranscriptionResult, Word

MODEL_NAME = "gemini-flash-latest"

PROMPT = """Ushbu audioni so'zma-so'z transkripsiya qil.
Nutq o'zbek tilida (lotin alifbosida yoz), ba'zi joylarda ingliz yoki rus so'zlari
aralashgan bo'lishi mumkin — ularni eshitilgan holicha yoz.

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


def transcribe(audio_path: Path) -> TranscriptionResult:
    client = get_client()
    uploaded = client.files.upload(file=str(audio_path))
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[uploaded, PROMPT],
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
