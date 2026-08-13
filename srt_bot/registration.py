"""Mandatory registration gate: every Telegram user must give their
full name and phone number before the bot will respond to anything else
(media, device-code activation, etc.). RegistrationGate is an outer
middleware installed on the Dispatcher so it runs ahead of every other
router and can intercept an unregistered user's update before it reaches
on_start/on_media/on_device_code/etc.
"""

import logging
import re

from aiogram import BaseMiddleware, F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    TelegramObject,
)

import keyboards
import licensing

logger = logging.getLogger(__name__)
router = Router()

# Accepts things like "+998 90 123 45 67", "998901234567", "90 123 45 67" -- loose on
# purpose since users paste numbers in all sorts of local formats; we just need enough
# digits to be a real phone number, not a validator for a specific country format.
PHONE_RE = re.compile(r"^\+?[\d\s\-()]{7,20}$")

NAME_PROMPT = (
    "Botdan foydalanishdan oldin ro'yxatdan o'tishingiz kerak.\n\n"
    "Ism va familiyangizni yuboring (masalan: Aziz Karimov):"
)
PHONE_PROMPT = "Endi telefon raqamingizni yuboring (pastdagi tugma orqali eng oson):"
INVALID_NAME_TEXT = "Iltimos, ism va familiyangizni matn sifatida yuboring."
INVALID_PHONE_TEXT = "Bu telefon raqamiga o'xshamayapti. Pastdagi tugmani bosing yoki raqamni to'g'ridan-to'g'ri yozing."
WRONG_CONTACT_TEXT = "Iltimos, faqat o'zingizning telefon raqamingizni yuboring."

WELCOME_AFTER_REGISTRATION = "Rahmat! Ro'yxatdan muvaffaqiyatli o'tdingiz ✅"


class RegistrationStates(StatesGroup):
    full_name = State()
    phone = State()


def contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Raqamni yuborish", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.split(maxsplit=1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""
    return first_name, last_name


async def _finish_registration(message: Message, state: FSMContext, phone_number: str) -> None:
    data = await state.get_data()
    first_name, last_name = data["first_name"], data["last_name"]
    start_payload = data.get("start_payload")
    licensing.register_user(message.from_user.id, first_name, last_name, phone_number)
    await state.clear()
    await message.answer(WELCOME_AFTER_REGISTRATION, reply_markup=ReplyKeyboardRemove())

    from bot import send_welcome  # deferred: bot.py imports this module, so import back here

    await send_welcome(message, start_payload)


# A stray "/start" (or any other command) sent while mid-registration -- e.g. the user
# gets impatient and taps /start again before answering -- used to fall straight into
# the generic F.text handler below and get saved as the person's literal name/phone.
# These two handlers intercept commands first and just re-show the current prompt.
@router.message(RegistrationStates.full_name, CommandStart())
async def on_start_during_name(message: Message, state: FSMContext, command: CommandObject) -> None:
    if command.args:
        await state.update_data(start_payload=command.args)
    await message.answer(NAME_PROMPT)


@router.message(RegistrationStates.phone, CommandStart())
async def on_start_during_phone(message: Message, state: FSMContext, command: CommandObject) -> None:
    if command.args:
        await state.update_data(start_payload=command.args)
    await message.answer(PHONE_PROMPT, reply_markup=contact_keyboard())


@router.message(RegistrationStates.full_name, F.text, ~F.text.startswith("/"))
async def on_full_name(message: Message, state: FSMContext) -> None:
    full_name = message.text.strip()
    if not full_name:
        await message.answer(INVALID_NAME_TEXT)
        return
    first_name, last_name = _split_name(full_name)
    await state.update_data(first_name=first_name, last_name=last_name)
    await state.set_state(RegistrationStates.phone)
    await message.answer(PHONE_PROMPT, reply_markup=contact_keyboard())


@router.message(RegistrationStates.full_name)
async def on_full_name_invalid(message: Message) -> None:
    await message.answer(INVALID_NAME_TEXT)


@router.message(RegistrationStates.phone, F.contact)
async def on_phone_contact(message: Message, state: FSMContext) -> None:
    if message.contact.user_id and message.contact.user_id != message.from_user.id:
        await message.answer(WRONG_CONTACT_TEXT)
        return
    await _finish_registration(message, state, message.contact.phone_number)


@router.message(RegistrationStates.phone, F.text, ~F.text.startswith("/"))
async def on_phone_text(message: Message, state: FSMContext) -> None:
    phone_number = message.text.strip()
    if not PHONE_RE.match(phone_number):
        await message.answer(INVALID_PHONE_TEXT)
        return
    await _finish_registration(message, state, phone_number)


@router.message(RegistrationStates.phone)
async def on_phone_invalid(message: Message) -> None:
    await message.answer(INVALID_PHONE_TEXT)


class RegistrationGate(BaseMiddleware):
    """Outer middleware: for Message and CallbackQuery updates alike, blocks anything
    from an unregistered user that isn't part of an in-progress registration and starts
    the registration flow instead. Registered by dp.message.outer_middleware(...) and
    dp.callback_query.outer_middleware(...) in bot.py so it runs before any router's
    filters are evaluated -- this is what makes the requirement apply everywhere
    (media upload, device-code activation, /start, callbacks), not just one handler.
    """

    async def __call__(self, handler, event: TelegramObject, data: dict):
        user = event.from_user
        state: FSMContext = data["state"]
        current_state = await state.get_state()

        if current_state in (RegistrationStates.full_name.state, RegistrationStates.phone.state):
            return await handler(event, data)

        if user is None or licensing.is_registered(user.id):
            return await handler(event, data)

        await state.set_state(RegistrationStates.full_name)
        # A brand-new user's very first /start may already carry a website
        # "?start=<tariff_key>" deep-link payload -- stash it now so _finish_registration
        # can hand it to send_welcome() once they're done registering, instead of losing
        # it here (this event never reaches on_start since we return None below).
        if isinstance(event, Message) and event.text:
            parts = event.text.split(maxsplit=1)
            if len(parts) > 1:
                await state.update_data(start_payload=parts[1].strip())
        target = event if isinstance(event, Message) else event.message
        await target.answer(NAME_PROMPT)
        if isinstance(event, CallbackQuery):
            await event.answer()
        return None