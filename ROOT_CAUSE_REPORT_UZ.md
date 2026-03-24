# Root cause report — category_limits / bot / worker

## Asosiy ildiz sabab

### 1) `category_limits` migratsiyasi to'liq emas
`supabase.sql` ichida `create table if not exists public.category_limits (...)` ishlatilgan.
Bu **yangi table yaratadi**, lekin **prod'da oldin mavjud bo'lgan legacy `category_limits` table'ni upgrade qilmaydi**.

Natija:
- prod sxemada eski ustunlar (`category`, `type`, `name`) qolib ketgan bo'lishi mumkin
- yangi ustunlar (`category_name`, `month_key`, `category_id`, `notify_bot`, `notify_app`, `is_active`) qo'shilmagan bo'lishi mumkin
- eski unique constraint (`user_id + category + type`) yangi oylik reja logikasiga to'sqinlik qiladi
- bot fallback ishlasa ham, ayrim sxemalarda yozish oqimi `category_limits write fallback exhausted` bilan tugaydi

### 2) Worker → legacy bot adapter zaif edi
`worker/index.js` ichida legacy bot dynamic import qilinadi, lekin handler resolution va env seed yetarli mustahkam emas edi.

Natija:
- ayrim deploylarda `Legacy handler is not a function: bot`
- `api/bot.js` top-level `process.env.*` ga tayanadi, Worker env bilan bridge bo'lmasa import notekis ishlashi mumkin

### 3) Diagnostika xabari yetarli emas edi
Bot va Mini App fallback tugaganda haqiqiy Supabase xatosi yo'qolib, faqat umumiy `fallback exhausted` qaytardi.

Natija:
- haqiqiy sababni logdan topish qiyinlashgan

## Patch qilingan joylar
- `worker/index.js`
  - Worker env → `process.env` seed qo'shildi
  - legacy handler resolution mustahkamlandi
- `api/bot.js`
  - `category_limits` fallback oxirida haqiqiy DB xato matni saqlanadigan qilindi
- `public/app.features.js`
- `dist/app.features.js`
  - Mini App plan save fallback ham haqiqiy xato matnini qaytaradigan qilindi
- `supabase.sql`
  - legacy `category_limits` ni hard-migrate qiluvchi blok qo'shildi
- `SQL_CATEGORY_LIMITS_HARD_FIX.sql`
  - alohida copy-paste uchun tayyor SQL fix

## Eng muhim amaliy yechim
1. Supabase SQL Editor'da `SQL_CATEGORY_LIMITS_HARD_FIX.sql` ni ishga tushiring.
2. Patch qilingan worker/bot kodlarini deploy qiling.
3. So'ng Telegram botda plan yozib sinang:
   - `ozodbek uchun 500 ming limit`
   - `transport 800 ming limit`
4. Mini App > Reja bo'limida yozuv ko'rinishini tekshiring.

## Kutiladigan natija
- bot orqali plan yaratish ishlaydi
- bir kategoriya uchun oyma-oy alohida reja saqlanadi
- legacy unique constraint muammo bermaydi
- agar yana xato chiqsa, logda umumiy emas, aniq DB xatosi ko'rinadi
