# Backend Worker

Bu papka Kassir bot va API qatlamining Cloudflare Worker deploy nuqtasidir.

## Asosiy fayllar
- `wrangler.jsonc` — Worker konfiguratsiyasi
- `worker-entry.mjs` — backend uchun kirish nuqtasi

## Lokal ishga tushirish
```bash
python3 ../../scripts/kassir_cloudflare.py split-env
npx wrangler dev --config wrangler.jsonc --local
```

## Deploy
```bash
python3 ../../scripts/kassir_cloudflare.py deploy-backend
```

`../../.env` dagi qiymatlar `apps/backend/.dev.vars` ga avtomatik ajratiladi.
