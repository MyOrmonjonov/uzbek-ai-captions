"""Server-side port of BrollSceneService.java/PexelsService.java/GiphyService.java: groups a
transcript's segments into scenes (Gemini), then finds stock video/photo/gif candidates for each
scene's keyword (Pexels + Giphy). Lives here (not in the Java plugin) so the Gemini/Pexels/Giphy
API keys never have to ship inside a distributed plugin install — only the actual downloaded
media URLs (public CDN links, no key needed to fetch) go back to the client.
"""

import json
from urllib.parse import quote

import aiohttp
from google import genai
from google.genai import types

import config

MAX_SCENES = 8
CANDIDATES_PER_TYPE = 50

# Was Flash-Lite (cheaper, "no audio understanding needed" reasoning) but a customer reported
# B-roll results were often completely unrelated to the actual scene ("umuman boshqa narsalarni
# olib kelyapti"). Understanding what a scene is actually ABOUT from Uzbek text well enough to
# pick a precise, visually-searchable English keyword is not the trivial task the Lite tier was
# chosen for — it's the same kind of comprehension gemini_transcriber.py already pays for the
# full Flash tier over Lite to get right. Matching that choice here.
MODEL_NAME = "gemini-3.5-flash"

PROMPT_TEMPLATE = """Quyida video subtitrining segmentlari (vaqt va matn) berilgan, o'zbek tilida.

Vazifang ikki bosqichli:
1. Butun videoni ketma-ket, bir-biriga ustma-ust tushmaydigan eng ko'pi bilan {max_scenes} ta
   "sahna"ga bo'l.
2. Har bir sahna uchun — matnni yuzaki emas, DIQQAT BILAN o'qib, sahna ASL MA'NODA nima haqida
   ekanini (mavzusini) chuqur tushunib ol, keyin aynan o'sha mavzuga OG'ZAKI EMAS, VIZUAL jihatdan
   mos keladigan stock-video kadrini tasvirlaydigan 2-4 so'zli INGLIZCHA qidiruv so'z birikmasi
   (keyword) top. O'zingga savol ber: "video ekranida aynan nima ko'rinishi kerak, bu matn shu
   haqida gapirganda?" — keyword shu savolga javob bo'lsin, matndagi so'zlarning tarjimasi emas.

Qoidalar:
- Sahnalar birinchi segment boshidan oxirgi segment oxirigacha bo'lgan
  butun davrni qamrab olsin, oraliqlarda bo'shliq yoki ustma-ustlik bo'lmasin.
- keyword aniq, konkret va vizual jihatdan qidirsa bo'ladigan narsa bo'lsin
  (masalan "city traffic jam", "ocean waves sunset", "person typing laptop office"),
  mavhum tushuncha, hissiyot nomi yoki so'zma-so'z tarjima emas — sahna nimani KO'RSATISHI
  kerakligini tasvirla, nimani AYTAYOTGANINI emas.
- Agar sahna aniq bir jismoniy narsa/joy/harakat haqida bo'lmasa (masalan mavhum fikr-mulohaza),
  shu fikrga eng yaqin, haqiqiy hayotda suratga olinishi mumkin bo'lgan vizual sahnani tanla
  (masalan "muvaffaqiyat" haqida gap ketsa — "person celebrating success").
- Natijani FAQAT JSON massiv sifatida qaytar, boshqa matn yoki izohsiz:
  [{{"start": 0.0, "end": 12.5, "keyword": "..."}}, ...]

Segmentlar:
{segment_list}
"""

RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "start": {"type": "NUMBER"},
            "end": {"type": "NUMBER"},
            "keyword": {"type": "STRING"},
        },
        "required": ["start", "end", "keyword"],
    },
}

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def group_into_scenes(segments: list[dict]) -> list[dict]:
    """segments: [{start, end, text}, ...] -> [{start, end, keyword}, ...]"""
    if not segments:
        return []

    segment_list = "\n".join(f"{s['start']:.1f}-{s['end']:.1f}: {s['text']}" for s in segments)
    prompt = PROMPT_TEMPLATE.format(max_scenes=MAX_SCENES, segment_list=segment_list)

    client = _get_client()
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
            temperature=0.0,
        ),
    )
    data = json.loads(response.text)

    scenes = []
    for item in data:
        keyword = str(item.get("keyword", "")).strip()
        if not keyword:
            continue
        start = float(item["start"])
        end = max(float(item["end"]), start)
        scenes.append({"start": start, "end": end, "keyword": keyword})
    return scenes


