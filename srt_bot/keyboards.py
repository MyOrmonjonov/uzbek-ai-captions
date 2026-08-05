from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

FORMAT_LABELS = {
    "premium": "✨ Premium",
    "1": "1 qator",
    "2": "2 qator",
    "3": "3 qator",
}


def format_choice_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text=label, callback_data=f"fmt:{key}")]
        for key, label in FORMAT_LABELS.items()
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)
