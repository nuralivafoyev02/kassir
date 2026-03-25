# Release 1.9

## Qisqacha

Bu relizda loyiha ichiga markaziy Telegram logging tizimi qo'shildi va yangi foydalanuvchi muvaffaqiyatli ro'yxatdan o'tganda adminga notify yuborish oqimi qo'shildi.
Keyingi yangilanishda `LOG_LEVEL` ko'p qiymatli formatni ham qabul qiladigan bo'ldi va `/start` triggerlari uchun ham `SUCCESS` log qo'shildi.

## Topilgan muammolar

1. Bot, cron va worker loglari tarqoq edi, format bir xil emas edi.
2. Worker/local console loglari signal-shovqin nisbatini buzayotgan edi.
3. Muhim `ERROR`/`SUCCESS`/`INFO` hodisalarini markaziy joyda kuzatish qiyin edi.
4. Yangi user ro'yxatdan o'tganda admin avtomatik xabardor bo'lmas edi.
5. Error payload ichida maxfiy qiymatlar logga tushib ketish xavfi bor edi.
6. Worker ichidagi legacy bot handler logging env'larini to'liq olmayotgani uchun kanal loglari amalda chiqmay qolishi mumkin edi.
7. Logger jim yiqilayotgan holatlarda Telegram API'ning aniq javobini olish uchun alohida diagnostika endpointi yo'q edi.
8. Legacy bot handler ichida `void logger.info/success(...)` tarzidagi fire-and-forget loglar response qaytgach yo'qolib ketishi mumkin edi.

## Root cause

- Loyiha bo'ylab yagona logger abstractionsi yo'q edi.
- Har qatlam o'zicha `console.log`/`console.error` ishlatgan.
- Telegram kanalga yuboriladigan loglar uchun formatlash, sanitize, chunklash va fallback qoidalari markazlashmagan edi.
- Register oqimida "haqiqiy yangi user" va "eski user qayta kontakt yubordi" holatlari alohida notify qoidasi bilan ajratilmagan edi.
- Worker `seedLegacyProcessEnv()` ichida `LOG_CHANNEL_ID`, `TELEGRAM_LOGGING_ENABLED`, `LOG_LEVEL`, `LOCAL_LOG_LEVEL`, `ADMIN_NOTIFY_CHAT_ID` kabi logging env'lari uzatilmayotgan edi.
- Telegram kanalga yozish bo'yicha runtime diagnostika yo'qligi sabab `chat not found`, `forbidden`, `not enough rights` kabi xatolarni tez ajratish qiyin edi.
- Worker legacy adapter javobni tez qaytargani uchun `await` qilinmagan logger promise'lari kanalga yetib bormasdan tushib qolishi mumkin edi.

## O'zgargan fayllar

- `lib/telegram-ops.cjs`
- `api/bot.js`
- `api/cron-reminders.js`
- `worker/index.js`

## Nimalar qo'shildi va tuzatildi

### `lib/telegram-ops.cjs`

- Markaziy Telegram logger util yaratildi.
- `ERROR`, `SUCCESS`, `INFO` level'lari qo'shildi.
- `LOG_LEVEL=ERROR,SUCCESS,INFO` kabi ko'p qiymatli format ham qo'llab-quvvatlanadi.
- Bitta qiymat berilsa eski threshold xulqi saqlanadi.
- `SUCCES` yozilgan bo'lsa ham `SUCCESS` sifatida qabul qilinadi.
- Pretty JSON formatting qo'shildi.
- Uzun payloadlar xavfsiz chunklarga bo'linadigan qilindi.
- `token`, `secret`, `authorization`, `cookie`, `api_key`, `service_role`, `bot_token`, `openai_key` va shunga o'xshash maxfiy maydonlar `[REDACTED]` qilinadigan bo'ldi.
- `user_name` fallback tartibi qo'shildi:
  1. `@username`
  2. `full_name`
  3. `phone_number`
  4. `chat_id`
  5. `unknown`
- Admin uchun yangi user notify formatter qo'shildi.

### `api/bot.js`

- Bot ichiga markaziy logger integratsiya qilindi.
- `logErr(...)` endi lokal console bilan birga Telegram kanalga ham xavfsiz `ERROR` yubora oladi.
- Notification settings o'zgarishlari uchun `INFO` loglar qo'shildi:
  - holat yoqish/o'chirish
  - vaqt o'zgartirish
  - default reset
  - matn yangilash
- `/admin`, `/notif`, `/notif help`, `/notif test` uchun ham `INFO` loglar qo'shildi.
- Yangi user contact yuborib muvaffaqiyatli ro'yxatdan o'tsa:
  - `SUCCESS` log yuboriladi
  - adminga alohida notify yuboriladi
- `/start` bosganlar uchun ham `SUCCESS` log qo'shildi:
  - yangi user bo'lsa kontakt so'rovi yuborilgani
  - ro'yxatdan o'tgan user bo'lsa start greeting yuborilgani
