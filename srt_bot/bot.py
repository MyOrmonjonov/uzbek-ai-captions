
import asyncio
import logging
import shutil
import uuid
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, FSInputFile, Message

import config
import hybrid_transcriber
import licensing
import licensing_handlers
import licensing_server
import media
import registration
import srt_builder
import transcriber
from keyboards import FORMAT_LABELS, back_keyboard, format_choice_keyboard, start_keyboard

# hybrid_transcriber runs Whisper (frame-accurate word timing) and Gemini (more reliable
# recognition content for a low-resource language like Uzbek) over the same audio and aligns
# them — plain Gemini alone only *estimates* word timing, plain Whisper alone can mishear whole
# words that its own spelling-correction pass can't catch since it never hears the audio. This
# is the same ASR path transcribe_server.py already uses for the Premiere/AE plugin; the bot
# used to call Gemini alone here, which is why its output could read differently from the
# plugin's for the same audio.
asr = hybrid_transcriber

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = Router()

# user_id -> path to the downloaded source file awaiting a format choice
pending_files: dict[int, Path] = {}

START_TEXT = (
    "Salom! Menga video yoki audio yuboring, men undan subtitr (.srt) fayl tayyorlab beraman.\n\n"
    "So'ng formatni tanlaysiz:\n"
    "✨ Premium — AI o'zi guruhlaydi\n"
    "1 qator — Reels/Shorts uchun\n"
    "2 qator — standart\n"
    "3 qator — ko'p matn uchun\n\n"
    "Tayyor SRT faylni CapCut, Premiere, DaVinci — istalgan dasturga tashlashingiz mumkin."
)

_MAX_FILE_MB = config.MAX_FILE_SIZE_BYTES // (1024 * 1024)
TOO_LARGE_TEXT = (
    f"Kechirasiz, bu fayl juda katta ({_MAX_FILE_MB}MB dan oshiq). "
    f"Hozircha faqat {_MAX_FILE_MB}MB gacha bo'lgan fayllarni qabul qila olaman."
)

DOWNLOAD_FAILED_TEXT = (
    "Faylni yuklab olib bo'lmadi (tarmoq xatosi yoki fayl juda katta). "
    "Iltimos qaytadan urinib ko'ring."
)

FREE_QUOTA_TEXT = (
    "Kuniga faqat 1 marta bepul subtitr olishingiz mumkin. Ertaga qayta urinib ko'ring.\n\n"
    "Premiere/After Effects paneli orqali cheklovsiz ishlatish uchun to'liq versiyani oling."
)

HOW_IT_WORKS_TEXT = (
    "🎬 Bot qanday ishlaydi:\n\n"
    "1. Menga video yoki audio fayl yuboring.\n"
    "2. Subtitr formatini tanlang (✨ Premium, 1/2/3 qator).\n"
    "3. Bir necha soniyada tayyor .srt fayl olasiz.\n\n"
    "Tayyor faylni CapCut, Premiere, DaVinci — istalgan dasturga tashlashingiz mumkin.\n\n"
    "Kuniga 1 marta bepul. Premiere/After Effects paneli orqali cheklovsiz foydalanish uchun "
    "to'liq versiyani oling (qurilma kodini shu botga yuboring)."
)


def _tariff_greeting(tariff: dict) -> str:
    price = f"{tariff['price_som']:,} so'm".replace(",", " ")
    return (
        f"Siz {tariff['label']} tarifni tanladingiz ({price}).\n\n"
        "Bu — Premiere/After Effects paneli uchun litsenziya. Agar panel hali "
        "o'rnatilmagan bo'lsa, avval saytimizdan yuklab oling va o'rnating.\n\n"
        "Panelda ko'rsatilgan qurilma kodini (masalan XXXX-XXXX-XXXX) shu yerga "
        "yuboring — to'lov ko'rsatmasi darhol chiqadi."
    )


