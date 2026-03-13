# Kassa Bot

Bu loyiha Telegram boti va web-app (`index.html`) bilan birga Supabase bazasida moliyaviy tranzaksiyalarni boshqaradi.

## ✅ Nima o'zgartirildi
- `node_modules/` katalogi Git tarixiga qo'shilmasligi uchun **`.gitignore`** ga qo'shildi va hozirgi repositordagi `node_modules/` fayllari Git indeksidan olib tashlandi.

---

## 🔧 Talablar
- Node.js (14+ tavsiya etiladi)
- `npm` yoki `pnpm` (yoki `yarn`)

---

## 🧩 Muhit o'zgaruvchilari (ENV)
Quyidagi o'zgaruvchilar `api/bot.js` va (`app.js` ichida hozircha to'g'ridan-to'g'ri yozilgan) Supabase va Telegram bot uchun ishlatiladi.

> **Eslatma:** Hech qachon maxfiy kalitlarni GitHub-ga qo'shmang. Ularni **.env** faylga joylang yoki GitHub Secrets/Deploy envs sifatida sozlang.

### Kerakli o'zgaruvchilar
- `BOT_TOKEN` — Telegram boti tokeni (BotFather dan olasiz)
- `SUPABASE_URL` — Supabase loyihangiz URL manzili
- `SUPABASE_KEY` — Supabase `anon` yoki `service_role` kaliti (xavfsizlikni inobatga oling)
- `OPENAI_API_KEY` — (ixtiyoriy) OpenAI API kaliti (agar OpenAI integratsiyasi ishlatilsa)

### Masalan `.env` fayli
```env
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-...
```

---

## 🚀 Loyihani ishga tushirish
1. Paketlarni o'rnating:
```bash
npm install
```

2. Telegram botni ishga tushiring:
```bash
node api/bot.js
```

> **Eslatma:** `api/bot.js` faylida `polling: false` sozlangan (webhook rejimi). Agar `polling` ishlashi kerak bo'lsa, `new TelegramBot(token, { polling: true })` deb o'zgartiring.

---

## 🧠 Botdan qanday foydalanish
Bot sizga moliyaviy tranzaksiyalarni tez kiritish imkonini beradi.

### 1) Chiqim (xarajat) yozish
- `50 ming tushlik`
- `-50$ bozorlik`
- Ovozli xabar yuborish (Telegram) ham qo'llab-quvvatlanadi

### 2) Kirim (daromad) yozish
- `2 mln oylik`
- `100 dollar bonus oldim`

### 3) Hisobotlar
- `📊 Bugungi Hisobot`
- `📅 Oylik Hisobot`
- `↩️ Oxirgisini O'chirish`

---

## 📌 Qo'shimcha maslahatlar
- **Maxfiy kalitlar**: kod ichida (masalan `app.js` ichidagi `SUPABASE_KEY`) yoki GitHub da ochiq joyda saqlamaslik kerak. Buning o'rniga, ularni `.env` faylga qo'ying.
- Agar loyihani GitHub ga yuborgan bo'lsangiz va node_modules ham ketgan bo'lsa, remote reponi tozalash uchun `git push` dan keyin quyidagi buyruqlarni ishlatishingiz mumkin:
  ```bash
  git rm -r --cached node_modules
  git commit -m "Remove node_modules from repo"
  git push
  ```

---

## 🧰 Fayl tuzilishi
- `index.html` — web interfeys
- `app.js` — frontend JavaScript
- `api/bot.js` — Telegram bot server kodi

Omad!
