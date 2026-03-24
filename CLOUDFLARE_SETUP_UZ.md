# Cloudflare deployment yo'riqnomasi

## 1. Dependencies
```bash
npm install
```

## 2. Secrets
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CRON_SECRET
```

`OWNER_ID`, `ADMIN_IDS`, `WEBAPP_URL` qiymatlarini `wrangler.jsonc` dagi `vars` bo'limiga qo'shish mumkin yoki secret qilib saqlang.

## 3. Telegram webhook
Deploydan keyin webhook ni Worker endpointga ulang:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/api/bot"
```

## 4. Deploy
```bash
npm run build
npx wrangler deploy
```

## 5. Health check
- `/api/health`
- `/api/debug-telegram`

## 6. Eslatma
Mini App `?user_id=` query paramisiz ham Telegram WebApp ichida ochilganda `initDataUnsafe.user.id` ni oladi.
