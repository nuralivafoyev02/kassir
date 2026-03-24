# RELEASE 1.0.5

## Nimalar yaxshilandi

### 1. Bot parser va AI fallback
- `❓ Qo'llanma` matni kengaytirildi: kirim, chiqim, kimga bo'lgan chiqim, qarz berish/olish, qarz qaytishi va reja misollari qo'shildi.
- OpenAI quota yoki rate limit (`429`) bo'lsa, bot endi xatoga yiqilib qolmaydi.
- AI parser vaqtincha o'chirilib, lokal regex/parser fallback ishlaydi.

### 2. Reja / limit bo'limi
- Mini App reja statistikasi endi kategoriya nomini **normalizatsiya** qilib hisoblaydi.
- Bot orqali kiritilgan reja ko'rinmay qolishining oldini olish uchun `plan` tab ochilganda serverdan qayta sinxronlash qo'shildi.
- Realtime update dedupe qilindi: bir xil reja insert/update eventlari UI'ni takrorlab yubormaydi.
- Reja saqlangandan keyin serverdan qayta o'qilib, Mini App holati yangilanadi.

### 3. Qarzlar bo'limi
- Debt realtime update'lar dedupe qilindi.
- Debt tab ochilganda serverdan qayta refresh qilinadi.
- Mavjud UI saqlangan holda qarzlar ro'yxati va detail oqimi barqarorroq qilindi.

### 4. Bot ↔ Mini App uyg'unligi
- Mini App ichidan kiritilgan yangi kirim/chiqim endi botga ham xabar sifatida yuboriladi.
- Bot tarafdan yozilgan debt/plan ma'lumotlari Mini App'da realtime + refresh fallback orqali ko'rinadigan qilindi.

### 5. Har kunlik 09:00 reminder
- `cron-reminders` endpoint kengaytirildi.
- Endi har kuni Toshkent vaqti bilan **09:00** da foydalanuvchiga quyidagi mazmundagi eslatma yuboriladi:
  - `Assalamu aleykum bugungi xarajatlarni kiritib borishni unutmang. 24/7 xizmatingizda man!`
- Qarz reminders ham saqlab qolindi.
- Daily reminder uchun `users.daily_reminder_enabled` va `users.last_daily_reminder_at` support qo'shildi.

### 6. Hisobot eksporti: PDF + Excel
- Export oqimi endi bitta PDF bilan cheklanmaydi.
- Mini App hisobot yaratganda:
  - PDF tayyorlanadi
  - Excel ko'rinishidagi `.xls` fayl ham tayyorlanadi
- Telegram botga **ikkita alohida fayl** yuboriladi:
  1. PDF hisobot
  2. Excel hisobot
- Botga yuborish ishlamasa, telefon tomonga fallback download ishlaydi.
- Export modal matnlari ham yangilandi.

### 7. Server va API
- Yangi endpointlar qo'shildi:
  - `/api/send-report-files`
  - `/api/notify-miniapp-tx`
- Dev server body parse limiti oshirildi, katta PDF payloadlarda uzilib qolmasligi uchun.

## O'zgargan fayllar
- `api/bot.js`
- `api/cron-reminders.js`
- `api/send-report-files.js` *(yangi)*
- `api/notify-miniapp-tx.js` *(yangi)*
- `server.js`
- `public/app.js`
- `public/app.features.js`
- `src/components/overlays/AppOverlays.vue`
- `supabase.sql`

## Muhim eslatma
- Daily reminder ustunlari uchun `supabase.sql` dagi yangi migrationni ishga tushirish tavsiya qilinadi.
- Excel fayl `.xls` formatida Spreadsheet XML ko'rinishida yuboriladi; Excel va ko'p telefon office ilovalari buni ochadi.


## Hotfix: Plan / Qarz / Mini App sync
- `normalizeTextForMatch` helper Mini App feature bundle ichiga qo'shildi. Shu bilan Reja va Qarz bo'limidagi runtime xatolik bartaraf etildi.
- Reja statistikasini hisoblash, qidirish va limit progress endi bir xil normalize qoidasi bilan ishlaydi.
- Mini App ichidan yangi reja yaratilganda, avval mavjud yozuv topilib **update** qilinadi; shuning uchun legacy `category_limits_user_id_category_type_key` unique constraint bilan to'qnashuv kamaytirildi.
- Reja yozishda legacy sxema (`category`, `type`) va yangi sxema (`category_name`, `month_key`, `category_id`) birga qo'llab-quvvatlanadi.
- Bot orqali yaratilgan reja yozuvlari Mini App reja ro'yxatida ko'rinishi uchun yuklash/dedupe oqimi mustahkamlandi.
- Mini App'dagi kirim/chiqim saqlash oqimini to'xtatib qo'yayotgan reja statistikasi xatosi bartaraf etildi.
- Bot tarafdagi reja saqlash logikasi ham legacy va yangi `category_limits` sxemalari orasida bir xil kalit bilan ishlaydigan qilindi.


## Hotfix: Reja kartalari accordion UX
- Reja kartalari endi yopiq/ochiq accordion ko‘rinishda ishlaydi.
- Default holatda faqat asosiy ma’lumotlar ko‘rinadi: kategoriya, oy, limit, progress va qolgan summa.
- Kartani bosganda ichki tafsilotlar ochiladi: sarflangan, qolgan, ogohlantirish, badge va action tugmalar.
- Reja ro‘yxatida bir ekranga ko‘proq yozuv sig‘ishi uchun details qismi compact qilindi.
