# srt_bot

Telegram bot: video yoki audio yuboring — bot AI (local Whisper) yordamida subtitr (.srt) fayl tayyorlaydi. SRT faylni CapCut, Premiere Pro, DaVinci Resolve — istalgan video-muharrirga import qilish mumkin.

## O'rnatish

```powershell
py -3.12 -m venv D:\Plugin\srt_bot\.venv
D:\Plugin\srt_bot\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r D:\Plugin\srt_bot\requirements.txt
```

## Sozlash

1. Telegramda **@BotFather** ga yozing, `/newbot` buyrug'ini yuboring, bot nomini tanlang va tokenni oling.
2. `.env.example` faylidan nusxa olib `.env` deb saqlang, `BOT_TOKEN` ga tokenni yozing.

```
BOT_TOKEN=123456:ABC-your-token-here
WHISPER_MODEL_SIZE=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_LANGUAGE=
```

`WHISPER_MODEL_SIZE` ni `medium` ga o'zgartirib aniqlikni oshirish mumkin (sekinroq ishlaydi). `WHISPER_LANGUAGE` ni `uz` deb qo'ysangiz, til avtomatik aniqlash o'rniga har doim o'zbekcha deb hisoblanadi.

## Ishga tushirish

```powershell
D:\Plugin\srt_bot\.venv\Scripts\Activate.ps1
python D:\Plugin\srt_bot\bot.py
```

Birinchi ishga tushirishda Whisper modeli internetdan yuklab olinadi (keyingi safar keshdan ishlaydi, internet shart emas).

## Cheklovlar (v1)

- Telegram Bot API standart serveri orqali fayllarni yuklab olish 20MB bilan cheklangan.
- Bir vaqtda foydalanuvchi boshqa fayl yuborsa, avvalgi kutilayotgan fayl almashtiriladi (baza yo'q, xotirada saqlanadi).
