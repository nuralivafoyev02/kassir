# Release v1.8

## Topilgan muammolar

1. `daily_reminder` va `daily_report` vaqt sozlamalari ba'zi holatlarda `09:00` / `22:00` defaultga qaytib ketayotgan edi.
2. Cloudflare worker cron path'ida notification helper funksiyalarining bir qismi umuman aniqlanmagan edi.
3. Worker cron `daily_report` ni umuman ishlatmayotgan edi.
4. Debt reminder oqimi birinchi 300 ta ochiq qarz bilan cheklanib qolayotgan, parallel run paytida esa duplicate yuborish xavfi bor edi.
5. Fullscreen modal va settings overlay'larida `X` close tugmasi ayrim selector override'lari sabab safe-area himoyasidan chiqib ketayotgan edi.
6. Deep-link refresh (`/plan`, `/history`, `/debts`, `/add`) paytida worker asset fallback noto'g'ri ishlagani uchun qora ekran va `Cannot read properties of undefined (reading 'fetch')` xatosi chiqishi mumkin edi.
7. Bot webhook'i optional secret bilan himoyalanmagan edi.
8. Repo ichida qolib ketgan Vercel cron konfiguratsiyasi asl deploy modeli bo'lmagan bo'lsa ham reminder arxitekturasini chalkashtirib yuborayotgan edi.

## Root cause

### Reminder va settings flow

- Vaqt parser faqat `HH:MM` formatini qabul qilgan.
- Supabase `time` ustuni esa ko'pincha `HH:MM:SS` qaytaradi.
- Natijada `02:10:00` qayta o'qilganda parser default `09:00` ga fallback qilgan.
- Shu fallback bot panel, cron va worker'ga bir xil tarqalgan.
- `notification_settings` jadvalida tarixiy/dublikat yozuv bo'lsa, kod deterministic ravishda eng so'nggi yozuvni tanlamagan.

### Fullscreen modal

- Umumiy overlay safe-area patchi bo'lsa ham, `#ov-settings` va mobil `#ov-debt-form/#ov-export` uchun maxsus CSS override'lari padding'ni nolga tushirib yuborgan.
- Shuning uchun close tugmasi yana Telegram native overlay hududiga kirib ketgan.
- Bundan tashqari o'ng/chap safe-area inset'lari umuman CSS arxitekturasiga ulanmagan edi.
- Shu sabab fullscreen profile/settings close tugmalari ayniqsa o'ng yuqori Telegram control'lari bilan to'qnashib qolayotgan edi.

### Refresh / qora ekran

- Worker fetch handler SPA deep-link route'larni (`/plan`, `/history` va boshqalar) xavfsiz `index.html` fallback bilan bermagan.
- Shu yo'lda `env.ASSETS.fetch(...)` mavjud bo'lmagan runtime holatda xato qaytarilgan.
- Frontend route-store esa fallback route query'sini yeb, asl tab/path'ni tiklashni bilmagan.

### Cron deploy modeli

- Amaldagi deploy modeli Cloudflare Worker + Wrangler cron ekan, repo ichidagi Vercel cron izi operatsion haqiqatni noto'g'ri ko'rsatib turgan.
- Shu sabab reminder diagnostikasi paytida qaysi scheduler asosiy ekanini chalkashtirish xavfi bor edi.

## O'zgargan fayllar

- `api/bot.js`
- `api/cron-reminders.js`
- `public/app.js`
- `public/style.css`
- `src/components/overlays/AppOverlays.vue`
- `src/router/routes.js`
- `src/router/route-store.js`
- `README.md`
- `NOTIFICATION_ADMIN_REPORT_UZ.md`
- `package.json`
- `vercel.json`
- `worker/index.js`

## Nimalar tuzatildi

### `api/bot.js`

- `normalizeNotifTime()` endi `HH:MM`, `HH:MM:SS` va datetime ichidagi vaqtni ham to'g'ri ajratadi.
- Notification list oqimi endi eng so'nggi `updated_at/last_sent_at` yozuvni tanlaydi.
- `saveNotificationSetting()` save'dan keyin DB'dan qayta o'qib, kanonik qiymatni qaytaradi.
- Optional Telegram webhook secret validatsiyasi qo'shildi.

### `api/cron-reminders.js`

- Reminder vaqt parseri seconds bilan qaytadigan formatlarni qabul qiladigan bo'ldi.
- `notification_settings` o'qishda latest row tanlash himoyasi qo'shildi.
- Debt reminder oqimi paging bilan ishlaydi.
- Reminder yuborishdan oldin claim qilinadi, xato bo'lsa release qilinadi.
- `x-cron-secret` va `x-internal-secret` header'lari ham qo'llab-quvvatlanadi.

### `public/app.js`

- Telegram safe-area, content-safe-area va visual viewport rezervlari yaxshilandi.
- Endi chap/o'ng Telegram safe-area inset'lari ham CSS variable sifatida sync qilinadi.
- Overlay open/close paytida viewport metrikalari qayta sync qilinadi.
- Hostga oid izoh Cloudflare/Wrangler neytral formatga tozalandi.

### `public/style.css`

