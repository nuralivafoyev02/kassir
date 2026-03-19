'use strict';
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ─── ENV CHECKS ──────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const OAI_KEY = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN yo\'q');
if (!SUPA_URL) throw new Error('SUPABASE_URL yo\'q');
if (!SUPA_KEY) throw new Error('SUPABASE_KEY (SERVICE_ROLE yoki anon) yo\'q');

// ─── CLIENTS ─────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

// OpenAI — faqat ovozli xabar uchun (ixtiyoriy)
let openai = null;
if (OAI_KEY && !OAI_KEY.startsWith('your-')) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: OAI_KEY });
  } catch (e) {
    console.warn('[BOT:openai] OpenAI moduli topilmadi:', e.message);
  }
}

// ─── CONSTANTS ───────────────────────────────────────────
const KB = {
  keyboard: [
    ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
    ['↩️ Oxirgisini O\'chirish', '❓ Qo\'llanma'],
  ],
  resize_keyboard: true,
};

const GUIDE = `<b>📖 Qo'llanma</b>

Menga yozing yoki <b>ovozli xabar</b> yuboring 🎙

<b>Chiqim:</b>
  · <i>50 ming tushlik</i>
  · <i>-30000 transport</i>
  · 🎙 <i>"Taksiga 20 ming berdim"</i>

<b>Kirim:</b>
  · <i>+2 mln oylik</i>
  · <i>100 dollar bonus tushdi</i>
  · 🎙 <i>"Mijozdan 500 ming oldim"</i>

<b>Rasm + matn:</b> Chek rasmini izoh bilan yuboring

<b>Valyuta kursi</b> Kassa App sozlamalaridan olinadi.`;

const DEFAULT_RATE = 12850;

// ─── LOGGING ─────────────────────────────────────────────
const log = (scope, data) => console.log(`[BOT:${scope}]`, JSON.stringify(data));
const warn = (scope, data) => console.warn(`[BOT:${scope}]`, JSON.stringify(data));
const logErr = (scope, e, extra = {}) => console.error(`[BOT:${scope}]`, { msg: e?.message || String(e), ...extra });

// ─── UTILS ───────────────────────────────────────────────
const iso = (ms = Date.now()) => new Date(ms).toISOString();

// HTML entity escape
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Raqamni lokal formatda ko'rsatish
const numFmt = n => Number(n || 0).toLocaleString('ru-RU');

