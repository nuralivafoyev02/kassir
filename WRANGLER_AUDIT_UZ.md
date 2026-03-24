# Wrangler / Cloudflare audit

## Hozirgi holat
- Frontend: Vite + Vue, lekin asosiy biznes-logika hanuz `public/app.js` va `public/app.features.js` ichida legacy script sifatida ishlayapti.
- Backend/API: `api/*.js` fayllar Vercel-style handler ko‘rinishida yozilgan.
- Bot qatlami: `node-telegram-bot-api`, `axios`, `fs`, `Buffer`, CommonJS `require()` ishlatilgan.

## To‘liq Wrangler migratsiyasiga asosiy blockerlar
1. `api/bot.js` Worker formatida emas, Node/Vercel handler formatida.
2. `node-telegram-bot-api` va stream/file ishlatadigan joylar Worker runtime uchun qayta yozilishi kerak.
3. `/api/send-report-pdf`, `/api/send-report-files`, `/api/cron-reminders`, `/api/notify-miniapp-tx` bitta Worker router ichiga ko‘chirilishi kerak.
4. Secrets (`BOT_TOKEN`, `SUPABASE_KEY`, `OPENAI_API_KEY`) Wrangler secrets sifatida berilishi kerak.

## Shu patchda nima qilindi
- Mini App transaction save oqimi mustahkamlandi: endi `undefined` o‘rniga real xatolik matni chiqadi.
- Plan/limit wrapper xatoligi transaction save ni yiqitib yubormasligi uchun himoya qo‘shildi.
- Yangi kategoriya yaratish state’i transaction `draft.type` bilan aralashib ketmasligi uchun ajratildi.
- `vite.config.mjs` Cloudflare plugin yo‘q bo‘lsa ham yiqilmaydigan qilindi.

## Keyingi real migratsiya bosqichi
1. `worker/index.js` yoki `src/worker.js` ichida central router yozish.
2. `/api/config.js`, `/api/notify-miniapp-tx`, `/api/cron-reminders` ni birinchi bosqichda ko‘chirish.
3. Telegram bot yuborish qismini `fetch('https://api.telegram.org/bot...')` ga o‘tkazish.
4. Audio/file download stream logikasini Worker-friendly `fetch + arrayBuffer/Blob` ga almashtirish.
5. `wrangler.jsonc` qo‘shish va static assets routing ni ulash.
