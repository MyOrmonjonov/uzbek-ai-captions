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

ASR_PROVIDER = os.getenv("ASR_PROVIDER", "whisper").strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
if ASR_PROVIDER == "gemini" and not GEMINI_API_KEY:
    raise RuntimeError(
        "ASR_PROVIDER=gemini tanlangan, lekin GEMINI_API_KEY topilmadi. "
        "srt_bot/.env fayliga GEMINI_API_KEY qo'shing."
    )

TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024

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
