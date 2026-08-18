import json
import time

from google import genai
from google.genai import types

import gemini_keys

# A transient Gemini blip (503 "high demand", or the rare bare 403 seen in practice) shouldn't
# immediately fall back to uncorrected Turkish-leaked spelling -- a couple of quick retries
# covers the common case where the very next attempt, seconds later, succeeds.
MAX_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.5

# Whisper is accurate on *timing* for low-resource languages like Uzbek but leaks Turkish-style
# orthography into the words themselves (e.g. "başqa"/"uzaq" instead of "boshqa"/"uzoq") since
# Uzbek had far less training data than its close relative Turkish. Gemini fixes the spelling
# word-for-word, in a single batched call per transcript, while Whisper's timestamps are left
# untouched — this keeps caption timing exact while getting Gemini-quality spelling.
# Flash-Lite (not the full Flash tier gemini_transcriber.py uses): this call only rewrites
# already-known words into standard spelling from text, no audio understanding needed, so the
# cheaper/lighter model is accurate enough here without risking transcription quality. Pinned
# (not "-latest") for predictable cost/quota — see gemini_transcriber.py for why.
# gemini-2.5-flash-lite 404'd for this key (see gemini_transcriber.py's note) — verified
# gemini-3.5-flash-lite actually works before switching.
MODEL_NAME = "gemini-3.5-flash-lite"

PROMPT = """Quyida nutqni tanish dasturi (Whisper) tomonidan avtomatik yozilgan o'zbekcha
so'zlar ketma-ketligi berilgan. Past resursli til bo'lgani uchun Whisper ba'zan so'zlarni
turkcha imlo bilan aralashtirib yuboradi yoki kirillcha qoldiqlar qoladi.

Vazifang: FAQAT imlo xatolarini standart o'zbek lotin alifbosiga to'g'irlash.

HAR BIR so'zni AYRIM-AYRIM, diqqat bilan tekshir — bironta ham xato so'z o'tkazib
yubormasliging SHART. Ko'p uchraydigan xato turlari va aniq misollar (chapda xato,
o'ngda to'g'ri):
- Turkcha unli/undosh almashinuvi: "başqa"→"boshqa", "uzaq"→"uzoq", "yaxşi"→"yaxshi",
  "tuğri"→"to'g'ri", "değil"→"emas", "büyük"→"katta"/"buyuk", "iyi"→"yaxshi",
  "çok"→"juda"/"ko'p".
- O'zbekchada apostrof bilan yoziladigan tovushlar tushib qolishi: "gapirdi" emas ba'zan
  kerak bo'lsa "gʻapirdi" kabi noto'g'ri shakl — o'/g' apostroflarini har doim to'g'ri
  qo'y (masalan "bolgan" emas "bo'lgan", "kop" emas "ko'p", "togri" emas "to'g'ri").
- Kirillcha harflar qolib ketishi mumkin (masalan "ва", "что") — bunday so'zlarni
  lotin alifbosiga to'liq o'gir.

Qat'iy qoidalar:
- Aynan {n} ta so'z berilgan — javobda ham AYNAN {n} ta so'z bo'lishi SHART, bir xil
  tartibda. Hech biri qo'shilmasin, o'chirilmasin, birlashtirilmasin yoki bo'linmasin.
- So'zlarni QAYTA IBORALASHTIRMA, tarjima qilma — faqat imlosini tuzat.
- Har bir so'zdagi tinish belgisini (bor bo'lsa) saqlab qol.
- Agar so'z allaqachon to'g'ri yozilgan bo'lsa, uni o'zgartirmasdan aynan shu holicha qaytar.

So'zlar (JSON massiv): {words_json}

Natijani FAQAT JSON massiv (satrlar) sifatida qaytar, boshqa hech qanday matn yoki izoh
qo'shma:
["so'z1", "so'z2", ...]
"""

def correct_words(words: list[str]) -> list[str]:
    """Fix Uzbek Latin spelling word-for-word via Gemini, preserving word count and order.

    Retries a couple of times (MAX_ATTEMPTS) on transient failures before giving up, since
    Gemini's occasional 503/403 blips are usually gone within a few seconds. A daily-quota
    (429) error instead rotates to the next configured key via gemini_keys, since retrying an
    exhausted key on the same day would never succeed. Falls back to returning the original
    words unchanged only once every attempt/key is exhausted (API error, bad JSON, wrong word
    count in the response), so a broken correction pass never desyncs Whisper's word-level
    timestamps from the text.
    """
    if not words:
        return words
    prompt = PROMPT.format(n=len(words), words_json=json.dumps(words, ensure_ascii=False))
    try:
        corrected = gemini_keys.call_with_rotation(lambda client: _correct_with_client(client, words, prompt))
    except Exception:
        return words
    return corrected if corrected is not None else words


def _correct_with_client(client: genai.Client, words: list[str], prompt: str) -> list[str] | None:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
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
        except Exception as exc:
            if gemini_keys.is_quota_error(exc):
                raise
        if attempt < MAX_ATTEMPTS:
            time.sleep(RETRY_DELAY_SECONDS)
    return None