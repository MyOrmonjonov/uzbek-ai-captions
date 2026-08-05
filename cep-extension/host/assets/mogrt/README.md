# Kinetic Typography — MOGRT shablonlari

Bu papkadagi har bir `.mogrt` fayl panelning "Kinetic Typography" (so'z-so'z animatsiya)
bo'limida **avtomatik** tanlov sifatida chiqadi — kod o'zgartirish shart emas, shunchaki
mos strukturadagi `.mogrt` faylni shu papkaga tashlash kifoya (`listKineticStyles()`,
`cep-extension/host/index.jsx`, papkani ishga tushirilganda skanerlaydi).

Hozircha 20 ta shablon bor ("Xojiakbarxon UI Plugin" mahsulotidan olingan, `Bounce_*` va
`Plain_*` — so'z/pozitsiya/scale asosidagi oddiy animatsiyalar). `New_Animation_01–10.mogrt`
(og'irroq, "Liquid Glass" uslubidagi) hali qo'shilmagan — kerak bo'lsa keyinroq tekshirib
qo'shish mumkin.

## Qanday ishlaydi

Panelda "Animatsion matn qo'shish" bosilganda, har bir so'z uchun tanlangan `.mogrt`
faylning yangi nusxasi alohida video track'ga qo'yiladi (`insertKineticText()`,
`index.jsx`), so'zning haqiqiy davomiyligiga qisqartiriladi va matni Essential Graphics
komponenti orqali o'sha so'zga o'rnatiladi (`setMogrtText()` — MGT komponent
parametrlaridan `textEditValue` kaliti bor JSON paramni nom bo'yicha emas, shakli bo'yicha
topadi, shuning uchun turli muallif/eksportlarga chidamli).

## Yangi stil qo'shish

1. Premiere/After Effects Essential Graphics panelida bitta matn qatlamli, qisqa
   (~0.15–0.4s) animatsiyali (scale/position/opacity) composition tayyorlang, matn
   qatlamini "Master Property" sifatida qo'shing.
2. "Export Motion Graphics Template..." orqali `.mogrt` sifatida saqlang.
3. Faylni shu papkaga qo'ying — panel keyingi ochilishida uni avtomatik ro'yxatga qo'shadi.

Batafsil qadamlar (noldan yasash uchun) ilgari shu faylda yozilgan edi — endi tayyor
namunalar (`Plain_word_up.mogrt` va h.k.) borligi sababli, ularni "namuna" sifatida ochib
ko'rish (mogrt — aslida zip fayl, `definition.json`da `capsuleparams.capParams[0]` ichida
`textEditValue`/`fontTextRunLength` ko'rinadi) eng tez yo'l.
