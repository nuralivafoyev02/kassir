'use strict';
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// ─── ENV CHECKS ──────────────────────────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SUPA_URL   = process.env.SUPABASE_URL;
const SUPA_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const OAI_KEY    = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN yo\'q');
if (!SUPA_URL)  throw new Error('SUPABASE_URL yo\'q');
if (!SUPA_KEY)  throw new Error('SUPABASE_KEY yo\'q');

// ─── CLIENTS ─────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db  = createClient(SUPA_URL, SUPA_KEY);

// OpenAI — optional (faqat voice uchun)
let openai = null;
if (OAI_KEY && !OAI_KEY.startsWith('your-')) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: OAI_KEY });
  } catch {}
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

<b>Valyuta kursi</b> Kassa App sozlamalaridan olinadi.`;

// ─── LOGGING ─────────────────────────────────────────────
const log  = (scope, data)  => console.log (`[BOT:${scope}]`, data);
const warn = (scope, data)  => console.warn (`[BOT:${scope}]`, data);
const err  = (scope, e, ex) => console.error(`[BOT:${scope}]`, { msg: e?.message || e, ...ex, raw: e });

// ─── UTILS ───────────────────────────────────────────────
const iso  = (ms = Date.now()) => new Date(ms).toISOString();
const esc  = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const numFmt = n => Number(n || 0).toLocaleString('uz-UZ');

// ─── TEXT PARSER ─────────────────────────────────────────
function parseText(raw) {
  if (!raw) return null;
  const text   = String(raw).trim();
  const lower  = text.toLowerCase();
  const isUSD  = /\$|\busd\b|dollar/i.test(lower);

  // Extract number
  const clean = lower
    .replace(/so'?m|sum|uzs|\$|€|\busd\b|dollar/gi, ' ')
    .replace(/\s+/g, ' ').trim();

  const m = clean.match(/(\d[\d.,]*)[\s]*(k|ming|mln|mlrd|million|milliard)?/);
  if (!m) return null;

  let amount = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(amount)) return null;
  const suffix = (m[2] || '').toLowerCase();
  if (['k', 'ming'].includes(suffix))               amount *= 1000;
  else if (['mln', 'million', 'm'].includes(suffix)) amount *= 1_000_000;
  else if (['mlrd', 'milliard'].includes(suffix))    amount *= 1_000_000_000;

  // Determine type
  const incWords = ['kirim','tushdi','keldi','avans','oylik','bonus','qaytdi','foyda','daromad','sotdim','tushum','oldim', 'dan'];
  const expWords = ['chiqim','ketdi','berdim','sarfladim','xarajat','sotib','uchun','tolandi',"to'landi",'taksi','ovqat', 'ga'];

  let type = 'expense';
  if (/^\s*\+/.test(lower) || incWords.some(w => lower.includes(w))) type = 'income';
  if (/^\s*-/.test(lower)  || expWords.some(w => lower.includes(w))) type = 'expense';

  // Category: leftover words
  let cat = clean
    .replace(m[0], '')
    .replace(new RegExp([...incWords,...expWords].map(w => `\\b${w}\\b`).join('|'), 'g'), '')
    .replace(/[+\-*/]/g, '')
    .replace(/\s+/g, ' ').trim();
  if (!cat || cat.length < 2) cat = type === 'income' ? 'Kirim' : 'Xarajat';
  else cat = cat.charAt(0).toUpperCase() + cat.slice(1);

  return { amount: Math.round(amount), type, category: cat, isUSD, original: text };
}

// ─── SAVE TRANSACTION ────────────────────────────────────
async function saveTx(userId, chatId, parsed, receiptUrl = null, exRate = 12850, replyId = null) {
  let amount   = parsed.amount;
  let category = parsed.category;
  let amtTxt   = `${numFmt(amount)} so'm`;

  if (parsed.isUSD) {
    amount   = Math.round(parsed.amount * Number(exRate || 12850));
    category = `${parsed.category} ($${parsed.amount})`;
    amtTxt   = `${numFmt(amount)} so'm\n<i>($${parsed.amount} × ${numFmt(exRate)})</i>`;
  }

  const row = {
    user_id: userId,
    amount,
    category,
    type: parsed.type,
    date: iso(),
    receipt_url: receiptUrl,
  };

  const { data, error } = await db.from('transactions').insert(row).select().single();
  if (error) {
    err('save-tx', error, { userId, chatId, amount, category });
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik. Keyinroq urinib ko\'ring.');
    return null;
  }

  const ico = parsed.type === 'income' ? '🟢' : '🔴';
  const typ = parsed.type === 'income' ? 'Kirim' : 'Chiqim';
  const chk = receiptUrl ? '📸 Bor' : 'Yo\'q';
  const opts = { parse_mode: 'HTML' };
  if (replyId) opts.reply_to_message_id = replyId;

  await bot.sendMessage(chatId,
    `✅ <b>Saqlandi!</b>\n\n`+
    `${ico} <b>Turi:</b> ${typ}\n`+
    `💰 <b>Summa:</b> ${amtTxt}\n`+
    `📂 <b>Kategoriya:</b> ${esc(category)}\n`+
    `🧾 <b>Chek:</b> ${chk}`, opts);

  log('tx-saved', { userId, id: data.id, type: data.type, amount: data.amount });
  return data;
}