- Notify faqat haqiqiy yangi user uchun ishlaydi.

### `api/cron-reminders.js`

- Cron run yakunida umumiy summary logger qo'shildi.
- Xato bo'lsa `ERROR`, yuborishlar bo'lsa `SUCCESS` log chiqadi.
- Top-level cron handler xatolari Telegramga yuboriladi.

### `worker/index.js`

- Worker uchun markaziy logger integratsiyasi qo'shildi.
- `notify-miniapp-tx`, `notifications/schedule`, `notifications/due`, `notifications/test`, `manual cron`, `scheduled cron`, `worker.fetch` xatolari loggerga ulandi.
- Shovqinli `console.error` va `console.log` lar kamaytirildi.
- Client log console chiqishi `CLIENT_CONSOLE_LOGS_ENABLED` env orqali boshqariladigan qilindi.
- Scheduled cron natijasi:
  - xato bo'lsa `ERROR`
  - yuborish bo'lsa `SUCCESS`
  - no-op bo'lsa faqat minimal local log
- Legacy bot handler uchun logging env bridge to'liq qilindi, shuning uchun worker secret/vars endi `api/bot.js` ichida ham ko'rinadi.
- `/api/logging/test` endpointi qo'shildi. U auth bilan himoyalangan va Telegram kanalga to'g'ridan-to'g'ri test xabar yuborib, real natijani JSON ko'rinishida qaytaradi.
- Bot ichidagi muhim `INFO` va `/start` `SUCCESS` loglari `await` qilinadigan bo'ldi, shuning uchun ular worker javobi tugashidan oldin real yuboriladi.

## Yangi env tavsiyalari

- `TELEGRAM_LOGGING_ENABLED=true`
- `LOG_CHANNEL_ID=<telegram kanal id>`
- `LOG_LEVEL=SUCCESS`
- yoki `LOG_LEVEL=ERROR,SUCCESS,INFO`
- `LOCAL_LOG_LEVEL=ERROR`
- `ADMIN_NOTIFY_CHAT_ID=<admin chat id>`
- `CLIENT_CONSOLE_LOGS_ENABLED=false`
npx wrangler secret put CLIENT_CONSOLE_LOGS_ENABLED
npx wrangler secret put ADMIN_NOTIFY_CHAT_ID

## Log format

Telegram kanalga yuboriladigan loglar quyidagi ko'rinishda:

- `[ERROR]`
- `[SUCCESS]`
- `[INFO]`
- `source`
- `scope`
- `user_id`
- `user_name`
- `xabar`
- pretty-printed payload

## New user admin notify formati

Adminga yuboriladigan xabar:

- `Yangi foydalanuvchi qo'shildi`
- `source: bot start/register`
- `user_id`
- `user_name`
- `phone_number`
- `full_name`
- `registered_at`

## Ishlatilgan test va check'lar

- `npm run build`
- `npm run cf:check`
- `node --check api/cron-reminders.js`
- `node --check lib/telegram-ops.cjs`
- `node --input-type=module -e "import('./lib/telegram-ops.cjs') ... sanitize/info test"`
- `node --input-type=module -e "import('./lib/telegram-ops.cjs') ... admin notify format test"`
- `git diff --stat`

## Test natijalari

- Build muvaffaqiyatli o'tdi.
- Worker va bot syntax check muvaffaqiyatli o'tdi.
- Cron syntax check muvaffaqiyatli o'tdi.
- Logger sanitize testi muvaffaqiyatli o'tdi.
- New user notify format testi muvaffaqiyatli o'tdi.

## Qolgan risklar

- Real Telegram kanalga yuborish uchun bot kanalga admin qilingan bo'lishi kerak.
- `LOG_CHANNEL_ID` noto'g'ri bo'lsa loglar chiqmaydi, lekin asosiy flow yiqilmaydi.
- `LOG_LEVEL=INFO` production'da ortiqcha ko'p log berishi mumkin.

## Prodga chiqarishdan oldin manual test

1. `LOG_CHANNEL_ID` va `TELEGRAM_LOGGING_ENABLED=true` bilan bitta test error log yuborilishini tekshiring.
2. `LOG_LEVEL=SUCCESS` holatida cron summary logi kelishini tekshiring.
2.1 `LOG_LEVEL=ERROR,SUCCESS,INFO` holatida `/admin` yoki `/notif` berib `INFO` log tushishini tekshiring.
3. Mutlaqo yangi user `/start` + contact yuborganda admin notify kelishini tekshiring.
3.1 Yangi user `/start` bosganda `SUCCESS` log, contact yuborganda yana `SUCCESS` log kelishini tekshiring.
3.2 Eski user `/start` bosganda `SUCCESS` log kelishini tekshiring.
4. Eski user qayta contact yuborganda admin notify qayta ketmasligini tekshiring.
5. Kanalga tushgan loglarda secret/token chiqmayotganini tekshiring.