// ─── TEXT PARSER ──────────────────────────────────────────
// Matndan summa, tur va kategoriyani ajratib olish
function parseText(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const lower = text.toLowerCase();

  // Dollar belgilari bormi?
  const isUSD = /\$|\busd\b|dollar/i.test(lower);

  // Belgilarni tozalash — raqam, bo'shliq, nuqta, vergulni qoldirish
  let clean = lower
    .replace(/so'?m|sum|uzs|\$|€|\busd\b|dollar/gi, ' ')
    .replace(/[^\d\s.,a-z']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Raqam va suffix topish
  // Masalan: "50 ming", "2mln", "100 000", "30,000"
  const m = clean.match(/(\d[\d\s,.]*)(\s*(?:k|ming|mln|mlrd|million|milliard|m|b)\b)?/i);
  if (!m) return null;

  // Raqamni tozalash: minglik ajratgichlarni olib tashlash
  // "1 000 000" => "1000000", "1,000" => "1000", "12.5" => "12.5"
  let numStr = m[1].trim();

  // Agar vergul minglik ajratgich bo'lsa yoki nuqta bo'lsa:
  // "1,500" -> 1500; "1.5" -> 1.5; "1 500" -> 1500
  numStr = numStr
    .replace(/,(?=\d{3}(\D|$))/g, '') // minglik vergul ajratgich
    .replace(/\s/g, '');              // bo'shliqlarni olib tashlash

  const amount = parseFloat(numStr);
  if (!amount || isNaN(amount) || !isFinite(amount)) return null;

  // Suffix multiplier
  const suffix = (m[2] || '').replace(/\s/g, '').toLowerCase();
  let finalAmount = amount;
  if (suffix === 'k' || suffix === 'ming') finalAmount = amount * 1_000;
  else if (suffix === 'mln' || suffix === 'million' || suffix === 'm') finalAmount = amount * 1_000_000;
  else if (suffix === 'mlrd' || suffix === 'milliard' || suffix === 'b') finalAmount = amount * 1_000_000_000;

  if (!isFinite(finalAmount) || finalAmount <= 0) return null;

  // Tur aniqlash (income / expense)
  const incWords = ['kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus',
    'qaytdi', 'foyda', 'oldim', 'topdi', 'yutdi', 'daromad'];
  const expWords = ['chiqim', 'ketdi', 'berdim', 'sarfladim', 'xarajat',
    'sotib', 'taksi', 'ovqat', 'toladi', 'toladim', 'tushlik', 'kechki'];

  // Suffix checks (Uzbek)
  const hasDan = /\w+dan\b/i.test(lower); // from ... (usually income)
  const hasGa = /\w+ga\b/i.test(lower);   // to ... (usually expense)

  let type = 'expense'; // sukut bo'yicha chiqim

  // Aniq belgilar
  if (/^\+/.test(lower)) type = 'income';
  else if (/^-/.test(lower)) type = 'expense';
  // Suffix override: "akamdan" "oylikdan" etc. should be income as per user request
  else if (hasDan) type = 'income'; 
  // Kalit so'zlar
  else if (incWords.some(w => lower.includes(w))) type = 'income';
  else if (expWords.some(w => lower.includes(w))) type = 'expense';
  else if (hasGa) type = 'expense';

  // Kategoriya: raqam va suffixni olib tashlagan qoldiq
  let catPart = clean
    .replace(m[0], '')
    .replace(/^\s*[+\-]\s*/, '')
    .trim();

  // Juda qisqa yoki bo'sh bo'lsa standart nom
  if (!catPart || catPart.length < 2) {
    catPart = type === 'income' ? 'kirim' : 'xarajat';
  }

  // Birinchi harfni katta
  const category = catPart.charAt(0).toUpperCase() + catPart.slice(1);

  return {
    amount: Math.round(finalAmount),
    type,
    category,
    isUSD,
  };
}

// ─── SAVE TRANSACTION ────────────────────────────────────
async function saveTx(userId, chatId, parsed, receiptUrl = null, exRate = DEFAULT_RATE, replyId = null) {
  const safeRate = Number(exRate) > 0 ? Number(exRate) : DEFAULT_RATE;

  let amount = parsed.amount;
  let category = parsed.category;
  let amtTxt = `${numFmt(amount)} so'm`;

  if (parsed.isUSD) {
    amount = Math.round(parsed.amount * safeRate);
    category = `${parsed.category} ($${parsed.amount})`;
    amtTxt = `${numFmt(amount)} so'm\n<i>($${numFmt(parsed.amount)} × ${numFmt(safeRate)})</i>`;
  }

  const row = {
    user_id: userId,
    amount,
    category,
    type: parsed.type,
    date: iso(),
    receipt_url: receiptUrl || null,
  };

  const { data, error } = await db.from('transactions').insert(row).select().single();
  if (error) {
    logErr('save-tx', error, { userId, chatId, amount, category });
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik. Keyinroq urinib ko\'ring.').catch(() => { });
    return null;
  }

  const ico = parsed.type === 'income' ? '🟢' : '🔴';
  const typ = parsed.type === 'income' ? 'Kirim' : 'Chiqim';
  const chk = receiptUrl ? '📸 Bor' : 'Yo\'q';

  const opts = { parse_mode: 'HTML' };
  if (replyId) opts.reply_to_message_id = replyId;

  await bot.sendMessage(chatId,
    `✅ <b>Saqlandi!</b>\n\n` +
    `${ico} <b>Turi:</b> ${typ}\n` +
    `💰 <b>Summa:</b> ${amtTxt}\n` +
    `📂 <b>Kategoriya:</b> ${esc(category)}\n` +
    `🧾 <b>Chek:</b> ${chk}`,
    opts
  ).catch(() => { });

  log('tx-saved', { userId, id: data.id, type: data.type, amount: data.amount });
  return data;
}

// ─── REPORT BUILDER ──────────────────────────────────────
function buildReport(rows, title) {
  const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const bal = inc - exp;

  // Top 5 chiqim kategoriyalar
  const catMap = {};
  rows.filter(r => r.type === 'expense').forEach(r => {
    catMap[r.category] = (catMap[r.category] || 0) + (Number(r.amount) || 0);
  });
  const top = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, v]) => `  · ${esc(c)}: <b>${numFmt(v)}</b>`)
    .join('\n');

  return `📊 <b>${esc(title)}</b>\n\n` +
    `📥 Kirim:  <b>+${numFmt(inc)} so'm</b>\n` +
    `📤 Chiqim: <b>-${numFmt(exp)} so'm</b>\n` +
    `━━━━━━━━━━━━\n` +
    `${bal >= 0 ? '🤑' : '💸'} Qoldiq: <b>${numFmt(bal)} so'm</b>` +
    (top ? `\n\n<b>Top kategoriyalar:</b>\n${top}` : '');
}