async def _search_pexels_videos(session: aiohttp.ClientSession, keyword: str, count: int) -> list[dict]:
    url = f"https://api.pexels.com/videos/search?query={quote(keyword)}&per_page={count}&orientation=landscape"
    async with session.get(url, headers={"Authorization": config.PEXELS_API_KEY}) as resp:
        if resp.status != 200:
            return []
        data = await resp.json()
    results = []
    for video in data.get("videos", []):
        chosen = _pick_pexels_file(video.get("video_files", []))
        if not chosen:
            continue
        results.append({"type": "video", "thumbnailUrl": video.get("image", ""), "mediaUrl": chosen.get("link", "")})
    return results


async def _search_pexels_photos(session: aiohttp.ClientSession, keyword: str, count: int) -> list[dict]:
    url = f"https://api.pexels.com/v1/search?query={quote(keyword)}&per_page={count}&orientation=landscape"
    async with session.get(url, headers={"Authorization": config.PEXELS_API_KEY}) as resp:
        if resp.status != 200:
            return []
        data = await resp.json()
    results = []
    for photo in data.get("photos", []):
        thumb = photo.get("src", {}).get("medium", "")
        full = photo.get("src", {}).get("large", "")
        if not full:
            continue
        results.append({"type": "photo", "thumbnailUrl": thumb, "mediaUrl": full})
    return results


async def _search_giphy_gifs(session: aiohttp.ClientSession, keyword: str, count: int) -> list[dict]:
    if not config.GIPHY_API_KEY:
        return []
    url = (f"https://api.giphy.com/v1/gifs/search?api_key={config.GIPHY_API_KEY}"
           f"&q={quote(keyword)}&limit={count}&rating=g")
    async with session.get(url) as resp:
        if resp.status != 200:
            return []
        data = await resp.json()
    results = []
    for gif in data.get("data", []):
        images = gif.get("images", {})
        thumb = images.get("fixed_height_small", {}).get("url", "")
        full = images.get("original", {}).get("url", "")
        if not full:
            continue
        results.append({"type": "gif", "thumbnailUrl": thumb or full, "mediaUrl": full})
    return results


def _pick_pexels_file(files: list[dict]) -> dict | None:
    """Prefers a compact "sd" file (~960px wide); falls back to the narrowest file available."""
    best_sd = None
    narrowest = None
    for f in files:
        width = f.get("width", float("inf"))
        if narrowest is None or width < narrowest.get("width", float("inf")):
            narrowest = f
        if f.get("quality") == "sd" and width <= 960 and (best_sd is None or width > best_sd.get("width", 0)):
            best_sd = f
    return best_sd or narrowest


async def pick_candidates(session: aiohttp.ClientSession, keyword: str) -> list[dict]:
    """Each type is fetched and capped independently (not a shared total) — mirrors
    BrollController.pickCandidates()'s reasoning: whenever a type has matches at all, the
    panel's per-type grid gets a full CANDIDATES_PER_TYPE to lay out as two columns."""
    videos = await _search_pexels_videos(session, keyword, CANDIDATES_PER_TYPE)
    photos = await _search_pexels_photos(session, keyword, CANDIDATES_PER_TYPE)
    gifs = await _search_giphy_gifs(session, keyword, CANDIDATES_PER_TYPE)
    return videos + photos + gifs


async def suggestions_for_segments(segments: list[dict]) -> list[dict]:
    """segments: [{start, end, text}, ...] -> [{start, end, keyword, candidates}, ...]"""
    scenes = group_into_scenes(segments)
    results = []
    async with aiohttp.ClientSession() as session:
        for scene in scenes:
            candidates = await pick_candidates(session, scene["keyword"])
            if candidates:
                results.append({**scene, "candidates": candidates})
    return results
