"""Telegram-side of the licensing flow: a user pastes the activation code
shown in the Premiere/AE panel, the bot shows payment instructions and pings
the admin, and the admin approves/rejects with a button. Approval issues a
token bound to that one device code (see licensing.py) and sends it back to
the user to paste into the panel.
"""

import logging
import re

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

import config
import licensing

logger = logging.getLogger(__name__)
router = Router()

DEVICE_CODE_RE = re.compile(r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")


def _is_admin(user_id: int) -> bool:
    return config.ADMIN_TELEGRAM_ID != 0 and user_id == config.ADMIN_TELEGRAM_ID


def _payment_instructions(device_code: str) -> str:
    price = config.SUBSCRIPTION_PRICE_TEXT or "narx admin bilan kelishiladi"
    return (
        f"Faollashtirish kodi qabul qilindi: <code>{device_code}</code>\n\n"
        f"To'lov: {price}\n"
        f"Karta raqami: <code>{config.PAYMENT_CARD_NUMBER}</code>\n"
        f"Karta egasi: {config.PAYMENT_CARD_HOLDER}\n\n"
        "To'lovni amalga oshirgach, chek/skrinshotni shu yerga (botga) yuboring. "
        "Admin tasdiqlagach, sizga faollashtirish tokeni yuboriladi — uni "
        "Premiere/After Effects panelidagi “Token” maydoniga kiriting."
    )


def _admin_request_keyboard(device_code: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Tasdiqlash", callback_data=f"approve:{device_code}"),
                InlineKeyboardButton(text="❌ Rad etish", callback_data=f"reject:{device_code}"),
            ]
        ]
    )


@router.message(F.text.regexp(DEVICE_CODE_RE.pattern))
async def on_device_code(message: Message) -> None:
    device_code = message.text.strip().upper()
    user_id = message.from_user.id

    if _is_admin(user_id):
        token = licensing.approve(device_code, user_id, config.SUBSCRIPTION_DAYS)
        await message.answer(
            "Admin sifatida to'lovsiz avtomatik faollashtirildingiz ✅\n\n"
            f"Token ({config.SUBSCRIPTION_DAYS} kunga amal qiladi):\n"
            f"<code>{token}</code>\n\n"
            "Buni Premiere/After Effects panelidagi “Token” maydoniga kiriting."
        )
        return

    licensing.create_pending_request(device_code, user_id)
    await message.answer(_payment_instructions(device_code))

    if config.ADMIN_TELEGRAM_ID:
        username = f"@{message.from_user.username}" if message.from_user.username else str(user_id)
        await message.bot.send_message(
            config.ADMIN_TELEGRAM_ID,
            f"Yangi faollashtirish so'rovi\nQurilma kodi: <code>{device_code}</code>\n"
            f"Foydalanuvchi: {username} (id: {user_id})\n\n"
            "To'lov chekini kutib, so'ng tasdiqlang:",
            reply_markup=_admin_request_keyboard(device_code),
        )
    else:
        logger.warning("ADMIN_TELEGRAM_ID sozlanmagan, admin xabar olmadi (%s)", device_code)


@router.message(F.photo, F.chat.type == "private")
async def on_payment_receipt(message: Message) -> None:
    """Forwards a payment screenshot the user sends to the admin. We don't
    try to auto-verify payments -- the admin reviews and clicks approve."""
    if not config.ADMIN_TELEGRAM_ID or config.ADMIN_TELEGRAM_ID == message.from_user.id:
        return
    username = f"@{message.from_user.username}" if message.from_user.username else str(message.from_user.id)
    await message.forward(config.ADMIN_TELEGRAM_ID)
    await message.bot.send_message(
        config.ADMIN_TELEGRAM_ID,
        f"↑ To'lov cheki: {username} (id: {message.from_user.id})",
    )


@router.callback_query(F.data.startswith("approve:"))
async def on_approve(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("Faqat admin uchun.", show_alert=True)
        return

    device_code = callback.data.split(":", 1)[1]
    requester_id = licensing.get_pending_request(device_code)
    if requester_id is None:
        await callback.answer("Bu so'rov allaqachon ko'rib chiqilgan.", show_alert=True)
        return

    token = licensing.approve(device_code, requester_id, config.SUBSCRIPTION_DAYS)
    await callback.bot.send_message(
        requester_id,
        "To'lovingiz tasdiqlandi ✅\n\n"
        f"Faollashtirish tokeningiz ({config.SUBSCRIPTION_DAYS} kunga amal qiladi):\n"
        f"<code>{token}</code>\n\n"
        "Buni Premiere/After Effects panelidagi “Token” maydoniga kiriting.",
    )
    await callback.message.edit_text(
        callback.message.text + f"\n\n✅ Tasdiqlandi ({config.SUBSCRIPTION_DAYS} kun)."
    )
    await callback.answer("Tasdiqlandi.")


@router.callback_query(F.data.startswith("reject:"))
async def on_reject(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("Faqat admin uchun.", show_alert=True)
        return

    device_code = callback.data.split(":", 1)[1]
    requester_id = licensing.get_pending_request(device_code)
    licensing.reject(device_code)
    if requester_id is not None:
        await callback.bot.send_message(
            requester_id,
            "So'rovingiz rad etildi. Savol bo'lsa, admin bilan bog'laning.",
        )
    await callback.message.edit_text(callback.message.text + "\n\n❌ Rad etildi.")
    await callback.answer("Rad etildi.")


@router.message(Command("revoke"))
async def on_revoke(message: Message) -> None:
    if not _is_admin(message.from_user.id):
        return
    parts = message.text.split(maxsplit=1)
    if len(parts) != 2:
        await message.answer("Foydalanish: /revoke QURILMA-KODI")
        return
    device_code = parts[1].strip().upper()
    if licensing.revoke(device_code):
        await message.answer(f"Bekor qilindi: {device_code}")
    else:
        await message.answer(f"Topilmadi: {device_code}")