async def send_welcome(message: Message, payload: str | None = None) -> None:
    """Shared by on_start (already-registered users) and registration.py (users who
    just finished registering) so a "?start=" deep-link payload survives a registration
    detour started by the same /start. payload is either a tariff key from the website's
    pricing buttons ("3m", see config.TARIFFS) or a device code from the plugin's
    "Botga o'tish" button (see cep-extension/client/js/main.js) -- device-code-shaped
    payloads take priority since that's a more specific/actionable signal."""
    if payload and licensing_handlers.DEVICE_CODE_RE.match(payload):
        await licensing_handlers.handle_device_code(message, payload)
        return

    tariff = config.TARIFFS_BY_KEY.get(payload) if payload else None
    if tariff is not None:
        licensing_handlers.set_pending_tariff(message.from_user.id, tariff)
        await message.answer(_tariff_greeting(tariff), reply_markup=start_keyboard())
    else:
        await message.answer(START_TEXT, reply_markup=start_keyboard())


@router.message(CommandStart())
async def on_start(message: Message, command: CommandObject) -> None:
    # RegistrationGate (registration.py) intercepts /start for any not-yet-registered user
    # before it reaches this handler, so by the time we get here the user is registered.
    # command.args carries a website/plugin "?start=<payload>" deep-link, if any.
    await send_welcome(message, command.args)


@router.callback_query(F.data == "howitworks")
async def on_how_it_works(callback: CallbackQuery) -> None:
    await callback.message.edit_text(HOW_IT_WORKS_TEXT, reply_markup=back_keyboard())
    await callback.answer()