// ─── MAIN HANDLER ────────────────────────────────────────
module.exports = async (req, res) => {
  // Webhook sog'liqi tekshiruvi
  if (req.method !== 'POST') {
    return res.status(200).send('Kassa Bot ishlayapti 🚀');
  }

  try {
    const update = req.body || {};

    // ── Inline Query Handlers ──
    if (update.inline_query) {
      const q = update.inline_query;
      const text = q.query.trim();
      if (!text) return res.status(200).json({ ok: true });

      const parsed = parseText(text);
      if (!parsed) return res.status(200).json({ ok: true });

      const title = parsed.type === 'income' ? '🟢 Kirim' : '🔴 Chiqim';
      const amount = numFmt(parsed.amount);
      const cat = esc(parsed.category);

      const result = {
        type: 'article',
        id: 'tx_' + Date.now(),
        title: `${title}: ${amount} so'm`,
        description: `📂 Kategoriya: ${cat}${parsed.isUSD ? ' ($)' : ''}\n✨ Saqlash uchun bosing`,
        input_message_content: {
          message_text: `✅ <b>Kassa:</b> ${title}\n💰 <b>Summa:</b> ${amount} so'm\n📂 <b>Kategoriya:</b> ${cat}`,
          parse_mode: 'HTML'
        }
      };

      await bot.answerInlineQuery(q.id, [result], { cache_time: 0 }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    if (update.chosen_inline_result) {
      const cir = update.chosen_inline_result;
      const userId = cir.from.id;
      const query = cir.query;
      const parsed = parseText(query);
      if (parsed) {
        let { data: user } = await db.from('users').select('exchange_rate').eq('user_id', userId).maybeSingle();
        await saveTx(userId, userId, parsed, null, user?.exchange_rate || DEFAULT_RATE);
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;

    // Callback query va boshqa turdagi update'lar — e'tiborsiz
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat?.id;
    const userId = msg.from?.id;

    if (!chatId || !userId) return res.status(200).json({ ok: true });

    const text = (msg.text || msg.caption || '').trim();

    log('msg', {
      userId,
      chatId,
      type: msg.voice ? 'voice' : msg.photo ? 'photo' : msg.contact ? 'contact' : 'text',
    });

    // ── Foydalanuvchi ma'lumotlarini olish ──
    let { data: user, error: uErr } = await db
      .from('users').select('*').eq('user_id', userId).maybeSingle();
    if (uErr) warn('user-fetch', { userId, msg: uErr.message });

    // ── Telefon raqami ro'yxatdan o'tkazish ──
    if (msg.contact) {
      // Faqat o'z kontaktini yuborishga ruxsat
      if (msg.contact.user_id !== userId) return res.status(200).json({ ok: true });

      const { error: regErr } = await db.from('users').upsert({
        user_id: userId,
        phone_number: msg.contact.phone_number,
        full_name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || `User ${userId}`,
        last_start_date: iso(),
        exchange_rate: DEFAULT_RATE,
      }, { onConflict: 'user_id' });

      if (regErr) {
        logErr('reg', regErr, { userId });
        return res.status(200).json({ ok: false });
      }

      await bot.sendMessage(chatId,
        `🎉 <b>Ro'yxatdan o'tdingiz!</b>\n\nEndi kirim-chiqimlarni yozishingiz mumkin.\n\n${GUIDE}`,
        { reply_markup: KB, parse_mode: 'HTML' }
      ).catch(() => { });

      return res.status(200).json({ ok: true });
    }

    // ── Yangi foydalanuvchi — telefon so'rash ──
    if (!user) {
      await bot.sendMessage(chatId,
        '👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.',
        {
          reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Admin Broadcast (/message ...) ──
    if (text.startsWith('/message')) {
      const allowedAdmins = (process.env.ADMIN_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!allowedAdmins.includes(String(userId))) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const waitMsg = await bot.sendMessage(chatId, '⏳ Xabar barcha foydalanuvchilarga jo\'natilmoqda...');

      const { data: allUsers, error: fErr } = await db.from('users').select('user_id');
      if (fErr || !allUsers?.length) {
        await bot.editMessageText('⚠️ Foydalanuvchilarni olishda xatolik.',
          { chat_id: chatId, message_id: waitMsg.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const parts = text.replace('/message', '').trim().split(/\s*\n--\n\s*/);
      const broadcastText = parts[0].trim();
      let reply_markup = null;

      if (parts[1]) {
        const lines = parts[1].split('\n').filter(l => l.includes('|'));
        if (lines.length > 0) {
          reply_markup = {
            inline_keyboard: lines.map(line => {
              const [btnText, btnUrl] = line.split('|').map(s => s.trim());
              return [{ text: btnText, url: btnUrl }];
            })
          };
        }
      }

      let success = 0, failed = 0;

      const sendOne = async (uid) => {
        const opts = { caption: broadcastText, parse_mode: 'HTML', reply_markup };
        try {
          if (msg.reply_to_message) {
            await bot.copyMessage(uid, chatId, msg.reply_to_message.message_id, { reply_markup });
          } else if (msg.photo) {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            await bot.sendPhoto(uid, photoId, opts);
          } else if (msg.video) {
            await bot.sendVideo(uid, msg.video.file_id, opts);
          } else if (msg.animation) {
            await bot.sendAnimation(uid, msg.animation.file_id, opts);
          } else if (msg.document) {
            await bot.sendDocument(uid, msg.document.file_id, opts);
          } else {
            if (!broadcastText) throw new Error('Bo\'sh xabar');
            await bot.sendMessage(uid, broadcastText, { parse_mode: 'HTML', reply_markup });
          }
          success++;
        } catch {
          failed++;
        }
      };

      // Telegram rate limit: 30 msg/s max — batch: 25, 1s oraliq
      const batchSize = 25;
      for (let i = 0; i < allUsers.length; i += batchSize) {
        await Promise.allSettled(allUsers.slice(i, i + batchSize).map(u => sendOne(u.user_id)));
        if (i + batchSize < allUsers.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      await bot.editMessageText(
        `✅ <b>Xabar yuborildi!</b>\n\nYetkazildi: <b>${success} ta</b>\nXato: ${failed} ta`,
        { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: 'HTML' }
      ).catch(() => { });

      log('broadcast', { userId, success, failed, total: allUsers.length });
      return res.status(200).json({ ok: true });
    }

    // ── /start ──
    if (text === '/start') {
      const now = new Date();
      const todayStr = now.toDateString();
      const lastStr = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;
      const isNew = lastStr !== todayStr;

      const greeting = isNew
        ? `☀️ Xush kelibsiz, ${esc(user.full_name || 'Foydalanuvchi')}!\nBugun qanday operatsiyalarni bajaramiz?`
        : GUIDE;

      await bot.sendMessage(chatId, greeting, { reply_markup: KB, parse_mode: 'HTML' }).catch(() => { });

      if (isNew) {
        await db.from('users').update({ last_start_date: iso() }).eq('user_id', userId);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Qo'llanma ──
    if (text === '❓ Qo\'llanma') {
      await bot.sendMessage(chatId, GUIDE, { parse_mode: 'HTML', reply_markup: KB }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Hisobotlar ──
    if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
      const wait = await bot.sendMessage(chatId, '⏳ Hisobot tayyorlanmoqda...').catch(() => null);
      const now = new Date();
      let since, title;

      if (text.includes('Bugungi')) {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        title = 'BUGUNGI HISOBOT';
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI`;
      }

      const { data: rows, error: re } = await db
        .from('transactions')
        .select('type, amount, category')
        .eq('user_id', userId)
        .gte('date', since);

      if (re) {
        logErr('report', re, { userId });
        if (wait) await bot.editMessageText('⚠️ Hisobot chiqarishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const txt = rows?.length
        ? buildReport(rows, title)
        : `📊 <b>${esc(title)}</b>\n\nBu davr uchun ma'lumot topilmadi.`;

      if (wait) {
        await bot.editMessageText(txt, { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }).catch(() => { });
      } else {
        await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' }).catch(() => { });
      }

      log('report', { userId, title, count: rows?.length });
      return res.status(200).json({ ok: true });
    }

    // ── Oxirgisini o'chirish ──
    if (text === '↩️ Oxirgisini O\'chirish') {
      const wait = await bot.sendMessage(chatId, '⏳ Qidirilmoqda...').catch(() => null);

      const { data: last } = await db
        .from('transactions')
        .select('id, category, amount, type')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!last) {
        if (wait) await bot.editMessageText('⚠️ O\'chirish uchun operatsiya topilmadi.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { error: de } = await db
        .from('transactions')
        .delete()
        .eq('id', last.id)
        .eq('user_id', userId);

      if (de) {
        logErr('del-last', de, { userId });
        if (wait) await bot.editMessageText('⚠️ O\'chirishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const ico = last.type === 'income' ? '🟢' : '🔴';
      if (wait) {
        await bot.editMessageText(
          `🗑 <b>O'chirildi!</b>\n\n${ico} ${esc(last.category)}\n💰 ${numFmt(last.amount)} so'm`,
          { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }
        ).catch(() => { });
      }

      log('del-last', { userId, id: last.id, category: last.category });
      return res.status(200).json({ ok: true });
    }

    // ── Ovozli xabar ──
    if (msg.voice) {
      if (!openai) {
        await bot.sendMessage(chatId,
          '⚠️ Ovozli xabar uchun <b>OPENAI_API_KEY</b> sozlanmagan.\n\nMatn orqali yozib yuboring.',
          { parse_mode: 'HTML', reply_markup: KB }
        ).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const proc = await bot.sendMessage(chatId, '🎙 Ovozli xabar tahlil qilinmoqda...').catch(() => null);
      const tmpPath = path.join('/tmp', `voice_${userId}_${Date.now()}.ogg`);

      try {
        const fileLink = await bot.getFileLink(msg.voice.file_id);
        const resp = await axios({ url: fileLink, method: 'GET', responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(tmpPath);
        resp.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        const tr = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-1',
          language: 'uz',
        });

        // Vaqtincha faylni tozalash
        fs.unlink(tmpPath, () => { });

        const spoken = (tr.text || '').trim();
        if (!spoken) {
          if (proc) await bot.editMessageText('Ovozdan matn ajrata olmadim. Qaytadan urinib ko\'ring.',
            { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        log('voice-text', { userId, spoken });

        const parsed = parseText(spoken);
        if (!parsed) {
          if (proc) await bot.editMessageText(
            `🤷 <b>Tushundim:</b> "${esc(spoken)}"\n\nLekin summa topa olmadim.\n<i>Masalan: Taksiga 20 ming berdim</i>`,
            { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }
          ).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        // Protsessing xabarini o'chirish
        if (proc) await bot.deleteMessage(chatId, proc.message_id).catch(() => { });

        await saveTx(userId, chatId, parsed, null, user.exchange_rate, msg.message_id);

      } catch (e) {
        logErr('voice', e, { userId });
        fs.unlink(tmpPath, () => { });
        if (proc) {
          await bot.editMessageText(
            '⚠️ Ovozli xabarni qayta ishlashda xatolik yuz berdi.',
            { chat_id: chatId, message_id: proc.message_id }
          ).catch(() => { });
        }
      }
      return res.status(200).json({ ok: true });
    }

    // ── Matn (rasm bilan yoki yolg'iz) ──
    const parsed = parseText(text);

    if (parsed) {
      let receiptUrl = null;

      if (msg.photo) {
        const procMsg = await bot.sendMessage(chatId, '📸 Chek rasmini yuklanmoqda...').catch(() => null);
        try {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          const fileLink = await bot.getFileLink(photoId);
          const resp = await axios({ url: fileLink, method: 'GET', responseType: 'arraybuffer', timeout: 30000 });
          const fileName = `${userId}/${Date.now()}.jpg`;

          const { error: upErr } = await db.storage
            .from('receipts')
            .upload(fileName, Buffer.from(resp.data), { contentType: 'image/jpeg' });

          if (upErr) throw upErr;

          const { data: ud } = db.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = ud.publicUrl;

          if (procMsg) await bot.deleteMessage(chatId, procMsg.message_id).catch(() => { });
          log('photo-uploaded', { userId, fileName });
        } catch (e) {
          logErr('photo', e, { userId });
          if (procMsg) {
            await bot.editMessageText(
              '⚠️ Rasmni saqlashda xatolik.\nTranzaksiya yoziladi, chekni ilovadan qo\'shishingiz mumkin.',
              { chat_id: chatId, message_id: procMsg.message_id }
            ).catch(() => { });
          }
        }
      }

      await saveTx(userId, chatId, parsed, receiptUrl, user.exchange_rate, msg.message_id);
      return res.status(200).json({ ok: true });
    }

    // ── Rasm matnsiz yuborilgan ──
    if (msg.photo && !parsed) {
      await bot.sendMessage(chatId,
        '⚠️ Rasm tagiga summa va izoh yozishni unutdingiz.\n\n<i>Masalan: 50 ming tushlik</i>',
        { parse_mode: 'HTML' }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Tushunilmagan matn ──
    if (text && text !== '/start') {
      await bot.sendMessage(chatId,
        `Tushunmadim 🤔\n\n${GUIDE}`,
        { parse_mode: 'HTML', reply_markup: KB }
      ).catch(() => { });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    logErr('handler', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
