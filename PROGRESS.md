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

## 2026-08-06 — Hybrid transkripsiya: matn Gemini'dan, vaqt Whisper'dan (alignment)

- Foydalanuvchi yana so'z tanish xatosini ko'rsatdi (masalan "bemorlarimiz" o'rniga
  "dimarlarimiz" — `large-v3`ga o'tilgandan keyin ham) va o'zi taklif qildi: subtitr matnini
  Gemini'da qilib, vaqtini boshqa (Whisper) bilan to'g'irlash mumkinmi. Bu taklif tasdiqlandi
  va amalga oshirildi — foydalanuvchiga narxi (ikkala servis ham har safar ishlaydi, biroz
  sekinroq) tushuntirilgach "hybrid alignment" varianti tanlandi.
- **Sabab**: eski `spelling_correction.py` (Whisper so'zini Gemini'ga faqat matn sifatida
  ko'rsatib, imlosini tuzatish) audio'ni EMAS, faqat matnni ko'radi — shuning uchun
  butunlay noto'g'ri eshitilgan so'zni (imlo xatosi emas, tanish xatosi) tuzata olmasdi.
- **Yangi arxitektura**: yangi `srt_bot/hybrid_transcriber.py` — Whisper (`transcriber.py`,
  aniq vaqt) va Gemini (`gemini_transcriber.py`, audio orqali to'g'ridan-to'g'ri, aniqroq
  matn) bir xil audio ustida **parallel** (`ThreadPoolExecutor`) ishga tushiriladi, so'ng
  `difflib.SequenceMatcher` orqali Gemini so'zlari Whisper so'zlariga normalizatsiya qilingan
  holda (kichik harf, tinish belgilarisiz) moslashtiriladi: mos kelgan so'zlar Whisper'ning
  **haqiqiy** vaqtini oladi, mos kelmagan (Gemini qo'shgan/almashtirgan yoki Whisper
  eshitmagan/xato eshitgan) so'zlar qo'shni mos so'zlar vaqti orasida harf-uzunligi bo'yicha
  interpolatsiya qilinadi (xuddi `gemini_transcriber._interpolate_words` kabi, lekin haqiqiy
  langar nuqtalar orasida). Segmentlar ham Gemini segment chegaralari bo'yicha, lekin yangi
  moslashtirilgan so'z vaqtlaridan qayta hisoblanadi (`_rebuild_segments`).
  - `transcribe_server.py`dagi `/transcribe` endpoint (Java `WhisperTranscriptionService`
    shu yerga so'rov yuboradi) endi `transcriber.transcribe` o'rniga
    `hybrid_transcriber.transcribe` chaqiradi — **Java tomonida hech qanday o'zgarish shart
    emas**, chunki javob shakli (`{words, segments}`) bir xil qoldi.
- **Sinovdan o'tkazildi (audio'siz, sof algoritm darajasida)**: soxta so'z ro'yxati bilan
  (Whisper: "dimarlarimiz" xato eshitgan, "yaxshi" so'zini butunlay tushirib qoldirgan;
  Gemini: to'g'ri "bemorlarimiz ... yaxshi ...") — natija to'g'ri chiqdi: to'g'ri tanilgan
  so'zlar (`bugun`, `kasalxonada`, `davolanmoqda`) haqiqiy Whisper vaqtini oldi, xato
  eshitilgan/qo'shilgan so'zlar (`bemorlarimiz`, `yaxshi`) qo'shni langar vaqtlar orasida
  to'g'ri interpolatsiya qilindi. `py_compile` xatosiz o'tdi.
- Bot va backend qayta ishga tushirildi (`srt_bot\bot.py`, `run-server.bat`) — ikkalasi ham
  hozir ishlab turibdi.
- **Hali sinovdan o'tkazilmagan — haqiqiy audio bilan**: foydalanuvchi Premiere'da real video
  bilan "Subtitr yaratish"ni sinashi kerak. E'tibor beriladigan narsalar: (1) so'zlar endi
  to'g'ri tanilyaptimi (Gemini matni), (2) vaqt hamon aniqmi (Whisper langar + interpolatsiya
  buzmadimi), (3) generatsiya vaqti qanchalik sekinlashdi (ikkala servis parallel ishlagani
  uchun umid — sof Whisper vaqtidan unchalik uzoq bo'lmasligi kerak, lekin Gemini audio
  yuklash+javob vaqti qo'shiladi).
- **Diqqat**: `spelling_correction.py` hamon Whisper yo'lida ishlaydi (Whisper so'zlarini
  alignment uchun standart imloga keltiradi — bu Gemini so'zlari bilan moslashish
  ehtimolini oshiradi), o'chirilmadi.

### Keyingi qadam
- Foydalanuvchi haqiqiy video bilan sinab, natijani (so'z aniqligi + vaqt aniqligi +
  generatsiya tezligi) tasdiqlashi kerak.
- Agar alignment ba'zi hollarda noto'g'ri ishlasa (masalan Gemini so'z tartibini juda
  o'zgartirsa yoki umuman boshqacha gapirsa) — `difflib` normalizatsiya funksiyasini
  (`_normalize`) yoki interpolatsiya chegaralarini qayta ko'rib chiqish kerak bo'lishi mumkin.
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish).

## 2026-08-06 (davomi) — Kinetic typography: "so'z erta kesilib ketyapti" bugi + "Your text" diagnostikasi

- Foydalanuvchi Premiere'da kinetic typography'ni sinab, ikkita muammo xabar qildi: (1) "Your
  text" namunaviy matni hamon ba'zan chiqib qolyapti (avvalgi ikki tuzatishdan keyin ham), (2)
  tez gapirilgan joylarda so'z oxirigacha to'liq chiqmay, keyingi so'zga erta o'tib ketyapti —
  o'qib ulgurish qiyin.
- **Sabab #2 (asosiy, tasdiqlangan mantiqiy tahlil bilan)**: barcha so'z kliplari **bitta**
  overlay track'ga qo'yilardi. `minDurationSeconds` (o'qish uchun minimal ko'rinish vaqti) —
  tez gapirilganda so'zlar orasidagi haqiqiy bo'shliqdan (`holdUntil - word.start`) katta
  bo'lib qolishi mumkin edi, bu holda hisoblangan `duration` keyingi so'z allaqachon
  boshlangan vaqtga "kirib" ketardi — bitta trekda ikkita so'z klipi vaqt bo'yicha ustma-ust
  tushardi. Bu **importMGT() orqali navbatdagi so'z joylashtirilganda oldingi klipni erta
  kesib/almashtirib qo'yishi** bilan natijalangan — aynan foydalanuvchi ta'riflagan holat.
  - Tuzatildi: `host/index.jsx`da `insertKineticText()` endi bitta qattiq trek o'rniga
    **greedy interval-scheduling** orqali dinamik trek pool ishlatadi (`pickTrack()`) — har
    so'z faqat o'sha vaqtga kelib **bo'sh qolgan** trekka qo'yiladi, bo'sh trek topilmasa
    yangisi (`addOverlayTrack()`) qo'shiladi. Natijada tez gapirilgan joylarda so'zlar zarur
    bo'lganda alohida qatlamlarda vizual ustma-ust chiqadi (hech biri kesilmaydi/yo'qolmaydi),
    sekin gapirilgan joylarda esa hamon bitta trek yetarli bo'ladi (qo'shimcha trek ochilmaydi).
    Natija xabarida endi nechta qatlam ishlatilgani ko'rsatiladi (agar 1 dan ko'p bo'lsa).
  - **Diqqat**: haqiqiy animatsiya tezligini o'zgartirish (ExtendScript'da hech qanday rasmiy
    yo'l yo'q, avvalgi sessiyada tasdiqlangan) hamon mumkin emas — bu tuzatish faqat
    **kesilib qolish bugini** bartaraf etadi, animatsiyaning o'zi hamon bir xil tezlikda
    o'ynaydi, faqat endi kerak bo'lganda bir necha so'z vizual bir vaqtda ko'rinishi mumkin.
- **"Your text" — ildizi hali aniqlanmagan**: ikki marta (oldingi sessiyalarda) turli
  taxminlar bilan "tuzatilgan" bo'lsa-da, muammo davom etyapti — demak taxminlar noto'g'ri
  yoki yetarli emas edi. Real Premiere muhitida debugger ulab bo'lmasligi sababli, endi
  `setMogrtText()`dan keyin **faqat 1-so'z uchun** yangi `setMogrtTextDiagnostic()` chaqiriladi
  — bu property'ni **qayta o'qib**, nechta "textEditValue" shaklidagi parametr topilgani va
  yozuvdan keyin o'sha parametr **haqiqatan qanday qiymat qaytarayotgani**ni natija xabariga
  qo'shadi (masalan: "diagnostika: 1-so'zda 2 ta matn-parametr, o'qilgan: [Your text | Your
  text], kutilgan: \"salom\""). Bu ikki gipotezani ajratib beradi: (a) agar o'qilgan qiymat
  hamon "Your text" bo'lsa — yozuvning o'zi umuman ta'sir qilmayapti (`setValue()` chaqiruvi
  yoki JSON shakli noto'g'ri), (b) agar o'qilgan qiymat to'g'ri chiqsa-yu vizual render hamon
  "Your text" ko'rsatsa — muammo yozuvda emas, balki **render yangilanmasligida** (masalan
  playhead/frame refresh kerak). Keyingi tuzatish shu diagnostika natijasiga qarab qilinadi.
- `node --check` (vaqtinchalik `.js` nusxa orqali, `.jsx` kengaytmasini node tanimaydi) va
  `install.bat` orqali qayta o'rnatish xatosiz o'tdi. Bot (`bot.py`) va backend
  (`run-server.bat`) qayta ishga tushirilgan holda ishlab turibdi.
- **Hali sinovdan o'tkazilmagan**: Premiere to'liq qayta ishga tushirilishi kerak (host `.jsx`
  keshlanadi), so'ng foydalanuvchi yana "Animatsion matn qo'shish"ni sinab: (1) tez
  gapirilgan joylarda so'zlar endi kesilmasdan to'liq ko'rinayaptimi (ehtiyot: endi ba'zan
  bir necha so'z bir lahzada ustma-ust ko'rinishi **kutilgan/normal** xatti-harakat, xato
  emas), (2) natija xabaridagi diagnostika satrini o'qib yuborishi kerak — shu orqali "Your
  text" muammosining aniq sababi (yozuv ishlamayaptimi yoki render yangilanmayaptimi)
  tasdiqlanadi.

### Keyingi qadam
- Foydalanuvchidan diagnostika xabarini olib, "Your text" muammosining haqiqiy sababini
  aniqlash va shunga qarab yakuniy tuzatishni qilish.
- Trek-scheduling tuzatishini tasdiqlash: so'zlar endi erta kesilmayaptimi.
- Ishlagach: git'da commit qilish.

## 2026-08-06 (davomi 2) — Subtitr MOGRT'ga o'tkazildi + "regenerate, stack emas" tuzatildi

