const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!token) throw new Error('BOT_TOKEN topilmadi');
if (!supabaseUrl) throw new Error('SUPABASE_URL topilmadi');
if (!supabaseServiceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY yoki SUPABASE_KEY topilmadi');

const bot = new TelegramBot(token, { polling: false });
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const GUIDE_TEXT = `<b>📖 BOTDAN FOYDALANISH QO'LLANMASI:</b>\n\n`
  + `Botga yozing yoki <b>OVOZLI XABAR</b> yuboring! 🎙\n\n`
  + `<b>1. Chiqim (Xarajat):</b>\n`
  + `➖ <i>50 ming tushlik</i>\n`
  + `➖ <i>-50$ bozorlik</i>\n`
  + `🎙 <i>"Taksiga 20 ming berdim"</i>\n\n`
  + `<b>2. Kirim (Daromad):</b>\n`
  + `➕ <i>2 mln oylik</i>\n`
  + `🎙 <i>"100 dollar bonus tushdi"</i>\n\n`
  + `<i>Valyuta kursi Kassa App sozlamalaridan olinadi.</i>`;

const MAIN_KEYBOARD = {
  keyboard: [
    ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
    ["↩️ Oxirgisini O'chirish", 'Botdan foydalanish❓'],
  ],
  resize_keyboard: true,
};

function logInfo(scope, payload = {}) {
  console.log(`[BOT:${scope}]`, payload);
}

function logWarn(scope, payload = {}) {
  console.warn(`[BOT:${scope}]`, payload);
}

function logError(scope, error, payload = {}) {
  console.error(`[BOT:${scope}]`, {
    message: error?.message || error,
    ...payload,
    raw: error,
  });
}

function toIsoString(value = Date.now()) {
  return new Date(value).toISOString();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseText(text) {
  if (!text) return null;

  const originalText = String(text).trim();
  const lowered = originalText.toLowerCase().trim();
  const isUSD = /\$|\busd\b|dollar/.test(lowered);

  const normalized = lowered
    .replace(/so'?m|sum|uzs|\$|€|\busd\b|dollar/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const numberMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(k|ming|mln|mlrd|million|milliard|m)?\b/);
  if (!numberMatch) return null;

  const rawNumber = numberMatch[1].replace(',', '.');
  const suffix = (numberMatch[2] || '').toLowerCase();
  let amount = parseFloat(rawNumber);
  if (!Number.isFinite(amount)) return null;

  if (['k', 'ming'].includes(suffix)) amount *= 1000;
  else if (['m', 'mln', 'million'].includes(suffix)) amount *= 1000000;
  else if (['mlrd', 'milliard'].includes(suffix)) amount *= 1000000000;

  const incomeKeywords = ['kirim', 'tushdi', 'keldi', 'avans', 'oylik', 'bonus', 'qaytdi', 'foyda', 'daromad', 'sotdim', 'tushum'];
  const expenseKeywords = ['chiqim', 'ketdi', "to'landi", 'tolandi', 'xarajat', 'berdim', 'sotib', 'oldim', 'uchun', 'sarfladim', 'taksi', 'ovqat'];

  let type = 'expense';
  if (/^\s*\+/.test(lowered) || incomeKeywords.some(word => lowered.includes(word))) type = 'income';
  if (/^\s*-/.test(lowered) || expenseKeywords.some(word => lowered.includes(word))) type = 'expense';

  let cleanText = normalized.replace(numberMatch[0], ' ');
  for (const word of [...incomeKeywords, ...expenseKeywords]) {
    const escapedWord = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    cleanText = cleanText.replace(new RegExp(`\\b${escapedWord}\\b`, 'g'), ' ');
  }

  cleanText = cleanText.replace(/[+\-*/]/g, ' ').replace(/\s+/g, ' ').trim();
  let category = cleanText ? cleanText.charAt(0).toUpperCase() + cleanText.slice(1) : '';
  if (category.length < 2) category = type === 'income' ? 'Kirim' : 'Umumiy xarajat';

  return {
    amount: Math.round(amount),
    type,
    category,
    isUSD,
    originalText,
  };
}

async function saveTransaction(userId, chatId, parsedData, receiptUrl = null, userExchangeRate = 12850, replyMsgId = null) {
  let finalAmount = parsedData.amount;
  let finalCategory = parsedData.category;
  let amountText = `${finalAmount.toLocaleString('uz-UZ')} so'm`;

  if (parsedData.isUSD) {
    finalAmount = Math.round(parsedData.amount * Number(userExchangeRate || 12850));
    finalCategory = `${parsedData.category} ($${parsedData.amount})`;
    amountText = `${finalAmount.toLocaleString('uz-UZ')} so'm\n<i>($${parsedData.amount} × ${Number(userExchangeRate || 12850).toLocaleString('uz-UZ')})</i>`;
  }

  const payload = {
    user_id: userId,
    amount: finalAmount,
    category: finalCategory,
    type: parsedData.type,
    date: toIsoString(),
    receipt_url: receiptUrl,
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select()
    .single();

  if (error) {
    logError('save-transaction', error, { userId, chatId, payload });
    await bot.sendMessage(chatId, "⚠️ Bazaga yozishda xatolik bo'ldi. Qaytadan urinib ko'ring.");
    return null;
  }

  const emoji = parsedData.type === 'income' ? '🟢' : '🔴';
  const typeText = parsedData.type === 'income' ? 'Kirim' : 'Chiqim';
  const photoStatus = receiptUrl ? 'Bor 📸' : "Yo'q";
  const options = { parse_mode: 'HTML' };
  if (replyMsgId) options.reply_to_message_id = replyMsgId;

  await bot.sendMessage(
    chatId,
    `✅ <b>Muvaffaqiyatli saqlandi!</b>\n\n`
      + `${emoji} <b>Turi:</b> ${typeText}\n`
      + `💰 <b>Summa:</b> ${amountText}\n`
      + `📂 <b>Kategoriya:</b> ${escapeHtml(finalCategory)}\n`
      + `🧾 <b>Chek:</b> ${photoStatus}`,
    options,
  );

  logInfo('transaction-saved', {
    userId,
    chatId,
    transactionId: data.id,
    type: data.type,
    amount: data.amount,
    category: data.category,
    hasReceipt: Boolean(receiptUrl),
  });

  return data;
}

function buildReport(trans, title) {
  const income = trans
    .filter(item => item.type === 'income')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expense = trans
    .filter(item => item.type === 'expense')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const balance = income - expense;

  return `📊 <b>${title}:</b>\n\n`
    + `📥 Kirim: <b>+${income.toLocaleString('uz-UZ')}</b> so'm\n`
    + `📤 Chiqim: <b>-${expense.toLocaleString('uz-UZ')}</b> so'm\n`
    + `➖➖➖➖➖➖➖➖\n`
    + `${balance >= 0 ? '🤑' : '💸'} Sof qoldiq: <b>${balance.toLocaleString('uz-UZ')} so'm</b>`;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(200).send('Bot ishlamoqda 🚀');
    }

    const update = req.body || {};
    const msg = update.message;
    if (!msg) return res.status(200).send('No message found');

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || msg.caption || '';

    logInfo('incoming-update', {
      userId,
      chatId,
      hasText: Boolean(text),
      hasPhoto: Boolean(msg.photo),
      hasVoice: Boolean(msg.voice),
      hasContact: Boolean(msg.contact),
    });

    let { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (userFetchError) logWarn('user-fetch-warning', { userId, message: userFetchError.message });

    if (msg.contact) {
      if (msg.contact.user_id !== userId) return res.status(200).send('OK');

      const { error: contactUpsertError } = await supabase
        .from('users')
        .upsert({
          user_id: userId,
          phone_number: msg.contact.phone_number,
          full_name: `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(),
          last_start_date: toIsoString(),
          exchange_rate: 12850,
        }, { onConflict: 'user_id' });

      if (contactUpsertError) {
        logError('contact-upsert', contactUpsertError, { userId, chatId });
        return res.status(500).send('Failed to register user');
      }

      await bot.sendMessage(
        chatId,
        "🎉 <b>Ro'yxatdan o'tdingiz!</b>\nEndi kirim yoki chiqimlarni yozishingiz mumkin.",
        { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' },
      );
      return res.status(200).send('OK');
    }

    if (!user) {
      await bot.sendMessage(chatId, "👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.", {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return res.status(200).send('OK');
    }

    if (text === '/start') {
      const now = new Date();
      const todayStr = now.toDateString();
      const lastDate = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;

      if (lastDate !== todayStr) {
        await bot.sendMessage(
          chatId,
          `Assalomu aleykum, ${escapeHtml(user.full_name || 'Foydalanuvchi')}! ☀️\nBugun qanday moliyaviy operatsiyalarni bajaramiz?`,
          { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' },
        );
        await supabase.from('users').update({ last_start_date: toIsoString(now) }).eq('user_id', userId);
      } else {
        await bot.sendMessage(chatId, GUIDE_TEXT, { reply_markup: MAIN_KEYBOARD, parse_mode: 'HTML' });
      }
      return res.status(200).send('OK');
    }

    if (text === 'Botdan foydalanish❓') {
      await bot.sendMessage(chatId, GUIDE_TEXT, { parse_mode: 'HTML' });
      return res.status(200).send('OK');
    }

    if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
      const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Hisob-kitob qilinmoqda...</b>", { parse_mode: 'HTML' });
      const now = new Date();
      let startTime;
      let title;

      if (text === '📊 Bugungi Hisobot') {
        startTime = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        title = 'BUGUNGI HISOBOT';
      } else {
        startTime = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI HISOBOTI`;
      }

      const { data: trans, error: reportError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startTime);

      if (reportError) {
        logError('report-query', reportError, { userId, startTime, title });
        await bot.editMessageText("⚠️ Hisobotni chiqarishda xatolik bo'ldi.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return res.status(200).send('OK');
      }

      if (!trans || trans.length === 0) {
        await bot.editMessageText(`📊 <b>${title}:</b>\n\nMa'lumot topilmadi.`, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML',
        });
        return res.status(200).send('OK');
      }

      await bot.editMessageText(buildReport(trans, title), {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML',
      });

      logInfo('report-built', { userId, title, count: trans.length });
      return res.status(200).send('OK');
    }

    if (text === "↩️ Oxirgisini O'chirish") {
      const statusMsg = await bot.sendMessage(chatId, "⏳ <b>Oxirgi operatsiya qidirilmoqda...</b>", { parse_mode: 'HTML' });

      const { data: lastTrans, error: lastTransError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastTransError) logWarn('last-transaction-warning', { userId, message: lastTransError.message });

      if (!lastTrans) {
        await bot.editMessageText("⚠️ O'chirish uchun hech narsa topilmadi.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return res.status(200).send('OK');
      }

      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', lastTrans.id)
        .eq('user_id', userId);

      if (deleteError) {
        logError('delete-last-transaction', deleteError, { userId, transactionId: lastTrans.id });
        await bot.editMessageText("⚠️ O'chirishda xatolik bo'ldi.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return res.status(200).send('OK');
      }

      await bot.editMessageText(
        `🗑 <b>Muvaffaqiyatli o'chirildi!</b>\n\n`
          + `📂 ${escapeHtml(lastTrans.category)}\n`
          + `💰 ${Number(lastTrans.amount || 0).toLocaleString('uz-UZ')} so'm`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML',
        },
      );

      logInfo('delete-last-transaction', { userId, transactionId: lastTrans.id });
      return res.status(200).send('OK');
    }

    if (msg.voice) {
      if (!openai) {
        await bot.sendMessage(chatId, "⚠️ Ovozli xabarni qayta ishlash uchun OPENAI_API_KEY kerak.");
        return res.status(200).send('OK');
      }

      const processingMsg = await bot.sendMessage(chatId, '🧐 Ovozli xabar tahlil qilinmoqda...');
      try {
        const fileId = msg.voice.file_id;
        const fileLink = await bot.getFileLink(fileId);
        const voicePath = path.join('/tmp', `${userId}-${Date.now()}.ogg`);
        const writer = fs.createWriteStream(voicePath);

        const response = await axios({
          url: fileLink,
          method: 'GET',
          responseType: 'stream',
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(voicePath),
          model: 'whisper-1',
          language: 'uz',
        });

        try { fs.unlinkSync(voicePath); } catch (_) {}

        const transcribedText = transcription.text || '';
        if (!transcribedText.trim()) {
          await bot.editMessageText("Kechirasiz, ovozli xabar ichidan matnni ajrata olmadim.", {
            chat_id: chatId,
            message_id: processingMsg.message_id,
          });
          return res.status(200).send('OK');
        }

        const parsedVoice = parseText(transcribedText);
        if (!parsedVoice) {
          await bot.editMessageText(
            `🤷‍♂️ <b>Tushunganim:</b> "${escapeHtml(transcribedText)}"\n\nLekin bu matndan aniq summa va maqsadni topa olmadim. Masalan: <i>Taksiga 20 ming berdim</i>.`,
            {
              chat_id: chatId,
              message_id: processingMsg.message_id,
              parse_mode: 'HTML',
            },
          );
          return res.status(200).send('OK');
        }

        await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
        const currentRate = Number(user.exchange_rate || 12850);
        await saveTransaction(userId, chatId, parsedVoice, null, currentRate, msg.message_id);
        return res.status(200).send('OK');
      } catch (error) {
        logError('voice-processing', error, { userId, chatId });
        await bot.editMessageText("Kechirasiz, ovozli xabarni qayta ishlashda xatolik bo'ldi. Keyinroq yana urinib ko'ring.", {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        return res.status(200).send('OK');
      }
    }

    const parsed = parseText(text);
    if (parsed) {
      let receiptUrl = null;

      if (msg.photo) {
        const photoProcessingMsg = await bot.sendMessage(chatId, '📸 <b>Rasm yuklanmoqda...</b>', { parse_mode: 'HTML' });
        try {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          const fileLink = await bot.getFileLink(photoId);
          const response = await axios({ url: fileLink, method: 'GET', responseType: 'arraybuffer' });
          const fileName = `${userId}/${Date.now()}.jpg`;

          const { error } = await supabase.storage
            .from('receipts')
            .upload(fileName, response.data, { contentType: 'image/jpeg' });

          if (error) throw error;

          const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = data.publicUrl;
          logInfo('photo-uploaded', { userId, chatId, fileName, receiptUrl });
          await bot.deleteMessage(chatId, photoProcessingMsg.message_id).catch(() => {});
        } catch (error) {
          logError('photo-upload', error, { userId, chatId });
          await bot.editMessageText(
            "⚠️ Rasmni saqlay olmadim, lekin tranzaksiya yoziladi. Chekni keyinroq ilovadan qo'shishingiz mumkin.",
            { chat_id: chatId, message_id: photoProcessingMsg.message_id },
          );
        }
      }

      const currentRate = Number(user.exchange_rate || 12850);
      await saveTransaction(userId, chatId, parsed, receiptUrl, currentRate, msg.message_id);
      return res.status(200).send('OK');
    }

    if (msg.photo && !parsed) {
      await bot.sendMessage(chatId, "⚠️ Rasm tagiga summa va izoh yozishni unutdingiz yoki men tushunmadim.");
      return res.status(200).send('OK');
    }

    if (text !== '/start') {
      await bot.sendMessage(chatId, `Tushunmadim. Quyidagicha yozing:\n${GUIDE_TEXT}`, { parse_mode: 'HTML' });
    }

    return res.status(200).send('OK');
  } catch (error) {
    logError('handler', error);
    return res.status(500).send('Internal Server Error');
  }
};
