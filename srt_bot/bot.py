
import asyncio
import logging
import shutil
import uuid
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, FSInputFile, Message

import config
import licensing
import licensing_handlers
import licensing_server
import media
import srt_builder
import transcriber
from keyboards import FORMAT_LABELS, format_choice_keyboard

if config.ASR_PROVIDER == "gemini":
    import gemini_transcriber as asr
else:
    asr = transcriber

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

TOO_LARGE_TEXT = (
    "Kechirasiz, bu fayl juda katta (500MB dan oshiq). "
    "Hozircha faqat 500MB gacha bo'lgan fayllarni qabul qila olaman."
)

FREE_QUOTA_TEXT = (
    "Kuniga faqat 1 marta bepul subtitr olishingiz mumkin. Ertaga qayta urinib ko'ring.\n\n"
    "Premiere/After Effects paneli orqali cheklovsiz ishlatish uchun to'liq versiyani oling."
)


@router.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer(START_TEXT)


@router.message(F.video | F.audio | F.voice | F.video_note)
async def on_media(message: Message) -> None:
    if not licensing.check_and_use_free_quota(message.from_user.id):
        await message.answer(FREE_QUOTA_TEXT)
        return

    tg_file = message.video or message.audio or message.voice or message.video_note
    file_size = getattr(tg_file, "file_size", None)
    if file_size and file_size > config.MAX_FILE_SIZE_BYTES:
        await message.answer(TOO_LARGE_TEXT)
        return

    session_dir = config.TEMP_DIR / uuid.uuid4().hex
    session_dir.mkdir(parents=True, exist_ok=True)

    file_info = await message.bot.get_file(tg_file.file_id)
    suffix = Path(file_info.file_path or "").suffix or ".bin"
    dest = session_dir / f"orig{suffix}"

    await message.bot.download_file(file_info.file_path, destination=dest)

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
    except Exception:
        logger.exception("Failed to process file for user %s", user_id)
        await status.edit_text(
            "Xatolik yuz berdi, faylni qayta ishlab bo'lmadi. Iltimos qaytadan urinib ko'ring."
        )
    finally:
        shutil.rmtree(session_dir, ignore_errors=True)


async def main() -> None:
    if config.ASR_PROVIDER != "gemini":
        transcriber.get_model()  # load model once at startup
    if not config.ADMIN_TELEGRAM_ID:
        logger.warning(
            "ADMIN_TELEGRAM_ID sozlanmagan (.env) - faollashtirish so'rovlari hech kimga yetib bormaydi."
        )
    bot = Bot(token=config.BOT_TOKEN)
    dp = Dispatcher()
    dp.include_router(licensing_handlers.router)
    dp.include_router(router)
    await licensing_server.start()
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