- Foydalanuvchi yana bug xabar qildi: "1 qator" tanlansa ham subtitr 2 qatorga bo'lib
  chiqyapti. Tekshirildi (rasmiy manba + Adobe community orqali): hozirgi
  `importSrtPremiere()` yo'li SRT faylni Premiere'ning **native Captions** formatiga import
  qiladi — bu format matnni **o'zi** o'raydi (bizning SRT'dagi qator sonini e'tiborsiz
  qoldirib) va **Adobe rasman tasdiqlagan**: native caption uslubini (shrift/rang/fon)
  ExtendScript orqali dasturiy boshqarishning **hech qanday yo'li yo'q** (UXP'ga
  o'tilmaguncha). Foydalanuvchi alohida savol sifatida "caption ilovalari kabi shrift/rang/
  fon tanlash imkoni bo'lsa optimal bo'lармиди" deb so'ragan edi — ikkalasi bitta sababga
  borib taqaladi.
  - Foydalanuvchiga ikki variant taklif qilindi (AskUserQuestion): (1) kinetic typography'dagi
    kabi MOGRT-asosiga o'tish — qator sonini aniq nazorat qiladi, kelajakda stil tanlash
    imkonini ochadi, lekin ko'proq ish; (2) hozirgi native caption bilan davom etish. **MOGRT
    variant tanlandi.**
  - **Amalga oshirildi**: yangi `insertCaptionMogrt(style, srtPath, sourceMediaPath,
    mogrtFolder)` (`host/index.jsx`) — `insertKineticText()`ga o'xshab, lekin **so'z emas,
    har SRT cue** uchun bitta MOGRT nusxasi qo'yadi (mavjud `parseSrt()` orqali .srt fayldan
    cue ro'yxati olinadi — backend o'zgarishi shart emas edi). Xuddi kinetic'dagidek: har cue
    o'z jismoniy MOGRT nusxasini oladi (mustaqillik uchun), greedy trek-scheduling (`pickTrack`)
    ishlatiladi (odatda 1 trek yetarli, chunki `SrtBuilderService.fixOverlaps()` cue'lar
    orasida bo'shliqni allaqachon kafolatlaydi), davomiylik `cue.end - cue.start`ga
    qisqartiriladi (native uzunlikdan oshib ketmasdan, xuddi so'z kliplaridagidek).
  - **Diqqat — hozircha vaqtinchalik cheklov**: hozirgi 20 ta MOGRT shablon (`assets/mogrt/`)
    yakka **so'z** uchun mo'ljallangan qisqa animatsiyalar (README: "~0.15-0.4s"), to'liq
    ko'p qatorli gap uchun mo'ljallanmagan. Shuning uchun default sifatida eng "neytral"
    (`Plain_fade_on`, `DEFAULT_CAPTION_STYLE`) tanlandi — vizual mos kelishi **hali
    tasdiqlanmagan**, ko'rinishi yomon bo'lsa alohida subtitr-uchun MOGRT shabloni
    tayyorlash/qidirish kerak bo'ladi.
  - `importSrt()` dispatcher endi (Premiere uchun) `mogrtFolder` argumenti berilsa
    `insertCaptionMogrt`ni chaqiradi; `main.js`dagi `importSrt()` client funksiyasi endi
    `MOGRT_FOLDER`ni ham uzatadi. Eski `importSrtPremiere()` (native caption) hali kodda
    qoladi, lekin asosiy oqimdan chaqirilmaydi.
- **Ikkinchi so'rov**: foydalanuvchi "animatsiya yaratilgandan keyin ro'yxatdagi boshqa
  stil bilan almashtirib ko'ra olish" va "davomiylikni video ko'rib turib moslashtirish"
  imkoni bo'lishi kerakligini aytdi. Tekshirilganda: `lastWords`/`lastSegments` panelda
  allaqachon keshlangan (qayta transkripsiya kerak emas), UI tugmasi ham har safar qayta
  bosilaveradi — lekin **har bosilganda eski MOGRT kliplari o'chirilmasdan, ustiga yangisi
  qo'shilardi** (stack, almashtirish emas) — bu shu so'rovni bloklardi.
  - Tuzatildi: rasmiy, hujjatlashtirilgan `TrackItem.remove(inRipple, inAlignToVideo)` API
    (Premiere 13.1+) topildi va ishlatildi. `index.jsx`da modul darajasidagi
    `lastKineticClips`/`lastKineticTrackIndices` va `lastCaptionClips`/
    `lastCaptionTrackIndices` — har `insertKineticText()`/`insertCaptionMogrt()` chaqiruvi
    endi **avval** o'zi oldingi safar qo'ygan barcha kliplarni tozalaydi
    (`clearTrackedClips()`), so'ng **bo'shagan** eski treklarni qayta ishlatadi (yangi
    bo'sh trek ochilmaydi, garchi kerak bo'lsa qo'shiladi). Natijada: foydalanuvchi stil yoki
    "eng kam davomiylik" slaydilarni o'zgartirib, tugmani qayta bossa — eskisi o'chib,
    yangisi o'sha joyga qo'yiladi (stack emas, almashtirish). Bu ham kinetic, ham (endi
    MOGRT-asosidagi) subtitr uchun ishlaydi.
- `node --check` va `install.bat` xatosiz o'tdi. Bot/backend ishlab turibdi.
- **Hali sinovdan o'tkazilmagan**: Premiere to'liq qayta ishga tushirilishi kerak. Tekshirish
  kerak: (1) subtitr endi to'g'ri qator sonida chiqayaptimi va vizual qanday ko'rinadi
  (`Plain_fade_on` uzun gaplar uchun mos keladimi), (2) stil/slayder o'zgartirib qayta
  bosilganda eski animatsiya to'g'ri o'chib, yangisi to'g'ri joyga qo'yilyaptimi (duplikat
  yo'qmi).

### Keyingi qadam
- Foydalanuvchi vizual tasdiqlashi kerak: subtitr MOGRT ko'rinishi (matn sig'yaptimi,
  qator sonini to'g'ri), qayta-generatsiya (regenerate) to'g'ri almashtirayotgani.
- Agar `Plain_fade_on` ko'p qatorli matn uchun yomon ko'rinsa — subtitrga maxsus
  (kattaroq matn qutili, orqa fon bilan) MOGRT shablon(lar)i kerak bo'ladi; shundan keyin
  "Your text" diagnostikasi ham hali kutilmoqda.
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish).

## 2026-08-06 (davomi 3) — Katta harf (ALL CAPS) bugi tuzatildi

- Foydalanuvchi xabar qildi: kinetic typography so'zlari doim **katta harflarda** chiqyapti
  (kutilmagan, biz matnni asl holicha yuboryapmiz). `.mogrt` fayllarni to'g'ridan-to'g'ri
  tekshirib (ular aslida zip — `definition.json` ochib ko'rildi): sabab topildi —
  `Plain_fade_on.mogrt`da (va ehtimol qolgan 19 tasida ham, xuddi shu shablon oilasidan)
  matn parametrining o'zida (`capParams[0]`) `textEditValue` bilan bir qatorda
  `"fontFSAllCapsValue": [true]` bor edi — bu AE'ning "All Caps" belgi uslubi, matn
  KONTENTIGA emas, alohida stil bayrog'iga tegishli, shuning uchun `textEditValue`ni
  to'g'ri yuborsak ham render doim katta harfda chiqaverardi.
  - Tuzatildi: `setMogrtText()` (`host/index.jsx`, kinetic va subtitr MOGRT ikkalasida ham
    ishlatiladi) endi xuddi shu obyektda `fontFSAllCapsValue` kaliti bor bo'lsa, uni
    `[false]`ga o'rnatadi (kalit yo'q shablonlarga tegmaydi). `node --check` va
    `install.bat` xatosiz o'tdi.
- **Hali sinovdan o'tkazilmagan** haqiqiy Premiere'da — Premiere qayta ishga tushirilishi
  kerak.
- Foydalanuvchi ikkinchi savol berdi: tez gapirilgan joylarda animatsiya "juda tez o'tib
  ketyapti", nima qilsak bo'ladi. Javob (kodga tegilmadi, tushuntirish berildi): haqiqiy
  animatsiya **tezligini** o'zgartirishning ExtendScript'da hech qanday yo'li yo'q
  (avval tasdiqlangan cheklov). Yagona dastak — panelda allaqachon bor "Har so'z eng
  kamida necha soniya ko'rinsin" slayderi (`kinetic-min-duration-slider`, 0.1–3.0s) — buni
  oshirish, endi trek-kolliziya tuzatilgani va regenerate-not-stack ishlagani sababli,
  video ko'rib turib sinab ko'rish tavsiya qilindi (kod o'zgarishi shart emas, foydalanuvchi
  hali sinamagan). Agar bu yetarli bo'lmasa, keyingi qadam — tez gapirilgan joylarda bir
  nechta so'zni bitta "burst"ga guruhlash (kod o'zgarishi talab qiladi, hali muhokama
  qilinmadi/qaror qilinmadi).

### Keyingi qadam
- Foydalanuvchi Premiere'ni qayta ishga tushirib: (1) so'zlar endi to'g'ri holatda (katta
  harf emas) chiqayotganini, (2) "eng kam davomiylik" slayderini oshirib tez gapirilgan
  joylarda animatsiya qanchalik yaxshi his qilinishini tekshirishi kerak.
- Agar slayder yetarli bo'lmasa — so'zlarni tez gapirilgan joylarda guruhlash imkoniyatini
  muhokama qilish kerak bo'ladi.

## 2026-08-06 (davomi 4) — Progress-indikator + kinetic sync-drift tuzatildi

- Foydalanuvchi: stil almashtirish uchun har safar Premiere'ga real qo'yish (kutish)
  kerakligidan noroziligini bildirdi ("telefondagi caption ilovalarida darhol bo'ladi").
  Tushuntirildi: bu haqiqiy texnik chegara (`importMGT()` har so'z uchun Premiere'ning o'z
  operatsiyasi, tezlashtirib bo'lmaydi) — ikkita variant taklif qilindi, **progress-
  indikator** tanlandi.
  - Amalga oshirildi: `host/index.jsx`da `dispatchProgress(kind, done, total)` — CEP'ning
    rasmiy `CSXSEvent`/`PlugPlugExternalObject` mexanizmi orqali (web qidiruv bilan
    tasdiqlangan API) har so'z/cue qo'yilgandan keyin panelga hodisa yuboradi.
    `insertKineticText()` va `insertCaptionMogrt()`ning ikkalasi ham chaqiradi.
    `main.js`da `csInterface.addEventListener('com.uzbekaicaptions.mogrtProgress', ...)` —
    statusni "Animatsiya qo'shilmoqda... 42/128" kabi jonli yangilaydi. `node --check` va
    `install.bat` xatosiz o'tdi.
- **Yangi, jiddiyroq bug**: foydalanuvchi subtitr (oddiy, cue-darajasida) vaqti to'g'ri, lekin
  kinetic (so'z-darajasida) ba'zan oldinga, ba'zan orqaga siljib chiqishini xabar qildi.
  Tahlil: ikkalasi ham bir xil `words` massividan foydalanadi, shuning uchun **tasodifiy
  yo'nalishdagi** (ba'zan oldinga, ba'zan orqaga) siljish placement kodidagi bug emas — bu
  bugungi ertalabki `hybrid_transcriber.py` alignment sifatiga borib taqaladi: Gemini so'zi
  Whisper so'ziga **aniq** (normalizatsiyadan keyin ham) mos kelmasa (masalan imlo biroz
  boshqacha), `_align_words()` uni "replace" blokga tashlab, faqat **interpolatsiya**
  (taxmin) qilar edi. Butun gap/cue darajasida bu sezilmaydi (quti baribir ekranda turadi),
  lekin bitta so'z alohida chiqib-kirganda taxminiy vaqt darhol sezilarli bo'ladi.
  - Tuzatildi: `_align_words()`ga ikkinchi, **fuzzy** moslashtirish qatlami qo'shildi —
    "replace" blok ichida (odatda bir xil so'z, faqat boshqacha yozilgan/imlo) har Gemini
    so'zi ishlatilmagan Whisper so'zlari orasidan `difflib` belgi-o'xshashligi (ratio) bo'yicha
    eng яqinini qidiradi (`_FUZZY_MATCH_THRESHOLD = 0.5`), topilsa **haqiqiy** Whisper vaqtini
    oladi (interpolatsiya emas). Butunlay boshqa so'z (past o'xshashlik) hamon avvalgidek
    interpolatsiya qilinadi — o'zgarmadi.
  - **Sinovdan o'tkazildi (audio'siz)**: yaqin imlo farqi ("kasalxonasida"/"kasalxonada") —
    endi to'g'ri Whisper vaqtini oldi; butunlay boshqa so'z ("mashina"/"bemorlar") — hamon
    interpolatsiya qilindi (kutilganidek, o'zgarmadi). `py_compile` xatosiz o'tdi.
  - Bot to'xtatilib qayta ishga tushirildi (config/kod o'zgarishi kuchga kirishi uchun shart).
- Foydalanuvchi yana bir, hali **noaniq** so'rov qildi: tez gapirilgan joylarda animatsiya
  vaqti "o'ta kam" bo'lishi (yoki hatto qo'yilmasligi) kerakmi — bu avvalgi so'rovlardagi
  "minDurationSeconds oshirib o'qishga qulay qilish" bilan zid ko'rinishi mumkin.
  **Aniqlashtirilmadi, keyingi safar so'rash kerak.**
- **Hali sinovdan o'tkazilmagan**: foydalanuvchi Premiere'da qayta sinab: (1) progress
  ko'rinayaptimi, (2) kinetic so'zlar endi audio bilan aniqroq sinxronmi (ayniqsa avval
  siljigan joylarda).

### Keyingi qadam
- Foydalanuvchidan tasdiqlash kerak: kinetic sync yaxshilandimi (real video bilan).
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish, ancha to'plandi).

## 2026-08-06 (davomi 5) — Tez gapirilgan joylarda kinetic animatsiya o'tkazib yuboriladi

- Oldingi ziddiyatli so'rov aniqlashtirildi (AskUserQuestion): foydalanuvchi **"tez joylarda
  animatsiya umuman qo'yilmasin"** variantini tanladi (floor'ni pasaytirish yoki tabiiy
  tezlikda qoldirish emas).
- Amalga oshirildi: `host/index.jsx`da yangi `FAST_SKIP_SLOT_SECONDS = 0.22` konstantasi —
  `insertKineticText()` endi har so'z uchun "slot" (keyingi so'z boshlangunча qancha vaqti
  bor) ni oldindan hisoblab, shundan kam bo'lsa (0.22s dan kam) — o'sha so'zga umuman MOGRT
  qo'ymaydi (`skippedFast` hisoblagichi bilan o'tkazib yuboriladi), faqat progress hodisasini
  yuboradi. Oddiy subtitr (agar mavjud bo'lsa) o'zgarishsiz qoladi — u alohida overlay.
  - Agar **barcha** so'zlar tez bo'lib o'tkazib yuborilsa, endi "ERROR" emas, tushunarli xabar
    qaytariladi ("Butun matn juda tez gapirilgani uchun ... animatsiyasiz qoldirildi").
    Aks holda natija xabarida "N ta so'z tez gapirilgani uchun animatsiyasiz qoldirildi"
    eslatmasi chiqadi.
- `node --check` va `install.bat` xatosiz o'tdi.
- **Hali sinovdan o'tkazilmagan**: Premiere'da haqiqiy tez gapirilgan video bilan sinash
  kerak — chegara qiymati (0.22s) hozircha taxminiy, real ko'rinishga qarab sozlash kerak
  bo'lishi mumkin (juda ko'p so'z o'tkazib yuborilsa — pasaytirish, hamon tez tuyulsa —
  oshirish).

