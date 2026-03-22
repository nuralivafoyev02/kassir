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
const ADMIN_IDS = new Set((process.env.ADMIN_IDS || '').split(',').map(v => v.trim()).filter(Boolean));

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
const isAdmin = userId => ADMIN_IDS.has(String(userId));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let txSourceColumnSupported = null;

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('uz-UZ');
  } catch {
    return String(v);
  }
}

function shortId(v, len = 8) {
  return String(v || '').slice(0, len);
}

function tgErr(e) {
  return e?.response?.body?.description || e?.message || "Noma'lum xatolik";
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error?.details || '');
  return msg.includes(`'${column}'`) && msg.includes('schema cache');
}

async function insertTransactions(rows, source = 'bot') {
  const payload = (rows || []).map(row => ({ ...row }));

  if (txSourceColumnSupported !== false) {
    const withSource = payload.map(row => ({ ...row, source }));
    const res = await db.from('transactions').insert(withSource).select();
    if (!res.error) {
      txSourceColumnSupported = true;
      return res;
    }
    if (!isMissingColumnError(res.error, 'source')) {
      return res;
    }
    txSourceColumnSupported = false;
  }

  return db.from('transactions').insert(payload).select();
}

function adminPanelMarkup() {
  return {
    inline_keyboard: [
      [{ text: '📊 Statistika', callback_data: 'admin_stats' }, { text: '👥 Yangi userlar', callback_data: 'admin_users' }],
      [{ text: '📣 Broadcastlar', callback_data: 'admin_broadcasts' }, { text: '⚠️ Xatolar', callback_data: 'admin_failed' }],
      [{ text: "🧭 Qo'llanma", callback_data: 'admin_help' }, { text: '🔄 Yangilash', callback_data: 'admin_panel' }]
    ]
  };
}

async function safeEditOrSend(chatId, messageId, text, extra = {}) {
  if (messageId) {
    try {
      return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...extra });
    } catch { }
  }
  return bot.sendMessage(chatId, text, extra).catch(() => null);
}

async function getExactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function getAdminSnapshot() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [totalUsers, activeToday, txToday, txMonth, failedTargets, drafts, lastBroadcastRes] = await Promise.all([
    getExactCount(db.from('users').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('users').select('*', { count: 'exact', head: true }).gte('last_start_date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', monthStart)),
    getExactCount(db.from('broadcast_failures').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('broadcasts').select('*', { count: 'exact', head: true }).eq('status', 'draft')),
    db.from('broadcasts').select('id, created_at, status, total_users, sent_count, failed_count').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    totalUsers,
    activeToday,
    txToday,
    txMonth,
    failedTargets,
    drafts,
    lastBroadcast: lastBroadcastRes.data || null
  };
}

function buildAdminPanelText(snapshot) {
  const last = snapshot.lastBroadcast;
  const lastLine = last
    ? `🕘 Oxirgi broadcast: <b>${shortId(last.id)}</b> · ${esc(last.status || 'unknown')}
   Yetkazildi: <b>${last.sent_count || 0}</b> / ${last.total_users || 0} · Xato: <b>${last.failed_count || 0}</b>
   Sana: ${esc(fmtDateTime(last.created_at))}`
    : `🕘 Oxirgi broadcast: <b>hali yo'q</b>`;

  return `🛠 <b>ADMIN PANEL</b>

👥 Userlar: <b>${snapshot.totalUsers}</b>
🔥 Bugun faol: <b>${snapshot.activeToday}</b>
💸 Bugungi tranzaksiyalar: <b>${snapshot.txToday}</b>
📅 Oylik tranzaksiyalar: <b>${snapshot.txMonth}</b>
📝 Draft broadcastlar: <b>${snapshot.drafts}</b>
⚠️ Yetkazilmagan targetlar: <b>${snapshot.failedTargets}</b>

${lastLine}`;
}

