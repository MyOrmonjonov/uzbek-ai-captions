import json

from google import genai
from google.genai import types

import config

# Whisper is accurate on *timing* for low-resource languages like Uzbek but leaks Turkish-style
# orthography into the words themselves (e.g. "başqa"/"uzaq" instead of "boshqa"/"uzoq") since
# Uzbek had far less training data than its close relative Turkish. Gemini fixes the spelling
# word-for-word, in a single batched call per transcript, while Whisper's timestamps are left
# untouched — this keeps caption timing exact while getting Gemini-quality spelling.
MODEL_NAME = "gemini-flash-latest"

PROMPT = """Quyida nutqni tanish dasturi (Whisper) tomonidan avtomatik yozilgan o'zbekcha
so'zlar ketma-ketligi berilgan. Past resursli til bo'lgani uchun Whisper ba'zan so'zlarni
turkcha imlo bilan aralashtirib yuboradi (masalan "başqa" o'rniga "boshqa", "uzaq" o'rniga
"uzoq" bo'lishi kerak) yoki kirillcha qoldiqlar qoladi.

Vazifang: FAQAT imlo xatolarini standart o'zbek lotin alifbosiga to'g'irlash.
Qat'iy qoidalar:
- Aynan {n} ta so'z berilgan — javobda ham AYNAN {n} ta so'z bo'lishi SHART, bir xil
  tartibda. Hech biri qo'shilmasin, o'chirilmasin, birlashtirilmasin yoki bo'linmasin.
- So'zlarni QAYTA IBORALASHTIRMA, tarjima qilma — faqat imlosini tuzat.
- Har bir so'zdagi tinish belgisini (bor bo'lsa) saqlab qol.

So'zlar (JSON massiv): {words_json}

Natijani FAQAT JSON massiv (satrlar) sifatida qaytar, boshqa hech qanday matn yoki izoh
qo'shma:
["so'z1", "so'z2", ...]
"""

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def correct_words(words: list[str]) -> list[str]:
    """Fix Uzbek Latin spelling word-for-word via Gemini, preserving word count and order.

    Falls back to returning the original words unchanged on any failure (API error, bad
    JSON, wrong word count in the response) so a broken correction pass never desyncs
    Whisper's word-level timestamps from the text.
    """
    if not words:
        return words
    try:
        client = get_client()
        prompt = PROMPT.format(n=len(words), words_json=json.dumps(words, ensure_ascii=False))
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={"type": "ARRAY", "items": {"type": "STRING"}},
                temperature=0.0,
            ),
        )
        corrected = json.loads(response.text)
        if isinstance(corrected, list) and len(corrected) == len(words):
            return [str(w) for w in corrected]
    except Exception:
        pass
    return words