### Keyingi qadam
- Foydalanuvchi Premiere'da tekshirishi kerak: (1) progress-indikator, (2) kinetic sync
  yaxshilanishi, (3) tez gapirilgan joylarda animatsiya to'g'ri o'tkazib yuborilishi va
  0.22s chegarasi mos keladimi.
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish, ancha to'plandi).

## 2026-08-06 (davomi 6) — Oddiy subtitr uchun standart stil o'zgartirildi

- Foydalanuvchi oddiy "Subtitr yaratish"da animatsiya (fade) butunlay bo'lmasligini xohladi.
  Tekshirildi: 20 ta MOGRT'ning hech birida animatsiya davomiyligi alohida sozlanadigan
  parametr sifatida ochilmagan (faqat matn/katta-harf bor) va klip tezligini o'zgartirishning
  ExtendScript'da yo'li yo'q — ya'ni fade'ni dasturiy tezlashtirib bo'lmaydi. Ikki variant
  taklif qilindi (native caption'ga qaytish vs MOGRT'da qolib eng qisqasini tanlash) — **MOGRT
  variant, qo'lda tanlash** orqali davom etildi.
  - Foydalanuvchi preview kartalardan ko'rib, **`Plain_word_down`**ni tanladi.
  - `DEFAULT_CAPTION_STYLE` (`host/index.jsx`, `insertCaptionMogrt()` standart stili)
    `Plain_fade_on` dan `Plain_word_down`ga o'zgartirildi. `node --check` va `install.bat`
    xatosiz o'tdi.
- **Hali sinovdan o'tkazilmagan** — foydalanuvchi Premiere'da yangi standart stilni ko'rishi
  kerak.
- Kelajakda: agar bu ham "juda animatsiyali" tuyulsa, hozircha yagona yechim — boshqa
  stillardan birini sinab ko'rish (preview orqali) yoki oddiy "Subtitr yaratish" tugmasiga
  ham stil-tanlash UI qo'shish (hali qurilmagan, so'ralganda qo'shish mumkin).

## 2026-08-06 (davomi 7) — Subtitr yaratish tezligi: Whisper large-v3 → small

