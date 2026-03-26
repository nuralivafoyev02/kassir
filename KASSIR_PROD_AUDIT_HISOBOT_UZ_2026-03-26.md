# Kassir PROD Audit Hisoboti

Sana: 2026-03-26

## Audit qamrovi

- `worker/index.js`
- `api/bot.js`
- `lib/telegram-ops.cjs`
- `api/client-log.js`
- `tests/bot-parser.test.cjs`
- live Supabase sxemasi va joriy notification ma'lumotlari

## Rejada qanday ishlashi kerak edi

- Cloudflare Worker cron har `30` daqiqada ishga tushib, `Asia/Tashkent` bo'yicha ertalabgi va kechki notificationlarni yuborishi kerak edi.
- Botdagi `/start` oqimi yangi user, mavjud user va contact flow uchun INFO log qoldirishi kerak edi.
- Admin panel `/admin` yoki inline callback orqali ochilganda bitta standart schema bilan log yozilishi kerak edi.
- `status` maydoni severity emas, amaliy natija statusini ko'rsatishi kerak edi.

## Hozirgi amaldagi holat bo'yicha topilmalar

- Live Supabase’da `notification_settings`, `notification_logs`, `last_daily_reminder_at`, `last_daily_report_at` ustunlari mavjud.
- Live ma'lumotda `daily_report` 2026-03-25 17:00:42 UTC da yuborilgan loglar bor.
- Live ma'lumotda `daily_reminder` bo'yicha umuman log yo'q.
- Live ma'lumotda barcha userlarda `last_daily_reminder_at` `null`, ya'ni ertalabgi oqim amalda claim/send bosqichiga yetmagan.
- `notification_settings.last_sent_at` ham `null` bo'lib qolgan, ya'ni observability qatlami to'liq ishonchli emas edi.

## Asosiy root cause lar

### 1. `/start` INFO log ishonchli yuborilmagan

- Belgisi: `/start` bosilganda INFO log kanalga kelmaydi.
- Asl sababi: `getAppLogger().info(...)` chaqiruvlari `await` qilinmagan. Worker javobni qaytargach background promise yo'qolib ketishi mumkin edi.
- Ta'siri: `/start` loglari skip bo'lib ketadi, ayniqsa production worker muhiti ichida.
- Yechimi: `/start`, `start.contact_request` va registration INFO loglari `await` qilinadigan holatga o'tkazildi.

### 2. Deep-link `/start <payload>` start oqimiga tushmagan

- Belgisi: deep-link bilan kirgan user start flow o'rniga oddiy text flow ga tushib qoladi yoki log yozilmaydi.
- Asl sababi: kod faqat `text === '/start'` ni tekshirgan.
- Ta'siri: deep-link payload yo'qoladi, log skip bo'ladi, registered user uchun noto'g'ri javob chiqishi mumkin.
- Yechimi: `parseStartCommand()` qo'shildi va `/start`, `/start payload`, `/start@bot payload` bir xil start oqimi sifatida qayta ishlanadigan bo'ldi.

### 3. Admin panel callback orqali ochilganda log yozilmagan

- Belgisi: `/admin` orqali log bor, lekin `admin_panel` callback orqali ochilganda consistency yo'q.
- Asl sababi: log faqat text command branch ichida bor edi.
- Ta'siri: admin panel usage telemetriyasi to'liq emas edi.
- Yechimi: callback branch uchun ham `admin-open` INFO log qo'shildi.

### 4. Logger `status` maydoniga severity yozgan

- Belgisi: `status: INFO` ko'rinishidagi loglar kelgan.
- Asl sababi: markaziy logger header builder `status` ni `level` bilan to'ldirgan.
- Ta'siri: admin/log kanalda status semantikasi buzilgan, monitoring va filtering chalkash bo'lgan.
- Yechimi: logger markazlashtirildi. Endi `status` alohida, `severity` alohida yuradi.

### 5. Cron scheduled slot vaqtini emas, haqiqiy ishga tushgan vaqtni baholagan

- Belgisi: scheduler ishlasa ham ertalab/kechki yuborishlar skip bo'lishi mumkin.
- Asl sababi: `runAllCronJobs()` `new Date()` dan foydalangan, `controller.scheduledTime` faqat payloadda saqlangan.
- Ta'siri: worker kechiksa yoki boundary slotga tushsa, notification window tashqarisida deb baholanib yuborish o'tib ketishi mumkin.
- Yechimi: cron hisob-kitobi endi `scheduledTime` dan foydalanadi; yo'q bo'lsa fallback sifatida joriy vaqt olinadi.

### 6. Daily window upper bound qat'iy bo'lgan

- Belgisi: `09:30` yoki `22:30` boundary slotlarda recovery yuborish ishlamasligi mumkin.
- Asl sababi: `currentMinutes < target + windowMinutes` ishlatilgan.
- Ta'siri: cron interval `30` minut bo'lsa, ikkinchi slotda yuborish imkoniyati yo'qoladi.
- Yechimi: upper bound inclusive qilindi.

### 7. Cron blocked holatlari logga aniq chiqmagan

- Belgisi: ustun/jadval muammosi yoki per-run limit bo'lsa ham tizim oddiy noop ko'rinishi mumkin.
- Asl sababi: `note` bilan qaytgan bloklovchi holatlar umumiy error/warn loggerga ko'tarilmagan.
- Ta'siri: real muammo bo'lsa ham kanalga ravshan sabab tushmaydi.
- Yechimi: `issues` kolleksiyasi qo'shildi. Endi scheduled/manual cron `ERROR` yoki `WARN` bilan sababini payload ichida ko'rsatadi.

