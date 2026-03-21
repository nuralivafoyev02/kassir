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

Menga oddiy matn ko‘rinishida yozing — men avtomatik ravishda <b>kirim</b> yoki <b>chiqim</b> sifatida saqlayman.

<b>💸 Chiqim misollari:</b>
  • <i>50 ming tushlik</i>
  • <i>30000 Yandex</i>
  • <i>Taksiga 20 ming berdim</i>

<b>💰 Kirim misollari:</b>
  • <i>2 mln oylik</i>
  • <i>100 dollar bonus tushdi</i>
  • <i>Mijozdan 500k oldim</i>

<b>🧾 Chek qo‘shish:</b>
Chek rasmini izoh bilan birga yuboring — summani va tavsifni o‘zim aniqlayman.

<b>💱 Valyuta:</b>
Valyuta kurslari ilova (<b>App</b>) sozlamalaridan avtomatik olinadi.`;

const DEFAULT_RATE = 12200;

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

// Markdown-ish to HTML (simple bold/italic)
const md2html = (t) => String(t ?? '')
  .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
  .replace(/__(.*?)__/g, '<i>$1</i>')
  .replace(/\*(.*?)\*/g, '<b>$1</b>')
  .replace(/_(.*?)_/g, '<i>$1</i>');

// Raqamni lokal formatda ko'rsatish
const numFmt = n => Number(n || 0).toLocaleString('ru-RU');

// GPT orkali matndan (ovozli xabardan) ma'lumotlarni olish
async function gptParse(text) {
  if (!openai || !text) return null;

  try {
    const prompt = `Ushbu o'zbek tilidagi moliyaviy xabardan summa (amount), tur (type: income yoki expense) va kategoriyani (category) JSON formatida aniqlab ber.
Xabar: "${text}"

Qoidalar:
1. "yuz ming", "bir yarim mln" kabi so'zlarni raqamga aylantir.
2. "berdim", "ketdi", "sotib oldim" so'zlari odatda chiqim (expense).
3. "tushdi", "oldim", "keldi", "oylik", "bonus" so'zlari odatda kirim (income).
4. Agar valyuta dollar ($) bo'lsa, isUSD: true qilib belgilang.
5. Faqat JSON qaytaring: {"amount": number, "type": "income"|"expense", "category": "string", "isUSD": boolean}
Agar tushunarsiz bo'lsa, null qaytaring.`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const data = JSON.parse(res.choices[0].message.content);
    if (!data || !data.amount) return null;

    return {
      amount: Math.round(data.amount),
      type: data.type || 'expense',
      category: data.category || (data.type === 'income' ? 'Kirim' : 'Xarajat'),
      isUSD: !!data.isUSD
    };
  } catch (e) {
    logErr('gpt-parse', e);
    return null;
  }
}

