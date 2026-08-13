from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

FORMAT_LABELS = {
    "premium": "✨ Premium",
    "1": "1 qator",
    "2": "2 qator",
    "3": "3 qator",
}

CHANNEL_URL = "https://t.me/ravon_captions"


def format_choice_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text=label, callback_data=f"fmt:{key}")]
        for key, label in FORMAT_LABELS.items()
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🎬 Qanday ishlaydi?", callback_data="howitworks")],
            [InlineKeyboardButton(text="📊 Statistikam", callback_data="stats")],
            [InlineKeyboardButton(text="📢 Kanal", url=CHANNEL_URL)],
        ]
    )


def back_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="◀ Orqaga", callback_data="start_back")]]
    )
