# Ish jarayoni / Progress log

Bu fayl har bir sessiyada nima qilinganini va oxirgi holatni yozib borish uchun.
"Qayerda qolgan edik" degan savolga javob shu yerdan olinadi.

## Loyiha tuzilishi

- `D:\Plugin\src` — Java Spring Boot backend (Premiere Pro CEP kengaytmasi uchun).
  Gemini orqali audio transkripsiya qilib SRT yaratadi (`GeminiTranscriptionService.java`).
- `D:\Plugin\cep-extension` — Premiere Pro CEP panel (host/client/CSXS).
- `D:\Plugin\srt_bot` — Python/aiogram Telegram bot. Video/audio qabul qilib,
  Gemini (`gemini_transcriber.py`, model: `gemini-flash-latest`) orqali SRT subtitr yaratadi.
  ASR provider `config.ASR_PROVIDER` bilan tanlanadi (`gemini` yoki mahalliy Whisper `transcriber.py`).

## 2026-07-24

- **srt_bot**: `run_test.log` bo'yicha bot ishga tushirilgan, biroz vaqt internetga (Telegram API)
  ulana olmay 60 marta qayta urinib turgan, oxiri **muvaffaqiyatli ulangan** ("Connection established").
  Hozir 2 ta `python.exe` process faol ko'rinyapti — bot ehtimol hozir ham ishlab turibdi.
- **Java Plugin backend**: `backend_test.log` bo'yicha oxirgi marta 15:13 da ishga tushirilgan,
  so'nggi qatorda `JSON parse error: Unrecognized character escape 'P' (code 80)` xatosi qayd etilgan
  (hal qilinmagan holicha qolgan, tekshirilmadi).
- Foydalanuvchi bilan kelishildi: hozircha **srt_bot** (Telegram bot) qismi bilan davom etyapmiz.

### Keyingi qadam
- srt_bot hozirgi holatini tekshirish (jonli ishlayaptimi, oxirgi xato bormi) va foydalanuvchi
  bilan aniq nima o'zgartirish/tuzatish kerakligini aniqlash.

## 2026-07-30

- **cep-extension paneli qayta dizayn qilindi**: `client/index.html`, `client/css/style.css`,
  `client/js/main.js` — brend belgisi, ulanish indikatori (conn-dot), fayl kartasi, format
  tanlash endi `<select>` emas 2x2 tugma grid, generate tugmasida spinner, status yashirin/faqat
  kerak bo'lganda ko'rinadi.
- **Yangi funksiya: B-roll takliflari** (video kontentiga mos stock video qo'shish):
  - Backend: `TranscribeResponse`ga `segments` qo'shildi. Yangi
    `BrollSceneService` (Gemini orqali segmentlarni sahnalarga guruhlab, har biriga inglizcha
    qidiruv kalit so'zi topadi), `PexelsService` (Pexels Videos Search API'dan mos video
    qidiradi), `BrollController` (`/api/broll-suggestions`, `/api/broll-download`).
    `PluginProperties.Pexels.apiKey` — **hali bo'sh, `application-local.properties`ga foydalanuvchi
    o'zi Pexels'dan bepul API key olib qo'yishi kerak** (pexels.com/api).
  - ExtendScript (`host/index.jsx`): yangi `insertBroll(mediaPath, start, end)` — videoni import
    qiladi, QE (undocumented) API orqali yangi track qo'shishga urinadi (fallback: oxirgi mavjud
    track), aniq vaqtga qo'yadi, kerak bo'lsa uzunligini segment davomiyligiga qisqartiradi.
  - Panel UI: subtitr yaratilgach "B-roll takliflarini qidirish" tugmasi chiqadi, natijalar
    thumbnail+kalit so'z+vaqt bilan ro'yxatda ko'rsatiladi, har birida "Qo'shish" tugmasi bor.
  - **Hali sinovdan o'tkazilmagan** (Pexels API key yo'q, Premiere'da real test qilinmagan —
    ayniqsa QE addTracks va clip trim qismlari Premiere versiyasiga qarab ishlamasligi mumkin).

