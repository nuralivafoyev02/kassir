# Notification Admin Patch — Hisobot

## Qo'shilgan imkoniyatlar

### 1. Telegram admin panel ichida notification boshqaruvi
`/admin` panelga yangi **🔔 Notificationlar** bo'limi qo'shildi.

U yerda quyidagilar bor:
- `daily_reminder` holatini yoqish/o'chirish
- `debt_reminder` holatini yoqish/o'chirish
- `scheduled_queue` holatini yoqish/o'chirish
- daily reminder vaqtini quick button orqali o'zgartirish
- notification test yuborish
- buyruqlar bo'yicha yordam oynasi

### 2. Admin buyruqlari qo'shildi

- `/notif` — notification panelni ochadi
- `/notif list` — barcha notification sozlamalari
- `/notif on daily_reminder` — yoqadi
- `/notif off daily_reminder` — o'chiradi
- `/notif time daily_reminder 08:30` — vaqtni o'zgartiradi
- `/notif text daily_reminder ...` — matnni almashtiradi
- `/notif text debt_reminder ...` — qarz eslatmasi matnini almashtiradi
- `/notif test daily_reminder` — test xabar yuboradi
- `/notif reset daily_reminder` — default holatga qaytaradi

### 3. Supabase notification config qatlami qo'shildi
Yangi jadvallar:
- `notification_settings`
- `notification_logs`

Bu jadvallar orqali:
- notification qaysi vaqtda borishi
- matni qanday bo'lishi
- yoqilgan/o'chirilgani
- oxirgi yuborish va loglar

markaziy ravishda saqlanadi.

### 4. Worker cron endi DB'dagi admin sozlamalarni o'qiydi
`worker/index.js` endi:
- `daily_reminder` ni `notification_settings.send_time` bo'yicha yuboradi
- `daily_reminder` matnini `message_template` dan oladi
- `debt_reminder` ni `message_template` dan oladi
- `scheduled_queue` o'chirilgan bo'lsa queue notification yubormaydi
- yuborilgan va yiqilgan notificationlarni `notification_logs` ga yozadi

### 5. Wrangler asosiy cron, Node handler fallback sifatida qoldi
Asosiy scheduled run `wrangler.jsonc` dagi Worker cron orqali ishlaydi.
`api/cron-reminders.js` esa lokal/manual fallback sifatida xuddi shu admin sozlamalarni o'qiydi.

---

## O'zgargan fayllar
- `api/bot.js`
- `worker/index.js`
- `api/cron-reminders.js`
- `supabase.sql`
- `wrangler.jsonc`

---

## Muhim eslatma
Bu patch to'liq ishlashi uchun **`supabase.sql` dagi yangi migration qismini ishlatish shart**.
Aks holda `/notif` panel ochiladi, lekin `notification_settings` jadvali topilmagani haqida xato beradi.

---

## Tavsiya etilgan ishga tushirish tartibi
1. Supabase SQL editorga `supabase.sql` dagi yangi bo'limni ishlating.
2. Worker yoki loyihani qayta deploy qiling.
3. Telegramda `/admin` yoki `/notif` ni bosing.
4. `daily_reminder` vaqtini sinab ko'ring.
5. `/notif test daily_reminder` bilan test yuboring.

---

## Hozirgi ishlash logikasi

### Daily reminder
- Admin panel yoki `/notif time daily_reminder HH:MM` orqali vaqt o'zgaradi.
- Cron har 1 daqiqada ishlaydi.
- Belgilangan vaqtdan boshlab default `5 daqiqa` oynada bir marta yuboradi.
- User darajasida `last_daily_reminder_at` bilan dubldan himoyalangan.

### Debt reminder
- `remind_at` yoki `due_at` yetganda yuboriladi.
- Matn `notification_settings.message_template` dan olinadi.
- Yuborilgach `reminder_sent_at` yoziladi.

### Scheduled queue
- `notification_jobs` dan pending joblarni oladi.
- `scheduled_queue` o'chirilgan bo'lsa yuborilmaydi.

---

## Eslatma
Agar xohlasangiz keyingi bosqichda men buni yanada kuchaytirib beraman:
- notification loglarni admin panelda ko'rsatish
- faqat inactive userlarga yuborish
- hafta kunlari bo'yicha schedule
- premium/all/custom segmentlar
- placeholder preview builder (`{{first_name}}`, `{{amount}}`, `{{category}}`)