### 8. `notification_settings.last_sent_at` observability qatlami zaif bo'lgan

- Belgisi: live DB’da yuborish bo'lgan bo'lsa ham `last_sent_at` `null` qolgan.
- Asl sababi: patch no-op bo'lsa tasdiqlash/upsert fallback yo'q edi.
- Ta'siri: admin kuzatuvida oxirgi yuborish vaqti noto'g'ri ko'rinishi mumkin.
- Yechimi: `sbTouchNotificationSetting()` endi update natijasini tekshiradi, kerak bo'lsa upsert fallback ishlatadi.

### 9. Local `warn` loglari noto'g'ri severity bilan yozilgan

- Belgisi: `warn()` helper ichki logda `SUCCESS` sifatida ko'ringan.
- Asl sababi: helper noto'g'ri mapped bo'lgan.
- Ta'siri: lokal debugging signali chalg'ituvchi bo'lgan.
- Yechimi: `WARN` severity qo'shildi va helper to'g'rilandi.

## O'zgartirilgan narsalar

### `lib/telegram-ops.cjs`

- `WARN` severity qo'shildi.
- `status` va `severity` ajratildi.
- Xato matnidan `401/403/404/422/429/504/500` status infer qilish qo'shildi.
- Yangi user notification format ham umumiy schema bilan moslashtirildi.
- Dedupe fingerprint endi `status` ni ham hisobga oladi.

### `api/bot.js`

- `parseStartCommand()` qo'shildi.
- `/start` va `/start payload` oqimi birlashtirildi.
- `/start`, `start.contact_request`, registration INFO loglari `await` qilinadigan bo'ldi.
- `/admin` command va `admin_panel` callback uchun `admin-open` loglari numeric status bilan yuboriladi.
- Local `warn()` helper `WARN` severity ga o'tkazildi.

### `worker/index.js`

- Cron reference time endi `scheduledTime` asosida hisoblanadi.
- Daily reminder/report window upper bound inclusive qilindi.
- `daily/report/debt/notifications` natijalariga `ok` bayrog'i qo'shildi.
- Blocking `note` holatlari `issues` ko'rinishida yig'iladi.
- Scheduled/manual cron yakunida `ERROR` yoki `WARN` log aniq sabab bilan yoziladi.
- `notification_settings.last_sent_at` update qatlami mustahkamlandi.
- Manual cron endpoint uchun ixtiyoriy `runAt` yoki `scheduledTime` input qo'shildi.
- Logging test endpoint formati umumiy schema bilan moslashtirildi.

### `tests/bot-parser.test.cjs`

- Deep-link `/start payload` parsing bo'yicha regression test qo'shildi.

## O'zgargan fayllar

- `api/bot.js`
- `lib/telegram-ops.cjs`
- `worker/index.js`
- `tests/bot-parser.test.cjs`

## Validation

- `node --test tests/bot-parser.test.cjs` muvaffaqiyatli o'tdi.
- `node --check api/bot.js` muvaffaqiyatli o'tdi.
- `node --check lib/telegram-ops.cjs` muvaffaqiyatli o'tdi.
- `node --check worker/index.js` muvaffaqiyatli o'tdi.
- Local smoke test orqali yangi logger formatida `status: 200` va `severity: INFO` chiqishi tasdiqlandi.
- Live Supabase inspection orqali:
  - `daily_report` live yuborilganligi tasdiqlandi
  - `daily_reminder` bo'yicha log yo'qligi tasdiqlandi
  - `last_daily_reminder_at` umuman to'ldirilmaganligi tasdiqlandi

## Regressiya xavfi

- Past.
- `/start` javobi va existing greeting matni o'zgarmadi, faqat command parsing kengaydi va log ishonchliligi oshdi.
- Logger formati markaziy joyda o'zgargani sabab monitoring ko'rinishi yangilanadi, lekin API yoki user-facing javoblarni buzmaydi.
- Cron loglar endi ko'proq signal beradi; bu shovqin emas, mavjud silent failure larni ko'rinadigan qiladi.

## Qo'shimcha audit topilmalari

- Live Supabase’da `notification_jobs.id` turi repo ichidagi `supabase.sql` tavsifidan farq qiladi.
- Public jadvallarda RLS o'chirilgan.
- Bu ikki masala hozirgi production oqimni buzmaslik uchun shu turni ichida o'zgartirilmadi.
- Keyingi nazorat bosqichida alohida, boshqariladigan migration/review bilan ko'rib chiqish tavsiya etiladi.

## Keyinchalik kuzatish kerak bo'lgan joylar

- Keyingi ertalabgi va kechki cronlardan keyin `notification_logs` va `notification_settings.last_sent_at` qiymatlari.
- `cron.scheduled` WARN/ERROR loglari chiqsa, `issues` payload ichidagi sabablar.
- Deep-link bilan kirgan userlarda `start_payload` maydoni logga to'g'ri tushishi.
- Admin panel `/admin` va callback ikkala oqimdan ham bir xil schema bilan log tushishi.

## Eski markdown fayl bo'yicha qaror

- `PROD_AUDIT_REPORT_2026-03-26.md` eski, inglizcha va endi yangi o'zbekcha audit hisobot bilan to'liq almashtiriladigan vaqtinchalik fayl sifatida belgilandi.
