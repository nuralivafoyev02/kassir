# Mini App Pages

Bu papka Kassir mini app’ning Cloudflare Pages deploy nuqtasidir.

## Asosiy fayllar
- `index.html` — Pages uchun app shell
- `vite.config.mjs` — build va lokal proxy sozlamalari
- `functions/api/[[path]].js` — Pages Function orqali backend Worker proxy
- `wrangler.jsonc` — Pages konfiguratsiyasi

## Lokal ishga tushirish
```bash
python3 ../../scripts/kassir_cloudflare.py split-env
npm run dev:miniapp
```

## Deploy
```bash
npm run build:miniapp
wrangler pages deploy dist --project-name kassir-miniapp --cwd .
```

`functions/api/[[path]].js` Pages ichida `/api/*` so‘rovlarini backend Worker’ga uzatadi.