### Keyingi qadam
- Foydalanuvchi Pexels API key olib `application-local.properties`ga qo'yishi kerak.
- Backend qayta ishga tushirilib, Premiere'da panel qayta yuklanib, to'liq oqim (subtitr →
  b-roll takliflari → qo'shish) haqiqiy loyihada sinovdan o'tkazilishi kerak.

## 2026-07-31

- **Panel dizayni qayta qurildi** (Caption.uz skrinshotiga o'xshab, lekin yashil rangda):
  `client/index.html`, `client/css/style.css`, `client/js/main.js`.
  - Eski 4 tugmali "format-grid" (Premium/1/2/3 qator) o'rniga 3 xonali segmented control
    (Qisqa/O'rta/Uzun).
  - Yangi "Boshqa tilga tarjima" toggle — yoqilsa til tanlash `<select>` chiqadi (8 til:
    ingliz/rus/turk/qozoq/arab/xitoy/fransuz/nemis), backend'ga **haqiqatan** ulangan.
  - Yangi "Ko'proq sozlama" toggle — yoqilsa "Qatorlar soni" va "Har qatorda so'z" slider'lari
    va live "Namuna" preview chiqadi (client-side, sample so'zlar bilan).
  - Rang sxemasi: `--accent` ko'k(`#4f8cff`)dan yashil(`#3ecf72`)ga o'zgartirildi.
  - Video/sequence qatoriga qayta-aniqlash (⟳) tugmasi qo'shildi; "Kompozitsiya" dropdown
    foydalanuvchi so'roviga ko'ra **faqat vizual** — hozircha real sequence tanlash yo'q,
    avtomatik aniqlash saqlanib qolgan.
- **Backend qayta qurildi — so'z-asosli qator boshqaruvi**:
  `SrtBuilderService` to'liq qayta yozildi: eski belgi-soni (char-count) asosidagi
  "premium"/"1"/"2"/"3" style tizimi o'chirildi, o'rniga `buildSrt(result, maxLines, wordsPerLine)`
  — qatorlar to'g'ridan-to'g'ri so'zlar soni bo'yicha to'ldiriladi.
  `TranscribeRequest` endi `{filePath, maxLines, wordsPerLine, translateTo}` qabul qiladi
  (`style` maydoni olib tashlandi). `TranscribeController`da validatsiya (maxLines 1-3,
  wordsPerLine 1-10, translateTo — ruxsat etilgan til kodlaridan biri yoki bo'sh).
  `GeminiTranscriptionService.transcribe(wavPath, translateTo)` — `translateTo` berilsa,
  promptga tarjima ko'rsatmasi qo'shiladi (Gemini transkripsiya qilib, to'g'ridan-to'g'ri
  tarjima qilingan matnni qaytaradi).
- `mvnw.cmd compile` orqali backend muvaffaqiyatli kompilyatsiya qilindi (xatosiz).
- **Hali sinovdan o'tkazilmagan**: Premiere'da real panel ochib, yangi UI (toggle/slider/
  tarjima) va backend'dagi yangi so'rov formati bilan haqiqiy oqim tekshirilmadi.

### Keyingi qadam
- Backend qayta ishga tushirilib (`run-server.bat`), Premiere'da panel qayta yuklanishi va
  yangi UI/tarjima/so'z-asosli sozlamalar bilan haqiqiy video ustida sinovdan o'tkazilishi kerak.

## 2026-08-03

- **Pullik litsenziya tizimi qurildi** (foydalanuvchi buni "boshqa odamga tashlab bersa
  ishlatadimi" va "buni pullik qilmoqchiman" degan savollaridan keyin). Kelishilgan qarorlar:
  oylik obuna (30 kun), token faqat 1 ta qurilmaga bog'lanadi, markaziy tekshiruv `srt_bot`
  ichida (keyinchalik AWS'ga chiqariladi), botning "kuniga 1 marta bepul" limiti faqat
  Telegram botga tegishli (panel har doim faqat pullik token bilan ishlaydi).
  - **srt_bot**: yangi `licensing.py` (SQLite: `licenses`, `pending_requests`, `free_usage`
    jadvallari; token = `secrets.token_urlsafe`, `verify()`/`approve()`/`revoke()`),
    `licensing_server.py` (aiohttp, `POST /license/verify` — boshqa kompyuterlardagi Java
    backend shunga so'rov yuboradi), `licensing_handlers.py` (foydalanuvchi qurilma kodini
    (`XXXX-XXXX-XXXX`) botga yuborsa to'lov ko'rsatmasi + admin'ga inline
    Tasdiqlash/Rad-etish tugmali xabar; admin tasdiqlasa token generatsiya qilinib
    foydalanuvchiga yuboriladi; `/revoke` admin buyrug'i). `bot.py`da ulandi, `on_media`da
    kunlik bepul limit tekshiruvi qo'shildi. `config.py`/`.env.example`ga
    `ADMIN_TELEGRAM_ID`, `PAYMENT_CARD_NUMBER` (`[REDACTED]`), `PAYMENT_CARD_HOLDER`
    (**hali bo'sh — foydalanuvchi to'liq F.I.Sh.ni aniq yozib to'ldirishi kerak**),
    `SUBSCRIPTION_PRICE_TEXT` (**hali bo'sh — narx kiritilmagan**), `SUBSCRIPTION_DAYS=30`,
    `LICENSE_SERVER_PORT=8899` qo'shildi.
  - **Java backend**: `DeviceIdentityService` (qurilma kodini va faollashtirish tokenini
    `%USERPROFILE%\.uzbek-ai-captions\` ostida saqlaydi), `LicenseService` (markaziy
    serverni tekshiradi, 1 soatlik keshlash + 48 soatlik offline-grace bilan),
    `LicenseController` (`GET /api/license/status`, `POST /api/license/activate`).
    `TranscribeController` va `BrollController` endi har so'rovda litsenziyani tekshiradi,
    yaroqsiz bo'lsa 402 qaytaradi. `PluginProperties`ga `plugin.license.server-url`
    qo'shildi (hozircha `http://localhost:8899/license/verify`, bot AWS'ga chiqarilgach
    o'zgartirish kerak).
  - **CEP panel**: yangi "faollashtirish" ekrani (qurilma kodi + nusxalash tugmasi + token
    kiritish maydoni), litsenziya yaroqsiz bo'lsa asosiy panel (`#main-content`) yashiriladi,
    yaroqli bo'lsa header'da "N kun qoldi" belgisi ko'rinadi.
  - `mvnw.cmd compile` va Python fayllari (`py_compile`) xatosiz o'tdi. **Hali sinovdan
    o'tkazilmagan** — real Telegram oqim (kod yuborish → to'lov → admin tasdiqlash → token →
    panelda faollashtirish) va Premiere'da haqiqiy generatsiya birorta ham marta ishga
    tushirilmagan.

- `.env`ga real qiymatlar to'ldirildi: `ADMIN_TELEGRAM_ID=[REDACTED]` ([REDACTED]),
  `PAYMENT_CARD_HOLDER=[REDACTED]`, `PAYMENT_CARD_NUMBER=[REDACTED]`.
  `SUBSCRIPTION_PRICE_TEXT` hali placeholder ("narx tez orada e'lon qilinadi") — narx keyinroq
  aniqlanadi. **Admin uchun avtomatik bepul faollashtirish qo'shildi**: agar qurilma kodini
  yuborgan Telegram user ADMIN_TELEGRAM_ID bo'lsa, to'lov so'ralmasdan darhol token beriladi
  (`licensing_handlers.py:on_device_code`).

- **Butun oqim dasturiy (curl/python) darajada sinovdan o'tkazildi va ishlayotgani tasdiqlandi**:
  bot + litsenziya serveri ishga tushirildi (`0.0.0.0:8899`), backend qurildi va ishga
  tushirildi (`localhost:8971`, o'zining qurilma kodini generatsiya qildi:
  `CKFD-S2UX-487E` — bu shu development kompyuterining doimiy kodi, `%USERPROFILE%\
  .uzbek-ai-captions\device.id` da saqlangan). Faollashtirilmasdan `/api/transcribe`
  `402` qaytardi → admin nomidan token generatsiya qilindi → `/api/license/activate`
  orqali faollashtirildi (`valid:true, 30 kun`) → shundan keyin `/api/transcribe` litsenziya
  bosqichidan muvaffaqiyatli o'tdi. Boshqa qurilma kodi bilan bir xil token ishlatilganda
  `device_mismatch`/`not_found` bilan rad etilishi (ulashishga qarshi himoya) va botning
  kunlik bepul limiti (1-chi urinish ruxsat, 2-chisi rad) ham tasdiqlandi.
  **Test uchun ishlatilgan soxta yozuvlar (`TEST-CODE-0001`, foydalanuvchi `111222333`)
  `licenses.db`dan tozalandi — faqat shu kompyuterning haqiqiy faol litsenziyasi qoldi**
  (device `CKFD-S2UX-487E`, telegram_user_id `[REDACTED]`, 30 kun, hozircha faol).
- **Foydalanuvchi so'roviga ko'ra sessiya oxirida bot va backend to'xtatildi** (ikkalasi ham
  hozir ishlamayapti). Keyingi safar ishga tushirish uchun: `srt_bot\.venv\Scripts\python.exe
  D:\Plugin\srt_bot\bot.py` (litsenziya serveri ham shu bilan birga avtomatik ishga tushadi)
  va `D:\Plugin\run-server.bat` (yoki `java -jar target\Plugin-0.0.1-SNAPSHOT.jar`).
- **Premiere/AE'da panel hali GUI orqali bir marta ham ochib ko'rilmagan** — faqat backend/bot
  darajasida (curl) tekshirildi.

### Keyingi qadam
- Premiere/AE'ni ochib, panelni haqiqatan sinash: faollashtirish ekrani ko'rinadimi, qurilma
  kodi to'g'ri ko'rsatiladimi, tokenni kiritgach asosiy panel ochiladimi.
- Narx aniqlangach `srt_bot/.env`dagi `SUBSCRIPTION_PRICE_TEXT`ni to'ldirish kerak (hozir
  placeholder: "narx tez orada e'lon qilinadi").
- Bot AWS serverga ko'chirilgach, `plugin.license.server-url`ni (`application-local.properties`,
  hozir `http://localhost:8899/license/verify`) va CEP panelning `API_BASE`sini (agar backend
  ham markazlashsa) yangi manzilga o'zgartirish kerak.

## 2026-08-03 (davomi) — B-roll: bug tuzatildi + rasm/GIF aralashtirish + 2-ustunli grid

- **Muhim bug topildi va tuzatildi**: backend har doim `BrollSuggestion.candidates` (ro'yxat)
  qaytargan, lekin `main.js`dagi eski render kodi `s.thumbnailUrl`/`s.videoUrl`ni to'g'ridan-to'g'ri
  o'qishga urinar edi (bunday maydonlar yo'q edi) — shuning uchun B-roll videolari deyarli hech
  qachon to'g'ri chiqmagan/qo'shilmagan. Foydalanuvchi buni "video moslar kam chiqyapti" deb
  ta'riflagan edi.
- **Video kam chiqqanda rasm/GIF bilan to'ldirish**: endi har sahna uchun backend Pexels'dan
  video **va** rasm (`PexelsService.searchPhotos`, xuddi shu Pexels kaliti bilan), Giphy'dan GIF
  (`GiphyService`, **yangi bepul API key kerak — hali `plugin.giphy.api-key` bo'sh**,
  `application-local.properties`) so'raydi va ularni video→rasm→gif tartibida aralashtirib
  har sahna uchun 3 tagacha nomzod tanlaydi (`BrollController.pickCandidates`). Shunga ko'ra
  `BrollCandidate` endi `(type, thumbnailUrl, mediaUrl)` — type: video/photo/gif.
- **GIF → MP4 avtomatik konvertatsiya**: Premiere GIF'ni animatsiyali klip sifatida emas,
  bitta statik kadr sifatida import qiladi — shuning uchun yangi `GifConversionService`
  yuklab olingan GIF'ni mavjud ffmpeg orqali qisqa MP4'ga aylantiradi, Premiere'ga shu MP4
  qo'shiladi. `/api/broll-download` endi `{mediaUrl, type}` qabul qiladi (eski `videoUrl` emas).
- **Panel UI**: B-roll natijalari endi har sahna uchun sarlavha (kalit so'z + vaqt) + **2 ustunli
  to'rtburchak kartalar grid**i (video/rasm/GIF belgisi bilan) tarzida ko'rsatiladi; kartaning
  o'zini bosish darhol qo'shadi (alohida "Qo'shish" tugmasi olib tashlandi).
- **Sinovdan o'tkazildi** (curl orqali, haqiqiy Gemini+Pexels kalitlar bilan): `/api/broll-suggestions`
  haqiqiy o'zbekcha matn bilan chaqirildi → har sahna uchun 3 ta aralash nomzod (video+rasm)
  to'g'ri qaytdi; `/api/broll-download` rasm uchun `.jpg` fayl to'g'ri yuklab olindi; GIF→MP4
  ffmpeg buyrug'i alohida (lokal test GIF bilan) tekshirildi — 10 frameli animatsiyali MP4
  muvaffaqiyatli yaratildi. **Giphy qismi hali haqiqiy kalit bilan sinalmagan** (kalit yo'q —
  GiphyService bo'sh kalitda shunchaki bo'sh ro'yxat qaytaradi, xato bermaydi).
- Sessiya oxirida bot va backend yana to'xtatildi.

- **Giphy API key qo'yildi va haqiqiy kalit bilan sinaldi**: `application-local.properties`da
  `plugin.giphy.api-key=[REDACTED]` (Beta key, soatiga 100 so'rov chegarasi —
  hozircha yetarli, ko'payib qolsa Giphy dashboard'da bepul "Upgrade to Production" qilish kerak).
  "Okean to'lqinlari" mavzusidagi test bilan chaqirilganda haqiqiy mos GIF Giphy'dan topildi,
  yuklab olindi va ffmpeg orqali animatsiyali MP4'ga (1.19s, 14fps) muvaffaqiyatli aylantirildi —
  **butun B-roll (video+rasm+GIF) zanjiri to'liq ishlayotgani tasdiqlandi**.

- **B-roll natijalari endi turi bo'yicha alohida bo'limlarga ajratildi** (foydalanuvchi so'roviga
  ko'ra): har sahna ichida avval "Video" bo'limi, keyin "Rasm", keyin "GIF" — har birining o'z
  sarlavhasi va 2 ustunli grid'i bilan (aralash emas). Kartadagi alohida turi-belgisi endi kerak
  emas edi (bo'lim sarlavhasi buni ko'rsatadi) — olib tashlandi. `main.js`da JS sintaksisi
  tekshirildi, backend o'zgarmadi (guruhlash faqat panelda, client-side).

- **Muhim topilma**: `%APPDATA%\Adobe\CEP\extensions\uzbek-ai-captions`da o'rnatilgan nusxa
  **31-iyuldan qolgan, eski fayl tuzilishida edi** (`index.html`/`css`/`js` to'g'ridan-to'g'ri
  papka tepasida, `client/`/`host/` pastki papkalarisiz) — bu hozirgi
  `manifest.xml` (`MainPath=./client/index.html`, `ScriptPath=./host/index.jsx`) bilan mos
  kelmaydi. Ya'ni Premiere'da panel oldin umuman to'g'ri ochilmagan yoki eski/buzuq holatda
  ko'ringan bo'lishi mumkin edi. **Eski nusxa o'chirildi, `install.bat` orqali joriy manba
  kodidan (barcha litsenziya + B-roll o'zgarishlari bilan) toza qayta o'rnatildi** — endi
  `client/`, `host/`, `CSXS/` to'g'ri joylashgan, `PlayerDebugMode` registry sozlamasi ham
  tasdiqlandi (CSXS.9-12).

- **"1 qator" tushunmovchiligi hal qilindi**: foydalanuvchi "subtitr faqat 2 qatordan
  boshlanyapti" deb o'ylagan, aslida `SrtBuilderService` va segmentlangan tugmalarda
  `maxLines=1` allaqachon bor edi (standalone test bilan tasdiqlandi: `buildSrt(result, 1, 4)`
  chindan ham har cue'da aynan 1 qator beradi) — muammo faqat **nomlashda**: tugma "Qisqa" deb
  atalgan, "1 qator" emas edi. `client/index.html`dagi segmented tugmalar
  "Qisqa/O'rta/Uzun" → **"1 qator"/"2 qator"/"3 qator"** ga o'zgartirildi (aniqlik uchun).
  `install.bat` bilan qayta o'rnatildi.

- **Muhim bug tuzatildi — subtitr timeline'ga noto'g'ri joylashardi**: `insertSrtPremiere`
  subtitrni har doim Timeline'ning **qattiq kodlangan 0-sekundiga** qo'yar edi, video klipning
  sequence'dagi haqiqiy joylashuvi (`clip.start`) yoki uning trim/in-point'i (`clip.inPoint`)
  hisobga olinmasdan — video 0-sekunddan boshlanmasa yoki kesilgan bo'lsa, subtitrlar siljib
  qolardi. Foydalanuvchi buni "subtitr buzilib ketyapti" deb ta'riflagan edi. Endi
  `host/index.jsx`da yangi `findSourceTimeZeroOffset()` — sequence'dan xuddi shu media fayli
  ishlatilgan klipni topib, `clip.start.seconds - clip.inPoint.seconds` orqali "manba faylning
  0-sekundi timeline'da qayerga to'g'ri kelishi"ni hisoblaydi, subtitr klipi shu joyga
  qo'yiladi (0 o'rniga). `importSrt(srtPath, sourceMediaPath)` endi ikkinchi argument qabul
  qiladi — `main.js`da `selectedFile` (aniqlangan video manba yo'li) shu yerga uzatiladi.
  Oddiy holatda (klip 0-sekunddan, trimsiz) xatti-harakat o'zgarmaydi (offset baribir 0 bo'ladi).
  `install.bat` bilan qayta o'rnatildi.

- **Gemini 503 ("high demand") xatosiga avtomatik qayta urinish qo'shildi**: foydalanuvchi
  haqiqiy `503 UNAVAILABLE` xatosini ko'rgan (Google tomonidagi vaqtinchalik ortiqcha
  yuklanish, bizning kodga aloqasi yo'q) — lekin bu mijozga to'g'ridan-to'g'ri xato sifatida
  chiqib, butun generatsiyani bekor qilardi. Yangi `RetryableHttp.sendWithRetry()`
  (503/429/500/502/504 xatolarida 1s→2s kutish bilan 3 martagacha avtomatik qayta urinadi)
  `GeminiTranscriptionService` va `BrollSceneService`ning ikkalasida ham ishlatildi (ikkalasi
  ham to'g'ridan-to'g'ri Gemini API'ga so'rov yuboradi). Soxta lokal server bilan sinaldi:
  birinchi 2 urinish 503, 3-chisi 200 — retry to'g'ri ishlab, muvaffaqiyatli natija qaytardi
  (kutilganidek ~3s kechikish bilan). Jar qayta qurildi.

## 2026-08-03 (davomi 2) — Subtitr vaqti: Gemini o'rniga Whisper (so'z-aniq)

- Foydalanuvchi subtitr vaqti "professional emas, oldinga o'tib yoki orqada qolib ketyapti"
  deb shikoyat qildi. Sabab aniqlandi: Gemini ASR modeli emas, LLM bo'lgani uchun segment
  vaqtini **taxmin** qiladi, undan keyin har bir so'zning vaqti yana harflar soniga qarab
  **interpolatsiya** (yana taxmin) qilinardi — ikki bosqichli taxmin xato to'plardi.
  Foydalanuvchi bilan kelishildi: **Whisper'ga o'tish** (aniqroq, lekin ko'proq ish).
- **Arxitektura**: `srt_bot`da allaqachon `transcriber.py` (faster-whisper, so'z-darajasida
  frame-aniq vaqt beradi) bor edi, lekin faqat botning o'zi ishlatardi. Endi shu imkoniyat
  Java backend'ga ham HTTP orqali ochildi:
  - Yangi `srt_bot/transcribe_server.py` — `POST /transcribe` (xom WAV bayt sifatida qabul
    qiladi, `X-Device-Code`/`X-License-Token` header orqali litsenziyani tekshiradi — faqat
    faollashtirilgan pluginlar ishlata oladi), `transcriber.transcribe()` chaqiradi,
    so'z+segment JSON qaytaradi. `licensing_server.py`ga ulandi (bitta aiohttp ilovasi,
    endi "internal API" — litsenziya + transkripsiya), yuklash chegarasi 300MB'gacha
    oshirildi (WAV fayllar uchun aiohttp'ning standart 1MB chegarasi yetarli emas edi).
  - Java: yangi `WhisperTranscriptionService` (WAV faylni shu endpoint'ga yuboradi, natijani
    `TranscriptionResult`ga aylantiradi, `RetryableHttp` orqali qayta urinadi).
    `PluginProperties.Whisper.serverUrl` (`http://localhost:8899/transcribe`, bot AWS'ga
    ko'chganda o'zgartiriladi). `TranscribeController` endi: **tarjima so'ralmagan bo'lsa —
    Whisper** (aniq vaqt), **tarjima so'ralgan bo'lsa — Gemini** (Whisperning o'z tarjima
    rejimi faqat X→ingliz, bizning 8 tilga ishlamaydi). Whisper serveriga ulanib bo'lmasa,
    avtomatik Gemini'ga qaytadi (butun generatsiya buzilib qolmasin deb).
  - **Qo'shimcha**: ffmpeg audio ajratishga `-avoid_negative_ts make_zero` qo'shildi
    (`AudioExtractionService.java` va `srt_bot/media.py`) — ba'zi video konteynerlarda manba
    audio PTS noldan boshlanmasa, sun'iy siljish qo'shilishining oldini oladi.
- **Sinovdan o'tkazildi (haqiqiy nutq bilan)**: Windows TTS orqali haqiqiy ingliz nutqli WAV
  yaratildi → `/transcribe`ga to'g'ridan-to'g'ri yuborildi → **haqiqiy so'z-darajasidagi
  vaqtlar** qaytdi (masalan "this" 0.94–1.14s) — taxminiy emas. Keyin to'liq
  `/api/transcribe` zanjiri xuddi shu audio bilan sinaldi — SRT to'g'ridan-to'g'ri shu aniq
  Whisper vaqtlaridan tuzildi (mos keldi). Jar qayta qurildi, bot qayta ishga tushirilgan
  holda (`transcribe_server` ulangan) ishlayapti.
- **Hali tekshirilmagan**: o'zbekcha real nutq bilan (Whisper `WHISPER_MODEL_SIZE=medium`,
  `WHISPER_LANGUAGE=uz` sozlangan) va tarjima rejimi (Gemini yo'liga tegilmadi, lekin real
  test qilinmadi). Bot+backend hozir ikkalasi ham ishlab turibdi (sessiya oxirida
  to'xtatilmadi — foydalanuvchi Premiere'da faol sinamoqda).

- **Whisper o'zbekcha matnni kirillda chiqarardi — lotinga o'girish qo'shildi**:
  foydalanuvchi o'zbekcha video bilan sinab, "harflar lotin alifbosida emas" deb xabar berdi.
  Sabab: Whisper (faster-whisper) — LLM emas, oddiy ASR modeli, uni Gemini kabi "lotin
  alifbosida yoz" deb prompt bilan boshqarib bo'lmaydi; u o'zbekcha nutqni odatda kirillda
  chiqaradi (shunday o'rgatilgan). `srt_bot/transcriber.py`ga `_cyrillic_to_latin_uz()` —
  standart o'zbek kirill→lotin belgilar jadvali (masalan ў→o', ғ→g', ҳ→h, ц→ts, ч→ch, ш→sh)
  qo'shildi, `transcribe()` endi har bir so'z/segment matnini shu orqali o'tkazadi (faqat
  kirillcha belgi topilsa ishlaydi, boshqa tillarga tegmaydi). **To'g'ridan-to'g'ri matn bilan
  sinaldi** (audio emas): `"Ғафур Ғулом кўчасида яшайман"` → `"G'afur G'ulom ko'chasida
  yashayman"` — to'g'ri chiqdi. Audio orqali end-to-end test rus ovozi bilan qilingani uchun
  (Windows'da o'zbekcha TTS yo'q) talaffuz chalkashligi tufayli to'liq tasdiqlanmadi, lekin
  transliteratsiya mantig'ining o'zi ishonchli tekshirildi — **haqiqiy o'zbekcha video bilan
  sinov hali kerak**. Bot qayta ishga tushirilgan holda ishlayapti.

- **Yana bir jiddiy bug topildi va tuzatildi — subtitr qo'shilganda video siljib/buzilib
  ketardi**: foydalanuvchi Premiere'da haqiqiy sinov qildi (skrinshot bilan) va subtitr
  video bilan mos kelmayotganini, aynan video bo'limida narsalar joyidan
  siljiganini ko'rsatdi. Sabab: `importSrtPremiere` (va `insertBroll`) `insertClip()`
  ishlatardi — bu Premiere'da **ripple insert** (barcha keyingi klip va boshqa
  track'lardagi mos keladigan kliplarni ham vaqt bo'yicha oldinga surib yuboradi),
  `sequence.videoTracks[0]`ga (odatda asosiy video shu yerda) qo'shilganda haqiqiy videoni
  o'zi ham surilib/joylashuvi buzilib qolardi. Endi:
  - Yangi umumiy `addOverlayTrack()` funksiyasi — QE API orqali subtitr/B-roll uchun
    **alohida yangi video track** qo'shadi (mavjud video track'larga tegmaydi), QE mavjud
    bo'lmasa oxirgi track'ga tushadi (avvalgidek).
  - `insertClip()` o'rniga **`overwriteClip()`** ishlatiladi — bu hech narsani surmaydi,
    faqat belgilangan joyga qo'yadi. Ikkalasida (`importSrtPremiere`, `insertBroll`) ham
    qo'llanildi.
  - `install.bat` bilan qayta o'rnatildi. **Diqqat**: host (`.jsx`) kodi Premiere'ning
    ExtendScript dvigateli tomonidan sessiya davomida keshlanadi — panelni oddiy
    yopib-ochish yetarli bo'lmasligi mumkin, **Premiere Pro'ni to'liq qayta ishga
    tushirish** kerak bo'ladi, shundagina yangi host kod ishga tushadi.
  - **Hali Premiere'da qayta sinalmagan** (foydalanuvchi tomonidan tasdiqlash kerak).

### Keyingi qadam
- **Premiere Pro'ni to'liq qayta ishga tushirib** (shart — host .jsx keshlanadi), subtitr
  qo'shilganda endi video/boshqa kliplar siljimasligini va subtitr alohida yangi track'da
  to'g'ri joyda chiqishini tekshirish.
- Shundan keyin: **video timeline'da 0-sekunddan boshqa joyda yoki kesilgan holda** bo'lganda
  subtitr to'g'ri joylashishini, **Whisper-asosidagi vaqt aniqligini** va **kirill→lotin
  o'girishning haqiqiy o'zbekcha video bilan ishlashini** tekshirish.

## 2026-08-05 — Git repo yaratildi (GitHub public) + Kinetic Typography (so'z-so'z animatsion matn)

- **D:\Plugin git repositoryga aylantirildi va GitHub'ga yuklandi**: `git init`, root va
  `srt_bot/.gitignore` maxfiy fayllar (API kalitlar, `.env`, `licenses.db`, log fayllar,
  `target/`, `.idea`, `scratchpad`) chiqarib tashlanadigan qilib sozlandi. `PROGRESS.md` va
  `srt_bot/.env.example`dagi haqiqiy karta raqami/ism/Telegram ID/Giphy API kaliti
  `[REDACTED]` bilan almashtirildi (repo **public** bo'lgani uchun). `gh repo create` orqali
  **https://github.com/MyOrmonjonov/uzbek-ai-captions** yaratildi va push qilindi.
- **Foydalanuvchi so'rovi**: Swishy.ai (https://www.swishy.ai/) kabi so'z-so'z animatsion
  subtitr ("kinetic typography") qo'shish. Tekshirildi: Swishy'da ochiq API yo'q (faqat veb
  interfeys). Muqobil pullik cloud video-render API'lar (Creatomate ~$54/oy, Shotstack
  ~$49/oy) ham topildi, lekin ular alohida bulutda butun videoni qayta render qiladi —
  foydalanuvchi buni rad etib, **bepul, Premiere ichida native** yechimni tanladi.
- **Muhim texnik cheklov**: Premiere Pro ExtendScript API'da matnni noldan kod orqali
  animatsiyali yaratib bo'lmaydi (`app.project.addTitle()` mavjud emas, Adobe rasman
  qo'llab-quvvatlamaydi). Yagona ishonchli yo'l — oldindan tayyorlangan Motion Graphics
  Template (`.mogrt`) import qilib, uning matnini `TrackItem.getMGTComponent()` orqali har
  nusxa uchun dasturiy almashtirish. Foydalanuvchi shu yo'lni tanladi.
- **MOGRT manbasi topildi**: foydalanuvchida `D:\Telegram_Download\
  Xojiakbarxon_UI_Plugin_PR.PRO_23-26_SKY_GLASS.zxp` bor edi — o'zining (yoki hamkorining,
  foydalanuvchi tasdiqladi) boshqa bir CEP plagini, xuddi shu maqsad uchun 30 ta tayyor
  `.mogrt` shablon bilan. Ichidagi `definition.json`ni tekshirib, struktura aynan biz
  kutgan `capsuleparams.capParams[0].textEditValue`/`fontTextRunLength` shaklida ekani
  tasdiqlandi. **20 tasi** (`Bounce_*`, `Plain_*` — soddaroq, 20-47KB, "so'z" uchun mos)
  `cep-extension/host/assets/mogrt/`ga ko'chirildi (~640KB). `New_Animation_01-10.mogrt`
  (2.5MB+ har biri, "Liquid Glass" og'irroq shablonlar) hozircha qo'shilmadi — strukturasi
  tekshirilmagan.
- **Amalga oshirildi (kod qismi)**:
  - Backend: `TranscribeResponse`ga `words` (so'z-darajasidagi vaqt) qo'shildi —
    ilgari `TranscriptionResult.words()` hisoblanardi-yu, lekin panelga hech qachon
    yuborilmasdi. `TranscribeController.java` shu maydonni endi qaytaradi.
  - Panel: yangi "Kinetic Typography" toggle + `<select>` (index.html), "Animatsion matn
    qo'shish" tugmasi (B-roll tugmasi bilan bir xil qatorda/naqshda). `main.js` panel
    ochilganda `listKineticStyles()`ni chaqirib select'ni **dinamik** to'ldiradi (fixed
    3 stil emas — shu papkaga qanday `.mogrt` fayl tashlansa, o'sha avtomatik ro'yxatga
    chiqadi, kod o'zgarishi shart emas), `lastWords` saqlanadi va tanlangan stil bilan
    `insertKineticText(...)` host funksiyasi chaqiriladi.
  - Host (`index.jsx`): `importSrtPremiere`/`insertBroll`dagi ikki marta takrorlangan
    "import qilingandan keyin yangi project item'ni topish" kodi umumiy `importSingleFile()`
    helperga chiqarildi. Yangi `getMogrtPath()`/`listKineticStyles()` (papkani skanerlaydi),
    `setMogrtText()` (MGT komponent JSON parametrlari orasidan `textEditValue` kaliti bor
    paramni nom bo'yicha emas, shakli bo'yicha topadi — turli AE eksportlariga chidamli),
    `insertKineticText(style, wordsJson, sourceMediaPath)` — har so'z uchun MOGRT nusxasini
    alohida overlay track'ga qo'yadi (subtitr/B-roll tracklaridan mustaqil,
    `addOverlayTrack`/`overwriteClip`/`findSourceTimeZeroOffset` mavjud funksiyalari qayta
    ishlatilgan), so'zning haqiqiy davomiyligiga qisqartiradi, matnini o'sha so'zga
    o'rnatadi. Eski ExtendScript muhitlarida `JSON` bo'lmasligi mumkinligi uchun minimal
    polyfill qo'shildi.
  - `mvnw.cmd compile` va `node --check` (main.js, index.jsx) xatosiz o'tdi.
- **Hali sinovdan o'tkazilmagan**: .mogrt fayllari endi mavjud bo'lsa-da, butun oqim
  (toggle → stil tanlash → "Animatsion matn qo'shish" → Premiere'da haqiqiy natija) birorta
  ham marta ishga tushirilmagan — ayniqsa `setMogrtText()`ning haqiqiy Premiere'da MGT
  komponent parametrini topib to'g'ri o'rnatishi tasdiqlanmagan.

- **Bug topildi va tuzatildi — "Animatsiya shabloni topilmadi (host/assets/mogrt bo'sh)"**:
  foydalanuvchi Premiere'ni to'liq qayta ishga tushirgandan keyin ham shu xato chiqdi.
  Sabab: `getMogrtFolder()` ExtendScript'dagi `$.fileName` orqali o'z joylashuvini
  aniqlashga urinardi — bu CEP host script sifatida yuklanganda ishonchli ishlamas ekan
  (birinchi marta shu loyihada ishlatilgan, tasdiqlanmagan taxmin edi). Tuzatildi: papka
  yo'li endi **panel (JS) tomonida** CEP'ning rasmiy `csInterface.getSystemPath(
  SystemPath.EXTENSION)` orqali aniqlanadi (`main.js`, `MOGRT_FOLDER`) va
  `listKineticStyles(mogrtFolder)`/`insertKineticText(style, wordsJson, sourceMediaPath,
  mogrtFolder)`ga argument sifatida uzatiladi. `install.bat` bilan qayta o'rnatildi.
  **Foydalanuvchi tomonidan hali qayta sinalmagan** (Premiere yana to'liq qayta ishga
  tushirilishi kerak — host .jsx yana o'zgardi).

- **Muhim arxitektura tuzatishi — "ERROR: Animatsiya shablonini import qilib bo'lmadi."**:
  foydalanuvchi haqiqiy Premiere'da sinaganda Premiere'ning o'zi bir dialog chiqardi:
  "Motion Graphics Templates cannot be imported into the Project panel. We have installed
  your Motion Graphics Templates in the Graphics Templates panel instead." Ya'ni yangi
  Premiere versiyalarida `.mogrt` fayllar `app.project.importFiles()` orqali **umuman**
  loyiha elementiga aylanmaydi (SRT/video fayllardan farqli) — shuning uchun bizning
  "import qil, keyin loyiha daraxtidan top" usuli (avval `importSingleFile()` bilan qilingan,
  hatto uni rekursiv qilib tuzatgandan keyin ham) mogrt uchun asosan ishlay olmasdi.
  To'g'ri, rasmiy hujjatlashtirilgan yechim topildi: `Sequence.importMGT(path, ticksTime,
  vidTrackOffset, audTrackOffset)` — MOGRT'ni loyiha elementiga aylantirmasdan **to'g'ridan-
  to'g'ri track'ga qo'yadi** va tayyor `TrackItem` qaytaradi. `insertKineticText()` shunga
  qarab qayta yozildi (`importSingleFile`/`overwriteClip` bosqichi olib tashlandi, endi har
  so'z uchun bevosita `sequence.importMGT(...)` chaqiriladi). `install.bat` bilan qayta
  o'rnatildi. **Hali sinovdan o'tkazilmagan** (Premiere yana to'liq qayta ishga tushirilishi
  kerak).
- **Nazorat qilinishi kerak bo'lgan noaniqlik**: `importMGT()`ning ripple-insert
  (`insertClip()` kabi — keyingi kliplarni/boshqa tracklarni suradimi) yoki
  overwrite-xatti-harakatga egaligi hujjatlarda aniq yozilmagan. So'zlar vaqt tartibida
  ketma-ket qo'shilgani uchun (har biri avvalgisidan keyin joylashadi) va alohida yangi
  overlay track ishlatilgani uchun xavf cheklangan, lekin **agar sinovda video/boshqa
  tracklar siljib qolsa** — bu ripple-insert sababli bo'lishi mumkin, alohida tekshirish
  kerak bo'ladi (xuddi ilgari `insertClip()` bilan bo'lgan bug kabi).

- **Yana ikkita bog'liq bug topildi va tuzatildi — "ffmpeg audio ajratishda xatolik" (yo'l
  `...\Motion Graphics Template Media\...\Bounce_character_left_bounce.aegraphic`)**:
  foydalanuvchi keyingi safar subtitr yaratmoqchi bo'lganda, `getActiveMediaPath()` (timeline'da
  video qidiruvchi funksiya) haqiqiy video o'rniga yangi qo'shilgan MOGRT trek elementining
  ichki `.aegraphic` faylini "video" deb aniqlab, ffmpeg'ga shuni yuborgan.
  - **Sabab #1**: `getActiveMediaPath()` `sequence.videoTracks[0]`dan boshlab birinchi topilgan
    `getMediaPath()`ni qaytarardi — `.aegraphic` yo'lini filtrlab o'tkazib yubormasdi.
    Tuzatildi: endi `.aegraphic` bilan tugaydigan yo'llar o'tkazib yuboriladi.
  - **Sabab #2 (jiddiyroq)**: bu shuni fosh qildiki, `addOverlayTrack()` yangi trekni
    **yuqoriga emas, pastga (index 0, orqa fon)** qo'shayotgan bo'lishi mumkin edi — QE
    `addTracks()`ning 2-parametri (insertion index) hujjatlashtirilmagan, kod hozirgacha
    "yangi trek doim yuqori indeksga tushadi" deb **tasdiqlanmagan taxmin** qilar edi. Agar
    shunday bo'lsa, subtitr/B-roll/animatsion matn video **ortida yashiringan** (ko'rinmas)
    bo'lishi kerak edi — bu hali birorta safar ham vizual tasdiqlanmagan edi (oldingi
    sessiyalarda "Keyingi qadam" sifatida qoldirilgan, hech qachon tekshirilmagan).
    Tuzatildi: `qeSequence.addTracks(1, 0, ...)` o'rniga endi aniq `addTracks(1,
    tracksBefore, ...)` chaqiriladi (eng yuqori indeksga qo'shishni **aniq so'raydi**), va
    natija tasdiqlanadi — qaysi indeks bo'sh ekanligi tekshirilib (avval yuqori, keyin pastki),
    shungagina ishonch qilinadi (taxmin emas).
  - `install.bat` bilan qayta o'rnatildi. **Bu ham hali sinovdan o'tkazilmagan** — eng muhim
    tekshiruv: subtitr/B-roll/kinetic-text endi haqiqatan **video ustida ko'rinadimi**
    (ilgari umuman tasdiqlanmagan bo'lishi mumkin).

- **UI: stil tanlash preview grid + davomiylik sozlamasi qo'shildi**. Har bir `.mogrt`
  ichida Adobe'ning o'zi render qilgan `thumb.mp4` (kichik animatsion preview) borligi
  aniqlandi — shu 20 tasi `cep-extension/client/assets/kinetic-previews/*.mp4`ga chiqarib
  olindi. Panelda oldingi oddiy `<select>` o'rniga endi har bir stil uchun **haqiqiy
  animatsion preview** (loop bilan) ko'rsatadigan kartalar grid'i bor (`index.html`,
  `main.js` — B-roll grid pattern'iga o'xshab). **Diqqat**: foydalanuvchi "oq fonda" deb
  so'ragan edi, lekin preview videolar matni oq rangda, qora fonda — chindan oq fon qilsak
  matn ko'rinmay qoladi (tekshirib ko'rildi, screenshot bilan tasdiqlangan) — shuning uchun
  qora fon qoldirildi (B-roll kartalari bilan bir xil, panelning umumiy dark tema'siga mos).
  Yana yangi slider: "Har so'z eng kamida necha soniya ko'rinsin" (`minDurationSeconds`,
  0.1–1.5s) — `insertKineticText()`ga yangi parametr sifatida qo'shildi.
- **Muhim bug tuzatildi — foydalanuvchi haqiqiy sinovda "animatsiya notekis, tez chiqib-
  kirib ketyapti" deb xabar berdi**: sabab — har so'z klipi aynan o'sha so'zning
  `word.end`igacha qisqartirilardi, lekin tabiiy nutqda so'zlar orasida doim kichik pauza
  bor — shuning uchun matn har so'zda yonib-o'chib turardi (keyingi so'z boshlanguncha
  bo'sh joy qolardi). Tuzatildi: endi har so'z **keyingi so'z boshlanguncha** ekranda
  qoladi (`insertKineticText()`dagi `holdUntil` hisobi), faqat MOGRT'ning o'z tabiiy
  uzunligidan oshib ketmaydi (uzun pauzalarda — masalan gap oxirida — baribir faqat qisqa
  tabiiy animatsiya o'ynaydi, ekranda muzlab qolmaydi).
- **Muhim bug — foydalanuvchi xabar berdi: "Motion Graphic Template Media" ustma-ust
  bo'lib qolyapti, so'zlar mustaqil emas**: sabab — bir xil `.mogrt` manba fayliga bir necha
  marta (har so'z uchun) `sequence.importMGT()` chaqirilganda, Premiere ularni **bitta
  umumiy shablon nusxasi** sifatida bog'lab qo'yayotgan ko'rinadi — shuning uchun bitta
  so'z instance'iga qilingan o'zgarish (matn/joylashuv) boshqalariga ham "sirg'alib"
  ko'rinardi. Tuzatildi: endi har so'z uchun manba `.mogrt` fayli avval vaqtinchalik papkaga
  (`Folder.temp`) **alohida jismoniy nusxa** sifatida ko'chiriladi (`word_0.mogrt`,
  `word_1.mogrt`, ...), `importMGT()` shu noyob nusxaga chaqiriladi — Premiere'da ular endi
  umuman bog'liq manba yo'liga ega bo'lmagani uchun mustaqil bo'lishi kerak.
- `install.bat` bilan qayta o'rnatildi. **Hali sinovdan o'tkazilmagan** (Premiere yana
  to'liq qayta ishga tushirilishi kerak).

- **Foydalanuvchi ikkita narsa so'radi: "Your text" namunaviy matnini olib tashlash va
  animatsiyani sekinlashtirish**:
  - **Animatsiya tezligi**: tekshirildi — Premiere ExtendScript API'da klip tezligini
    (time-stretch) o'zgartirish uchun **hech qanday rasmiy yo'l yo'q** (Adobe community'da
    bir necha marta tasdiqlangan cheklov, QE DOM ham buni hujjatlashtirilmagan holda ham
    ishonchli qo'llab-quvvatlamaydi). Yagona qo'ldagi vosita — davomiylik (necha soniya
    ko'rinishi). Shunga ko'ra `kinetic-min-duration-slider` maksimal chegarasi 1.5s dan
    **3.0s**ga oshirildi — foydalanuvchi so'zlarni ko'proq ekranda ushlab turib "sekinroq"
    taassurot yaratishi mumkin (haqiqiy animatsiya tezligi emas, lekin qo'lda bor yagona
    dastak).
  - **"Your text" muammosi**: `setMogrtText()` ba'zan matnni muvaffaqiyatli
    o'rnatolmayotgani (yoki o'rnatgani rendered natijaga ta'sir qilmayotgani) aniqlandi.
    Ikki himoya chorasi qo'shildi: (1) endi **barcha** mos JSON-shakldagi parametrlar
    yangilanadi (ilgari faqat birinchisi topilgach to'xtab qolardi — ba'zi MOGRT'larda bir
    nechta matn-parametri bo'lishi mumkin), (2) matn endi klipni qisqartirishdan **oldin**
    o'rnatiladi (ehtiyot chorasi — trim MGT komponent keshini tiklab yuborishi ehtimoliga
    qarshi). **Diqqat**: bu hamon rasman hujjatlashtirilmagan texnika (Adobe community
    manbasiga asoslangan) — agar muammo davom etsa, chuqurroq diagnostika kerak bo'ladi.
  - `install.bat` bilan qayta o'rnatildi. **Hali sinovdan o'tkazilmagan**.

### Keyingi qadam
- Premiere'ni yana to'liq qayta ishga tushirib tekshirish: (1) "Your text" o'rniga haqiqiy
  so'z matni to'g'ri chiqayaptimi, (2) so'z instance'lari mustaqilmi (ustma-ust/bog'liq
  emas), (3) subtitr/kinetic-text/B-roll **haqiqatan video ustida ko'rinishini**, (4)
  so'zlar to'g'ri vaqtda, uzluksiz chiqishini, (5) video/boshqa tracklar siljimasligini,
  (6) subtitr yaratish to'g'ri video faylni aniqlashini.
- Agar "Your text" muammosi davom etsa — `setMogrtText()`ning qaysi qismida aniq
  to'xtayotganini (JSON param topilmayaptimi, topiladi-yu lekin render yangilanmayaptimi)
  aniqlash uchun qo'shimcha diagnostika (masalan vaqtincha alert/log) qo'shish kerak
  bo'ladi.
- Agar `New_Animation_01-10.mogrt` ham kerak bo'lsa — strukturasini tekshirib (bitta matn
  qatlami bilan mosmi yoki boshqacha), keyin qo'shish mumkin.
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish, push qilinmagan).

## 2026-08-05 (davomi 3) — Butun panel dizayni referens skrinshotga moslab qayta qurildi

- Foydalanuvchi tayyor dizayn skrinshotini yuborib, panelni shunga moslab qayta qurishni
  so'radi. Kelishilgan qarorlar: (1) 20 ta haqiqiy mogrt video-preview'i saqlanadi (rasmdagi
  statik "SALOM"+strelka ikonkalariga o'tilmadi), (2) panel kengligi ~340px dan **960px**ga
  oshirildi (`CSXS/manifest.xml`, ikki ustun sig'ishi uchun, tor holatda CSS breakpoint
  orqali bitta ustunga qaytadi), (3) haqiqiy % progress ma'lumoti yo'qligi sababli progress
  ring soddalashtirilgan holatda (band=aylanuvchi, tayyor=to'liq halqa+"100%"+belgi).
- **Bu faqat vizual/frontend qayta qurish — `host/index.jsx` va Java backend'ga hech qanday
  o'zgarish kiritilmadi**, shuning uchun bu safar **Premiere qayta ishga tushirilishi shart
  emas** — faqat panel oynasini yopib-qayta ochish kifoya (client fayllar CEP'da har safar
  qayta yuklanadi, faqat host `.jsx` keshlanadi).
- **`client/index.html`**: `#main-content` endi `.main-grid` (chap: video/subtitr
  uslubi/`.settings-card` ichida translate+advanced+kinetic bo'limlari/generate tugmasi,
  o'ng: `.results-panel` — progress-ring + status + `broll-btn`/`kinetic-btn`) va pastda
  to'liq-kenglikdagi `.media-library` (B-roll natijalari, joyi o'zgardi, xatti-harakati
  o'zgarmadi) ga bo'lindi. Barcha mavjud element `id`lari saqlanib qoldi — `main.js`
  o'zgarishsiz ishlashi kerak bo'lgan joylarda buzilish yo'q. Toggle qatorlariga (tarjima/
  ko'proq sozlama/kinetic) va B-roll/kinetic tugmalariga kichik SVG ikonkalar qo'shildi.
- **`client/css/style.css`**: `.main-grid` (CSS grid, `@media max-width:760px`da bitta
  ustunga qaytadi), `.settings-card`, `.results-panel`/`.progress-ring*` (inline SVG halqa,
  `.busy`/`.done` holat klasslari), `.kinetic-grid-head`/`.kinetic-search`/
  `.kinetic-count-badge`, `.kinetic-card-media`/`.kinetic-card-play`/`.kinetic-card-check`
  (kartaga play-belgi va tanlash-check qo'shildi), `.kinetic-pagination`
  (sahifa/nuqta/"Barchasini ko'rish"), `.media-library` qo'shildi. `.toggle-row` yangi
  `.toggle-icon` uchun qayta strukturalandi (`justify-content: space-between` o'rniga
  `label{flex:1}`).
- **`client/js/main.js`**: `setStatus(text, kind)` endi `updateProgressRing(kind)`ni ham
  chaqiradi (busy→aylanuvchi halqa, ok→to'liq halqa+"100%", boshqa→idle) — yagona joydan
  butun ilova bo'ylab ishlaydi, alohida chaqiruvlar sepilmadi. Kinetic grid butunlay qayta
  yozildi: `allKineticStyles`/`kineticFiltered`/`kineticPage`/`kineticShowAllFlag` state,
  `renderKineticGrid()` (6 tadan sahifalaydi, "Barchasini ko'rish" bosilsa scroll qiladigan
  to'liq ro'yxatga o'tadi), `applyKineticFilter()` (qidiruv input, nom bo'yicha filtr).
  Video-preview va tanlash logikasi (`buildKineticCard`, `selectKineticCard`,
  `insertKineticText` chaqiruvi) **o'zgarmadi** — faqat qanday kartalar render qilinishi
  o'zgardi. "N ta animatsiya" badge haqiqiy sondan to'ldiriladi.
- `node --check` (main.js) xatosiz o'tdi, `install.bat` bilan qayta o'rnatildi.
  **Foydalanuvchi tomonidan hali vizual tasdiqlanmagan**.

### Keyingi qadam
- Panelni Premiere'da yopib-qayta ochib tekshirish: keng holatda ikki ustun to'g'ri
  chiqishini, tor holatga torraytirilganda bitta ustunga qaytishini, kinetic qidiruv/
  sahifalash ishlashini, progress-ring band/tayyor holatlarida to'g'ri ko'rinishini,
  barcha mavjud funksiyalar (Subtitr yaratish, B-roll, Animatsion matn qo'shish,
  faollashtirish ekrani) avvalgidek ishlashini.
- Kinetic Typography'ning o'zi (so'z vaqtlari, MOGRT joylashtirish) hali oldingi
  sessiyada qo'yilgan tuzatishlar (mustaqil nusxalar, uzluksiz davomiylik) bilan
  to'liq tasdiqlanmagan edi — dizayn testi bilan birga shuni ham qayta tekshirish kerak.

## 2026-08-05 (davomi 4) — Whisper so'z tanish xatosi: medium → large-v3

- Foydalanuvchi "Subtitr yaratish" natijasida so'zlar noto'g'ri chiqayotganini xabar
  qildi (skrinshot: "bemorlarimiz" o'rniga "dimarlarimiz" — haqiqiy eshitish xatosi, imlo
  xatosi emas). Birinchi taklifi "Whisper'ni olib tashla, faqat Gemini ishlat" edi, lekin
  bu kinetic typography uchun kerak bo'lgan **aniq so'z-vaqtlarini yo'qotardi** (Gemini
  faqat taxminiy/interpolatsiya vaqt beradi — aynan shu sabab bilan avvalgi sessiyada
  Gemini'dan Whisper'ga o'tilgan edi). Buni tushuntirib, kamroq xavfli yechim taklif
  qilindi va tanlandi.
- **Muhim topilma**: `srt_bot/transcriber.py`da allaqachon (oldingi sessiyalarda qurilgan)
  gibrid yondashuv bor edi — `spelling_correction.py` Whisper natijasidagi so'zlarni
  Gemini orqali **faqat imlosini tuzatadi** (so'z sonini/tartibini/vaqtini o'zgartirmasdan).
  Lekin bu **faqat imlo** uchun ishlaydi ("başqa"→"boshqa" kabi) — "dimarlarimiz" kabi
  **butunlay boshqa eshitilgan so'z**ni tuzata olmaydi (prompt aniq "so'zni almashtirma,
  faqat imlosini to'g'irla" deb cheklangan — mo'ljallangan tarzda).
  - Tuzatish: `srt_bot/.env`da `WHISPER_MODEL_SIZE=medium` → **`large-v3`**ga o'zgartirildi
    (`WHISPER_LANGUAGE=uz` allaqachon to'g'ri sozlangan edi). So'z-vaqt aniqligi saqlanib
    qoladi, so'zlarni tanish sifati yaxshilanishi kutiladi. **Kamchilik**: CPU'da (`
    WHISPER_DEVICE=cpu`, `int8`) ishlaydi, shuning uchun generatsiya sezilarli
    sekinlashadi, birinchi so'rovda model fayli (`large-v3`) hali yuklab olinmagan bo'lsa
    avtomatik yuklanadi (qo'shimcha kutish).
  - `srt_bot` python jarayoni to'xtatilib qayta ishga tushirildi (config o'zgarishi kuchga
    kirishi uchun shart) — litsenziya server javob bermoqda, tasdiqlandi.
- **Hali sinovdan o'tkazilmagan** — foydalanuvchi haqiqiy video bilan qayta "Subtitr
  yaratish"ni sinashi kerak (birinchi urinish model yuklanishi sababli sezilarli uzoq
  davom etishi mumkin, bu normal).

### Keyingi qadam
- Foydalanuvchi qayta subtitr yaratib, so'zlar to'g'ri chiqayotganini tekshirishi kerak.
- Agar `large-v3` bilan ham xato davom etsa yoki tezlik muammo bo'lsa: (a) `WHISPER_DEVICE`
  GPU'ga o'tkazish imkoniyatini ko'rib chiqish, yoki (b) har video uchun `initial_prompt`
  (domen so'zlar ro'yxati) qo'shishni ko'rib chiqish mumkin.