// ─── TEXT PARSER ──────────────────────────────────────────
// Matndan summa, tur va kategoriyani ajratib olish (Regex asosslangan fallback)
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
  const m = clean.match(/(\d[\d\s,.]*)(\s*(?:k|ming|mln|mlrd|million|milliard|m|b)\b)?/i);
  if (!m) return null;

  let numStr = m[1].trim();
  numStr = numStr
    .replace(/,(?=\d{3}(\D|$))/g, '') // minglik vergul
    .replace(/\s/g, '');              // bo'shliqlar

  const amount = parseFloat(numStr);
  if (!amount || isNaN(amount) || !Number.isFinite(amount)) return null;

  // Suffix multiplier
  const suffix = (m[2] || '').replace(/\s/g, '').toLowerCase();
  let finalAmount = amount;
  if (suffix === 'k' || suffix === 'ming') finalAmount = amount * 1_000;
  else if (suffix === 'mln' || suffix === 'million' || suffix === 'm') finalAmount = amount * 1_000_000;
  else if (suffix === 'mlrd' || suffix === 'milliard' || suffix === 'b') finalAmount = amount * 1_000_000_000;

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) return null;

  // Tur aniqlash
  const incWords = ['kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus', 'oldim', 'daromad'];
  const expWords = ['chiqim', 'ketdi', 'berdim', 'sarfladim', 'xarajat', 'taksi', 'ovqat', 'tushlik'];

  let type = 'expense';
  if (/^\+/.test(lower)) type = 'income';
  else if (/^-/.test(lower)) type = 'expense';
  else if (/\w+dan\b/i.test(lower)) type = 'income';
  else if (incWords.some(w => lower.includes(w))) type = 'income';
  else if (expWords.some(w => lower.includes(w))) type = 'expense';
  else if (/\w+ga\b/i.test(lower)) type = 'expense';

  let catPart = clean.replace(m[0], '').replace(/^\s*[+\-]\s*/, '').trim();
  if (!catPart || catPart.length < 2) catPart = type === 'income' ? 'kirim' : 'xarajat';

  const category = catPart.charAt(0).toUpperCase() + catPart.slice(1);

  return { amount: Math.round(finalAmount), type, category, isUSD };
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

    // ── Callback Query Handlers ──
    if (update.callback_query) {
      const q = update.callback_query;
      const userId = q.from.id;
      const data = q.data || '';
      const chatId = q.message.chat.id;
      const msgId = q.message.message_id;

      if (data.startsWith('bc_')) {
        const [action, bcId] = data.split(':');

        if (action === 'bc_cancel') {
          await bot.deleteMessage(chatId, msgId).catch(() => { });
          await bot.answerCallbackQuery(q.id, { text: 'Bekor qilindi' }).catch(() => { });
          await db.from('broadcasts').delete().eq('id', bcId);
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_send') {
          const { data: bc, error: bErr } = await db.from('broadcasts').select('*').eq('id', bcId).maybeSingle();
          if (bErr || !bc) {
            await bot.answerCallbackQuery(q.id, { text: 'Xabar topilmadi yoki admin xatosi', show_alert: true });
            return res.status(200).json({ ok: true });
          }

          await bot.editMessageText('⏳ Xabar barcha foydalanuvchilarga jo\'natilmoqda...', { chat_id: chatId, message_id: msgId }).catch(() => { });
          await bot.answerCallbackQuery(q.id, { text: 'Yuborish boshlandi...' }).catch(() => { });

          const { data: allUsers, error: fErr } = await db.from('users').select('user_id');
          if (fErr || !allUsers?.length) {
            await bot.editMessageText('⚠️ Foydalanuvchilarni olishda xatolik.', { chat_id: chatId, message_id: msgId }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          let success = 0, failed = 0;
          const sendOne = async (uid) => {
            const opts = {
              caption: bc.content,
              entities: bc.entities,
              caption_entities: bc.entities,
              reply_markup: bc.reply_markup
            };

            try {
              if (bc.msg_type === 'photo') await bot.sendPhoto(uid, bc.media_id, opts);
              else if (bc.msg_type === 'video') await bot.sendVideo(uid, bc.media_id, opts);
              else if (bc.msg_type === 'animation') await bot.sendAnimation(uid, bc.media_id, opts);
              else if (bc.msg_type === 'document') await bot.sendDocument(uid, bc.media_id, opts);
              else await bot.sendMessage(uid, bc.content, { entities: bc.entities, reply_markup: bc.reply_markup });
              success++;
            } catch { failed++; }
          };

          const batchSize = 25;
          for (let i = 0; i < allUsers.length; i += batchSize) {
            await Promise.allSettled(allUsers.slice(i, i + batchSize).map(u => sendOne(u.user_id)));
            if (i + batchSize < allUsers.length) await new Promise(r => setTimeout(r, 1000));
          }

          await bot.editMessageText(
            `✅ <b>Xabar yuborildi!</b>\n\nYetkazildi: <b>${success} ta</b>\nXato: ${failed} ta`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }
          ).catch(() => { });

          await db.from('broadcasts').delete().eq('id', bcId);
          return res.status(200).json({ ok: true });
        }
      }
      return res.status(200).json({ ok: true });
    }

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

      const rawText = msg.text || msg.caption || '';
      const entities = msg.entities || msg.caption_entities || [];

      const parts = rawText.split(/\s*\n--\n\s*/);
      let broadcastText = parts[0].replace(/^\/message\s*/, '').trim();
      const prefixLen = rawText.indexOf(broadcastText);

      // Suffix/Buttons part
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

      // Shifting entities logic
      let shiftedEntities = null;
      if (entities && entities.length > 0) {
        shiftedEntities = entities
          .map(e => ({ ...e, offset: e.offset - prefixLen }))
          .filter(e => e.offset >= 0 && e.offset + e.length <= broadcastText.length);
      }

      // Draft save
      let msgType = 'text';
      let mediaId = null;
      if (msg.photo) { msgType = 'photo'; mediaId = msg.photo[msg.photo.length - 1].file_id; }
      else if (msg.video) { msgType = 'video'; mediaId = msg.video.file_id; }
      else if (msg.animation) { msgType = 'animation'; mediaId = msg.animation.file_id; }
      else if (msg.document) { msgType = 'document'; mediaId = msg.document.file_id; }

      if (!broadcastText && !mediaId) {
        await bot.sendMessage(chatId, '⚠️ Xabar matni bo\'sh.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { data: draft, error: drErr } = await db.from('broadcasts').insert({
        admin_id: userId,
        msg_type: msgType,
        content: broadcastText,
        media_id: mediaId,
        reply_markup,
        entities: shiftedEntities
      }).select().single();

      if (drErr) {
        logErr('draft-save', drErr);
        await bot.sendMessage(chatId, '⚠️ Draft saqlashda xatolik.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      // Preview send
      const previewMarkup = {
        inline_keyboard: [
          ...(reply_markup?.inline_keyboard || []),
          [{ text: '✅ Tasdiqlash', callback_data: `bc_send:${draft.id}` }, { text: '❌ Bekor qilish', callback_data: `bc_cancel:${draft.id}` }]
        ]
      };

      await bot.sendMessage(chatId, '📣 <b>BROADCAST PREVIEW</b>\n\nXabar foydalanuvchilarga shunday ko\'rinadi:', { parse_mode: 'HTML' });

      if (msgType === 'photo') await bot.sendPhoto(chatId, mediaId, { caption: broadcastText, entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'video') await bot.sendVideo(chatId, mediaId, { caption: broadcastText, entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'animation') await bot.sendAnimation(chatId, mediaId, { caption: broadcastText, entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'document') await bot.sendDocument(chatId, mediaId, { caption: broadcastText, entities: shiftedEntities, reply_markup: previewMarkup });
      else await bot.sendMessage(chatId, broadcastText, { entities: shiftedEntities, reply_markup: previewMarkup });

      return res.status(200).json({ ok: true });
    }

    // ── /start ──
    if (text === '/start') {
      const now = new Date();
      const todayStr = now.toDateString();
      const lastStr = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;
      const isNew = lastStr !== todayStr;

      const firstName = (user.full_name || 'Boshliq').split(' ')[0];
      const greeting = `Xush kelibsiz, <b>${esc(firstName)}</b>☺️!\nBemalol kirim yoki chiqim qilishingiz mumkin💸`;

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
      const proc = await bot.sendMessage(chatId, '🎙 Ovozli xabar qabul qilindi...').catch(() => null);
      const tmpPath = path.join('/tmp', `voice_${userId}_${Date.now()}.ogg`);

      try {
        if (!openai) throw new Error('OpenAI configured emas');

        if (proc) await bot.editMessageText('⏳ Ovoz tahlil qilinmoqda (Whisper)...', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });

        const fileLink = await bot.getFileLink(msg.voice.file_id);
        const resp = await axios({ url: fileLink, method: 'GET', responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(tmpPath);
        resp.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        // Whisper transcription
        const tr = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-1',
          language: 'uz',
        });

        const spoken = (tr.text || '').trim();
        if (!spoken) {
          if (proc) await bot.editMessageText('❌ Ovoz matnga aylanmadi. Qaytadan aniqroq gapirib ko\'ring.', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        log('voice-text', { userId, spoken });

        if (proc) await bot.editMessageText(`📝 <b>Eshitdim:</b> "${esc(spoken)}"\n⏳ Tahlil qilinmoqda...`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });

        // Intent parsing (GPT first, then regex)
        let parsed = await gptParse(spoken);
        if (!parsed) parsed = parseText(spoken);

        if (!parsed) {
          if (proc) await bot.editMessageText(`🤷 <b>Tushundim:</b> "${esc(spoken)}"\n\nLekin moliyaviy ma'lumot topa olmadim.\n<i>Masalan: "Taksiga 20 ming berdim" deb ayting.</i>`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (proc) await bot.deleteMessage(chatId, proc.message_id).catch(() => { });

        await saveTx(userId, chatId, parsed, null, user.exchange_rate, msg.message_id);

      } catch (e) {
        logErr('voice', e, { userId });
        if (proc) await bot.editMessageText('😕 Ovozli xabarni qayta ishlashda xatolik yuz berdi. Matn orqali yozib yuboring.', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Matn (rasm bilan yoki yolg'iz) ──
    let parsed = parseText(text);

    // Agar regex matnni taniy olmasa va OpenAI bo'lsa, GPT dan so'rab ko'ramiz
    if (!parsed && text.length > 5 && openai) {
      parsed = await gptParse(text);
    }

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