- Foydalanuvchi "Subtitr yaratish" juda sekin (ko'p vaqt olyapti) deb shikoyat qildi.
  Sabab: `srt_bot/.env`da `WHISPER_MODEL_SIZE=large-v3` (CPU'da, `int8`) — bu 2026-08-05
  sessiyasida **so'z tanish aniqligi** uchun махсус o'rnatilgan edi. Lekin bugungi
  `hybrid_transcriber.py` arxitekturasidan keyin bu asosan **keraksiz bo'lib qoldi**: yakuniy
  matn endi Gemini'dan keladi (Whisper faqat vaqt-langar sifatida, fuzzy-moslashtirish
  orqali ishlatiladi) — ya'ni Whisper qanchalik "to'g'ri eshitishi" endi unchalik muhim emas,
  faqat vaqt-belgilash sifati muhim.
  - Tuzatildi: `WHISPER_MODEL_SIZE` `large-v3`dan **`small`**ga qaytarildi (`config.py`dagi
    original standart qiymat ham shu edi — katta modelga faqat vaqtinchalik o'tilgan edi).
    Bot to'xtatilib qayta ishga tushirildi (jarayonni to'xtatishda port 8899 band bo'lib
    qolgan holat ham tuzatildi — eski python jarayon zombie qolib ketgan edi, `Get-Process
    python | Stop-Process -Force` bilan tozalandi).
- `spelling_correction.py` (Whisper so'zlarini alignment uchun standart imloga keltiruvchi
  qo'shimcha Gemini chaqiruvi) hozircha **o'zgartirilmadi** — bu vaqt jihatidan katta
  ta'sir qilmaydi (bitta batched so'rov), lekin fuzzy-alignment sifatiga hali ham yordam
  beradi.
- **Hali sinovdan o'tkazilmagan**: foydalanuvchi haqiqiy video bilan "Subtitr yaratish"ni
  qayta sinab, tezlik sezilarli yaxshilanganini va so'z/vaqt sifati hamon qoniqarli
  ekanligini tasdiqlashi kerak (birinchi urinishda `small` model fayli hali yuklab olinmagan
  bo'lsa avtomatik yuklanadi — bir martalik qo'shimcha kutish bo'lishi mumkin).

### Keyingi qadam
- Foydalanuvchi tezlik va sifatni tasdiqlashi kerak. Agar hamon sekin bo'lsa yoki sifat
  yetarli bo'lmasa — `WHISPER_MODEL_SIZE`ni oraliq qiymatga (`medium`) qaytarish yoki
  `WHISPER_DEVICE`ni GPU'ga o'tkazish muhokama qilinishi kerak.
- Ishlagach: git'da commit qilish (hozircha faqat lokal o'zgarish, juda ko'p to'plandi).

## 2026-08-07 — Gemini narx/kvota muhokamasi + bot deploy oldidan QA (interfeys tekshiruvi)

- Foydalanuvchi bepul Gemini kvotasi (429 xatolik, kuniga 20 so'rov) tugagach, qaysi
  modelga o'tish/billing yoqish haqida so'radi. Tekshirildi (rasmiy narx sahifasi): eski
  `gemini-flash-latest` (moving alias) hozir `gemini-3.6-flash`ga ishora qilar ekan —
  bashorat qilib bo'lmaydigan narx/kvota xavfi. **Pinned (qattiq belgilangan) modellarga
  o'tildi**: transkripsiya (audio, aniqlik muhim) — `gemini-2.5-flash`; sodda matn ishlari
  (imlo tuzatish, B-roll kalit so'z) — `gemini-2.5-flash-lite` (arzonroq). O'zgartirilgan
  joylar: `srt_bot/gemini_transcriber.py`, `srt_bot/spelling_correction.py`,
  `PluginProperties.java` (yangi `gemini.lite-model` maydoni qo'shildi),
  `application.properties`, `BrollSceneService.java` (endi lite-model ishlatadi). Java
  qayta build qilindi, bot/backend qayta ishga tushirildi.
- Narx/marja hisob-kitobi qilib berildi: audio narxi 32 token/soniya (rasmiy hujjat),
  2 daqiqalik video ~$0.006, 10 daqiqalik ~$0.03. 99 000 so'm/oy narxda foydalanuvchi
  darajasiga qarab ~85-99% sof foyda marjasi (Gemini xarajati hisobga olinganda).
- **AWS**: foydalanuvchi 6 oylik bepul AWS krediti ($200, 2025-iyuldan keyingi yangi
  qoida) olgan. Tavsiya: `t3.medium` (2vCPU/4GB, ~$30/oy) dan boshlash, kerak bo'lsa
  `t3.large`ga o'tish. 6 oydan keyingi taxminiy xarajat (t3.medium+disk) ~$33/oy
  (~395 000 so'm) — bu narxda ~5 ta obunachi hosting xarajatini yopadi, qolgani sof foyda.

- **Foydalanuvchi so'rovi: "bugun deploy qilishdan oldin bot interfeysini to'liq
  tekshirib, kamchiliklarni tuzataylik".** `srt_bot`ning barcha fayllari
  (`bot.py`, `keyboards.py`, `licensing_handlers.py`, `licensing.py`, `config.py`,
  `media.py`, `srt_builder.py`) qatma-qat o'qib chiqildi. **To'rtta jiddiy muammo
  topildi va tuzatildi**:
  1. **Bepul kvota erta sarflanardi**: `licensing.check_and_use_free_quota()` foydalanuvchi
     fayl yuklagan ZAHOTI kunlik limitni yozib qo'yardi — keyin format tanlamasa yoki
     transkripsiya xato bersa ham (masalan Gemini xatosi), foydalanuvchi natija olmay
     kunlik urinishini behuda yo'qotardi. Tuzatildi: `has_free_quota_today()` (faqat
     o'qiydi, erta rad javobi uchun) va `record_free_usage()` (faqat **muvaffaqiyatli**
     natija — `answer_document` yuborilgandan keyin — chaqiriladi) ga bo'lindi.
  2. **20MB+ fayl butunlay ishlamas edi (kritik)**: `.env`da `TELEGRAM_API_ID`/
     `TELEGRAM_API_HASH`/`LOCAL_BOT_API_URL` bor edi (local Bot API server uchun
     mo'ljallangan, kattaroq fayl yuklash imkonini beradi), lekin **kodda hech qayerda
     ishlatilmagan** edi — bot standart bulutli Telegram Bot API orqali ishlar edi, u esa
     fayl yuklab olishni qattiq **20MB** bilan cheklaydi (rasmiy hujjatda tasdiqlangan).
     `MAX_FILE_SIZE_BYTES` esa 500MB deb qo'yilgan edi va `on_media`dagi yuklab olish kodi
     `try/except`siz edi — ya'ni 20-500MB oralig'idagi (juda oddiy holat!) har qanday video
     **jim** (hech qanday xabarsiz) muvaffaqiyatsiz tugardi. Foydalanuvchi bilan
     kelishildi: hozircha **tezkor tuzatish** — `MAX_FILE_SIZE_BYTES` haqiqiy 20MB'ga
     tushirildi, aniq xabar bilan (`TOO_LARGE_TEXT`), va yuklab olish endi `try/except`
     bilan himoyalangan (`DOWNLOAD_FAILED_TEXT`). **500MB'gacha to'liq qo'llab-quvvatlash
     AWS'ga deploy qilinganda birga sozlanadi** (Linux'da Docker orqali `telegram-bot-api`
     server ishga tushiriladi — Windows'da rasmiy build yo'q, ancha murakkabroq bo'lardi).
  3. **`<code>` teglari hech qachon render bo'lmagan**: `licensing_handlers.py`dagi eng
     muhim xabarlar (qurilma kodi, karta raqami, faollashtirish tokeni) — aynan
     foydalanuvchi **nusxalashi** kerak bo'lgan joylar — `<code>...</code>` bilan
     yozilgan, lekin botda `parse_mode` hech qayerda (global ham, chaqiruv darajasida
     ham) sozlanmagan edi. Natijada foydalanuvchi ekranida xom `<code>ABCD-1234</code>`
     matni chiqardi (chiroyli nusxalanadigan blok o'rniga). Tuzatildi: `bot.py`da
     `Bot(..., default=DefaultBotProperties(parse_mode=ParseMode.HTML))`.
  4. **Qurilma kodini kichik harfda kiritsa bot javob bermas edi**: `DEVICE_CODE_RE` katta-
     kichik harfga sezgir edi (`^[A-Z0-9]{4}-...$`, `re.IGNORECASE` yo'q); handler ichida
     `.upper()` bo'lsa-da, TASHQI filtr (qaysi xabarlar shu handlerga tegishli ekanini
     hal qiluvchi) kichik harfli kodni umuman handlerga yubormas edi — foydalanuvchi
     kodni qo'lda kichik harfda yozsa (nusxalash o'rniga), bot **hech narsa javob
     bermasdi**. Tuzatildi: pattern ichiga `(?i)` qo'shildi (`DEVICE_CODE_RE.pattern`
     xususiyati flag'siz qatorni qaytargani uchun `re.compile(..., re.IGNORECASE)`
     alohida ishlamas edi — flag pattern matniga bevosita joylashtirilishi shart edi).
  - **Kichikroq, kod-bilan-bog'liq bo'lmagan topilma (tuzatilmadi, faqat qayd etildi)**:
    Python bot (`srt_builder.py`) hamon eski **belgi-soni** asosidagi "premium"/"1"/"2"/"3"
    style tizimini ishlatadi — Java/Premiere tomoni esa 2026-07-31da **so'z-soni**
    asosidagi tizimga o'tkazilgan edi. Ikkalasi endi boshqa-boshqa algoritm — funksional
    xato emas (ikkalasi ham "1 qator = 1 qator" kafolatini beradi), lekin muvofiqlik
    yo'q. Foydalanuvchidan so'ralmadi, hozircha o'zgartirilmadi.
  - `py_compile` barcha o'zgartirilgan fayllar uchun xatosiz o'tdi. Bot qayta ishga
    tushirildi, barcha 4 tuzatish kuchga kirgan holda ishlab turibdi.
- **Hali sinovdan o'tkazilmagan**: foydalanuvchi haqiqiy Telegram orqali to'liq oqimni
  (video yuborish → format tanlash → SRT olish; qurilma kodi yuborish → to'lov
  ko'rsatmasi endi to'g'ri `<code>` blok bilan chiqishi → admin tasdiqlash) sinashi kerak.

### Keyingi qadam
- Foydalanuvchi Telegram'da botni haqiqatan sinab, yuqoridagi 4 tuzatishni tasdiqlashi
  kerak (ayniqsa `<code>` bloklari va 20MB xabari).
- Ishlagach: git'da commit qilish (juda ko'p o'zgarish to'plandi, hali push qilinmagan).

## 2026-08-07 — AWS deploy amalga oshirildi (server topish, tozalash, HTTPS, systemd)

- **Raqobatchi tahlili**: foydalanuvchi `C:\Users\DELL\Downloads\UzCaption-Plugin` (caption.uz,
  @uzcaptions_bot) degan boshqa CEP pluginni yubordi — solishtirib chiqildi. Muhim topilmalar:
  (1) ular Gemini/Pexels/Giphy kabi barcha AI so'rovlarini **serverga yashirgan** (klientda
  hech qanday kalit yo'q) — bizning rejalashtirilgan "server-proxy" yo'nalishimizni
  tasdiqladi; (2) ularda **avtomatik yangilanish** mexanizmi bor (server `latest_version`
  qaytaradi, ZIP yuklab, tekshirib, keyingi Premiere ochilishida joylashtiradi,
  backup+rollback bilan); (3) audio uchun `seq.exportAsMediaDirect()` (Premiere'ning rasmiy
  sequence-audio-eksport API'si, `.epr` preset bilan) ishlatishadi — bizning
  `findSourceTimeZeroOffset()` orqali manba faylni topib offset hisoblash yondashuvimizdan
  farqli, bu offset-bug'larini butunlay yo'q qiladi (kelajakda ko'chirish tavsiya etiladi).
  Ularning manifest'ida `ExtensionBundleName="Uzbek AI Captions"` va papka nomi ham
  `uzbek-ai-captions` ekani qayd etildi (Bundle ID'lar farqli, to'g'ridan-to'g'ri nusxa
  emas) — ehtimol tanish hamkor (Xojiakbarxon)ning mahsuloti.
- Foydalanuvchi uchta katta ishni ("AWS deploy + server-proxy", "auto-update",
  "sequence-audio eksport") **hammasini ketma-ket** qilishni so'radi — shu sessiyada faqat
  **AWS deploy** qismi to'liq bajarildi (quyida), qolgan ikkitasi hali boshlanmagan.

- **AWS hisob chalkashligi (muhim, ehtiyot chorasi sifatida qayd etiladi)**: AWS CLI
  standart profili (`default`, hisob `339640512462`) foydalanuvchining **o'zi emas**
  ekani aniqlandi — u yerda "TaskApp" degan **boshqa, faol** loyiha (Docker: Java backend +
  Postgres, hozir ham so'rovlar kelayotgan edi) ishlab turgan edi. Foydalanuvchi buni
  **tasdiqlamadi** ("Mutal" nomi chalkashtirdi) — **hech narsaga tegilmadi**. To'g'ri hisob
  aniqlandi: `205080700819` (mavjud `shox-med` profili orqali, garchi nomi chalg'itsa ham) —
  foydalanuvchi buni o'zining haqiqiy hisobi deb **aniq tasdiqladi**.
- **Server tozalandi**: `205080700819` hisobidagi mavjud instans (`i-029513291443dbb52`,
  `shox-med-platform`, `13.53.201.43`, t3.small, eu-north-1) da oldin "Shox Med Platform"
  (boshqa, tibbiyot-mavzusidagi loyiha — nginx + PostgreSQL 14 + systemd xizmati) ishlab
  turgan edi. Foydalanuvchi **aniq tasdiqlagach**: `shox-med.service` va
  `postgresql@14-main.service` to'xtatildi va avtostartdan o'chirildi (**ma'lumotlar
  o'chirilmadi**, diskda saqlanib qoldi — kerak bo'lsa tiklash mumkin).
- **Domen**: foydalanuvchida pullik domen yo'q edi — bepul **DuckDNS** orqali yangi
  subdomain olindi: **`aitilmoch.duckdns.org`** (loyihaning yangi nomi muhokamasi
  jarayonida "Tilmoch" tavsiya qilingandan keyin tanlangan). DuckDNS update API orqali
  server IP'siga (`13.53.201.43`) bog'landi.
- **HTTPS**: `certbot --nginx` orqali haqiqiy Let's Encrypt sertifikati olindi
  (`aitilmoch.duckdns.org`, 2026-11-05gacha amal qiladi, avtomatik yangilanadigan). nginx
  `/etc/nginx/sites-available/aitilmoch` — port 80/443 dan `127.0.0.1:8899`ga (bot/litsenziya
  serveri) proxy qiladi, `client_max_body_size 300M` (katta WAV yuklashlar uchun).
- **Kod deploy**: `srt_bot/` (venv/cache/log/db'siz) serverga ko'chirildi
  (`~/uzbek-ai-captions/srt_bot`), Python 3.10 venv yaratildi (avval `python3.10-venv`
  paketi yetishmagan edi, o'rnatildi), `requirements.txt` to'liq o'rnatildi
  (faster-whisper, aiogram, google-genai va h.k.).
- **systemd xizmati**: `uzbek-ai-captions-bot.service` yaratildi (`Restart=always`,
  loglar `bot.log`ga yoziladi, avtostart yoqilgan). **Mahalliy (Windows) bot avval
  to'xtatildi** (bitta Telegram token bilan ikkita joyda bir vaqtda ishlay olmaydi) —
  bot endi **faqat serverda** ishlaydi.
- **Java tomoni yangilandi**: `application.properties`dagi `plugin.license.server-url` va
  `plugin.whisper.server-url` endi `https://aitilmoch.duckdns.org/...` ga ishora qiladi
  (avval `http://localhost:8899/...`). Jar qayta build qilindi (`mvnw package` — eski
  jar java jarayoni band qilib turgani uchun avval to'xtatildi), backend qayta ishga
  tushirildi. **Sinovdan o'tkazildi**: mahalliy backend `GET /api/license/status` orqali
  yangi HTTPS serverga muvaffaqiyatli murojaat qildi (`reason: not_found` — kutilgan,
  chunki yangi server ma'lumotlar bazasi toza, bu kompyuter hali faollashtirilmagan).
- **Hozirgi holat**: server end-to-end ishlab turibdi (`https://aitilmoch.duckdns.org/license/health`
  → `{"status":"ok"}`). Foydalanuvchi @srt_subtitr_bot'ga video yuborib sinashi,
  va bu qurilmani (device code `CKFD-S2UX-487E`) admin sifatida yangi serverda qayta
  faollashtirishi kerak (eski litsenziya ma'lumotlari yangi serverga ko'chirilmagan).

### Keyingi qadam
- Foydalanuvchi Telegram bot orqali to'liq oqimni (video → SRT, qurilma kodi → admin
  avtofaollashtirish) yangi serverda sinashi kerak.
- Qurilma kodini (`CKFD-S2UX-487E`) yangi serverda qayta faollashtirish (admin sifatida
  botga yuborish orqali).
- **Navbatdagi katta ishlar** (foydalanuvchi so'ragan, hali boshlanmagan): (1) Gemini/
  Pexels/Giphy so'rovlarini serverga proxy qilish (API kalitlarini himoya qilish +
  klonlanishning oldini olish), (2) CEP panel uchun avtomatik yangilanish mexanizmi
  (UzCaption'nikiga o'xshab), (3) Premiere audio eksportini `seq.exportAsMediaDirect()`ga
  o'tkazish (offset bug'larini yo'qotish uchun).
- Ishlagach: git'da commit qilish (juda ko'p o'zgarish to'plandi, hali push qilinmagan).

## 2026-08-07 (davomi) — Server-proxy: Gemini tarjima + B-roll endi AWS orqali

- Foydalanuvchi tasdiqlagach, uchta navbatdagi ishni ketma-ket boshladik. **Birinchisi —
  server-proxy — to'liq bajarildi**:
  - **Python (server)**: `gemini_transcriber.py`ga `translate_to` parametri qo'shildi
    (Java'dagi `TRANSLATION_LANGUAGES`/prompt aynan ko'chirildi). Yangi `broll.py` —
    `BrollSceneService.java` (sahna guruhlash) + `PexelsService.java` + `GiphyService.java`
    ning to'liq Python porti (`aiohttp` orqali async so'rovlar). Yangi `proxy_server.py` —
    ikkita endpoint: `POST /transcribe-translate` (WAV + `?translateTo=`, litsenziya bilan
    himoyalangan, `/transcribe` bilan bir xil chegara/naqsh) va `POST /broll-suggestions`
    (JSON segmentlar → sahna+nomzodlar, litsenziya bilan himoyalangan). `licensing_server.py`
    ga ulandi. `config.py`ga `PEXELS_API_KEY`/`GIPHY_API_KEY` qo'shildi.
  - **Java (klient)**: `GeminiTranscriptionService` endi Gemini'ga to'g'ridan-to'g'ri emas,
    yangi serverga (`plugin.translate.server-url`) murojaat qiladi (Whisper xizmati bilan
    bir xil naqsh — device-code+token header, retry). `BrollSceneService` xuddi shunday
    qayta yozildi (`plugin.broll.server-url`) — endi bitta HTTP chaqiruv orqali sahna+barcha
    nomzodlarni oladi, **`PexelsService.java` va `GiphyService.java` butunlay o'chirildi**
    (endi kerak emas). `BrollController` shunga mos yangilandi (endi faqat
    `BrollSceneService`+`GifConversionService` kerak — `/api/broll-download` o'zgarmadi,
    chunki u faqat ochiq media-URL'ni yuklaydi, kalit kerak emas edi).
  - **Config**: `PluginProperties`dan `Gemini`/`Pexels`/`Giphy` ichki klasslari olib
    tashlandi, o'rniga `Translate`/`Broll` (`server-url` bilan) qo'shildi.
    `application.properties`ga yangi ikkita server-url qo'shildi (AWS domenga ishora
    qiladi). **`application-local.properties`dan `plugin.gemini.api-key`,
    `plugin.pexels.api-key`, `plugin.giphy.api-key` butunlay olib tashlandi** — bu
    aynan bugungi maqsad edi: bu kalitlar endi tarqatiladigan plagin nusxasida
    umuman yo'q, faqat AWS serverning `.env`sida.
  - Java qayta build qilindi (`mvnw package`, eski jar java jarayoni band qilib
    turgani uchun avval to'xtatildi), backend qayta ishga tushirildi.
  - Yangi endpointlar serverga ko'chirildi, `.env`ga `PEXELS_API_KEY`/`GIPHY_API_KEY`
    qo'shildi, bot xizmati qayta ishga tushirildi. **Sinovdan o'tkazildi**: ikkala yangi
    endpoint ham litsenziyasiz so'rovni to'g'ri `402` bilan rad etadi (haqiqiy litsenziya
    bilan to'liq oqim hali sinalmagan — dev kompyuter yangi serverda hali qayta
    faollashtirilmagan).
- **Hali kerak**: foydalanuvchi qurilma kodini (`CKFD-S2UX-487E`) admin sifatida botga
  qayta yuborib, shu kompyuterni yangi serverda faollashtirishi, so'ng haqiqiy tarjima va
  B-roll so'rovlarini Premiere'da sinashi kerak.

### Keyingi qadam
- Foydalanuvchi qurilmani qayta faollashtirib, tarjima+B-roll'ni haqiqiy sinash.
- Ishlagach: git'da commit qilish (juda ko'p o'zgarish to'plandi, hali push qilinmagan).

## 2026-08-07 (davomi 2) — Avtomatik yangilanish + sequence-audio eksport + AE + responsive

- **Avtomatik yangilanish** (UzCaption naqshiga asoslanib): `main.js`ga to'liq mexanizm
  qo'shildi — `PLUGIN_VERSION` (`1.1.0`, manifest bilan mos), `checkForUpdate()` (boot'da
  serverdan `GET /plugin/version` so'raydi), yangi versiya topilsa panel tepasida
  `#update-banner` ko'rinadi ("Yangilash" tugmasi bilan). Bosilsa `stageUpdate()` — ZIP'ni
  yuklab, tekshirib (`verifyPackage` — kerakli fayllar bormi, versiya mos keladimi),
  extensions papkasi yonidagi vaqtinchalik `.uzbek-ai-captions-pending`ga joylaydi.
  `applyPendingUpdate()` panel boot'ida chaqiriladi — oldingi safar tayyorlab qo'yilgan
  yangilanish bo'lsa, eski nusxani backup qilib, ustiga yozadi (xato bo'lsa avtomatik
  qaytaradi). **Server tomoni**: yangi `srt_bot/plugin_release.py` —
  `GET /plugin/version`/`GET /plugin/download` (litsenziyasiz, ochiq — bu shunchaki o'rnatish
  paketi). `~/uzbek-ai-captions/srt_bot/plugin-release/` papkasiga joriy pluginning ZIP'i
  (`uzbek-ai-captions.zip`) va `VERSION` fayli qo'yildi, serverga yuklandi, sinovdan
  o'tkazildi (ikkala endpoint ham to'g'ri javob berdi).
- **Sequence-audio eksport** (offset bug'larini yo'qotish uchun): raqobatchi (UzCaption)
  tahlilidan ilhomlanib, `host/index.jsx`ga yangi `exportActiveSequenceAudio(outputPath,
  presetPath)` — Premiere'da `sequence.exportAsMediaDirect()` (rasmiy API, `.epr` preset
  bilan) orqali audio to'g'ridan-to'g'ri **sequence'ning o'zidan** eksport qilinadi
  (`findSourceTimeZeroOffset()` orqali manba faylni topib offset hisoblash o'rniga). Bu
  degani — natija WAV har doim sequence'ning o'z 0-vaqtidan boshlanadi, shuning uchun
  so'z/cue vaqtlarini joylashtirishda **offset kerak emas** (har doim 0). `.epr` preset
  fayli (`audio_wav_mono_16k.epr`, foydalanuvchi bilan kelishilgan holda raqobatchi
  papkasidan olindi — sof texnik audio-format sozlamasi) `host/assets/export-presets/`ga
  qo'shildi. `main.js`da yangi `exportSequenceAudioForTranscribe()` — bu funksiya audio
  eksport qilib, natija yo'lini "Subtitr yaratish" va B-roll/kinetic'ning umumiy
  `transcribeForSegments()`ga `filePath` sifatida beradi (Java backend'ga hech qanday
  o'zgarish kerak emas edi — WAV'ni yana ffmpeg orqali WAV'ga "qayta kodlash" zararsiz).
  Barcha `importSrt`/`insertKineticText` chaqiruvlarida `sourceMediaPath` endi doim bo'sh
  qator (offset endi har doim 0).
- **After Effects to'liq qo'llab-quvvatlash** (avval "Subtitr yaratish" AE'da butunlay
  ishlamas edi — `getActiveMediaPath()` AE'ni hard-block qilardi):
  - `getActiveMediaPath()` endi AE uchun faol kompozitsiya nomini qaytaradi
    (`_ae_findActiveComp()`, yangi helper).
  - `exportActiveSequenceAudio()` AE uchun yangi `_ae_exportActiveCompAudio()`ga
    yo'naltiriladi — AE'ning render queue'si orqali audio eksport qiladi (WAV/AIFF output
    module shablonlaridan birini sinab ko'radi, faqat shu comp render qilinishi uchun
    boshqa navbatdagi elementlarni vaqtincha o'chiradi).
  - **Muhim tuzatish**: eski `importSrtAfterEffects()` subtitrlarni foydalanuvchining
    haqiqiy kompozitsiyasiga QO'SHISH o'rniga, har doim **yangi, alohida, 1920x1080
    hardcoded** composition yaratardi (foydalanuvchi qo'lda o'z kompozitsiyasiga
    ko'chirishi kerak bo'lardi) — bu funksiya hech qachon asosiy oqimga ulanmagani uchun
    (AE avval `getActiveMediaPath()`da bloklangan) sinalmagan/ishlatilmagan holda qolgan
    edi. To'liq qayta yozildi: endi **faol kompozitsiyaning o'ziga** matn qatlamlari
    qo'shadi, haqiqiy shrift/rang/kontur stili bilan (Arial Bold, oq matn + qora kontur,
    komp o'lchamiga nisbatan hajm, pastda markazlashgan) — Premiere'dagi MOGRT-subtitr
    vizual natijasiga yaqinlashtirildi. Qayta-generatsiya eskisini almashtiradi (stack
    emas, `lastAeCaptionLayers`/`clearTrackedLayers` — Premiere'dagi bir xil naqsh).
  - **Diqqat — hali AE'ga ko'chirilmagan**: Kinetic typography (MOGRT-asosida, faqat
    Premiere API'sida bor) va B-roll (`insertBroll`) hamon faqat Premiere'da ishlaydi —
    bu ataylab qoldirilgan (vaqt maqsadida ustuvorlik: asosiy "Subtitr yaratish" ikkala
    hostda ham ishlashi ta'minlandi).
- **Responsive dizayn**: `.kinetic-grid`/`.broll-grid` qattiq 2-3 ustunli
  (`1fr 1fr`/`1fr 1fr 1fr`) o'rniga `repeat(auto-fill, minmax(...))` ga o'zgartirildi —
  endi panel har qanday kenglikda (manifest MinSize 300px'gacha) kartalarni to'g'ri
  qatorlarga qayta joylaydi, o'rniga sig'maydigan/kesilgan holat bo'lmaydi. Header'dagi
  brend matni (`brand-title`/`brand-sub`) tor joyda kesilib, "..." bilan ko'rsatiladigan
  qilindi (`text-overflow: ellipsis`) — oldin tor holatda tashqariga toshib ketishi
  mumkin edi. `body`ga `overflow-x: hidden` xavfsizlik cho'g'i sifatida qo'shildi.
- **Mac uchun o'rnatuvchi**: yangi `cep-extension/install.command` (bajarilishi mumkin
  qilib belgilangan, `chmod +x`) — `install.bat`ning aynan Mac ekvivalenti (Mac CEP
  extensions papkasiga nusxalaydi, `defaults write` orqali PlayerDebugMode yoqadi).
- `node --check` (main.js, index.jsx) xatosiz o'tdi.
- **Hali sinovdan o'tkazilmagan**: extension hali qayta o'rnatilmagan (foydalanuvchi
  boshqa yo'nalishga o'tishni so'ragani uchun to'xtatilgan edi). Haqiqiy Premiere/AE
  sinovi, auto-update to'liq oqimi (eski versiyadan yangisiga), va AE'da audio eksport +
  subtitr qo'shish birortasi ham hali tekshirilmagan.

### Keyingi qadam
- Extension'ni qayta o'rnatib (`install.bat`), Premiere'da: (1) sequence-audio eksport
  orqali subtitr yaratish, (2) auto-update banner ko'rinishi (server versiyasi
  `main.js`dagi `PLUGIN_VERSION`dan yangi bo'lgani uchun ko'rinishi kutiladi — buni ham
  tekshirish kerak, chunki ikkalasi hozir bir xil `1.1.0`), sinash kerak.
- AE'da (agar mavjud bo'lsa): kompozitsiya ochib "Subtitr yaratish"ni sinash — audio
  eksport + matn qatlamlari to'g'ri qo'shilishini tekshirish.
- Kinetic va B-roll'ni AE'ga ko'chirish — hali qilinmagan, kerak bo'lsa keyingi ish.
- Ishlagach: git'da commit qilish (bu sessiyada juda ko'p o'zgarish to'plandi).

## 2026-08-07 (davomi 3) — Versiya 1.2.0 + Gemini model 404 tuzatildi + responsive kuchaytirildi

- **Auto-update "yangi emas" xatosi**: sababi — men keyingi ishlarni (AE, sequence-audio,
  responsive, Mac installer) qo'shgandan keyin versiyani qayta oshirmay, serverga eski
  ZIP'ni qayta yubormay qoldirib ketibman (ikkalasi ham "1.1.0" bo'lib qolgan, lekin
  mazmuni farq qilardi). Tuzatildi: versiya **1.2.0**ga oshirildi (`manifest.xml` +
  `main.js`), yangi ZIP+VERSION serverga qayta yuklandi, ikkalasi endi mos.
- **Responsive dizayn yanada kuchaytirildi**: foydalanuvchi Premiere panel guruhida juda
  tor joyga (masalan Frame.io panel yonida) joylashtirilganda elementlar yarimlab
  qirqilib qolishini xabar qildi. Sabab: CEP manifest'dagi MinSize (300px) amalda **qattiq
  chegara emas** — Premiere guruhlangan panellarni undan ham torroq siqishi mumkin.
  Qo'shimcha himoya qatlamlari: `.segment-btn`/`.toggle-label` endi min-width:0 + ellipsis
  bilan (matn tashqariga toshmaydi), yangi `@media (max-width: 380px)` — bu kenglikdan
  past bo'lsa header/combo-row/segmented/toggle-row barchasi vertikal qatorlarga
  yig'iladi (yonma-yon emas), `body` padding kichrayadi. `overflow-x: hidden` xavfsizlik
  cho'g'i sifatida qoldi.
- **Muhim topilma — Gemini model 404 xatoligi**: foydalanuvchi tarjima funksiyasini
  sinaganda `"Tarjima transkripsiyasi xatoligi (500): {"error": "transcription_failed"}"`
  oldi. Server logini tekshirib chiqilganda sabab aniqlandi: `gemini-2.5-flash` va
  `gemini-2.5-flash-lite` (bugun ertalab "arzon+aniq" deb tanlangan modellar) bu loyihaning
  API kaliti uchun **404 qaytarayotgan edi** — Google javobi: "This model
  models/gemini-2.5-flash is no longer available to new users" (modellar ro'yxatida hali
  ko'rinsa-da, YANGI kalitlar/loyihalar uchun berilmaydi — faqat oldindan ishlatgan
  hisoblarga qoldirilgan). Bu ertalabki narx-tadqiqoti umumiy blog manbalariga asoslangani
  uchun, real ishlashini tekshirmasdan tanlangan edi — xato shu yerdan kelib chiqqan.
  - **To'g'ri tuzatildi (taxmin qilmasdan, real so'rov bilan tasdiqlab)**: to'g'ridan-
    to'g'ri serverdan curl orqali bir nechta joriy modelni sinab ko'rildi —
    `gemini-3.5-flash` (3/3 muvaffaqiyatli) va `gemini-3.5-flash-lite` (muvaffaqiyatli)
    ishlar ekan. `gemini_transcriber.py` (transkripsiya, `gemini-3.5-flash`),
    `spelling_correction.py` va `broll.py` (`gemini-3.5-flash-lite`) shunga yangilandi.
    Serverga joylashtirildi, bot qayta ishga tushirildi, va **uchalasi ham haqiqiy Gemini
    so'rovi bilan sinovdan o'tkazildi** (SSH orqali to'g'ridan-to'g'ri, litsenziya
    qatlamidan tashqarida): transkripsiya (sintetik audio bilan — nutq yo'q deb to'g'ri
    bo'sh natija qaytardi), imlo tuzatish, va B-roll sahna-so'z topish — uchalasi ham
    xatosiz ishladi.
  - **Eslatma**: Java tomonida hech narsa o'zgartirilmadi — ertalabki server-proxy
    o'zgarishi tufayli Gemini model nomi endi FAQAT Python'da (serverda) belgilanadi.
- **Hali sinovdan o'tkazilmagan**: foydalanuvchi Premiere panelida haqiqiy tarjima va
  B-roll so'rovlarini (litsenziya orqali, to'liq oqim bilan) sinashi kerak — hozirgacha
  faqat server tomonida to'g'ridan-to'g'ri (litsenziyasiz) tekshirildi.

### Keyingi qadam
- Foydalanuvchi Premiere'da panelni qayta ochib: (1) tarjima funksiyasini, (2) B-roll
  funksiyasini, (3) tor joyga joylashtirilganda responsive ko'rinishni qayta sinashi
  kerak.
- Ishlagach: git'da commit qilish (bu sessiyada juda ko'p o'zgarish to'plandi).

## 2026-08-07 (davomi 4) — Haqiqiy foiz-asosidagi progress tizimi (background job)

- Foydalanuvchi raqobatchi (UzCaption)dagi kabi **haqiqiy foiz-progress** so'radi (ular
  background-job + polling ishlatishadi). "To'liq" variant tanlandi (tezkor/soxta emas).
- **Java backend to'liq qayta qurildi** — `POST /api/transcribe` endi natijani kutib
  turmasdan, darhol `{jobId}` qaytaradi:
  - Yangi `TranscriptionJobService` — har bir so'rov uchun fon oqimida (background
    thread, `ExecutorService`) ishlaydigan job yaratadi, holatini xotirada
    (`ConcurrentHashMap`) saqlaydi: `stage` (`audio`/`transcribing`/`building`/`done`) va
    `progressPercent` (0-100).
  - **Muhim cheklov (ochiq tan olindi)**: Whisper/Gemini o'zlari haqiqiy granular progress
    bermaydi (bir martalik so'rov, oqim emas) — shuning uchun "transcribing" bosqichida
    foiz **vaqt-asosida taxminiy hisoblanadi** (WAV faylning haqiqiy uzunligi
    o'qiladi — `readWavDurationSeconds()`, header'dan — va shunga qarab kutilgan davomiylik
    taxmin qilinadi, o'tgan vaqt/kutilgan vaqt nisbatida progress 10%→89% oralig'ida
    o'sib boradi). Bu — aksariyat shunday tizimlarning haqiqiy qilishi (100% aniq
    instrumentatsiya emas, chunki AI API'lar buni bermaydi), lekin statik spinnerdan
    ancha yaxshi tuyuladi.
  - Yangi `GET /api/transcribe/status/{jobId}` — joriy holatni qaytaradi, tugagach
    (`done`/`error`) job xotiradan o'chiriladi (bir martalik olish).
  - `TranscribeController` soddalashtirildi (validatsiya joyida qoldi, og'ir ish
    `TranscriptionJobService`ga ko'chirildi).
- **Panel (`main.js`)**: yangi `startTranscribeJob(requestBody)` — POST qilib jobId oladi,
  keyin `GET /api/transcribe/status/{jobId}`ni har 800ms'da so'raydi, natija tayyor
  bo'lguncha statusni "Matnga aylantirilmoqda... 47%" kabi jonli yangilab turadi.
  `generateBtn` va `transcribeForSegments()` (B-roll/kinetic uchun ishlatiladigan umumiy
  funksiya) ikkalasi ham shunga o'tkazildi.
- `mvnw package` orqali qayta build qilindi (avval ishlayotgan java jarayoni to'xtatilib),
  backend qayta ishga tushirildi. Yangi endpointlar **sinovdan o'tkazildi**: noto'g'ri
  fayl yo'li bilan to'g'ri xato qaytardi, mavjud bo'lmagan jobId uchun status endpoint
  to'g'ri "job topilmadi" javobini berdi.
- Versiya **1.3.0**ga oshirildi, panel qayta o'rnatildi, yangi ZIP+VERSION serverga
  yuklandi (versiyalar mos: 1.3.0).
- **Hali sinovdan o'tkazilmagan**: haqiqiy video bilan to'liq oqim (progress foizi real
  ko'rinishda qanday harakat qilishi, Whisper/Gemini haqiqiy vaqtiga qanchalik mos
  kelishi) hali Premiere'da tekshirilmagan.

### Keyingi qadam
- Foydalanuvchi haqiqiy video bilan "Subtitr yaratish"ni sinab, progress-foizining
  ko'rinishini tasdiqlashi kerak.
- Ishlagach: git'da commit qilish (bu sessiyada juda ko'p o'zgarish to'plandi).

## 2026-08-07 (davomi 5) — Kinetic: MOGRT kirish-animatsiyasini "chetlab o'tish" tajribasi

- Foydalanuvchi kinetic so'zlarning "biroz kechikib chiqishi" haqida qayta ta'kidladi va
  "animatsiyasini olib tashlab, o'z vaqtida chiqib-o'tadigan qilib" so'radi. MOGRT
  animatsiya tezligini o'zgartirish imkoni yo'qligi allaqachon tasdiqlangani uchun, **yangi
  texnik yondashuv sinaldi**: `insertKineticText()`da (`host/index.jsx`) har so'z klipi
  joylashtirilgandan keyin endi uning **in-point**i (klipning ichki material boshlanishi)
  `KINETIC_INTRO_SKIP_SECONDS = 0.15` soniyaga oldinga suriladi — bu klipning **timeline
  pozitsiyasini** (`.start`, `word.start`da qoladi) o'zgartirmasdan, faqat qaysi ICHKI
  frame'dan boshlab ko'rsatilishini siljitadi, ya'ni animatsiyaning "kirish" (fade/slide-in)
  qismini chetlab o'tishga harakat qiladi — matn darhol "settled" holatda ko'rinishi
  kutiladi. **Diqqat — bu hujjatlashtirilmagan/tasdiqlanmagan texnika** (bu loyihada
  birinchi marta sinalmoqda): in-point o'zgartirilgandan keyin `.start` qayta tasdiqlanadi
  (Premiere ikkalasini bog'lab qo'yishi ehtimoliga qarshi ehtiyot chorasi), lekin haqiqiy
  natija (matn chindan darhol to'liq ko'rinadimi, yoki juda qisqa MOGRT'larda in-point
  out-point'dan oshib xato berishi mumkinmi) **faqat Premiere'da sinab ko'rilgandan keyin**
  ma'lum bo'ladi.
- Versiya **1.3.1**ga oshirildi, panel qayta o'rnatildi, ZIP+VERSION serverga yuklandi.
- **Hali sinovdan o'tkazilmagan** — foydalanuvchi Premiere'da haqiqiy kinetic
  generatsiyasini sinab, so'zlar endi "kechikmasdan" chiqayotganini tasdiqlashi kerak.
  Agar hali ham kech tuyulsa yoki xato chiqsa — `KINETIC_INTRO_SKIP_SECONDS` qiymatini
  sozlash (oshirish/kamaytirish) yoki butunlay boshqa yondashuv kerak bo'lishi mumkin.

### Keyingi qadam
- Foydalanuvchi Premiere'ni to'liq qayta ishga tushirib (host `.jsx` o'zgargani uchun
  shart), kinetic typography'ni qayta sinab, natijani aytishi kerak.
- Ishlagach: git'da commit qilish (bu sessiyada juda ko'p o'zgarish to'plandi, hali push
  qilinmagan — sessiya juda katta bo'ldi, commit qilish tavsiya etiladi).

## 2026-08-07 (davomi 6) — Intro-skip oddiy subtitrga ham qo'llandi (1.3.2)

- Foydalanuvchi yana ta'kidladi: oddiy subtitr ham raqobatchidek animatsiyasiz bo'lsin.
  Lekin native Premiere caption'ga qaytish "1 qator→2 qator" bugini qaytaradi (buni
  ataylab MOGRT'ga o'tkazgan edik) — shuning uchun orqaga qaytmasdan, `insertKineticText`
  uchun yozilgan **intro-skip** texnikasi (yuqoridagi yozuvga qarang) umumiy
  `skipMogrtIntroAnimation(clip, startSeconds)` funksiyasiga chiqarilib,
  **`insertCaptionMogrt()`ga (oddiy subtitr) ham qo'llandi** — MOGRT_INTRO_SKIP_SECONDS
  = 0.15s. Shunday qilib qator-son to'g'riligi (MOGRT arxitekturasi) saqlanib qoladi,
  animatsiya esa (agar sinov tasdiqlasa) deyarli sezilmay qoladi.
- Versiya **1.3.2**ga oshirildi, panel qayta o'rnatildi, ZIP+VERSION serverga yuklandi.
- **Hali sinovdan o'tkazilmagan** — ikkalasi (kinetic va oddiy subtitr) uchun ham
  Premiere'da haqiqiy natija tekshirilishi kerak.

### Keyingi qadam
- Foydalanuvchi Premiere'ni to'liq qayta ishga tushirib, HAM kinetic HAM oddiy subtitrni
  qayta sinab: (1) qator soni to'g'rimi, (2) animatsiya kirishi sezilmay qolyaptimi.
- Ishlagach: git'da commit qilish (sessiya juda katta bo'ldi, tavsiya etiladi).

## 2026-08-07 (davomi 7) — Haqiqiy Premiere sinovi: subtitr vaqti buzilgani va responsive bug (1.3.3)

- Foydalanuvchi birinchi marta haqiqiy Premiere'da "Subtitr yaratish"ni oxirigacha sinab
  ko'rdi (skrinshot: "31/31 subtitr qo'shildi (14 ta qatlamda joylashtirildi)", 100%). Ikki
  muammo xabar qildi: (1) subtitr **ortda qolib ketyapti** — gapirilgan joylarga to'liq
  yozilmayapti, (2) panel **responsivligi buzilgan** — kontent panel eniga sig'masdan
  kesilib/yarim bo'lib qolyapti ("dabdala").
- **Sabab #1 topildi (yuqori ishonch, lekin hali vizual tasdiqlanmagan) — oldingi sessiyada
  (davomi 5/6) qo'shilgan "intro-skip" tajribasi**: `skipMogrtIntroAnimation()`
  (`MOGRT_INTRO_SKIP_SECONDS=0.15`, `clip.inPoint`ni siljitib `.start`ni qayta tasdiqlash)
  o'sha paytda ham aniq **"hujjatlashtirilmagan, birinchi marta sinalyapti, Premiere'da
  tasdiqlash kerak"** deb belgilangan edi — va bu aynan shu joy (klipning
  joylashuvi/davomiyligi) endi buzilgan bo'lib chiqdi. Bu — sessiyaning eng so'nggi va eng
  xavfli (klip pozitsiyasi/inPoint bilan ishlaydigan) o'zgarishi bo'lgani uchun eng ehtimolli
  sabab. **Tuzatildi**: `skipMogrtIntroAnimation()` funksiyasi va ikkala chaqiruv joyi
  (`insertKineticText()`, `insertCaptionMogrt()`) butunlay olib tashlandi — klip endi faqat
  o'z asl (native) intro-animatsiyasi bilan, hech qanday inPoint-siljitishsiz joylashtiriladi
  (1.3.0/1.3.1'gacha bo'lgan xatti-harakatga qaytdi, "so'z kechikib chiqadi" degan kichik
  kosmetik shikoyat hisobidan pozitsiya to'g'riligi ustuvor qilindi).
- **Sabab #2 topildi va tasdiqlandi (CSS Grid/Flexbox'ning mashhur "min-width: auto"
  bug'i)**: `.main-grid` (`display:grid`, ikki ustunli, tor holatda `1fr`ga qulaydigan)ning
  ikkala bolasi (`.col-left`, `.col-right`) `min-width`siz qoldirilgan edi — grid/flex
  bolalari standart holatda `min-width: auto` bo'ladi, ya'ni ichidagi kontent
  (masalan status matni) qanchalik uzun bo'lsa, bola shunchalik kengayadi va **butun panelni
  eniga torroq bo'lishiga yo'l qo'ymaydi** — shu sabab kontent kesilib/scrollbar bilan
  ko'rinardi (skrinshotda aynan "31/31 subtitr qo'shildi..." status satri panel chekkasida
  keskin kesilgan holda ko'rindi). Xuddi shu bug ichkarida `#status-text` (`.status`
  flex qatoridagi ikkinchi element)da ham bor edi. **Tuzatildi**: `.main-grid`,
  `.col-left`, `.col-right`, `.panel`, `html`ga `min-width:0`/`overflow-x:hidden`
  qo'shildi, `.status > span:last-child`ga `min-width:0` qo'shildi — endi uzun status
  matni panel ichida **qatorlarga bo'linib** ko'rinadi, kesilmaydi.
- Versiya **1.3.3**ga oshirildi (`manifest.xml`, `main.js`), `install.bat` bilan qayta
  o'rnatildi, yangi ZIP+VERSION AWS serverga yuklandi va **sinovdan o'tkazildi**
  (`GET /plugin/version` → `1.3.3`, `GET /plugin/download` → to'g'ri hajmda ZIP qaytardi).
- **Hali sinovdan o'tkazilmagan**: foydalanuvchi Premiere'ni to'liq qayta ishga tushirib
  (host `.jsx` o'zgardi — shart), (1) subtitr endi gapirilgan joylarga to'liq va vaqtida
  yozilishini, (2) panel tor joyga joylashtirilganda endi kesilmasligini tasdiqlashi kerak.
  Agar intro-skipni olib tashlash muammoni hal qilmasa — sabab boshqa joyda (masalan
  `SrtBuilderService`ning cue-buzish mantig'ida yoki Whisper natijasining o'zida) qidirilishi
  kerak bo'ladi.

### Keyingi qadam
- Foydalanuvchi Premiere'ni to'liq qayta ishga tushirib, subtitr vaqti va panel
  responsivligini qayta sinashi kerak.
- Agar subtitr hali ham "ortda qolsa" — keyingi tekshirish nuqtasi: Whisper natijasining
  o'zi (`word.start`/`word.end`) to'g'rimi, yoki `SrtBuilderService.packWords()`dagi
  cue-buzish (`durationBreak`/`gapBreak`) mantig'ida xato bormi.
- Ishlagach: git'da commit qilish (bir necha sessiyadan beri to'planib kelyapti, hali push
  qilinmagan).

## 2026-08-07 (davomi 8) — Haqiqiy sabab topildi: caption klipi cho'zilmasdan faqat qisqartirilardi (1.3.4)

- Foydalanuvchi 1.3.3'ni sinab, muammo davom etayotganini xabar qildi ("to'liq
  qilmayapti", "ortda tashlab ketyapti") — intro-skip'ni olib tashlash yetarli bo'lmadi,
  demak sabab boshqa joyda edi.
- **Haqiqiy sabab topildi**: `insertCaptionMogrt()`da klip davomiyligini moslashtiruvchi kod
  faqat **qisqartirar edi** — `if ((insertedClip.end - insertedClip.start) > duration) { ...
  qisqartir }` — agar kerakli cue davomiyligi (gap so'zlar aytilgan haqiqiy vaqt) MOGRT
  shablonining **native (standart) uzunligidan uzunroq** bo'lsa, klip **hech qachon
  cho'zilmagan** — shunchaki o'z qisqa standart uzunligida qolib, matn hali gapirilayotgan
  paytdayoq ekrandan g'oyib bo'lgan. Ko'pchilik subtitr MOGRT shablonlari standart
  ~2 soniyaga sozlangan, lekin ko'p cue'lar (2-3 qatorli, bir necha so'zli) undan ancha
  uzoqroq davom etadi — shuning uchun **deyarli har bir cue** vaqtidan oldin yo'qolib,
  keyingi cue boshlanguncha ekran bo'sh qolar edi (aynan "ortda qolib ketish"/"to'liq
  yozilmaslik" ta'rifiga mos keladi). Bu — `insertKineticText()`dagi ataylab qilingan
  "faqat qisqartir, hech qachon cho'zma" xatti-harakatidan (qisqa so'z-portlash
  animatsiyalari uchun to'g'ri) **caption uchun noto'g'ri nusxa ko'chirilgan** edi.
- **Tuzatildi**: endi klip oxiri **doim** `startSeconds + duration`ga o'rnatiladi (faqat
  native uzunlikdan qisqa bo'lsagina emas) — kerak bo'lsa native uzunlikdan **cho'ziladi**
  ham. Subtitr/lower-third MOGRT shablonlari (bitta-marta o'ynaydigan kinetic portlash
  animatsiyalaridan farqli) o'zining "joylashgan" kadrida istalgancha ushlab turishga
  mo'ljallangan, shuning uchun cho'zish xavfsiz deb hisoblandi.
- Versiya **1.3.4**ga oshirildi, `install.bat` bilan qayta o'rnatildi, ZIP+VERSION AWS
  serverga qayta yuklandi va tasdiqlandi (`GET /plugin/version` → `1.3.4`).
- **Hali sinovdan o'tkazilmagan** — foydalanuvchi Premiere'ni to'liq qayta ishga tushirib,
  subtitrlar endi to'liq gap davomida ekranda turishini tasdiqlashi kerak.

### Keyingi qadam
- Foydalanuvchi Premiere'ni to'liq qayta ishga tushirib (host `.jsx` o'zgardi — shart),
  subtitr yaratib, endi har cue gapirilgan butun vaqt davomida ko'rinib turishini tekshirishi
  kerak.
- Agar hali ham muammo bo'lsa: klipni cho'zish MOGRT'ning ba'zi turlarida ishlamasligi
  mumkin (native uzunlikdan tashqarida "freeze"ni qo'llab-quvvatlamaydigan shablon bo'lsa) —
  shu holda qaysi aniq `.mogrt` fayl bilan sinalgani va xato xabari (agar `eTrim` catch
  bloki ishga tushsa) kerak bo'ladi.
- Ishlagach: git'da commit qilish (bir necha sessiyadan beri to'planib kelyapti, hali push
  qilinmagan).

## 2026-08-10 — srt_bot: /start menyusi yakunlandi + majburiy ro'yxatdan o'tish (ism/familiya/telefon)

- Sessiya boshida (`git status`) ikkita commit qilinmagan fayl topildi: `keyboards.py`da
  yarim tayyor `start_keyboard()`/`back_keyboard()` (kanal tugmasi bilan), `licensing.py`da
  faqat ishlatilmagan `datetime`/`timedelta` import — oldingi sessiya "Statistikam" tugmasi
  ustida ishlab, to'xtab qolgan ko'rinadi. Avval shu ishni yakunlash so'raldi:
  - `bot.py`dagi `on_start` endi `start_keyboard()` bilan javob beradi; yangi
    `howitworks`/`stats`/`start_back` callback handlerlari qo'shildi. "Statistikam" —
    ism-familiya, telefon, ro'yxatdan o'tgan kun, bugungi bepul limit holati va (bo'lsa)
    faol litsenziya(lar) muddatini ko'rsatadi.
- **Foydalanuvchi yangi talab qo'ydi: har bir foydalanuvchi botdan foydalanishdan oldin
  ism-familiya va telefon raqami bilan ro'yxatdan o'tishi kerak.** Amalga oshirildi:
  - `licensing.py`: yangi `users` jadvali (`telegram_user_id, first_name, last_name,
    phone_number, registered_at`) + `is_registered()`/`register_user()`/`get_user()`/
    `days_since_registration()`/`get_active_licenses_for_user()`.
  - Yangi `srt_bot/registration.py`: FSM (`RegistrationStates.full_name` → `.phone`) orqali
    avval ism-familiya, keyin telefon (kontakt-tugma yoki qo'lda yozib) so'raladi.
    `RegistrationGate` — Dispatcher darajasidagi **outer middleware**
    (`dp.message.outer_middleware`/`dp.callback_query.outer_middleware`, `bot.py`da
    ulangan) — ro'yxatdan o'tmagan foydalanuvchining **har qanday** harakatini (media,
    qurilma kodi, tugmalar — hammasi, faqat registratsiya routeridan tashqari) to'xtatib,
    avval ro'yxatdan o'tishga yo'naltiradi. Bu **eski foydalanuvchilarga ham** tegishli —
    ilgari faollashtirilgan/ishlatgan, lekin yangi `users` jadvalida yo'q bo'lganlar ham
    endi birinchi harakatda ro'yxatdan o'tishi so'raladi.
- **Haqiqiy Telegram sinovida topilgan va tuzatilgan bug**: foydalanuvchi ism so'ralgan
  paytda sabrsizlanib yana `/start` yuborgan — bu matn sifatida qabul qilinib, **so'zma-so'z
  "/start" ism sifatida bazaga yozilib qolgan edi** (`users` jadvalida
  `first_name='/start'`). Sabab: ism/telefon handlerlari har qanday matnni (buyruqlarni ham)
  qabul qilardi. Tuzatildi: har ikkala holat (`full_name`, `phone`) uchun alohida
  `CommandStart()` handler qo'shildi (joriy so'rovni qaytadan ko'rsatadi, saqlamaydi), asosiy
  matn handlerlariga `~F.text.startswith("/")` filtri qo'shildi. Yaroqsiz test yozuvi
  `licenses.db`dan tozalandi.
- **Kichik alohida bug (shu sessiyada tuzatildi)**: `days_since_registration()` da
  `timedelta.days` — bir necha mikrosekundlik salbiy farqda `-1` qaytarardi (ya'ni
  hozirgina ro'yxatdan o'tgan foydalanuvchi "-1 kun oldin" ko'rar edi). `total_seconds()`
  asosida hisoblab, `max(0, ...)` bilan cheklandi.
- **Botni lokal (shu Windows kompyuterda) ishga tushirishda topilgan holat**: `.env`da
  `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`LOCAL_BOT_API_URL` bor edi (500MB'gacha fayl
  yuklash uchun, AWS/Linux'da Docker `telegram-bot-api` server orqali mo'ljallangan), lekin
  bu kompyuterda mos server ishlamayapti — bot shu tufayli darhol `ConnectionRefusedError`
  bilan yiqilib tushardi. **Vaqtincha** shu uchta qator `.env`da izohga olindi (kod
  o'zgarmadi, faqat lokal test uchun) — bot hozir oddiy bulutli Telegram API orqali
  ishlayapti (20MB fayl chegarasi bilan). **Eslatma**: AWS'ga chiqarilganda yoki shu
  kompyuterda ham local bot-api server sozlansa, bu uchta qator qaytarilishi kerak.
- Sinov paytida `bot.py`ning global Python312 interpretatori bilan bitta **bola-jarayon**
  (child process, `ParentProcessId` = asosiy bot jarayoni) spawn qilinishi kuzatildi —
  sababi aniqlanmadi (Telegram poll konflikti EMAS, chunki bitta ota-jarayon, dublikat
  poller emas), zararli ta'siri ko'rinmadi, keyingi safar takrorlansa chuqurroq
  tekshirish kerak bo'lishi mumkin.
- Bot hozir **fon rejimida ishlab turibdi** (`.venv\Scripts\python.exe bot.py`,
  log: `srt_bot/bot_run9.log`), `@ravoncaptions_bot` sifatida to'g'ri ulangan, xatosiz
  polling qilyapti. **Foydalanuvchi to'liq oqimni oxirigacha (ism → telefon → tasdiqlash →
  asosiy menyu → Statistikam) hali qayta sinamagan** — birinchi sinovda /start bug'i
  chiqqach, sessiya "keyinroq davom ettiramiz" deb to'xtatildi.
- **Hali commit qilinmagan**: `bot.py`, `licensing.py`, `keyboards.py`,
  `registration.py` (yangi fayl). `.env`dagi vaqtinchalik izohga olingan qatorlar ham
  eslab qolinishi kerak (git'ga tegmaydi, `.env` gitignored).

### Keyingi qadam
- Foydalanuvchi Telegram'da `/start`dan to'liq ro'yxatdan o'tishni oxirigacha sinashi kerak:
  ism-familiya yuborish (bu safar oralab `/start` yubormasdan), telefon (kontakt tugmasi
  orqali) yuborish, tasdiqlash xabari + asosiy menyu chiqishini, "Statistikam" to'g'ri
  ma'lumot ko'rsatishini tekshirish.
- Eski (ro'yxatdan o'tmagan) foydalanuvchilar birinchi harakatda ro'yxatdan o'tishga
  to'g'ri yo'naltirilayotganini alohida tekshirish.
- Admin (`ADMIN_TELEGRAM_ID`) ham ro'yxatdan o'tishi kerakmi yoki istisno qilinsinmi —
  hozir istisnosiz, hammaga baravar qo'llanadi, agar bu noqulay bo'lsa o'zgartirish kerak.
- Ishlagach: git'da commit qilish (bu fayllar hali umuman commit qilinmagan).
- `.env`dagi `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`LOCAL_BOT_API_URL` qatorlarini qachon
  qaytarish kerakligini hal qilish (AWS deploy paytida, yoki shu kompyuterda ham local
  bot-api server sozlansa).

## 2026-08-12 — B-roll: Pixabay qo'shildi + AE kinetic typography (noldan, MOGRT'siz)

- Sessiya boshida `git status`/`git log` orqali tekshirilganda ma'lum bo'ldi: 2026-08-11'da
  juda katta ish qilingan — bir qismi (versiya 1.4.2→1.4.10gacha, video-aniqlash osilib
  qolish bug'i, installer, B-roll yaxshilanishlari) allaqachon commit qilingan, lekin
  **PROGRESS.md shu ishlarning hech biri bilan yangilanmagan** edi (oxirgi yozuv hali
  2026-08-10'dagi ro'yxatdan o'tish funksiyasi haqida edi). Bundan tashqari, commit
  qilinmagan holda saytdan botga tarif deep-link (`?start=1m/3m/6m/12m`), botda mos tarifni
  to'g'ridan-to'g'ri ko'rsatish, va foydalanuvchi statistikasi kabi ishlar ham topildi —
  bularning barchasi hali sinovdan o'tkazilmagan/commit qilinmagan holicha qoldi.
- **B-roll manba qo'shildi — Pixabay** (foydalanuvchi "Pexels'da material kam, Pinterest'ga
  o'xshab aniq chiqmayapti" deb shikoyat qilgach): Pinterest/YouTube kabi manbalar avval ham
  litsenziyasiz-qayta-tarqatish xavfi sababli rad etilgan edi (mualliflik huquqi), shuning
  uchun o'rniga **yana bir bepul/litsenziyalangan stock manba** — Pixabay — Pexels'ga
  qo'shimcha (o'rniga emas) qo'shildi:
  - `srt_bot/broll.py`: `_search_pixabay_photos()` (`orientation=horizontal/vertical`
    to'g'ridan-to'g'ri API parametri bilan), `_search_pixabay_videos()` (Pixabay video
    API'sida orientatsiya parametri yo'q — shuning uchun ko'proq natija so'rab, natijalarni
    o'zi tanlagan fayl variantining kengligi/balandligiga qarab landscape/portrait'ga
    ajratadi, xuddi mavjud `_search_pexels_videos_mixed_orientation()` kabi). Yangi
    `_search_videos_combined()`/`_search_photos_combined()` — Pexels va Pixabay'ni
    **parallel** so'rab, natijalarni URL bo'yicha dublikatsiz aralashtiradi, `pick_candidates()`
    endi shularni ishlatadi (fallback-kalit-so'z mantig'i o'zgarishsiz qoldi).
  - `config.py`/`.env.example`ga `PIXABAY_API_KEY` qo'shildi, `.env`da bo'sh joy tayyorlab
    qo'yildi. **Foydalanuvchi hali pixabay.com/api'dan bepul kalit olib qo'ymagan** — kalit
    bo'lmasa bu funksiyalar shunchaki bo'sh natija qaytaradi (Giphy'dagi kabi xavfsiz
    pattern), xato bermaydi. `py_compile` bilan sinovdan o'tkazildi (sintaksis xatosiz).
- **Alohida masala: foydalanuvchi "SaeedReels.zip" (Telegram orqali topilgan, boshqa
  muallifning tayyor pullik AE skripti, `.jsxbin` — kompilyatsiya qilingan, ochib
  o'qib bo'lmaydigan format, rus tilidagi pirat-uslubidagi "o'rnatish gaydi" bilan
  tarqatilgan) funksiyalarini dekompilyatsiya qilib, o'z pluginimizga "bizniki" qilib
  joylashtirishni so'radi.** Bir necha marta har xil asoslash bilan qayta so'ralgan
  ("sotib olganman", keyin "akam yozgan") — ikkalasi ham tekshirib bo'lmaydigan da'vo,
  va `.jsxbin`ning o'zi ham "hech kim ochmasin" deb qilingan pirat-uslubidagi tarqatish
  formati edi. **Rad etildi** — boshqa muallifning kodini dekompilyatsiya qilib, ko'plab
  to'lovchi mijozlarga qayta tarqatish mualliflik huquqini buzadi, kim yozganidan qat'i
  nazar tasdiqlab bo'lmaydi. Muqobil sifatida: skriptning `ico/` papkasidagi effekt
  nomlaridan (`word_up/down/left/right`, `character_up/down/left/right`, `position_bounce`,
  `scale_bounce`, `fade_on`) FAQAT g'oya sifatida foydalanib (kod emas), xuddi shu effekt
  turlarini **noldan** qurish taklif qilindi va foydalanuvchi rozi bo'ldi.
  - **Muhim topilma**: bizning mavjud `cep-extension/host/assets/mogrt/`dagi 20 ta MOGRT
    fayl nomlari (`Bounce_word_left_bounce`, `Plain_character_up`, `Plain_1by1`,
    `Plain_Flicker` va h.k. — 2026-08-05'da boshqa manbadan, foydalanuvchi o'zining/
    hamkorining ekanini tasdiqlagan holda olingan) **aynan SaeedReels'ning effekt
    ro'yxati bilan bir xil** ekani aniqlandi — demak bu keng tarqalgan, umumiy MOGRT
    shablon oilasi ekan (turli skriptlar shu umumiy paketni turlicha o'rab-avtomatlashtiradi),
    SaeedReels'ga xos original narsa emas. Bu degani — Premiere tomonida bu funksiya
    **allaqachon mavjud va ishlaydi** (`insertKineticText()`, MOGRT-asosida); yetishmayotgan
    yagona narsa — **After Effects qo'llab-quvvatlashi** edi.
- **Kinetic typography After Effects'ga qo'shildi — noldan, MOGRT'siz** (AE'da
  `Sequence.importMGT()`ning ekvivalenti yo'q, lekin AE'ning o'z Text Animator API'si
  to'liq skriptlanadigan, hatto haqiqiy harf-darajasidagi boshqaruv beradi — MOGRT'dan
  ko'ra to'g'ridan-to'g'riroq yo'l):
  - `host/index.jsx`: yangi `parseKineticStyleRecipe(style)` — panelda ko'rinadigan xuddi
    shu stil nomini (masalan "Bounce_word_left_bounce") o'qib, animatsiya "retsepti"ga
    aylantiradi (birlik: so'z/harf, turi: slide/scale/fade/flicker/reveal, yo'nalish,
    bounce bormi) — MOGRT faylning o'ziga tegmasdan, faqat nomidan.
  - `_ae_animateWordEntrance()` — butun so'z darajasida Position/Scale/Opacity
    keyframe'lari bilan slайд/scale/fade/flicker effektlarini (bounce uchun target'dan
    oshib o'tib, keyin orqaga qaytadigan overshoot bilan) quradi.
  - `_ae_addCharacterStagger()` — harf-darajasidagi effektlar uchun AE Text Animator +
    Range Selector qo'shadi, Selector'ning "Offset" xususiyati -100%'dan 100%gacha
    animatsiya qilinadi (Shape=RampUp bilan) — bu matnni harf-baharf, ketma-ket
    ochib-chiqaradigan standart AE texnikasi. **Diqqat — bu birinchi marta qo'shilmoqda,
    haqiqiy AE'da hali sinalmagan**: xususan RampUp/RampDown yo'nalishi (harflar
    old-tomondan-orqaga yoki aksinchami chiqishi) tasdiqlanmagan — agar teskari chiqsa,
    `AE_CHAR_RAMP_SHAPE`ni 2'dan 3'ga almashtirish kerak bo'ladi.
  - `_ae_insertKineticText()` — Premiere'dagi `insertKineticText()`ning so'z-bo'yicha
    aylanish mantig'ini (keyingi so'zgacha ekranda ushlab turish, juda tez gapirilgan
    so'zlarni o'tkazib yuborish, progress dispatch) takrorlaydi, lekin AE'da track-
    rejalashtirish shart emas (qatlamlar shunchaki z-tartib bo'yicha ustma-ust
    joylashadi, to'qnashuv yo'q) — Premiere'dagi murakkab `trackPool` mantig'idan ancha
    soddaroq.
  - `_ae_styleTextLayer()` — avvalgi `importSrtAfterEffects()`dagi shrift/rang/kontur
    sozlash kodi umumiy funksiyaga chiqarildi (endi ikkalasi — subtitr va kinetic —
    shundan foydalanadi, ikki joyda takrorlanmaydi).
  - `insertKineticText()` dispatcher endi `BridgeTalk.appName === "aftereffects"` bo'lsa
    `_ae_insertKineticText()`ga yo'naltiradi (avval AE uchun to'g'ridan-to'g'ri xato
    qaytarardi). Panel (`main.js`) tomonida hech qanday o'zgarish shart emas edi — u
    allaqachon host-agnostik, faqat natija matnini ko'rsatadi.
  - `node --check` (vaqtinchalik `.js` nusxa orqali, `.jsx` kengaytmasini Node ESM
    deb noto'g'ri talqin qilgani uchun) xatosiz o'tdi. Versiya **1.4.11**ga oshirildi,
    `install.bat` bilan lokal qayta o'rnatildi.
- **Hali sinovdan o'tkazilmagan va push qilinmagan** (ataylab — endi avtomatik
  deploy pipeline har push'da ishlaydi, sinalmagan AE kodni push qilish darhol
  mijozlarga tarqalishi mumkin edi): foydalanuvchi Premiere'ni **va** After Effects'ni
  to'liq qayta ishga tushirib (host `.jsx` o'zgardi — ikkalasida ham shart), kinetic
  typography'ni sinashi kerak — ayniqsa harf-darajasidagi stillar (`character_*`,
  `1by1`) haqiqatan harf-baharf chiqayaptimi yoki barchasi bir vaqtda chiqyaptimi.

## 2026-08-12 (davomi) — Reels animatsiya: alohida tugma + shrift/rang/joylashuv/o'lcham sozlamalari

- Backend/bot lokal ishga tushirilmagan edi (panelda "Backend serverga ulanib bo'lmadi"
  xatosi) — Java backend (`target\Plugin-0.0.1-SNAPSHOT.jar`, mavjud jar, qayta build shart
  emas edi) va `srt_bot\bot.py` (litsenziya/transkripsiya serveri bilan birga) ikkalasi ham
  qo'lda ishga tushirildi, ikkalasi ham sog'lom (health-check/log bilan tasdiqlandi).
- **Timing bug tuzatildi**: `_ae_insertKineticText()` so'z-darajasidagi (character bo'lmagan)
  stillar uchun `_ae_animateWordEntrance()`ni chaqirganda, so'zning haqiqiy ekranda turish
  vaqtiga moslab hisoblangan `entranceSeconds`ni UZATMAGAN edi — funksiya ichida buning
  o'rniga doim qattiq kodlangan `AE_KINETIC_ENTRANCE_SECONDS` konstantasi ishlatilardi. Endi
  bu qiymat parametr sifatida uzatiladi va ishlatiladi (fade davomiyligi ham shunga moslab
  qisqartiriladi) — kompozitsiya oxiriga yaqin joylashgan so'zlar uchun animatsiya
  o'zining ko'rinish vaqtidan oshib ketmasligini ta'minlaydi.
- **Panel: "Kinetic Typography" mayda switch o'rniga alohida, aniq ko'ringan "Reels
  animatsiya" tugmasi** (`index.html`: `.toggle-row` olib tashlandi, o'rniga to'liq
  kenglikdagi `.btn.kinetic-open-btn`, xuddi shu `id="kinetic-toggle"` bilan — `main.js`da
  hech qanday JS o'zgarishi shart emas edi, `setupToggle()` xilma-xil elementlar bilan
  universal ishlaydi). CSS'da accent-rangli chegara/hover holati qo'shildi
  (`style.css`, `.kinetic-open-btn`).
- **Yangi ko'rinish sozlamalari — faqat After Effects uchun** (Premiere'ning MOGRT yo'lida
  shrift/rang dasturiy boshqarilmasligi allaqachon hujjatlashtirilgan cheklov edi):
  panelga shrift tanlash (5 ta xavfsiz variant), matn rangi, kontur rangi, joylashuv
  (yuqorida/markazda/pastda), o'lcham slider (50%-200%) qo'shildi (`index.html`,
  yangi `.field-row`/`.color-input`/`.kinetic-style-note` CSS). `main.js` bu qiymatlarni
  JSON qilib `insertKineticText()`ga oltinchi argument sifatida uzatadi.
  `host/index.jsx`: `_ae_styleTextLayer()` endi ixtiyoriy `style` obyektini qabul qiladi
  (yangi `_ae_hexToRgb01()` — "#rrggbb"ni AE'ning [r,g,b] 0-1 formatiga o'giradi),
  `_ae_insertKineticText()` joylashuvni (Y-koordinata) va o'lcham-koeffitsientini shu
  sozlamalardan hisoblaydi. Premiere yo'li bu argumentni oddiygina e'tiborsiz qoldiradi.
  `node --check` xatosiz o'tdi.
- Versiya **1.4.13**gacha bosqichma-bosqich oshirildi (1.4.11→1.4.12 timing fix,
  1.4.12→1.4.13 tugma+sozlamalar), har safar `install.bat` bilan lokal qayta o'rnatildi.
- **Alohida masala — foydalanuvchi qayta-qayta SaeedReels kodini "aynan bir xil"
  ko'chirishni so'radi** (turli asoslash bilan: "sotib olganman", "akam yozgan",
  "ekran ochib tekshir", oxiri "GUI o'rnat"). Har safar rad etildi — sabab o'zgarmadi
  (boshqa mualliflik kodini dekompilyatsiya qilib qayta tarqatish, va bundan tashqari
  bu terminaldan ishlaydigan agent sifatida GUI dasturlarni umuman ochish qobiliyati yo'q).
  Foydalanuvchi SaeedReels **faqat Mac uchun** ekanini aytdi — demak shu Windows
  kompyuterda skrinshot orqali solishtirish ham qiyin. Kelishildi: standart kinetic-
  typography vositalarida odatiy bo'ladigan generik sozlamalar (shrift/rang/joylashuv/
  o'lcham — yuqoridagi bandda amalga oshirildi) SaeedReels'ni ko'rmasdan ham qo'shiladi.
- **Hali sinovdan o'tkazilmagan va push qilinmagan** (sabab o'zgarmadi — avtomatik deploy).

### Keyingi qadam
- Foydalanuvchi Premiere **va** After Effects'ni to'liq qayta ishga tushirib, kinetic
  typography'ni ikkalasida ham sinashi kerak: (1) so'z-darajasidagi stillar (slide/bounce/
  scale/fade/flicker) to'g'ri chiqayaptimi, (2) harf-darajasidagi stillar chindan
  harf-baharf ochilib chiqayaptimi (agar teskari tartibda chiqsa — `AE_CHAR_RAMP_SHAPE`
  ni 3'ga o'zgartirish kerak), (3) matn joylashuvi/o'lchami ko'rinishda yaxshimi,
  (4) yangi "Reels animatsiya" tugmasi va shrift/rang/joylashuv/o'lcham sozlamalari
  AE'da to'g'ri ishlayaptimi (Premiere'da bu sozlamalar sezilarli ta'sir qilmasligi
  kutiladi — bu bilinishi kerak, xato emas), (5) "So'zlarga ajratish" va "Yozuv kursor
  effekti" vositalarini sinashi kerak.
- Pixabay: foydalanuvchi bepul API key olib `.env`ga qo'yishi va botni qayta ishga
  tushirishi kerak, shundan keyin haqiqiy kalit bilan natijalarni sinash kerak.
- Ishlagach (barchasi): git'da commit qilish — juda ko'p o'zgarish (2026-08-11'dan
  buyon) hali umuman commit qilinmagan, push qilinganda avtomatik deploy ishga tushishini
  yodda tutish kerak.

## 2026-08-12 (davomi 3) — "Split to Words" + "Yozuv kursor" vositalari (noldan)

- Foydalanuvchi yana bir Telegram'dan olingan fayl (`LMT.jsxbin`, aslida oddiy o'qiladigan
  kod ekan, kompilyatsiya qilinmagan) yubordi — ochib ko'rilganda footer'da
  **"Created by LukhmanMotion"** deb aniq yozilgan edi, ya'ni yana boshqa muallifning
  skripti (avvalgi "o'zim yozganman"/"akam yozgan" da'volariga zid tasdiq). Kodi
  o'qiladigan bo'lsa ham, ko'chirib olish rad etildi (sabab avvalgidek — mualliflik
  huquqi, o'qiladigan format ruxsat degani emas). Foydali tomoni: uning ichidagi
  texnika (Text Animator + Range Selector + Offset sweep) bizning `_ae_insertKineticText()`
  yondashuvimiz bilan bir xil ekanini tasdiqladi. Foydalanuvchi bilan kelishildi: shu
  kabi ikkita **umumiy, mashhur AE texnikasi** (kodi emas, faqat g'oyasi) noldan
  qo'shildi.
- **"So'zlarga ajratish" (Split to Words)** — `host/index.jsx`: yangi
  `splitSelectedTextToWords()` — Timeline'da tanlangan (istalgan, transkripsiyaga
  bog'liq bo'lmagan) bitta matn qatlamini so'zlarga ajratib, har birini asl matndagi
  joylashuviga mos joyga qo'yadi. Texnika: vaqtinchalik yashirin nusxa-qatlam orqali
  "so'z + `|` belgisi" uzunligini o'lchab (AE oxiridagi bo'sh joyni o'lchashda
  qirqib tashlaydi, shuning uchun belgi kerak), so'ng shu uzunlikni ayirib tashlab,
  har so'zning haqiqiy chap chetini hisoblaydi; `Layer.sourcePointToComp()` orqali
  comp koordinatasiga o'giradi.
- **"Yozuv kursor effekti" (Typing cursor)** — yangi `addTypingCursorEffect(durationSeconds)`
  — tanlangan matn qatlamiga bitta `Slider Control` effekti (0→100, belgilangan
  davomiylikda) va Source Text'ga ifoda (`expression`) qo'shadi: har freym'da necha
  belgi ko'rsatilishini `reveal/100 * matn_uzunligi` orqali hisoblab, oxiriga
  miltillovchi `|` kursorini qo'shadi.
- Panel (`index.html`/`main.js`): "Reels animatsiya" bo'limiga ikkita yangi tugma
  ("So'zlarga ajratish", "Yozuv kursor effekti qo'shish" + davomiylik input maydoni)
  qo'shildi — B-roll/kinetic-btn'dan farqli, bular `transcribeForSegments()`ni chaqirmaydi
  (transkripsiyaga bog'liq emas), to'g'ridan-to'g'ri evalScript chaqiradi.
  `setBusy()`ga ham ulandi (boshqa amal davomida disabled bo'ladi).
  `node --check` xatosiz o'tdi. Versiya **1.4.14**ga oshirildi, `install.bat` bilan
  lokal qayta o'rnatildi.
- **Hali sinovdan o'tkazilmagan va push qilinmagan** (sabab o'zgarmadi).