function buildRecentUsersText(rows, totalUsers) {
  const body = rows?.length
    ? rows.map((u, i) => `${i + 1}. <b>${esc(u.full_name || `User ${u.user_id}`)}</b>\n   ID: <code>${u.user_id}</code>${u.phone_number ? `\n   Tel: ${esc(u.phone_number)}` : ''}${u.created_at ? `\n   Qo\'shilgan: ${esc(fmtDateTime(u.created_at))}` : ''}`).join('\n\n')
    : 'Hozircha userlar topilmadi.';

  return `👥 <b>SO\'NGGI USERLAR</b>\nJami userlar: <b>${totalUsers}</b>\n\n${body}`;
}

function buildBroadcastsText(rows) {
  if (!rows?.length) return `📣 <b>BROADCASTLAR</b>\n\nHozircha yozuvlar yo\'q.`;

  return `📣 <b>SO\'NGGI BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b> · ${esc(b.status || 'unknown')}\n` +
    `   Yetkazildi: <b>${b.sent_count || 0}</b> / ${b.total_users || 0}\n` +
    `   Xato: <b>${b.failed_count || 0}</b>\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedBroadcastsText(rows) {
  if (!rows?.length) return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\nHozircha muammo yo\'q.`;

  return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b>\n` +
    `   Xato: <b>${b.failed_count || 0}</b> ta\n` +
    `   Holat: ${esc(b.status || 'unknown')}\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedTargetsText(bc, rows) {
  const header = `⚠️ <b>YETKAZILMAGAN USERLAR</b>\nBroadcast: <b>${shortId(bc.id)}</b>\nHolat: <b>${esc(bc.status || 'unknown')}</b>\n\n`;
  if (!rows?.length) return header + 'Ayni paytda xato qolmagan ✅';

  return header + rows.map((row, i) => (
    `${i + 1}. <code>${row.user_id}</code>\n` +
    `   Sabab: ${esc(row.error_message || "Noma\'lum")}\n` +
    `   Retry: <b>${row.retry_count || 0}</b>\n` +
    `   Vaqt: ${esc(fmtDateTime(row.updated_at || row.last_retry_at || row.created_at))}`
  )).join('\n\n');
}

function buildBroadcastGuideText() {
  return `🧭 <b>ADMIN BUYRUQLARI</b>

<b>/admin</b> — admin panelni ochadi
<b>/message Matn</b> — broadcast draft yaratadi

<b>Tugmali broadcast:</b>
<code>/message Assalomu alaykum
--
Kanal | https://t.me/username</code>

Rasm/video/document bilan ham <b>/message</b> yuborsangiz, preview chiqadi.
Xato bo'lsa, natija oynasida yetkazilmagan userlar uchun alohida <b>qayta yuborish</b> tugmasi chiqadi.`;
}

async function sendAdminPanel(chatId, messageId = null) {
  const snapshot = await getAdminSnapshot();
  return safeEditOrSend(chatId, messageId, buildAdminPanelText(snapshot), {
    parse_mode: 'HTML',
    reply_markup: adminPanelMarkup()
  });
}

async function sendBroadcastPayload(uid, bc) {
  const opts = {
    caption: bc.content,
    entities: bc.entities,
    caption_entities: bc.entities,
    reply_markup: bc.reply_markup
  };

  if (bc.msg_type === 'photo') return bot.sendPhoto(uid, bc.media_id, opts);
  if (bc.msg_type === 'video') return bot.sendVideo(uid, bc.media_id, opts);
  if (bc.msg_type === 'animation') return bot.sendAnimation(uid, bc.media_id, opts);
  if (bc.msg_type === 'document') return bot.sendDocument(uid, bc.media_id, opts);
  return bot.sendMessage(uid, bc.content || '', { entities: bc.entities, reply_markup: bc.reply_markup });
}

async function storeBroadcastFailures(broadcastId, rows) {
  if (!rows.length) return;
  const { error } = await db.from('broadcast_failures').upsert(rows, { onConflict: 'broadcast_id,user_id' });
  if (error) throw error;
}

async function sendBroadcastBatch(bc, { targetUserIds = null, retryOnly = false } = {}) {
  let userIds = targetUserIds;
  if (!userIds) {
    const { data: allUsers, error: fErr } = await db.from('users').select('user_id');
    if (fErr) throw fErr;
    userIds = (allUsers || []).map(u => u.user_id);
  }

  userIds = [...new Set((userIds || []).map(Number).filter(Boolean))];
  const total = userIds.length;
  let success = 0;
  let failed = 0;
  const deliveredIds = [];
  const failedRows = [];
  const failureSamples = [];

  if (!retryOnly) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id);
  }

  const batchSize = 25;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (uid) => {
      try {
        await sendBroadcastPayload(uid, bc);
        success++;
        deliveredIds.push(uid);
      } catch (e) {
        failed++;
        const reason = tgErr(e);
        failedRows.push({
          broadcast_id: bc.id,
          user_id: uid,
          error_message: reason.slice(0, 400),
          retry_count: retryOnly ? 1 : 0,
          last_retry_at: retryOnly ? iso() : null
        });
        if (failureSamples.length < 8) failureSamples.push({ uid, reason });
      }
    }));

    if (i + batchSize < userIds.length) await sleep(900);
  }

  if (deliveredIds.length) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id).in('user_id', deliveredIds);
  }

  if (failedRows.length) {
    await storeBroadcastFailures(bc.id, failedRows);
  }

  const { count: remainingFailed, error: rcErr } = await db.from('broadcast_failures').select('*', { count: 'exact', head: true }).eq('broadcast_id', bc.id);
  if (rcErr) throw rcErr;

  const totalUsers = retryOnly ? (bc.total_users || total) : total;
  const sentCount = Math.max(0, totalUsers - (remainingFailed || 0));
  const status = (remainingFailed || 0) > 0 ? 'partial_fail' : 'sent';

  const { error: updErr } = await db.from('broadcasts').update({
    status,
    total_users: totalUsers,
    sent_count: sentCount,
    failed_count: remainingFailed || 0,
    completed_at: iso()
  }).eq('id', bc.id);
  if (updErr) throw updErr;

  return {
    total,
    success,
    failed,
    remainingFailed: remainingFailed || 0,
    status,
    failureSamples
  };
}