@router.callback_query(F.data == "stats")
async def on_stats(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    profile = licensing.get_user(user_id)
    if profile is None:
        await callback.answer("Ma'lumot topilmadi.", show_alert=True)
        return

    days_since = licensing.days_since_registration(user_id)
    free_quota_line = (
        "Bor ✅" if licensing.has_free_quota_today(user_id) else "Bugun ishlatilgan ❌"
    )
    full_name = f"{profile.first_name} {profile.last_name}".strip()
    lines = [
        "📊 Sizning statistikangiz",
        "",
        f"Ism familiya: {full_name}",
        f"Telefon: {profile.phone_number}",
        f"Ro'yxatdan o'tgan: {days_since} kun oldin",
        f"Bugungi bepul limit: {free_quota_line}",
    ]

    active_licenses = licensing.get_active_licenses_for_user(user_id)
    if active_licenses:
        lines.append("")
        lines.append("Faol litsenziya(lar) (Premiere/AE paneli):")
        lines.extend(f"• {device_code}: {days_left:.1f} kun qoldi" for device_code, days_left in active_licenses)

    await callback.message.edit_text("\n".join(lines), reply_markup=back_keyboard())
    await callback.answer()


@router.callback_query(F.data == "start_back")
async def on_start_back(callback: CallbackQuery) -> None:
    await callback.message.edit_text(START_TEXT, reply_markup=start_keyboard())
    await callback.answer()


@router.message(F.video | F.audio | F.voice | F.video_note)
async def on_media(message: Message) -> None:
    if not licensing.has_free_quota_today(message.from_user.id):
        await message.answer(FREE_QUOTA_TEXT)
        return

    tg_file = message.video or message.audio or message.voice or message.video_note
    file_size = getattr(tg_file, "file_size", None)
    if file_size and file_size > config.MAX_FILE_SIZE_BYTES:
        await message.answer(TOO_LARGE_TEXT)
        return

    session_dir = config.TEMP_DIR / uuid.uuid4().hex
    session_dir.mkdir(parents=True, exist_ok=True)

    try:
        # get_file() itself is where Telegram's real ~20MB cap bites for files whose size
        # wasn't known upfront (file_size is optional on the Telegram object) — previously
        # unhandled here, so a file that slipped past the check above (or any transient
        # network error) crashed this update with no message shown to the user at all.
        file_info = await message.bot.get_file(tg_file.file_id)
        suffix = Path(file_info.file_path or "").suffix or ".bin"
        dest = session_dir / f"orig{suffix}"
        await message.bot.download_file(file_info.file_path, destination=dest)
    except Exception:
        logger.exception("Failed to download media from user %s", message.from_user.id)
        shutil.rmtree(session_dir, ignore_errors=True)
        await message.answer(DOWNLOAD_FAILED_TEXT)
        return

    pending_files[message.from_user.id] = dest
    await message.answer(
        "Fayl qabul qilindi. Endi subtitr formatini tanlang:",
        reply_markup=format_choice_keyboard(),
    )


@router.message(F.document)
async def on_document(message: Message) -> None:
    await message.answer(
        "Iltimos, faylni video yoki audio sifatida yuboring (dokument sifatida emas)."
    )


@router.callback_query(F.data.startswith("fmt:"))
async def on_format_chosen(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    src_path = pending_files.pop(user_id, None)
    await callback.answer()

    if src_path is None or not src_path.exists():
        await callback.message.answer(
            "Fayl topilmadi, iltimos video yoki audioni qaytadan yuboring."
        )
        return

    style = callback.data.split(":", 1)[1]
    label = FORMAT_LABELS.get(style, style)
    session_dir = src_path.parent
    status = await callback.message.answer(f"{label} tanlandi. Audio ajratilmoqda...")

    try:
        wav_path = session_dir / "audio.wav"
        await asyncio.to_thread(media.extract_audio, src_path, wav_path)

        await status.edit_text("Matnga aylantirilmoqda, biroz vaqt oladi...")
        result = await asyncio.to_thread(asr.transcribe, wav_path)

        if not result.words and not result.segments:
            await status.edit_text(
                "Nutq aniqlanmadi. Boshqa fayl bilan urinib ko'ring."
            )
            return

        srt_text = srt_builder.build_srt(result, style)
        srt_path = session_dir / "subtitle.srt"
        srt_path.write_text(srt_text, encoding="utf-8")

        await callback.message.answer_document(FSInputFile(srt_path, filename="subtitle.srt"))
        await status.delete()
        licensing.record_free_usage(user_id)
    except Exception:
        logger.exception("Failed to process file for user %s", user_id)
        await status.edit_text(
            "Xatolik yuz berdi, faylni qayta ishlab bo'lmadi. Iltimos qaytadan urinib ko'ring."
        )
    finally:
        shutil.rmtree(session_dir, ignore_errors=True)


async def main() -> None:
    transcriber.get_model()  # load Whisper once at startup, not on the first request
    if not config.ADMIN_TELEGRAM_ID:
        logger.warning(
            "ADMIN_TELEGRAM_ID sozlanmagan (.env) - faollashtirish so'rovlari hech kimga yetib bormaydi."
        )
    # HTML parse mode wasn't set anywhere (globally or per-call), so the <code>...</code>
    # tags used for the device code/card number/activation token in licensing_handlers.py
    # were rendering as literal "<code>ABCD-1234</code>" text instead of a copyable code
    # block — exactly the messages a user most needs to be able to copy cleanly.
    #
    # Routed through a self-hosted local Bot API server (see config.py) when
    # TELEGRAM_API_ID/TELEGRAM_API_HASH are set — Telegram's cloud API hard-caps file
    # downloads at 20MB no matter what, and this is the only way past that. Falls back to
    # the normal cloud API (default session) when those aren't configured.
    session = None
    if config.USE_LOCAL_BOT_API:
        # is_local=True: the local Bot API server's plain HTTP /file/ endpoint 404s for
        # files it has already downloaded (observed directly — the file exists on disk but
        # isn't served over HTTP without --local). In --local mode get_file() instead returns
        # an absolute filesystem path, and aiogram reads it directly from disk instead of
        # making an HTTP request — which only works because the server container's work dir
        # is bind-mounted at the identical path on this host (see docker run -v ...).
        session = AiohttpSession(
            api=TelegramAPIServer.from_base(config.LOCAL_BOT_API_URL, is_local=True)
        )
        logger.info("Using local Bot API server at %s (large-file support enabled)", config.LOCAL_BOT_API_URL)
    bot = Bot(
        token=config.BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    gate = registration.RegistrationGate()
    dp.message.outer_middleware(gate)
    dp.callback_query.outer_middleware(gate)
    dp.include_router(registration.router)
    dp.include_router(licensing_handlers.router)
    dp.include_router(router)
    await licensing_server.start()
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