- Overlay/sheet max-height va padding'lar Telegram fullscreen safe-area'ga moslashtirildi.
- `sheet` positioned konteyner bo'ldi.
- Receipt viewer, debt modal va settings overlay balandliklari xavfsiz viewport bo'yicha qayta hisoblandi.
- `#ov-settings` va mobil `#ov-debt-form/#ov-export` override'lari safe-area padding'ni bekor qilmaydigan qilib tuzatildi.
- Overlay, settings sheet va close tugmalari endi chap/o'ng safe-area rezervlarini ham hisobga oladi.
- Export/report modali uchun close tugmasi va yengil visual polish qo'shildi.

### `src/components/overlays/AppOverlays.vue`

- Terms / privacy / guide dialog'lari endi umumiy safe-area-aware scroll class bilan ishlaydi.
- Export/report modaliga ham umumiy close tugmasi qo'shildi.

### `src/router/routes.js`

- `/index.html` va trailing slash holatlari to'g'ri normalize qilinadi.

### `src/router/route-store.js`

- Worker fallback redirect query'sidagi `__kassa_route` yutiladi.
- Fallback route brauzer URL'iga qayta tiklanadi va to'g'ri tab hydrate qilinadi.

### `worker/index.js`

- Notification helper funksiyalari real implement qilindi.
- `normalizeNotifTime()` worker ichiga ham qo'shildi.
- Worker cron `daily_report` ni ham to'liq qo'llab-quvvatlaydi.
- `notification_settings` latest row tanlash himoyasi qo'shildi.
- Debt reminder oqimi paging + claim/release bilan mustahkamlandi.
- SPA route'lar uchun `index.html` fallback va asset serve helper qo'shildi.
- Legacy env bridge'ga webhook secret env'lari uzatiladi.
- Daily reminder/report result payload'lariga timezone va local time debug maydonlari qo'shildi.

### `README.md`

- Cron yo'riqnomasi Cloudflare Worker secrets va `wrangler.jsonc` schedule bo'yicha aniqlashtirildi.

### `NOTIFICATION_ADMIN_REPORT_UZ.md`

- Scheduled run uchun Wrangler asosiy manba, `api/cron-reminders.js` esa fallback ekanligi aniq yozildi.

### `package.json`

- Loyihaning asosiy deploy yo'nalishi Cloudflare/Wrangler deb ko'rsatildi.

### `vercel.json`

- Vercel cron bo'limi olib tashlandi, shunda repo'da noto'g'ri asosiy scheduler taassuroti qolmaydi.

## Ishlatilgan test va check'lar

- `npm run build`
- `npm run cf:check`
- `node --check api/cron-reminders.js`
- `node --input-type=module -e "import('./worker/index.js') ... /plan html request"`
- `node --input-type=module -e "import('./src/router/routes.js') ... normalizePath(...)" `
- `node --input-type=module -e "import('./worker/index.js') ... runAllCronJobs result keys"`
- `git diff --stat`

## Test natijalari

- Build muvaffaqiyatli o'tdi.
- Worker va bot syntax check muvaffaqiyatli o'tdi.
- `api/cron-reminders.js` syntax check muvaffaqiyatli o'tdi.
- Worker SPA fallback simulyatsiyasida `/plan` uchun `302 -> /index.html?__kassa_route=%2Fplan` qaytdi.
- Route normalize testi `/index.html -> /`, `/plan/ -> /plan`, `/history -> /history` natija berdi.
- Worker manual cron route'i auth va DB/API env talab qilgani sabab to'liq runtime yuborish lokal muhitda bajarilmadi; payload debug maydonlari diff va syntax review orqali tekshirildi.

## Qolgan risklar

- Haqiqiy Telegram iPhone/Android WebApp ichida vizual smoke test baribir kerak, chunki terminal ichida native overlay/UI qatlamini ko'rib bo'lmaydi.
- Debt reminder uchun hozirgi claim/release duplicate ehtimolini keskin kamaytiradi, lekin to'liq exactly-once semantika uchun DB darajasida alohida processing marker yoki transaction kerak bo'lishi mumkin.
- Worker fallback redirect scenariysi HTML route'lar uchun mustahkamlandi, lekin prod deploy'da bir marta real refresh smoke test qilish shart.

## Prodga chiqarishdan oldin manual test

1. Bot admin paneldan `/notif time daily_reminder 02:10` bering.
2. `notification_settings` jadvalida `send_time` `02:10:00` yoki `02:10` ko'rinishida saqlanayotganini tekshiring.
3. Bot paneli va cron response'da shu qiymat `02:10` sifatida qaytayotganini tekshiring.
4. Fullscreen settings, add category, plan, debt modal va receipt viewer ichida `X` tugmasi iPhone va Android Telegram WebApp'da bosilishini tekshiring.
5. `/plan`, `/history`, `/debts`, `/add` route'larida refresh qilib, app qora ekran bermasligini tekshiring.
6. Manual cron run bilan `daily_reminder`, `daily_report` va debt reminder payload'larini tekshiring.
7. Cloudflare dashboard yoki `wrangler tail` orqali scheduled event har 30 daqiqada ishlayotganini tasdiqlang.
