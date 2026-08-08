import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN topilmadi. srt_bot/.env faylini yarating "
        "(.env.example dan nusxa oling) va @BotFather bergan tokenni qo'ying."
    )

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small").strip()
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip()
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip()
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "").strip() or None

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY topilmadi. srt_bot/.env fayliga GEMINI_API_KEY qo'shing "
        "(transkripsiya, tarjima va B-roll uchun barchasi shu kalitni ishlatadi)."
    )

# Premiere/AE plugin's translation transcription and B-roll (Pexels/Giphy) now proxy
# through this server instead of calling those APIs directly from each user's local
# machine — keeps the keys off of every distributed plugin install.
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "").strip()
GIPHY_API_KEY = os.getenv("GIPHY_API_KEY", "").strip()

TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)

# TELEGRAM_API_ID/TELEGRAM_API_HASH (from my.telegram.org) point the bot at a self-hosted
# local Bot API server (see bot.py's Bot() construction) instead of Telegram's cloud
# api.telegram.org — the cloud API hard-caps file downloads at 20MB regardless of what limit
# we advertise, and a local server is the only way past that. When these aren't set, the bot
# falls back to the cloud API and MAX_FILE_SIZE_BYTES must stay at the real 20MB ceiling (a
# file between this limit and a larger number would pass our own check and then silently fail
# to download).
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID", "").strip()
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "").strip()
LOCAL_BOT_API_URL = os.getenv("LOCAL_BOT_API_URL", "http://127.0.0.1:8081").strip()
USE_LOCAL_BOT_API = bool(TELEGRAM_API_ID and TELEGRAM_API_HASH)

MAX_FILE_SIZE_BYTES = (500 if USE_LOCAL_BOT_API else 20) * 1024 * 1024

# --- Litsenziya / to'lov ---
# Adminning Telegram raqamli user ID'si (@userinfobot orqali oling). Faollashtirish
# so'rovlari va to'lov cheklari shu ID'ga yuboriladi.
ADMIN_TELEGRAM_ID = int(os.getenv("ADMIN_TELEGRAM_ID", "0") or "0")

PAYMENT_CARD_NUMBER = os.getenv("PAYMENT_CARD_NUMBER", "").strip()
PAYMENT_CARD_HOLDER = os.getenv("PAYMENT_CARD_HOLDER", "").strip()
SUBSCRIPTION_PRICE_TEXT = os.getenv("SUBSCRIPTION_PRICE_TEXT", "").strip()

SUBSCRIPTION_DAYS = int(os.getenv("SUBSCRIPTION_DAYS", "30"))

# Boshqa kompyuterlardagi backend'lar shu portga /license/verify so'rovi yuboradi.
# Bot serverga (masalan AWS) chiqarilgach, panel/backend konfiguratsiyasida shu
# manzil (http://<server>:<LICENSE_SERVER_PORT>) ko'rsatilishi kerak.
LICENSE_SERVER_HOST = os.getenv("LICENSE_SERVER_HOST", "0.0.0.0").strip()
LICENSE_SERVER_PORT = int(os.getenv("LICENSE_SERVER_PORT", "8899"))
