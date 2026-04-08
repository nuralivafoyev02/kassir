# Kassir — split Cloudflare architecture

Bu versiyada Kassir mini app dizayni va UX/UI oqimi o‘zgartirilmasdan loyiha Cloudflare uchun ikki alohida deploy target’ga ajratildi:
- `apps/backend` — Telegram bot + API + cron uchun Worker
- `apps/miniapp` — Vite build + Pages Function proxy bilan mini app

Legacy UI va biznes logika hanuz ehtiyotkor bosqichma-bosqich saqlangan, shuning uchun ko‘rinish va foydalanuvchi oqimi avvalgidek ishlaydi.

## Yangi arxitektura
- `apps/backend/wrangler.jsonc` — backend Worker konfiguratsiyasi
- `apps/backend/worker-entry.mjs` — Worker entrypoint
- `apps/miniapp/index.html` — Pages app shell
- `apps/miniapp/vite.config.mjs` — alohida mini app build/proxy config
- `apps/miniapp/functions/api/[[path]].js` — Pages ichidan backend Worker proxy
- `scripts/kassir_cloudflare.py` — root `.env` dan env split, dev va deploy orchestration
- `src/*` va `public/*` — mavjud UI/source, vizual regressiyasiz qayta ishlatilyapti

## Nima o‘zgardi
- UI / CSS / DOM id-class va inline eventlar saqlab qolindi.
- Legacy biznes logika hanuz `public/app.js` ichida ishlaydi.
- Katta `src/App.vue` bo‘laklarga ajratildi.
- Frontend endi Cloudflare Pages sifatida alohida build bo‘ladi.
- Backend endi Cloudflare Worker sifatida alohida deploy qilinadi.
- Pages ichida `/api/*` uchun Worker service binding proxy qatlami qo‘shildi.
- Root `.env` dan `apps/backend/.dev.vars`, `apps/miniapp/.dev.vars`, `apps/miniapp/.env.local` avtomatik yaratiladi.
- URL route qo‘llab-quvvatlashi qo‘shildi:
  - `/` → Dashboard
  - `/add` → Qo‘shish
  - `/history` → Tarix
- Legacy tab switch va browser route bir-biriga sinxron qilindi.

## Kod struktura
- `apps/backend/*` — Worker deploy paketi
- `apps/miniapp/*` — Pages deploy paketi
- `src/App.vue` — root shell
- `src/views/DashboardView.vue` — bosh sahifa
- `src/views/AddView.vue` — tranzaksiya qo‘shish sahifasi
- `src/views/HistoryView.vue` — tarix sahifasi
- `src/components/core/*` — loader va PIN qatlamlari
- `src/components/nav/BottomNav.vue` — pastki navigatsiya
- `src/components/overlays/AppOverlays.vue` — modal/sheet/subpage’lar
- `src/router/routes.js` — route map
- `src/router/route-store.js` — lightweight route bridge
- `src/lib/loadLegacyScripts.js` — legacy script loader
- `public/style.css` — original CSS
- `public/app.js` — original JS logika + route bridge patch

## Muhim tamoyil
- Dizayn qayta chizilmagan.
- Legacy JS birdaniga rewrite qilinmagan.
- Refactor xavfsiz bosqich bilan qilindi: avval markup bo‘lindi, keyin route bridge qo‘shildi.

## Ishga tushirish
```bash
npm install
npm run dev
```

Bu buyruq avtomatik ravishda:
- root `.env` dan app env fayllarini yaratadi
- backend Worker lokal serverini ishga tushiradi
- mini app Vite dev serverini ishga tushiradi

## Build
```bash
npm run build
npm run preview
```

## Cloudflare deploy
```bash
npm run cf:setup
python3 scripts/kassir_cloudflare.py deploy
```

Yoki alohida:
```bash
python3 scripts/kassir_cloudflare.py deploy-backend
python3 scripts/kassir_cloudflare.py deploy-miniapp
```

## Env boshqaruvi
- Root secretlar `/.env` ichida qoladi.
- Lokal Worker env: `apps/backend/.dev.vars`
- Lokal Pages fallback env: `apps/miniapp/.dev.vars`
- Lokal Vite proxy env: `apps/miniapp/.env.local`
- Template’lar: `apps/backend/.dev.vars.example`, `apps/miniapp/.dev.vars.example`, `apps/miniapp/.env.local.example`

## Keyingi bosqich uchun tayyor poydevor
Endi quyidagilarni xavfsizroq joriy qilish mumkin:
- kategoriya logikasini alohida service/store’ga ajratish
- AI classification qatlamini qo‘shish
- limit va notification modulini alohida bo‘limga ko‘chirish
- add/history/settings oqimlarini bosqichma-bosqich legacy JS’dan Vue composable/store’ga o‘tkazish


## Feature upgrade

- Debts: `/debts` now supports add/edit/delete/mark-paid flow and due-date reminders.
- Plan: `/plan` now supports per-category spending limits and warning thresholds.
- Settings > Categories: now active with keyword editing, icon editing, delete and usage preview.
- Cron reminders: add `CRON_SECRET` in Cloudflare Worker secrets and apply the latest `supabase.sql` migrations. Asosiy cron schedule `apps/backend/wrangler.jsonc` ichida yuradi.




## Last update need to push to prod

worker/index.js
api/send-report-files.js
api/send-report-pdf.js
