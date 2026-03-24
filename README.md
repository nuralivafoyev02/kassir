# Kassa Premium — Vite + Vue route refactor

Bu versiyada ishlayotgan mini app vizual ko‘rinishi o‘zgartirilmasdan ichki tuzilma route va componentlarga ajratildi.

## Nima o‘zgardi
- UI / CSS / DOM id-class va inline eventlar saqlab qolindi.
- Legacy biznes logika hanuz `public/app.js` ichida ishlaydi.
- Katta `src/App.vue` bo‘laklarga ajratildi.
- URL route qo‘llab-quvvatlashi qo‘shildi:
  - `/` → Dashboard
  - `/add` → Qo‘shish
  - `/history` → Tarix
- Legacy tab switch va browser route bir-biriga sinxron qilindi.

## Yangi struktura
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

Yoki:

```bash
npm install
node server.js
```

## Build
```bash
npm run build
npm run preview
```

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
- Cron reminders: add `CRON_SECRET` in Vercel env and apply the latest `supabase.sql` migrations.