function buildBroadcastResultText(bc, result, retryOnly = false) {
  const title = retryOnly ? '🔁 <b>QAYTA YUBORISH YAKUNLANDI</b>' : '📣 <b>BROADCAST YAKUNLANDI</b>';
  const sampleText = result.failureSamples?.length
    ? '\n\n<b>Namuna xatolar:</b>\n' + result.failureSamples.map(item => `• <code>${item.uid}</code> — ${esc(item.reason)}`).join('\n')
    : '';

  return `${title}\n\nBroadcast ID: <b>${shortId(bc.id)}</b>\nJoriy urinish targetlari: <b>${result.total}</b>\nUshbu urinishda yetkazildi: <b>${result.success}</b>\nUshbu urinishda xato: <b>${result.failed}</b>\nHozir qolgan xatolar: <b>${result.remainingFailed}</b>\nHolat: <b>${esc(result.status)}</b>${sampleText}`;
}

function buildBroadcastResultMarkup(bc, result) {
  const rows = [];
  if (result.remainingFailed > 0) {
    rows.push([
      { text: "🔁 Xato bo'lganlarga qayta yuborish", callback_data: `bc_retry:${bc.id}` },
      { text: "👀 Xatolar ro'yxati", callback_data: `bc_failed:${bc.id}` }
    ]);
  }
  rows.push([{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}

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
    .replace(/[. ](?=\d{3}(?:\D|$))/g, '') // minglik nuqta yoki bo'shliq: 500.000 -> 500000
    .replace(/,/g, '.')                    // vergulni nuqtaga: 1,5 -> 1.5
    .replace(/\s/g, '');                   // qolgan bo'shliqlar

  const amount = parseFloat(numStr);
  if (!amount || isNaN(amount) || !Number.isFinite(amount)) return null;

  // Suffix multiplier
  const suffix = (m[2] || '').replace(/\s/g, '').toLowerCase();
  let finalAmount = amount;

  // Redundancy check: if user wrote "500 000 ming", amount is 500000. 
  // If amount >= 1000 and suffix is 'k'/'ming', we skip multiplication.
  const isAlreadyBig = (suffix === 'k' || suffix === 'ming') && amount >= 1000;
  const isAlreadyMln = (suffix === 'mln' || suffix === 'm' || suffix === 'million') && amount >= 1000000;

  if (suffix === 'k' || suffix === 'ming') {
    if (!isAlreadyBig) finalAmount = amount * 1_000;
  } else if (suffix === 'mln' || suffix === 'million' || suffix === 'm') {
    if (!isAlreadyMln) finalAmount = amount * 1_000_000;
  } else if (suffix === 'mlrd' || suffix === 'milliard' || suffix === 'b') {
    finalAmount = amount * 1_000_000_000;
  }

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

  const { data, error } = await insertTransactions([row], 'bot');
  if (error) {
    logErr('save-tx', error, { userId, chatId, amount, category });
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik. Keyinroq urinib ko\'ring.').catch(() => { });
    return null;
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) {
    await bot.sendMessage(chatId, '⚠️ Tranzaksiya saqlanganini tasdiqlab bo\'lmadi.').catch(() => { });
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

  log('tx-saved', { userId, id: saved.id, type: saved.type, amount: saved.amount });
  return saved;
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
          await bot.answerCallbackQuery(q.id, { text: 'Draft bekor qilindi' }).catch(() => { });
          await db.from('broadcasts').update({ status: 'cancelled' }).eq('id', bcId).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        const { data: bc, error: bErr } = await db.from('broadcasts').select('*').eq('id', bcId).maybeSingle();
        if (bErr || !bc) {
          await bot.answerCallbackQuery(q.id, { text: 'Broadcast topilmadi', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_send') {
          await bot.answerCallbackQuery(q.id, { text: 'Yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, '⏳ Broadcast userlarga yuborilmoqda...').catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { retryOnly: false });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, false), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Broadcast yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_retry') {
          const { data: failedRows, error: frErr } = await db.from('broadcast_failures').select('user_id').eq('broadcast_id', bcId);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolarni o'qishda muammo", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          const ids = (failedRows || []).map(r => r.user_id);
          if (!ids.length) {
            await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish uchun user qolmagan', show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, `🔁 ${ids.length} ta userga qayta yuborilyapti...`).catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { targetUserIds: ids, retryOnly: true });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, true), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Qayta yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_failed') {
          const { data: rows, error: frErr } = await db.from('broadcast_failures')
            .select('user_id, error_message, retry_count, created_at, last_retry_at')
            .eq('broadcast_id', bcId)
            .order('last_retry_at', { ascending: false })
            .limit(25);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolar ro'yxatini olishda xatolik", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await safeEditOrSend(chatId, msgId, buildFailedTargetsText(bc, rows || []), {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔁 Qayta yuborish', callback_data: `bc_retry:${bc.id}` }],
                [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]
              ]
            }
          });
          return res.status(200).json({ ok: true });
        }
      }

      if (data.startsWith('admin_')) {
        if (!isAdmin(userId)) {
          await bot.answerCallbackQuery(q.id, { text: 'Admin emas', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        await bot.answerCallbackQuery(q.id).catch(() => { });

        if (data === 'admin_panel' || data === 'admin_stats') {
          await sendAdminPanel(chatId, msgId);
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_users') {
          const [{ data: rows, error: uErr }, totalUsers] = await Promise.all([
            db.from('users').select('user_id, full_name, phone_number, created_at').order('created_at', { ascending: false }).limit(10),
            getExactCount(db.from('users').select('*', { count: 'exact', head: true }))
          ]);
          if (uErr) {
            await safeEditOrSend(chatId, msgId, `⚠️ Userlarni olishda xatolik: ${esc(uErr.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildRecentUsersText(rows || [], totalUsers), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_broadcasts') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, total_users, sent_count, failed_count, created_at')
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildBroadcastsText(rows || []), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_failed') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, failed_count, created_at')
            .gt('failed_count', 0)
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Xatoli broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          const rowsKb = (rows || []).slice(0, 5).map(b => [{ text: `👀 ${shortId(b.id)} · ${b.failed_count} ta`, callback_data: `bc_failed:${b.id}` }]);
          await safeEditOrSend(chatId, msgId, buildFailedBroadcastsText(rows || []), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [...rowsKb, [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]] }
          });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_help') {
          await safeEditOrSend(chatId, msgId, buildBroadcastGuideText(), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
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

    // ── Admin panel / broadcast buyruqlari ──
    if (text === '/admin') {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      try {
        await sendAdminPanel(chatId);
      } catch (e) {
        await bot.sendMessage(chatId, `⚠️ Admin panelni ochishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' }).catch(() => { });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Admin Broadcast (/message ...) ──
    if (text.startsWith('/message')) {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const rawText = msg.text || msg.caption || '';
      const entities = msg.entities || msg.caption_entities || [];
      const parts = rawText.split(/\s*\n--\n\s*/);
      let broadcastText = parts[0].replace(/^\/message\s*/, '').trim();
      const prefixLen = rawText.indexOf(broadcastText);

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

      let shiftedEntities = null;
      if (entities && entities.length > 0) {
        shiftedEntities = entities
          .map(e => ({ ...e, offset: e.offset - prefixLen }))
          .filter(e => e.offset >= 0 && e.offset + e.length <= broadcastText.length);
      }

      let msgType = 'text';
      let mediaId = null;
      if (msg.photo) { msgType = 'photo'; mediaId = msg.photo[msg.photo.length - 1].file_id; }
      else if (msg.video) { msgType = 'video'; mediaId = msg.video.file_id; }
      else if (msg.animation) { msgType = 'animation'; mediaId = msg.animation.file_id; }
      else if (msg.document) { msgType = 'document'; mediaId = msg.document.file_id; }

      if (!broadcastText && !mediaId) {
        await bot.sendMessage(chatId, `⚠️ Broadcast bo'sh.\n\nMisol:\n<code>/message Assalomu alaykum\n--\nKanal | https://t.me/username</code>`, { parse_mode: 'HTML' }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { data: draft, error: drErr } = await db.from('broadcasts').insert({
        admin_id: userId,
        status: 'draft',
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

      const previewMarkup = {
        inline_keyboard: [
          ...(reply_markup?.inline_keyboard || []),
          [{ text: '✅ Tasdiqlash', callback_data: `bc_send:${draft.id}` }, { text: '❌ Bekor qilish', callback_data: `bc_cancel:${draft.id}` }]
        ]
      };

      await bot.sendMessage(chatId, `📣 <b>BROADCAST PREVIEW</b>\nID: <code>${draft.id}</code>\n\nQuyidagi ko'rinish userlarga yuboriladi:`, { parse_mode: 'HTML' });

      if (msgType === 'photo') await bot.sendPhoto(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'video') await bot.sendVideo(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'animation') await bot.sendAnimation(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'document') await bot.sendDocument(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else await bot.sendMessage(chatId, broadcastText, { entities: shiftedEntities, reply_markup: previewMarkup });

      return res.status(200).json({ ok: true });
    }

    // ── Yangi foydalanuvchi — telefon so'rash ──
    if (!user) {
      await bot.sendMessage(chatId, `👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.`, {
          reply_markup: {
            keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      ).catch(() => { });
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
