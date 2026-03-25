# Release 1.9

## Qisqacha

Bu relizda joriy production bot kodi `kassir_dev` bilan to'liq solishtirildi va prodga tushmay qolgan backend yangilanishlar qayta olib kirildi.
Asosiy fokus bot logger oqimi, cron barqarorligi, worker notification rendering va admin paneldagi userlar boshqaruvi bo'ldi.

## Prod va Dev orasida topilgan farqlar

1. `api/bot.js` ichida devdagi paginatsiyali `admin_users` oqimi prodga tushmagan edi.
2. Botdagi `logErr(...)` prod versiyada `await` qilinmayotgani uchun worker response tugashi bilan log promise'lari yo'qolib ketishi mumkin edi.
3. Yangi user aniqlash prod versiyada faqat `!user` orqali tekshirilgan, shu sabab row mavjud bo'lib telefon raqami hali tasdiqlanmagan userlar notify oqimidan tushib qolardi.
4. Kontakt qayta yuborilganda prod bot mavjud userning `exchange_rate` qiymatini default `12200` ga qayta bosib yuborishi mumkin edi.
5. `lib/telegram-ops.cjs` ichidagi Telegram log delivery retry, HTML parse fallback va admin fallback-notice himoyalari prodga tushmagan edi.
6. `worker/index.js` ichida `renderTemplate(...)` helper'i yo'qolib qolgan, lekin daily reminder/report text builder'lar uni ishlatayotgan edi.
7. Worker va `api/cron-reminders.js` cron tasklari prod versiyada izolyatsiyasiz qolgan edi, bitta task yiqilsa qolgan cron oqimlari ham to'xtab qolardi.

## Root Cause

- Dev branch'dagi keyingi bugfix commitlar production branch'ga ko'chirilmagan.
- Logging tizimi bir necha bosqichda qo'shilgani sabab ayrim helper va safety patchlar qisman merge bo'lib qolgan.
- Worker va cron oqimlari uchun "partial failure tolerant" himoyasi prodga yetib bormagan.
- Registration va admin panel flow'lari regressiya tekshiruvsiz soddalashtirib yuborilgan.

## O'zgargan Fayllar

- `api/bot.js`
- `api/cron-reminders.js`
- `lib/telegram-ops.cjs`
- `worker/index.js`
- `release-1-9.md`

## Tuzatilgan Kamchiliklar

### `api/bot.js`

- Devdagi `ADMIN_USERS_PAGE_SIZE` va callback-based pagination qayta tiklandi.
- `admin_users:<offset>` formatidagi callback'lar yana ishlaydigan bo'ldi.
- `logErr(...)` qayta `await` qilinadigan formatga qaytarildi.
- `normalizePhoneNumber()` va `hasRegisteredPhone()` yordamchilari qayta qo'shildi.
- New registration notify endi faqat `!user` bilan emas, balki real telefon tasdiqlanish holati bilan aniqlanadi.
- Existing user contact yuborganda `exchange_rate` endi sababsiz reset bo'lmaydi.
- Devdagi kabi `LOG_LEVEL` default fallback'i `INFO` ga qaytarildi.

### `lib/telegram-ops.cjs`

- Telegram log yuborishda `429` va `5xx` holatlar uchun retry qo'shildi.
- `can't parse entities` kabi xatolarda HTML parse_mode'dan plain text fallback'ga tushish qayta tiklandi.
- Log channel ishlamasa admin chat'ga fallback notice yuborish qo'shildi.
- Chunk yuborish oqimi devdagi barqaror ko'rinishga to'liq tenglashtirildi.

### `worker/index.js`

- Yo'qolib qolgan `renderTemplate()` helper'i qayta qo'shildi.
- `runCronTask()` va `buildCronTaskFailureResult()` yordamchilari qayta tiklandi.
- `runAllCronJobs()` endi har bir taskni alohida izolyatsiya qilib ishlatadi.
- Bitta cron task xato bersa ham qolgan tasklar ishlashda davom etadi.
- Worker logger config'i devdagi kabi `INFO` default bilan tenglashtirildi.

### `api/cron-reminders.js`

- Manual cron endpoint uchun task-izolatsiya himoyasi qayta tiklandi.
- Endi `daily`, `report`, `debts` oqimlaridan bittasi yiqilsa response butunlay `500` bo'lib ketmaydi.
- Cron logger config'i dev bilan bir xil defaultga qaytarildi.

## Qo'shilgan Dev Yangiliklar

1. Admin panelda userlar ro'yxati sahifalab ko'rsatiladi.
2. Bot logger xabarlari response tugashidan oldin haqiqiy yuboriladi.
3. Telegram logger HTML parse xatolarida ham yiqilmaydi.
4. Telegram log channel muammo bersa admin fallback-notice olish mumkin.
5. Worker daily reminder/report text rendering yana to'liq ishlaydi.
6. Manual va scheduled cron oqimlari partial failure rejimida barqaror ishlaydi.

## Ishlatilgan Test va Check'lar

- `node --check api/bot.js`
- `node --check api/cron-reminders.js`
- `node --check lib/telegram-ops.cjs`
- `node --input-type=module -e "import('./worker/index.js') ..."`
- `npm run cf:check`
- `npm run build`
- Custom logger smoke test: HTML parse fallback ssenariysi
- Custom logger smoke test: admin fallback-notice ssenariysi
- Custom worker smoke test: success va partial-failure cron ssenariylari

## Test Natijalari

- `api/bot.js` syntax check muvaffaqiyatli o'tdi.
- `api/cron-reminders.js` syntax check muvaffaqiyatli o'tdi.
- `lib/telegram-ops.cjs` syntax check muvaffaqiyatli o'tdi.
- Worker import muvaffaqiyatli o'tdi.
- `npm run cf:check` muvaffaqiyatli o'tdi.
- `npm run build` muvaffaqiyatli o'tdi.
- Logger parse fallback testida birinchi yuborish `HTML`, ikkinchisi `parse_mode`siz plain-text fallback bilan muvaffaqiyatli ketdi.
- Logger fallback testida asosiy log channel xato berganda ikkinchi urinish admin chat'ga yuborilgani tasdiqlandi.
- Worker smoke testida success scenariyda `daily` va `report` bittadan yuborildi.
- Worker partial-failure smoke testida `notification_jobs` xato bo'lsa ham endpoint `200` qaytardi va `daily/report` oqimlari ishlashda davom etdi.

## Qolgan Risklar

- Real Telegram kanal/gruppe ichida `LOG_CHANNEL_ID` va bot admin huquqlari prod muhitda alohida tekshirilishi kerak.
- Local smoke test stub fetch bilan o'tkazildi; haqiqiy Supabase schema migratsiyalari alohida prod verifikatsiya talab qiladi.
- Local `node` import testida `MODULE_TYPELESS_PACKAGE_JSON` warning chiqadi, lekin bu worker deploy uchun bloklovchi xato emas.

## Prodga Chiqarishdan Oldin Manual Test

1. `/admin` ichidan `👥 Yangi userlar` tugmasini bosib, `Oldingi/Keyingi` pagination ishlashini tekshiring.
2. Mutlaqo yangi user `/start` va contact yuborganda admin notify kelishini tekshiring.
3. Eski, lekin telefoni hali ro'yxatdan o'tmagan user contact yuborganda notify kelishini tekshiring.
4. Eski user contact yuborganda `exchange_rate` qiymati reset bo'lmayotganini tekshiring.
5. `/api/logging/test` orqali kanal logi va fallback holatini tekshiring.
6. Manual cron run bilan `daily`, `report`, `scheduled queue`, `debt reminder` natijalarini ko'rib chiqing.