// ─── REPORT BUILDER ──────────────────────────────────────
function buildReport(rows, title) {
  const inc = rows.filter(r => r.type === 'income' ).reduce((s, r) => s + (Number(r.amount)||0), 0);
  const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount)||0), 0);
  const bal = inc - exp;
  return `📊 <b>${title}</b>\n\n`+
    `📥 Kirim:   <b>+${numFmt(inc)} so'm</b>\n`+
    `📤 Chiqim:  <b>-${numFmt(exp)} so'm</b>\n`+
    `━━━━━━━━━━━━\n`+
    `${bal >= 0 ? '🤑' : '💸'} Qoldiq: <b>${numFmt(bal)} so'm</b>`;
}

// ─── MAIN HANDLER ────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(200).send('Kassa Bot ishlayapti 🚀');

    const update = req.body || {};
    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text   = (msg.text || msg.caption || '').trim();

    log('msg', { userId, chatId, hasText: !!text, hasPhoto: !!msg.photo, hasVoice: !!msg.voice, hasContact: !!msg.contact });

    // ── Fetch user ──
    let { data: user, error: uErr } = await db.from('users').select('*').eq('user_id', userId).maybeSingle();
    if (uErr) warn('user-fetch', { userId, msg: uErr.message });

    // ── Phone registration ──
    if (msg.contact) {
      if (msg.contact.user_id !== userId) return res.status(200).json({ ok: true });
      const { error: e } = await db.from('users').upsert({
        user_id:       userId,
        phone_number:  msg.contact.phone_number,
        full_name:     `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(),
        last_start_date: iso(),
        exchange_rate: 12850,
      }, { onConflict: 'user_id' });
      if (e) { err('reg', e, { userId }); return res.status(500).send('Error'); }
      await bot.sendMessage(chatId,
        `🎉 <b>Ro'yxatdan o'tdingiz!</b>\nEndi kirim-chiqimlarni yozishingiz mumkin.`,
        { reply_markup: KB, parse_mode: 'HTML' });
      return res.status(200).json({ ok: true });
    }

    // ── Ask phone if new user ──
    if (!user) {
      await bot.sendMessage(chatId, '👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.', {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
          resize_keyboard: true, one_time_keyboard: true,
        },
      });
      return res.status(200).json({ ok: true });
    }

    // ── /start ──
    if (text === '/start') {
      const now    = new Date();
      const today  = now.toDateString();
      const last   = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;
      const greeting = last !== today
        ? `☀️ Assalomu aleykum, ${esc(user.full_name || 'Foydalanuvchi')}!\nBugun qanday operatsiyalarni bajaramiz?`
        : GUIDE;
      await bot.sendMessage(chatId, greeting, { reply_markup: KB, parse_mode: 'HTML' });
      if (last !== today) await db.from('users').update({ last_start_date: iso(now) }).eq('user_id', userId);
      return res.status(200).json({ ok: true });
    }

    // ── Qo'llanma ──
    if (text === '❓ Qo\'llanma') {
      await bot.sendMessage(chatId, GUIDE, { parse_mode: 'HTML', reply_markup: KB });
      return res.status(200).json({ ok: true });
    }

    // ── Hisobotlar ──
    if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
      const wait = await bot.sendMessage(chatId, '⏳ Hisobot tayyorlanmoqda...', { parse_mode: 'HTML' });
      const now  = new Date();
      let since, title;

      if (text.includes('Bugungi')) {
        since = new Date(now.setHours(0,0,0,0)).toISOString();
        title = 'BUGUNGI HISOBOT';
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI`;
      }

      const { data: rows, error: re } = await db.from('transactions')
        .select('*').eq('user_id', userId).gte('date', since);

      if (re) {
        err('report', re, { userId }); 
        await bot.editMessageText('⚠️ Hisobot chiqarishda xatolik.', { chat_id: chatId, message_id: wait.message_id });
        return res.status(200).json({ ok: true });
      }

      const txt = rows?.length ? buildReport(rows, title) : `📊 <b>${title}</b>\n\nMa'lumot topilmadi.`;
      await bot.editMessageText(txt, { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' });
      log('report', { userId, title, count: rows?.length });
      return res.status(200).json({ ok: true });
    }

    // ── Oxirgisini o'chirish ──
    if (text === '↩️ Oxirgisini O\'chirish') {
      const wait = await bot.sendMessage(chatId, '⏳ Qidirilmoqda...', { parse_mode: 'HTML' });

      const { data: last } = await db.from('transactions')
        .select('*').eq('user_id', userId)
        .order('date', { ascending: false }).limit(1).maybeSingle();

      if (!last) {
        await bot.editMessageText('⚠️ O\'chirish uchun operatsiya topilmadi.', { chat_id: chatId, message_id: wait.message_id });
        return res.status(200).json({ ok: true });
      }

      const { error: de } = await db.from('transactions').delete().eq('id', last.id).eq('user_id', userId);
      if (de) {
        err('del-last', de, { userId });
        await bot.editMessageText('⚠️ O\'chirishda xatolik.', { chat_id: chatId, message_id: wait.message_id });
        return res.status(200).json({ ok: true });
      }

      await bot.editMessageText(
        `🗑 <b>O'chirildi!</b>\n\n📂 ${esc(last.category)}\n💰 ${numFmt(last.amount)} so'm`,
        { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' });
      log('del-last', { userId, id: last.id });
      return res.status(200).json({ ok: true });
    }

    // ── Ovozli xabar ──
    if (msg.voice) {
      if (!openai) {
        await bot.sendMessage(chatId, '⚠️ Ovozli xabar uchun OPENAI_API_KEY kerak.', { reply_markup: KB });
        return res.status(200).json({ ok: true });
      }

      const proc = await bot.sendMessage(chatId, '🎙 Ovozli xabar tahlil qilinmoqda...');
      try {
        const fileLink = await bot.getFileLink(msg.voice.file_id);
        const tmpPath  = path.join('/tmp', `voice_${userId}_${Date.now()}.ogg`);
        const resp     = await axios({ url: fileLink, method: 'GET', responseType: 'stream' });
        const writer   = fs.createWriteStream(tmpPath);
        resp.data.pipe(writer);
        await new Promise((ok, nok) => { writer.on('finish', ok); writer.on('error', nok); });

        const tr = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath), model: 'whisper-1', language: 'uz',
        });
        try { fs.unlinkSync(tmpPath); } catch {}

        const spoken = (tr.text || '').trim();
        if (!spoken) {
          await bot.editMessageText('Ovozdan matn ajrata olmadim.', { chat_id: chatId, message_id: proc.message_id });
          return res.status(200).json({ ok: true });
        }

        const parsed = parseText(spoken);
        if (!parsed) {
          await bot.editMessageText(
            `🤷 <b>Tushundim:</b> "${esc(spoken)}"\n\nLekin summa topa olmadim. Masalan: <i>Taksiga 20 ming berdim</i>`,
            { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' });
          return res.status(200).json({ ok: true });
        }

        await bot.deleteMessage(chatId, proc.message_id).catch(() => {});
        await saveTx(userId, chatId, parsed, null, user.exchange_rate, msg.message_id);
      } catch (e) {
        err('voice', e, { userId });
        await bot.editMessageText('Ovozli xabarni qayta ishlashda xatolik.', { chat_id: chatId, message_id: proc.message_id });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Matn + rasm ──
    const parsed = parseText(text);
    if (parsed) {
      let receiptUrl = null;

      if (msg.photo) {
        const procMsg = await bot.sendMessage(chatId, '📸 Rasm yuklanmoqda...', { parse_mode: 'HTML' });
        try {
          const photoId  = msg.photo[msg.photo.length - 1].file_id;
          const fileLink = await bot.getFileLink(photoId);
          const resp     = await axios({ url: fileLink, method: 'GET', responseType: 'arraybuffer' });
          const fileName = `${userId}/${Date.now()}.jpg`;
          const { error: ue } = await db.storage.from('receipts').upload(fileName, resp.data, { contentType: 'image/jpeg' });
          if (ue) throw ue;
          const { data: ud } = db.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = ud.publicUrl;
          await bot.deleteMessage(chatId, procMsg.message_id).catch(() => {});
          log('photo', { userId, fileName });
        } catch (e) {
          err('photo', e, { userId });
          await bot.editMessageText(
            '⚠️ Rasmni saqlashda xatolik. Tranzaksiya yoziladi, chekni keyinroq ilovadan qo\'shishingiz mumkin.',
            { chat_id: chatId, message_id: procMsg.message_id });
        }
      }

      await saveTx(userId, chatId, parsed, receiptUrl, user.exchange_rate, msg.message_id);
      return res.status(200).json({ ok: true });
    }

    // ── Photo without text ──
    if (msg.photo && !parsed) {
      await bot.sendMessage(chatId, '⚠️ Rasm tagiga summa va izoh yozishni unutdingiz.\nMasalan: <i>50 ming tushlik</i>', { parse_mode: 'HTML' });
      return res.status(200).json({ ok: true });
    }

    // ── Tushunilmagan ──
    if (text && text !== '/start') {
      await bot.sendMessage(chatId,
        `Tushunmadim 🤔\n\n${GUIDE}`,
        { parse_mode: 'HTML', reply_markup: KB });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    err('handler', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
